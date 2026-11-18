import { createHash } from "node:crypto";
import {
  RISK_RULES, REASSESSMENT_TRIGGERS, RISK_SOURCE, assessmentInputs, draftRiskPolicy, normalizeRiskAssessment,
  normalizeTrigger, policyApprovalBlock, riskValidationBlock, safeSource, text, validDate,
} from "../public/risk-model.js";
import { cleanProjectId } from "../public/rules.js";
import { designatedAdministrators } from "./policy.js";
import { practiceActor, practiceRoleFrom } from "./practice.js";
import { vendorKey } from "../public/boards.js";

const stringify = (value) => JSON.stringify(value);
function userInputs(value) {
  const input = assessmentInputs(value);
  if (!input) return null;
  const { policy, policyVersion, ...facts } = input;
  return facts;
}
const contextFields = ["title", "module", "supplier", "sourceItem", "drawing", "condition", "lifecycle", "evidence", "openFact", "tradeSensitive", "projectId"];
const recordContext = (record) => Object.fromEntries(contextFields.map(key => [key, record?.[key] ?? ""]));
const digest = (record) => createHash("sha256").update(stringify({ assessment: assessmentInputs(record.riskAssessment), context: recordContext(record) })).digest("hex");
const safeVersion = (value) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : -1;
const canReview = (actor, item) => actor.role === item.reviewerRole && actor.email !== item.preparedBy && actor.role !== item.ownerRole;

export function activePolicy(document, projectId) {
  const active = document?.payload?.active;
  return active || { ...draftRiskPolicy(document?.payload?.draft), id: `${projectId}-draft-preview`, status: "Draft" };
}

export async function decorateRiskRecords(store, environment, items) {
  const documents = await store.listRiskDocuments(environment);
  return items.map(item => {
    const related = documents.filter(doc => doc.kind === "trigger" && doc.projectId === item.projectId && doc.payload.code === item.code && !doc.payload.closedAt);
    const policy = documents.find(doc => doc.kind === "policy" && doc.projectId === item.projectId);
    const policyChanged = Boolean(item.riskAssessment && policy?.payload?.active && item.riskAssessment.policyVersion !== policy.payload.active.id);
    if (!related.length && !item.riskAssessment) return item;
    return { ...item, reassessment: {
      pendingCount: related.filter(doc => doc.payload.materiality === "Pending").length,
      materialCount: related.filter(doc => doc.payload.materiality === "Material change").length,
      policyChanged, triggerIds: related.filter(doc => doc.payload.materiality === "Material change").map(doc => doc.key),
    } };
  });
}

export async function prepareRiskChange({ store, environment, actor, existing, record, practice }) {
  delete record.reassessment;
  const prior = normalizeRiskAssessment(existing?.riskAssessment);
  let next = normalizeRiskAssessment(record.riskAssessment);
  if (!next && !prior) return "";
  if (!next && prior) return "A risk assessment cannot be removed. Preserve its audit trail and return the record for correction.";
  if (next.triggerIds.length) {
    const events = await store.listRiskDocuments(environment, record.projectId);
    if (next.triggerIds.some(id => !events.some(doc => doc.kind === "trigger" && doc.key === id && doc.payload.code === record.code))) {
      return "Every linked trigger must belong to this record in the selected project.";
    }
  }
  const changed = stringify(userInputs(prior)) !== stringify(userInputs(next)) || stringify(recordContext(existing)) !== stringify(recordContext(record)) ||
    (actor.role === record.ownerRole && ["risk", "confidence", "action"].some(key => existing?.[key] !== record[key]));
  if (prior && existing.projectId !== record.projectId) return "A record with risk history stays in its assessed project. Create a separately scoped record if needed.";
  const policyDoc = await store.readRiskDocument(environment, "policy", record.projectId);
  const currentPolicy = activePolicy(policyDoc, record.projectId);
  const policyChanged = Boolean(prior && currentPolicy.id !== prior.policyVersion);
  const refreshPolicy = actor.role === (existing?.ownerRole || record.ownerRole) && ["Open", "Returned"].includes(existing?.status || record.status) && policyChanged;
  if (!prior || changed || refreshPolicy) {
    if (actor.role !== (existing?.ownerRole || record.ownerRole)) return "Only the preparing role can change the risk facts or the policy basis.";
    next.policy = currentPolicy;
    next.policyVersion = currentPolicy.id;
    next.validation = null;
  } else {
    next.policy = prior.policy;
    next.policyVersion = prior.policyVersion;
    const validationChanged = stringify(next.validation) !== stringify(prior.validation);
    if (validationChanged) {
      if (!existing || existing.status !== "In review" || !canReview(actor, existing)) return "Risk validation is limited to the assigned, different-person reviewer while the record is in review.";
      if (policyChanged) return "The policy changed. Return the record so the preparing role can re-assess it under the current policy.";
      const block = riskValidationBlock(next, next.validation, { practice });
      if (block) return block;
      record.riskAssessment = next;
      next.validation = { ...next.validation, by: actor.email, role: actor.role, at: new Date().toISOString(), recordVersion: record.version, inputDigest: digest(record) };
      record.risk = next.validation.finalRisk;
      record.confidence = next.validation.confidence;
      record.action = next.validation.action;
    } else next.validation = prior.validation;
  }
  for (const [field, id] of [["prohibition", "RR-01"], ["designation", "RR-02"]]) {
    const evidence = next.evidence[id];
    if (next.facts[field] === "confirmed" && (!evidence.note || !evidence.url || !evidence.checkedOn || evidence.checkedOn > new Date().toISOString().slice(0, 10))) {
      return `${id} needs a current source URL, checked date, and the applicability rationale before a confirmed finding is saved.`;
    }
  }
  if (record.status === "In review" && !practice && next.policy?.status !== "Approved") return "An administrator must approve the risk policy before this real assessment is sent to review.";
  if (record.status === "Approved") {
    record.riskAssessment = next;
    if (!next.validation?.at || next.validation.inputDigest !== digest(record)) return "The assigned reviewer must validate this version of the risk assessment before approval.";
    if (policyChanged) return "The policy changed. Return and re-assess the record before approval.";
    const block = riskValidationBlock(next, next.validation, { practice });
    if (block) return block;
    if (record.risk !== next.validation.finalRisk || record.confidence !== next.validation.confidence || record.action !== next.validation.action) return "The final risk, confidence, and action must match the validated assessment.";
  }
  record.riskAssessment = next;
  // Derived status must be read from the server, never accepted from a browser.
  delete record.reassessment;
  return "";
}

export function registerRiskRoutes(app, { store, grantedActor, parseReview }) {
  async function context(req, res, projectId) {
    // The caller resolves the working role for this project.
    const actor = await grantedActor(req, projectId);
    if (actor.error) { res.status(actor.error).json({ message: actor.message }); return null; }
    const requestedRole = practiceRoleFrom(req.get("x-practice-role"));
    const acting = requestedRole ? practiceActor({
      environment: actor.environment, designated: designatedAdministrators().includes(actor.session.email),
      grantRole: actor.grant.role, email: actor.session.email,
      requestedRole, projectId,
      existingProjectId: projectId,
    }) : { role: actor.grant.role, email: actor.session.email, practice: false };
    if (acting.error) { res.status(403).json({ message: acting.error }); return null; }
    return { ...actor, acting };
  }
  const conflict = (res) => res.status(409).json({ message: "This entry changed in another session. Reload before saving." });
  const reviews = async (environment) => (await store.listItems(environment)).map(parseReview).filter(Boolean);

  app.get("/api/assurance", async (req, res) => {
    const projectId = cleanProjectId(req.query.project);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const documents = await store.listRiskDocuments(ctx.environment, projectId);
    res.json({
      projectId, source: RISK_SOURCE,
      policy: documents.find(doc => doc.kind === "policy") || { key: projectId, kind: "policy", projectId, version: 0, payload: { draft: draftRiskPolicy(), active: null } },
      triggers: documents.filter(doc => doc.kind === "trigger"),
    });
  });

  app.get("/api/assurance/history", async (req, res) => {
    const ctx = await context(req, res, cleanProjectId(req.query.project));
    if (!ctx) return;
    const kind = ["policy", "trigger"].includes(req.query.kind) ? req.query.kind : "";
    const key = text(req.query.key, 100);
    const document = kind ? await store.readRiskDocument(ctx.environment, kind, key) : null;
    if (!document || document.projectId !== cleanProjectId(req.query.project)) { res.status(404).json({ message: "This risk entry was not found in the selected project." }); return; }
    res.json({ history: await store.listRiskHistory(ctx.environment, kind, key) });
  });

  app.post("/api/assurance/policy", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    if (ctx.grant.role !== "administrator" || !designatedAdministrators().includes(ctx.session.email)) {
      res.status(403).json({ message: "Only a designated administrator can configure the risk policy." }); return;
    }
    const expectedVersion = safeVersion(req.body.version);
    const old = await store.readRiskDocument(ctx.environment, "policy", projectId);
    if (expectedVersion !== (old?.version || 0)) { conflict(res); return; }
    const draft = draftRiskPolicy(req.body.draft);
    const approve = req.body.action === "approve";
    if (!["save", "approve"].includes(req.body.action)) { res.status(400).json({ message: "Choose Save draft or Approve rules." }); return; }
    if (approve) {
      if (req.body.acknowledge !== true) { res.status(400).json({ message: "Acknowledge the policy's effect on existing assessments before approving it." }); return; }
      const block = policyApprovalBlock(draft);
      if (block) { res.status(400).json({ message: block }); return; }
    }
    const active = approve ? { ...draft, id: `${projectId}-v${expectedVersion + 1}`, status: "Approved", approvedAt: new Date().toISOString(), approvedBy: ctx.session.email } : old?.payload?.active || null;
    const saved = await store.saveRiskDocument({ environment: ctx.environment, projectId, kind: "policy", key: projectId, expectedVersion, savedBy: ctx.session.email, payload: { draft, active } });
    if (!saved) { conflict(res); return; }
    res.json(saved);
  });

  app.post("/api/assurance/triggers", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    if (!["nstt", "cpi", "trade"].includes(ctx.acting.role)) { res.status(403).json({ message: "Administrators do not log analysis events. Use a granted working role or the isolated practice project." }); return; }
    const all = await reviews(ctx.environment);
    const codes = [...new Set((Array.isArray(req.body.codes) ? req.body.codes : []).map(code => text(code, 20)))];
    const batchId = text(req.body.batchId, 50);
    if (!codes.length || codes.length > 500 || !/^[a-zA-Z0-9-]{8,50}$/.test(batchId)) { res.status(400).json({ message: "Select affected records and retry with a valid event identifier." }); return; }
    if (!REASSESSMENT_TRIGGERS.some(row => row.id === req.body.type)) { res.status(400).json({ message: "Choose one of the ten event categories." }); return; }
    if (!["record", "vendor"].includes(req.body.scopeKind)) { res.status(400).json({ message: "Choose a record or vendor event scope." }); return; }
    if (codes.some(code => !all.some(item => item.code === code && item.projectId === projectId))) { res.status(400).json({ message: "Every affected record must belong to the selected project." }); return; }
    if (req.body.scopeKind === "vendor") {
      const expected = all.filter(item => item.projectId === projectId && item.supplier && vendorKey(item.supplier) === vendorKey(req.body.scopeLabel)).map(item => item.code).sort();
      if (!expected.length || stringify(expected) !== stringify([...codes].sort())) { res.status(400).json({ message: "Vendor scope must include exactly that vendor's records in the selected project. Refresh and review the affected list." }); return; }
    } else if (codes.length !== 1) { res.status(400).json({ message: "Record scope must identify one record." }); return; }
    if (req.body.sourceUrl && !safeSource(req.body.sourceUrl)) { res.status(400).json({ message: "Use an HTTP or HTTPS source URL without credentials." }); return; }
    if (!req.body.summary || !req.body.sourceNote || !validDate(req.body.observedOn) || req.body.observedOn > new Date().toISOString().slice(0, 10)) { res.status(400).json({ message: "Record the event, supporting evidence, and a valid observation date." }); return; }
    if (req.body.dueOn && !validDate(req.body.dueOn)) { res.status(400).json({ message: "Use a valid review due date." }); return; }
    const saved = [];
    for (const code of codes) {
      const key = `${batchId}-${code}`;
      const prior = await store.readRiskDocument(ctx.environment, "trigger", key);
      if (prior) { saved.push(prior); continue; }
      const payload = normalizeTrigger({
        ...req.body, id: key, projectId, code, materiality: "Pending", rationale: "",
        reviewedBy: "", reviewedRole: "", reviewedAt: "", disposition: "", dispositionNote: "", closedAt: "",
        recordVersion: all.find(item => item.code === code).version,
        reportedBy: ctx.acting.email, reportedRole: ctx.acting.role, reportedAt: new Date().toISOString(),
      });
      const document = await store.saveRiskDocument({ environment: ctx.environment, projectId, kind: "trigger", key, expectedVersion: 0, savedBy: ctx.session.email, payload });
      if (document) saved.push(document);
      else {
        const concurrent = await store.readRiskDocument(ctx.environment, "trigger", key);
        if (concurrent) saved.push(concurrent);
        else { conflict(res); return; }
      }
    }
    res.json({ triggers: saved, message: `Logged ${saved.length} affected record${saved.length === 1 ? "" : "s"}. No rating, recommendation, or approval was changed.` });
  });

  app.post("/api/assurance/triggers/:key", async (req, res) => {
    const projectId = cleanProjectId(req.body?.projectId);
    const ctx = await context(req, res, projectId);
    if (!ctx) return;
    const old = await store.readRiskDocument(ctx.environment, "trigger", text(req.params.key, 100));
    if (!old || old.projectId !== projectId) { res.status(404).json({ message: "This trigger was not found." }); return; }
    if (old.version !== safeVersion(req.body.version)) { conflict(res); return; }
    const item = (await reviews(ctx.environment)).find(row => row.code === old.payload.code && row.projectId === projectId);
    if (!item || !canReview(ctx.acting, item)) { res.status(403).json({ message: "Only the assigned, different-person reviewer can determine materiality or close this event." }); return; }
    if (old.payload.closedAt) { res.status(409).json({ message: "This event is closed. Log a new event if conditions change again." }); return; }
    let payload = normalizeTrigger(old.payload);
    if (req.body.action === "materiality") {
      if (!["No material change", "Material change"].includes(req.body.materiality) || !text(req.body.rationale)) { res.status(400).json({ message: "Choose materiality and document the rationale." }); return; }
      payload = normalizeTrigger({
        ...payload, materiality: req.body.materiality, rationale: req.body.rationale,
        rules: Array.isArray(req.body.rules) && req.body.rules.length ? req.body.rules : payload.rules,
        reviewedBy: ctx.acting.email, reviewedRole: ctx.acting.role, reviewedAt: new Date().toISOString(), recordVersion: item.version,
      });
      if (!payload.rules.length) { res.status(400).json({ message: "Select at least one affected rule." }); return; }
      if (payload.materiality === "No material change") { payload.closedAt = new Date().toISOString(); payload.disposition = "Confirmed recommendation"; payload.dispositionNote = payload.rationale; }
    } else if (req.body.action === "escalate") {
      if (payload.materiality !== "Material change" || !text(req.body.dispositionNote)) { res.status(400).json({ message: "Escalation needs a material event and a documented next action." }); return; }
      payload.disposition = "Escalated";
      payload.dispositionNote = text(req.body.dispositionNote);
    } else if (req.body.action === "resolve") {
      const risk = normalizeRiskAssessment(item.riskAssessment);
      if (payload.materiality !== "Material change" || item.status !== "Approved" || !risk?.validation?.at ||
        item.version <= payload.recordVersion || !risk.triggerIds.includes(payload.id) ||
        payload.rules.some(id => !risk.reassessedRules.includes(id))) {
        res.status(400).json({ message: "A new, approved risk assessment must cover this trigger and every affected rule before disposition is recorded." }); return;
      }
      const documents = await store.listRiskDocuments(ctx.environment, projectId);
      const policy = documents.find(doc => doc.kind === "policy")?.payload?.active;
      if (policy && policy.id !== risk.policyVersion) { res.status(400).json({ message: "Re-assess under the current approved policy before closing this event." }); return; }
      if (!["Confirmed recommendation", "Revised recommendation"].includes(req.body.disposition) || !text(req.body.dispositionNote)) { res.status(400).json({ message: "Confirm or revise the recommendation and record its rationale. Use Escalate for resolution to keep an unresolved event open." }); return; }
      payload.disposition = req.body.disposition;
      payload.dispositionNote = text(req.body.dispositionNote);
      payload.closedAt = new Date().toISOString();
    } else { res.status(400).json({ message: "Choose a materiality review or a disposition." }); return; }
    const saved = await store.saveRiskDocument({ environment: ctx.environment, projectId, kind: "trigger", key: old.key, expectedVersion: old.version, savedBy: ctx.session.email, payload });
    if (!saved) { conflict(res); return; }
    res.json(saved);
  });
}
