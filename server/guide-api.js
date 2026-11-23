// Routes for the guide workflow: program plan, gates, sourcing lines, the vendor and part repository,
// the regulatory watch, and the portfolio. Every write is role-checked, versioned, and logged.
// Responses carry roles and times. Email addresses stay in the stored record and are not sent to the screen.

import { timingSafeEqual } from "node:crypto";
import { cleanProjectId } from "../public/rules.js";
import { BUILT_IN_PROJECT } from "../public/boards.js";
import { CATALOG_SEED } from "../public/catalog-seed.js";
import {
  FIELD_ROLE_LABEL, affectedEntries, clean, entryId, fieldChangeBlock, fieldDef, isMissing, mergeCatalog, newEntryBlock,
  partTitle, safeUrl, siteDomain, topicOf, vendorOf,
} from "../public/catalog-model.js";
import {
  GATES, applyGateAction, applyProgramSection, designContext, gateApplies, gateBlock, gatePassed, lineBenchmark, lineRecheck,
  nextLineId, normalizeGate, normalizeProgram, normalizeSelection, portfolioRow, priorGate, programSectionBlock,
  selectionSaveBlock, selectionSubmitBlock, snapshotOf, stopSigns,
} from "../public/guide-model.js";
import { currentEnvironment, designatedAdministrators } from "./policy.js";
import { PRACTICE_PROJECT, practiceActor, practiceRoleFrom } from "./practice.js";
import { analyzeEntry, dayOf, hostOf, inverterAuto, longDate, screeningAuto, screeningChange, tierForUrl } from "./analysis.js";
import {
  CATALOG_PARTITION, NOT_CONNECTED, PRACTICE_CATALOG_PARTITION, PRACTICE_WATCH_PARTITION, SYSTEM_ACTOR, WATCH_PARTITION,
  WATCH_SOURCES, flattenRuns, itemFromReview, logItems, runWatch, scheduleState,
} from "./watch.js";

const PROJECT_KINDS = ["guide-program", "guide-gate", "guide-selection"];
const CATALOG_KINDS = ["catalog-vendor", "catalog-part"];
const MAX_LINES = 60;

const safeVersion = (value) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : -1;
const sentence = (value) => clean(value, 600).length >= 8;
// Ends a typed note with a period so that the history reads as full sentences.
const closed = (value) => { const text = clean(value, 600); return !text || /[.!?”"]$/.test(text) ? text : `${text}.`; };
const withoutBy = (row) => {
  if (!row || typeof row !== "object") return row ?? null;
  const { by, ...rest } = row;
  return rest;
};
const bareKey = (doc) => String(doc.key || "").replace(/^practice:/, "");
const entryOf = (catalog, kind, id) => (kind === "vendor" ? catalog.vendors : catalog.parts).find(row => row.id === id) || null;
const partLabel = (catalog, id) => {
  const part = catalog.parts.find(row => row.id === id);
  return part ? partTitle(vendorOf(catalog, part)?.name || part.vendor, part.name) : "a part that is no longer in the repository";
};

// ---------- Shapes sent to the screen ----------

function publicProgram(doc) {
  if (!doc) return null;
  const plan = normalizeProgram(doc.payload);
  return { version: doc.version, savedAt: doc.savedAt, payload: { ...plan, log: plan.log.map(withoutBy) } };
}

function publicGate(doc, gateId, email) {
  const { preparedBy, ...gate } = normalizeGate(doc?.payload, gateId);
  return {
    gate: gateId, version: doc?.version || 0, savedAt: doc?.savedAt || "",
    payload: { ...gate, preparedByYou: Boolean(preparedBy) && preparedBy === email, decision: withoutBy(gate.decision), log: gate.log.map(withoutBy) },
  };
}

function publicSelection(doc, email) {
  const { preparedBy, ...line } = normalizeSelection(doc.payload);
  return {
    id: line.id, version: doc.version, savedAt: doc.savedAt,
    payload: {
      ...line, preparedByYou: Boolean(preparedBy) && preparedBy === email,
      decision: line.decision ? withoutBy(line.decision) : null, log: line.log.map(withoutBy),
    },
  };
}

function publicCatalogDoc(doc) {
  const payload = doc.payload || {};
  return {
    kind: doc.kind, key: doc.key, version: doc.version, savedAt: doc.savedAt,
    payload: {
      ...payload,
      fields: Object.fromEntries(Object.entries(payload.fields || {}).map(([id, row]) => [id, withoutBy(row)])),
      cleared: (Array.isArray(payload.cleared) ? payload.cleared : []).map(withoutBy),
      log: (Array.isArray(payload.log) ? payload.log : []).map(withoutBy),
      analysis: payload.analysis ? withoutBy(payload.analysis) : null,
    },
  };
}

function publicReview(doc) {
  const payload = doc.payload || {};
  return {
    itemId: payload.itemId, version: doc.version, savedAt: doc.savedAt,
    payload: {
      ...payload,
      dispositions: Object.fromEntries(Object.entries(payload.dispositions || {}).map(([role, row]) => [role, withoutBy(row)])),
      log: (Array.isArray(payload.log) ? payload.log : []).map(withoutBy),
    },
  };
}

// Material reviews are the watch findings that flag vendors and parts for a recheck.
function materialReviews(reviewDocs) {
  const rows = [];
  for (const doc of reviewDocs) {
    const payload = doc.payload || {};
    for (const [role, row] of Object.entries(payload.dispositions || {})) {
      if (row?.materiality !== "Material") continue;
      rows.push({
        id: `${payload.itemId}:${role}`, title: payload.title, url: row.confirmUrl || payload.url, topics: row.topics || [],
        ownerRole: role, at: row.at, note: row.note, affected: row.affected || { vendors: [], parts: [] },
      });
    }
  }
  return rows;
}

const overlayPayload = (doc) => {
  const payload = doc?.payload && typeof doc.payload === "object" ? doc.payload : {};
  return {
    ...payload, auto: { ...(payload.auto || {}) }, fields: { ...(payload.fields || {}) },
    cleared: Array.isArray(payload.cleared) ? payload.cleared : [], log: Array.isArray(payload.log) ? payload.log : [],
  };
};

export function registerGuideRoutes(app, { store, grantedActor, fetchImpl = (...args) => fetch(...args) }) {
  async function context(req, res, projectId) {
    // The caller resolves the working role for this project. The repository and the watch are shared by every project,
    // so a change there is recorded under the role the person holds in the project that is open.
    const actor = await grantedActor(req, projectId);
    if (actor.error) { res.status(actor.error).json({ message: actor.message }); return null; }
    const requestedRole = practiceRoleFrom(req.get("x-practice-role"));
    const acting = requestedRole ? practiceActor({
      environment: actor.environment, designated: designatedAdministrators().includes(actor.session.email),
      grantRole: actor.grant.role, email: actor.session.email,
      requestedRole, projectId, existingProjectId: projectId,
    }) : { role: actor.grant.role, email: actor.session.email, practice: false };
    if (acting.error) { res.status(403).json({ message: acting.error }); return null; }
    // The practice project keeps its own copy of the repository and of the watch reviews.
    return { ...actor, acting, practice: actor.environment === "development" && projectId === PRACTICE_PROJECT };
  }
  const conflict = (res) => res.status(409).json({ message: "This entry changed in another session. Reload before saving." });
  const refuse = (res, message) => res.status(/^Only the |cannot record its decision|cannot review it/.test(message) ? 403 : 400).json({ message });
  const notFound = (res, message) => res.status(404).json({ message });

  // The practice project is usable in development before its sample records are loaded.
  const practiceProject = (environment) => environment === "development" ? { code: PRACTICE_PROJECT, name: "Practice reviews", status: "Active" } : null;
  async function projectOf(environment, projectId) {
    if (projectId === BUILT_IN_PROJECT.code) return BUILT_IN_PROJECT;
    const saved = (await store.listProjects(environment)).find(project => project.code === projectId);
    return saved || (projectId === PRACTICE_PROJECT ? practiceProject(environment) : null);
  }

  // The working repository: seed, custom entries, role records, refreshed screening results, and open rechecks.
  async function catalogState(environment, practice) {
    const [documents, screeningDoc, reviewDocs] = await Promise.all([
      store.listGuideDocuments(environment, practice ? PRACTICE_CATALOG_PARTITION : CATALOG_PARTITION, { kinds: CATALOG_KINDS }),
      store.readGuideDocument(environment, "watch-screening", "screening"),
      store.listGuideDocuments(environment, practice ? PRACTICE_WATCH_PARTITION : WATCH_PARTITION, { kinds: ["watch-review"] }),
    ]);
    const stored = screeningDoc?.payload || {};
    const values = practice ? { ...(stored.values || {}), ...(stored.practice || {}) } : stored.values || {};
    const overlayAt = new Map(documents.filter(doc => doc.kind === "catalog-vendor").map(doc => [bareKey(doc), String(doc.payload?.auto?.screening?.checkedAt || "")]));
    const auto = {};
    // The newer of the daily screening result and the result of an analysis is the one shown.
    for (const [id, record] of Object.entries(values)) {
      if (!record?.checkedAt || (overlayAt.get(id) || "") > record.checkedAt) continue;
      auto[`vendor:${id}`] = { screening: screeningAuto(record) };
    }
    const base = mergeCatalog(CATALOG_SEED, documents, { practice, auto });
    for (const part of base.parts) {
      const value = inverterAuto(part, vendorOf(base, part));
      if (value) auto[`part:${part.id}`] = { fccInverter: value };
    }
    const reviews = materialReviews(reviewDocs);
    return {
      documents, auto, reviews, values, screenedAt: stored.at || "", listDate: stored.listDate || "",
      partition: practice ? PRACTICE_CATALOG_PARTITION : CATALOG_PARTITION,
      catalog: mergeCatalog(CATALOG_SEED, documents, { practice, auto, reviews }),
    };
  }

  async function designFor(environment, projectId) {
    const doc = await store.readGuideDocument(environment, "guide-program", projectId);
    return designContext(doc?.payload);
  }

  // ---------- Program plan, gates, and sourcing lines ----------

  app.get("/api/guide", async (req, res) => {
    const projectId = cleanProjectId(req.query.project);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    if (!await projectOf(ctx.environment, projectId)) { notFound(res, "This project was not found."); return; }
    const docs = await store.listGuideDocuments(ctx.environment, projectId, { kinds: PROJECT_KINDS });
    res.json({
      projectId, practice: ctx.practice,
      program: publicProgram(docs.find(doc => doc.kind === "guide-program" && doc.key === projectId)),
      gates: GATES.map(def => publicGate(docs.find(doc => doc.kind === "guide-gate" && doc.key === `${projectId}:${def.id}`), def.id, ctx.acting.email)),
      selections: docs.filter(doc => doc.kind === "guide-selection").map(doc => publicSelection(doc, ctx.acting.email))
        .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true })),
    });
  });

  app.post("/api/guide/save", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const { acting, environment } = ctx;
    if (!await projectOf(environment, projectId)) { notFound(res, "This project was not found."); return; }
    const section = clean(req.body?.section, 40);
    const data = req.body?.data && typeof req.body.data === "object" ? req.body.data : {};
    const [doc, gate0] = await Promise.all([
      store.readGuideDocument(environment, "guide-program", projectId),
      store.readGuideDocument(environment, "guide-gate", `${projectId}:0`),
    ]);
    const block = programSectionBlock(section, data, { role: acting.role, gate0Passed: gatePassed(normalizeGate(gate0?.payload, 0)), current: doc?.payload });
    if (block) { refuse(res, block); return; }
    const saved = await store.saveGuideDocument({
      environment, projectId, kind: "guide-program", key: projectId, expectedVersion: safeVersion(req.body?.version), savedBy: acting.email,
      payload: applyProgramSection(doc?.payload, section, data, acting),
    });
    if (!saved) { conflict(res); return; }
    res.json({ program: publicProgram(saved) });
  });

  app.post("/api/guide/gate", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const { acting, environment } = ctx;
    const gateId = Number(req.body?.gate);
    const action = clean(req.body?.action, 20);
    if (!Number.isInteger(gateId) || !GATES[gateId]) { res.status(400).json({ message: "Choose a gate." }); return; }
    if (!await projectOf(environment, projectId)) { notFound(res, "This project was not found."); return; }
    const prior = priorGate(gateId);
    const [programDoc, doc, priorDoc] = await Promise.all([
      store.readGuideDocument(environment, "guide-program", projectId),
      store.readGuideDocument(environment, "guide-gate", `${projectId}:${gateId}`),
      prior === null ? null : store.readGuideDocument(environment, "guide-gate", `${projectId}:${prior}`),
    ]);
    if (!programDoc) { res.status(400).json({ message: "Save the design basis in Program plan before preparing a gate." }); return; }
    const current = normalizeGate(doc?.payload, gateId);
    const input = {
      gate: gateId, evidence: req.body?.evidence, openItems: req.body?.openItems, result: req.body?.result,
      condition: req.body?.condition, signoffRef: req.body?.signoffRef, note: req.body?.note,
    };
    const block = gateBlock(current, action, input, acting, {
      priorPassed: prior === null || gatePassed(normalizeGate(priorDoc?.payload, prior)),
      applies: gateApplies(gateId, programDoc.payload),
    });
    if (block) { refuse(res, block); return; }
    // A stop sign pauses the purchase, so purchase orders are not released while one is recorded.
    if (gateId === 1 && action === "decide") {
      const lines = await store.listGuideDocuments(environment, projectId, { kinds: ["guide-selection"] });
      const stopped = lines.map(row => normalizeSelection(row.payload)).filter(line => stopSigns(line).length).map(line => line.id);
      if (stopped.length) { res.status(400).json({ message: `A stop sign is recorded on ${stopped.join(", ")}. Resolve it before purchase orders are released.` }); return; }
    }
    const saved = await store.saveGuideDocument({
      environment, projectId, kind: "guide-gate", key: `${projectId}:${gateId}`, expectedVersion: safeVersion(req.body?.version), savedBy: acting.email,
      payload: applyGateAction(current, action, input, acting),
    });
    if (!saved) { conflict(res); return; }
    res.json({ gate: publicGate(saved, gateId, acting.email) });
  });

  app.post("/api/guide/selection", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const { acting, environment } = ctx;
    const action = clean(req.body?.action, 20);
    if (!["save", "submit", "approve", "return", "reopen"].includes(action)) { res.status(400).json({ message: "Choose an action for the sourcing line." }); return; }
    if (!await projectOf(environment, projectId)) { notFound(res, "This project was not found."); return; }
    const programDoc = await store.readGuideDocument(environment, "guide-program", projectId);
    if (!programDoc) { res.status(400).json({ message: "Save the design basis in Program plan before adding sourcing lines." }); return; }
    let id = clean(req.body?.id, 20);
    const existing = id ? await store.readGuideDocument(environment, "guide-selection", `${projectId}:${id}`) : null;
    if ((id || action !== "save") && (!existing || existing.projectId !== projectId)) { notFound(res, "This sourcing line was not found in the selected project."); return; }
    const current = existing ? normalizeSelection(existing.payload) : null;
    const { catalog } = await catalogState(environment, ctx.practice);
    const design = designContext(programDoc.payload);
    const now = new Date().toISOString();
    const note = clean(req.body?.note, 600);
    const logged = (name, text) => [...(current?.log || []), { at: now, by: acting.email, role: acting.role, action: name, note: clean(text, 600) }].slice(-60);
    let next;

    if (action === "save") {
      if (acting.role !== "nstt") { refuse(res, "Only the NSTT role prepares sourcing lines."); return; }
      if (current?.status === "Approved") { refuse(res, "This line is approved. Reopen it with a reason before changing it."); return; }
      if (current?.status === "In review") { refuse(res, "This line is in review. The reviewer returns it, or NSTT withdraws it, before it changes."); return; }
      if (!existing) {
        const all = await store.listGuideDocuments(environment, projectId, { kinds: ["guide-selection"] });
        if (all.length >= MAX_LINES) { refuse(res, `A project holds at most ${MAX_LINES} sourcing lines.`); return; }
        id = nextLineId(all.map(row => row.payload?.id));
      }
      const input = normalizeSelection({ ...(req.body?.line && typeof req.body.line === "object" ? req.body.line : {}), id });
      const block = selectionSaveBlock(input, catalog);
      if (block) { refuse(res, block); return; }
      const returned = current?.status === "Returned";
      next = {
        ...input, status: returned ? "Returned" : "Draft", reviewerRole: returned ? current.reviewerRole : "",
        preparedBy: acting.email, preparedAt: now,
        // A new primary part after purchase release is a change that returns the line to Gate 1.
        primaryChangedAt: !current || current.primary !== input.primary ? now : current.primaryChangedAt,
        submitted: returned ? current.submitted : null, decision: null,
        log: logged("save", `Primary: ${partLabel(catalog, input.primary)}. ${input.alternate ? `Alternate: ${partLabel(catalog, input.alternate)}.` : "No alternate is named."}`),
      };
    } else if (action === "submit") {
      if (acting.role !== "nstt") { refuse(res, "Only the NSTT role sends a sourcing line to review."); return; }
      if (!["Draft", "Returned"].includes(current.status)) { refuse(res, "Only a draft or a returned line can be sent to review."); return; }
      const block = selectionSubmitBlock(current, catalog);
      if (block) { refuse(res, block); return; }
      const result = lineBenchmark(current, catalog, design);
      if (result.posture === "Red") { refuse(res, "The indicated posture is Red. Choose another primary part, or have the owning role correct the facts in the repository, before the line goes to review."); return; }
      const reviewerRole = result.tradeFlag ? "trade" : "cpi";
      next = {
        ...current, status: "In review", reviewerRole, preparedBy: acting.email, preparedAt: now,
        submitted: snapshotOf(result, current, design, now), decision: null,
        log: logged("submit", `The ${FIELD_ROLE_LABEL[reviewerRole]} role reviews this line. The indicated posture was ${result.posture} and the confidence was ${result.confidence.label}.`),
      };
    } else if (action === "approve" || action === "return") {
      if (current.status !== "In review") { refuse(res, "Only a line in review can be decided."); return; }
      if (acting.role !== current.reviewerRole) { refuse(res, `Only the ${FIELD_ROLE_LABEL[current.reviewerRole]} role reviews this line.`); return; }
      if (acting.email === current.preparedBy) { refuse(res, "The person who prepared the line cannot review it."); return; }
      if (action === "return") {
        if (!sentence(note)) { refuse(res, "State why the line is returned in a full sentence."); return; }
        next = { ...current, status: "Returned", log: logged("return", closed(note)) };
      } else {
        const block = selectionSubmitBlock(current, catalog);
        if (block) { refuse(res, block); return; }
        const result = lineBenchmark(current, catalog, design);
        if (result.posture === "Red") { refuse(res, "The indicated posture is now Red, so the line cannot be approved. Return it with a note."); return; }
        if (Boolean(result.tradeFlag) !== Boolean(current.submitted?.tradeFlag)) {
          refuse(res, result.tradeFlag
            ? "A trade rule now applies to this line. Return it so that NSTT sends it to Trade review."
            : "No trade rule applies to this line any longer. Return it so that NSTT sends it to CPI review.");
          return;
        }
        if (result.posture === "Orange" && !sentence(note)) { refuse(res, "An Orange line proceeds only with active mitigation. State the mitigation and its conditions in a full sentence."); return; }
        next = {
          ...current, status: "Approved",
          decision: { by: acting.email, role: acting.role, at: now, note: closed(note), snapshot: snapshotOf(result, current, design, now) },
          log: logged("approve", `The indicated posture was ${result.posture} and the confidence was ${result.confidence.label}.${note ? ` ${closed(note)}` : ""}`),
        };
      }
    } else {
      const withdraw = current.status === "In review";
      if (!withdraw && current.status !== "Approved") { refuse(res, "Only an approved line, or a line in review, can be reopened."); return; }
      if (withdraw && acting.role !== "nstt") { refuse(res, "Only the NSTT role withdraws a line from review."); return; }
      if (!withdraw && !["nstt", current.reviewerRole].includes(acting.role)) { refuse(res, "Only the NSTT role or the reviewing role reopens this line."); return; }
      if (!sentence(note)) { refuse(res, withdraw ? "State why the line is withdrawn in a full sentence." : "State the change that reopens the line in a full sentence."); return; }
      const earlier = current.decision
        ? ` The earlier approval by the ${FIELD_ROLE_LABEL[current.decision.role] || "reviewing"} role on ${longDate(current.decision.at)} at ${current.decision.snapshot?.posture || "its recorded posture"} stays in this history.`
        : "";
      next = {
        ...current, status: "Draft", reviewerRole: "", submitted: null, decision: null,
        log: logged(withdraw ? "withdraw" : "reopen", `${closed(note)}${earlier}`),
      };
    }

    const saved = await store.saveGuideDocument({
      environment, projectId, kind: "guide-selection", key: `${projectId}:${id}`,
      expectedVersion: existing ? safeVersion(req.body?.version) : 0, savedBy: acting.email, payload: next,
    });
    if (!saved) { conflict(res); return; }
    res.status(existing ? 200 : 201).json({ selection: publicSelection(saved, acting.email) });
  });

  // ---------- Vendor and part repository ----------

  app.get("/api/catalog", async (req, res) => {
    const projectId = cleanProjectId(req.query.project);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const state = await catalogState(ctx.environment, ctx.practice);
    res.json({
      practice: ctx.practice, documents: state.documents.map(publicCatalogDoc), auto: state.auto, reviews: state.reviews,
      screenedAt: state.screenedAt, listDate: state.listDate,
    });
  });

  app.post("/api/catalog/field", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const { acting, environment, practice } = ctx;
    const kind = req.body?.kind === "part" ? "part" : "vendor";
    const id = clean(req.body?.id, 80);
    const action = clean(req.body?.action, 20);
    const state = await catalogState(environment, practice);
    const entry = entryOf(state.catalog, kind, id);
    if (!entry) { notFound(res, "This entry was not found in the repository."); return; }
    const key = practice ? `practice:${id}` : id;
    const doc = state.documents.find(row => row.kind === `catalog-${kind}` && row.key === key) || null;
    const payload = overlayPayload(doc);
    const now = new Date().toISOString();
    const who = { by: acting.email, role: acting.role, at: now };
    const log = (row) => { payload.log = [...payload.log, { at: now, by: acting.email, role: acting.role, ...row }].slice(-200); };

    if (action === "clear-recheck") {
      const row = entry.recheck.find(item => item.kind === "review" && item.reviewId === clean(req.body?.reviewId, 160));
      if (!row) { refuse(res, "This recheck is no longer open. Reload to see the current state."); return; }
      if (acting.role !== row.role) { refuse(res, `Only the ${FIELD_ROLE_LABEL[row.role] || "Trade"} role clears this recheck.`); return; }
      const note = clean(req.body?.note, 600);
      if (!sentence(note)) { refuse(res, "State what was checked in a full sentence."); return; }
      payload.cleared = [...payload.cleared.filter(item => item.reviewId !== row.reviewId), { reviewId: row.reviewId, ...who, note: closed(note) }].slice(-100);
      log({ field: "", action, note: `${closed(row.title)} ${closed(note)}` });
    } else {
      const fieldId = clean(req.body?.field, 40);
      const block = fieldChangeBlock(kind, fieldId, { action, value: req.body?.value, reason: req.body?.reason, sourceUrl: req.body?.sourceUrl }, acting.role);
      if (block) { refuse(res, block); return; }
      const def = fieldDef(kind, fieldId);
      const field = entry.fields[fieldId];
      if (action === "confirm") {
        if (isMissing(field.baselineValue)) { refuse(res, "There is no value to confirm yet. Enter the value and its source."); return; }
        payload.fields[fieldId] = { state: "confirmed", baseline: field.baselineValue, ...who };
        log({ field: fieldId, action, to: field.baselineValue, note: `Confirmed the sourced value from ${field.baselineSource?.label || "the program rule"}.` });
      } else if (action === "change") {
        const value = clean(req.body.value, 400);
        const sourceUrl = safeUrl(req.body?.sourceUrl);
        if (fieldId === "eoType" && value === "Determination recorded" && tierForUrl(sourceUrl) !== 1) { refuse(res, "Cite the Department of Energy determination with its government address."); return; }
        payload.fields[fieldId] = {
          state: "changed", value, detail: clean(req.body?.detail, 700),
          source: { label: clean(req.body?.sourceLabel, 160) || hostOf(sourceUrl), url: sourceUrl },
          reason: closed(req.body.reason), baseline: field.baselineValue, ...who,
        };
        log({ field: fieldId, action, from: field.value, to: value, note: closed(req.body.reason) });
      } else {
        if (!payload.fields[fieldId]) { refuse(res, "This field has no confirmation or change to remove."); return; }
        delete payload.fields[fieldId];
        log({ field: fieldId, action, from: field.value, to: field.baselineValue, note: "Returned to the sourced value. It is no longer confirmed." });
      }
    }
    const saved = await store.saveGuideDocument({
      environment, projectId: state.partition, kind: `catalog-${kind}`, key, expectedVersion: safeVersion(req.body?.version), savedBy: acting.email, payload,
    });
    if (!saved) { conflict(res); return; }
    res.json({ document: publicCatalogDoc(saved) });
  });

  app.post("/api/catalog/entry", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const { acting, environment, practice } = ctx;
    if (acting.role !== "nstt") { refuse(res, "Only the NSTT role adds a vendor or a part to the repository."); return; }
    const kind = req.body?.kind === "part" ? "part" : "vendor";
    const state = await catalogState(environment, practice);
    const input = kind === "vendor"
      ? { legalName: clean(req.body?.legalName, 160), website: clean(req.body?.website, 200) }
      : { vendor: clean(req.body?.vendor, 80), category: clean(req.body?.category, 60), model: clean(req.body?.model, 160), sourceUrl: clean(req.body?.sourceUrl, 600) };
    const block = newEntryBlock(kind, input, state.catalog);
    if (block) { refuse(res, block); return; }
    const now = new Date().toISOString();
    const day = dayOf(now);
    const maker = kind === "part" ? state.catalog.vendors.find(row => row.id === input.vendor) : null;
    const id = kind === "vendor" ? entryId(input.legalName) : entryId(`${input.vendor}-${input.model}`);
    let custom;
    if (kind === "vendor") {
      custom = {
        name: clean(input.legalName, 120), names: [clean(input.legalName, 200)], domain: siteDomain(input.website), asOf: day,
        fields: { legalName: [input.legalName, "Entered by NSTT", "", "R", "Typed in when the vendor was added. The registry name replaces it when a registry record matches."] },
      };
    } else {
      const page = safeUrl(input.sourceUrl);
      const tier = page ? tierForUrl(page, maker.domain) : "R";
      custom = {
        vendor: input.vendor, category: input.category, name: clean(input.model, 160), asOf: day,
        fields: { model: page
          ? [input.model, tier === 4 ? `${maker.name} product page` : hostOf(page), page, tier, "NSTT entered this address. The workbench did not read the page."]
          : [input.model, "Entered by NSTT", "", "R", ""] },
      };
    }
    const key = practice ? `practice:${id}` : id;
    // The list, registry, and screening checks run at once. The AI analysis runs as a second step.
    const merged = mergeCatalog(CATALOG_SEED, [...state.documents, { kind: `catalog-${kind}`, key, version: 0, payload: { custom } }], { practice, auto: state.auto, reviews: state.reviews });
    const entry = entryOf(merged, kind, id);
    let result = null;
    try {
      result = await analyzeEntry({ kind, entry, vendor: kind === "part" ? vendorOf(merged, entry) : null, context: await designFor(environment, projectId), useAi: false, fetchImpl });
    } catch { result = null; }
    const filledFirst = (result?.analysis.fields || []).filter(row => row.applied).map(row => row.label);
    const firstChecks = !result ? "The first checks did not run. Run the analysis from the entry."
      : filledFirst.length ? `The first checks filled: ${filledFirst.join(", ")}.` : "The first checks filled no field.";
    const saved = await store.saveGuideDocument({
      environment, projectId: state.partition, kind: `catalog-${kind}`, key, expectedVersion: 0, savedBy: acting.email,
      payload: {
        custom, auto: result?.auto || {}, fields: {}, cleared: [],
        analysis: result ? { ...result.analysis, by: acting.email, role: acting.role } : null,
        log: [{ at: now, by: acting.email, role: acting.role, field: "", action: "add", note: `${kind === "vendor" ? "The vendor is new to the repository." : `The part is new under ${maker.name}.`} ${firstChecks}` }],
      },
    });
    if (!saved) { conflict(res); return; }
    res.status(201).json({ id, kind, filled: filledFirst.length, document: publicCatalogDoc(saved) });
  });

  app.post("/api/catalog/analyze", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const { acting, environment, practice } = ctx;
    if (!["nstt", "cpi", "trade"].includes(acting.role)) { res.status(403).json({ message: "The NSTT, CPI, or Trade role runs the analysis. The administrator role reads the result." }); return; }
    const kind = req.body?.kind === "part" ? "part" : "vendor";
    const id = clean(req.body?.id, 80);
    const state = await catalogState(environment, practice);
    const entry = entryOf(state.catalog, kind, id);
    if (!entry) { notFound(res, "This entry was not found in the repository."); return; }
    const key = practice ? `practice:${id}` : id;
    const doc = state.documents.find(row => row.kind === `catalog-${kind}` && row.key === key) || null;
    const lastAi = doc?.payload?.analysis?.steps?.find(step => step.id === "ai")?.status;
    if (doc?.payload?.analysis?.at && lastAi && lastAi !== "not run" && Date.now() - Date.parse(doc.payload.analysis.at) < 30 * 1000) {
      res.status(429).json({ message: "This entry was analyzed less than 30 seconds ago. Wait a moment before running the analysis again." }); return;
    }
    const newest = (a, b) => !a ? b : !b ? a : String(a.checkedAt || "") >= String(b.checkedAt || "") ? a : b;
    const previous = kind === "vendor" ? newest(state.values[id], doc?.payload?.auto?.screening?.signature ? doc.payload.auto.screening : null) : null;
    const result = await analyzeEntry({
      kind, entry, vendor: kind === "part" ? vendorOf(state.catalog, entry) : null, context: await designFor(environment, projectId),
      previousScreening: previous || null, earlier: doc?.payload?.analysis || null, useAi: true, fetchImpl,
    });
    // Rows carried from the first checks were logged when the entry was added.
    const applied = result.analysis.fields.filter(row => row.applied && !row.carried).map(row => row.label);
    const record = {
      at: result.analysis.at, by: acting.email, role: acting.role, field: "", action: "analyze",
      note: `${applied.length ? `Filled or refreshed from cited sources: ${applied.join(", ")}.` : "No field changed."}${result.analysis.status === "complete" ? "" : result.analysis.status === "not connected" ? " The AI step is not connected." : " The AI step did not complete."}`,
      // A screening change that this analysis dated is kept with what it started from. The next daily check finds
      // nothing new for this vendor, so the daily update reads the change from this entry.
      ...(result.screening?.changedAt === result.analysis.at ? { screening: screeningChange(result.screening, previous, entry.fields?.screening) } : {}),
    };
    // The analysis adds sourced values and its own record. It never touches what a role confirmed or changed.
    const merge = (current) => {
      const payload = overlayPayload(current);
      return { ...payload, auto: { ...payload.auto, ...result.auto }, analysis: { ...result.analysis, by: acting.email, role: acting.role }, log: [...payload.log, record].slice(-200) };
    };
    const save = (current) => store.saveGuideDocument({
      environment, projectId: state.partition, kind: `catalog-${kind}`, key, expectedVersion: current?.version || 0, savedBy: acting.email, payload: merge(current),
    });
    // A field may be confirmed while the analysis runs, so one retry applies the result to the newest record.
    const saved = await save(doc) || await save(await store.readGuideDocument(environment, `catalog-${kind}`, key));
    if (!saved) { conflict(res); return; }
    res.json({ document: publicCatalogDoc(saved) });
  });

  // ---------- Portfolio ----------

  app.get("/api/portfolio", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) { res.status(actor.error).json({ message: actor.message }); return; }
    const { environment } = actor;
    const showPractice = environment === "development" && designatedAdministrators().includes(actor.session.email);
    const saved = await store.listProjects(environment);
    const docs = await store.listGuideDocuments(environment, "", { kinds: PROJECT_KINDS });
    const projects = [BUILT_IN_PROJECT, ...saved.filter(project => project.code !== BUILT_IN_PROJECT.code)]
      .filter(project => project.code !== PRACTICE_PROJECT || showPractice);
    if (showPractice && !projects.some(project => project.code === PRACTICE_PROJECT) && docs.some(doc => doc.projectId === PRACTICE_PROJECT)) projects.push(practiceProject(environment));
    const today = dayOf();
    const states = new Map();
    const rows = [];
    for (const project of projects) {
      const practice = environment === "development" && project.code === PRACTICE_PROJECT;
      if (!states.has(practice)) states.set(practice, await catalogState(environment, practice));
      const { catalog } = states.get(practice);
      const mine = docs.filter(doc => doc.projectId === project.code);
      const program = mine.find(doc => doc.kind === "guide-program")?.payload || null;
      const gates = Object.fromEntries(GATES.map(def => [def.id, mine.find(doc => doc.kind === "guide-gate" && doc.key === `${project.code}:${def.id}`)?.payload]));
      const selections = mine.filter(doc => doc.kind === "guide-selection").map(doc => doc.payload);
      const design = designContext(program);
      const rechecks = selections.filter(line => lineRecheck(line, catalog, design).length).length;
      rows.push({ ...portfolioRow({ project, program, gates, selections, rechecks, today }), practice });
    }
    res.json({ today, rows });
  });

  // ---------- Regulatory watch ----------

  app.get("/api/watch", async (req, res) => {
    const projectId = cleanProjectId(req.query.project);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const { environment, practice } = ctx;
    const [stateDoc, runDocs, reviewDocs, screeningDoc] = await Promise.all([
      store.readGuideDocument(environment, "watch-state", "state"),
      store.listGuideDocuments(environment, WATCH_PARTITION, { kinds: ["watch-run"], limit: 60 }),
      store.listGuideDocuments(environment, practice ? PRACTICE_WATCH_PARTITION : WATCH_PARTITION, { kinds: ["watch-review"] }),
      store.readGuideDocument(environment, "watch-screening", "screening"),
    ]);
    // The newest items, and every older item that carries a decision, so a decision can always be read and corrected.
    const flat = logItems(runDocs, reviewDocs, 200);
    const state = stateDoc?.payload || {};
    res.json({
      practice,
      state: {
        lastRunAt: state.lastRunAt || "", lastTrigger: state.lastTrigger || "", runs: Number(state.runs) || 0,
        running: Boolean(state.lock?.until && Date.parse(state.lock.until) > Date.now()),
        ...scheduleState({ environment, configured: Boolean(process.env.CRON_SECRET), lastScheduledAt: state.lastScheduledAt }),
      },
      runs: flat.runs.slice(0, 40).map(withoutBy),
      items: flat.items,
      reviews: reviewDocs.map(publicReview),
      sources: WATCH_SOURCES.map(row => ({ id: row.id, label: row.label, page: row.page, tier: row.tier, lead: Boolean(row.lead) })),
      notConnected: NOT_CONNECTED,
      screening: { at: screeningDoc?.payload?.at || "", listDate: screeningDoc?.payload?.listDate || "" },
    });
  });

  // Any granted role may ask for a check. The run is recorded under the working role in the project that is open,
  // or under the environment role when no project is named. It is never recorded under a practice role.
  app.post("/api/watch/run", async (req, res) => {
    const actor = await grantedActor(req, req.body?.projectId ? cleanProjectId(req.body.projectId) : undefined);
    if (actor.error) { res.status(actor.error).json({ message: actor.message }); return; }
    const result = await runWatch({
      store, environment: actor.environment, trigger: req.body?.trigger === "catch-up" ? "catch-up" : "manual",
      actor: { email: actor.session.email, role: actor.grant.role }, fetchImpl,
    });
    res.json({
      status: result.status, message: result.message || "",
      added: result.run?.added ?? 0, screeningChanged: result.run?.screening?.changed?.length ?? 0,
      unavailable: (result.run?.sources || []).filter(row => row.status === "unavailable").length,
    });
  });

  // The scheduled daily check. The scheduler sends the shared secret as a bearer token.
  app.get("/api/watch/cron", async (req, res) => {
    const secret = process.env.CRON_SECRET || "";
    if (!secret) { res.status(503).json({ message: "The scheduled check is not configured." }); return; }
    const sent = Buffer.from(String(req.get("authorization") || ""));
    const expected = Buffer.from(`Bearer ${secret}`);
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) { res.status(401).json({ message: "The scheduled check was refused." }); return; }
    const result = await runWatch({ store, environment: currentEnvironment(), trigger: "scheduled", actor: SYSTEM_ACTOR, fetchImpl });
    res.json({ status: result.status, added: result.run?.added ?? 0, screeningChanged: result.run?.screening?.changed?.length ?? 0 });
  });

  app.post("/api/watch/review", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const { acting, environment, practice } = ctx;
    const itemId = clean(req.body?.itemId, 80);
    const key = practice ? `practice:${itemId}` : itemId;
    const [runDocs, doc] = await Promise.all([
      store.listGuideDocuments(environment, WATCH_PARTITION, { kinds: ["watch-run"], limit: 60 }),
      store.readGuideDocument(environment, "watch-review", key),
    ]);
    // An item that has left the recent checks is read from the decision record that was kept with it.
    const item = flattenRuns(runDocs, Infinity).items.find(row => row.id === itemId) || (doc ? itemFromReview(doc.payload) : null);
    if (!itemId || !item) { notFound(res, "This item was not found in the watch log."); return; }
    const topics = [...new Set((Array.isArray(req.body?.topics) ? req.body.topics : []).map(id => clean(id, 40)))].filter(id => topicOf(id));
    if (!topics.length) { refuse(res, "Choose at least one rule topic for this item."); return; }
    const foreign = topics.map(topicOf).find(topic => topic.role !== acting.role);
    if (foreign) { res.status(403).json({ message: `Only the ${FIELD_ROLE_LABEL[foreign.role]} role records materiality for ${foreign.label}.` }); return; }
    const materiality = clean(req.body?.materiality, 20);
    if (!["Material", "Not material"].includes(materiality)) { refuse(res, "Choose Material or Not material."); return; }
    const note = clean(req.body?.note, 600);
    if (!sentence(note)) { refuse(res, "State the reason in a full sentence."); return; }
    const confirmUrl = safeUrl(req.body?.confirmUrl);
    if (req.body?.confirmUrl && !confirmUrl) { refuse(res, "Use an HTTP or HTTPS address for the confirming source."); return; }
    // A press item is a lead. It changes nothing until a government source confirms it.
    if (materiality === "Material" && item.lead && tierForUrl(confirmUrl) > 2) {
      refuse(res, "A press item is a lead. Add the address of the government source that confirms it before recording it as material."); return;
    }
    const { catalog } = await catalogState(environment, practice);
    const vendors = [...new Set((Array.isArray(req.body?.vendors) ? req.body.vendors : []).map(id => clean(id, 80)))].filter(id => catalog.vendors.some(row => row.id === id)).slice(0, 40);
    const broad = Boolean(req.body?.broad);
    const affected = materiality === "Material" ? affectedEntries(catalog, { topics, vendors, broad }) : { vendors: [], parts: [] };
    const now = new Date().toISOString();
    const earlier = doc?.payload || {};
    const saved = await store.saveGuideDocument({
      environment, projectId: practice ? PRACTICE_WATCH_PARTITION : WATCH_PARTITION, kind: "watch-review", key,
      expectedVersion: safeVersion(req.body?.version), savedBy: acting.email,
      payload: {
        itemId, title: clean(item.title, 300), url: safeUrl(item.url), sourceLabel: clean(item.sourceLabel, 160), tier: item.tier, lead: Boolean(item.lead), date: clean(item.date, 20),
        // The item is kept whole with its decision, so the decision stays readable after the item leaves the recent checks.
        summary: clean(item.summary, 500), publisher: clean(item.publisher, 160), sourceId: clean(item.sourceId, 60), foundAt: clean(item.foundAt, 40),
        itemTopics: (Array.isArray(item.topics) ? item.topics : []).map(id => clean(id, 40)).filter(id => topicOf(id)).slice(0, 20),
        itemVendors: (Array.isArray(item.vendors) ? item.vendors : []).map(id => clean(id, 80)).filter(Boolean).slice(0, 40),
        dispositions: { ...(earlier.dispositions || {}), [acting.role]: { materiality, topics, vendors, broad, note: closed(note), confirmUrl, affected, by: acting.email, role: acting.role, at: now } },
        log: [...(Array.isArray(earlier.log) ? earlier.log : []), { at: now, by: acting.email, role: acting.role, materiality, topics, note: closed(note), vendors: affected.vendors.length, parts: affected.parts.length }].slice(-60),
      },
    });
    if (!saved) { conflict(res); return; }
    res.json({ review: publicReview(saved), affected });
  });
}
