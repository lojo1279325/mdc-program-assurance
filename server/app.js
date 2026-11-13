import express from "express";
import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import {
  currentEnvironment,
  decideAccess,
  designatedAdministrators,
  isAllowedDomain,
} from "./policy.js";
import { cleanEmail, openStore, validEnvironment, validRole } from "./store.js";
import { applyImportRow, cleanProjectId, normalizeReview, validRecordCode } from "../public/rules.js";
import { importPrivilege, libraryPrivilege, privilegeDecision, projectPrivilege, restorePrivilege } from "../public/privileges.js";
import { BUILT_IN_PROJECT, validNewProjectCode, vendorKey } from "../public/boards.js";
import { lookupSources, sourceStatus } from "./sources.js";
import { PRACTICE_PROJECT, practiceActor, practiceRoleFrom, practiceSeedPlan } from "./practice.js";
import { rowsFromWorkbook, workbookFromRows } from "./sheet.js";

const store = openStore();

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function writeCookie(res, name, value, maxAgeSeconds) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (process.env.APP_ORIGIN?.startsWith("https://")) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function publicSession(extra = {}) {
  return {
    state: "anonymous",
    environment: currentEnvironment(),
    providers: {
      google: Boolean(process.env.APP_ORIGIN && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    domains: ["blackengtech.com", "alvarezandmarsal.com"],
    database: store.kind,
    ...extra,
  };
}

async function sessionFrom(req) {
  const id = readCookie(req, "sid");
  if (!id) return null;
  return store.readSession(id);
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "3mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      name: "MDC Program Assurance",
      environment: currentEnvironment(),
      database: store.kind,
    });
  });

  app.get("/api/session", async (req, res) => {
    const session = await sessionFrom(req);
    if (!session || !isAllowedDomain(session.email)) {
      res.json(publicSession());
      return;
    }
    const environment = currentEnvironment();
    const grant = await store.activeGrant(session.email, environment);
    const decision = decideAccess({
      email: session.email,
      emailVerified: true,
      grantRole: grant?.role || null,
      grantRevoked: Boolean(grant?.revoked_at),
    });
    res.json(publicSession({
      state: decision === "granted" ? "granted" : "pending",
      email: session.email,
      role: decision === "granted" ? grant.role : null,
      administrator: designatedAdministrators().includes(session.email) || grant?.role === "administrator",
    }));
  });

  app.get("/api/auth/google/start", (req, res) => {
    const origin = (process.env.APP_ORIGIN || "").replace(/\/$/, "");
    if (!origin || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      res.status(503).json({ message: "Google sign-in is not connected yet." });
      return;
    }
    const state = randomBytes(16).toString("hex");
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${origin}/api/auth/google/callback`);
    writeCookie(res, "oauth_state", state, 600);
    res.redirect(client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      prompt: "select_account",
    }));
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const origin = (process.env.APP_ORIGIN || "").replace(/\/$/, "");
    const saved = readCookie(req, "oauth_state");
    writeCookie(res, "oauth_state", "", 0);
    if (!origin || !saved || saved !== req.query.state || !req.query.code) {
      res.redirect("/?error=signin");
      return;
    }
    try {
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${origin}/api/auth/google/callback`);
      const { tokens } = await client.getToken(String(req.query.code));
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = cleanEmail(payload?.email);
      if (!email || payload.email_verified !== true || !isAllowedDomain(email)) {
        res.redirect("/?error=domain");
        return;
      }
      const session = await store.createSession(email, "google");
      writeCookie(res, "sid", session.id, 8 * 60 * 60);
      res.redirect("/");
    } catch {
      res.redirect("/?error=signin");
    }
  });

  app.post("/api/auth/sign-out", async (req, res) => {
    const id = readCookie(req, "sid");
    if (id) await store.deleteSession(id);
    writeCookie(res, "sid", "", 0);
    res.json({ ok: true });
  });

  app.get("/api/items", async (req, res) => {
    const session = await sessionFrom(req);
    const environment = currentEnvironment();
    const grant = session ? await store.activeGrant(session.email, environment) : null;
    const decision = decideAccess({
      email: session?.email || "",
      emailVerified: Boolean(session),
      grantRole: grant?.role || null,
      grantRevoked: Boolean(grant?.revoked_at),
    });
    if (!session) {
      res.status(401).json({ message: "Sign-in is required." });
      return;
    }
    if (decision !== "granted") {
      res.status(403).json({ message: "An administrator has not granted a role for this environment." });
      return;
    }
    res.json({ environment, items: await store.listItems(environment) });
  });

  app.post("/api/items", async (req, res) => {
    const session = await sessionFrom(req);
    const environment = currentEnvironment();
    const grant = session ? await store.activeGrant(session.email, environment) : null;
    if (!session || !grant || grant.revoked_at) {
      res.status(401).json({ message: "Sign-in is required." });
      return;
    }
    if (grant.role !== "administrator") {
      res.status(403).json({ message: "This path does not store an analysis record." });
      return;
    }
    const code = String(req.body?.code || "").trim();
    const status = String(req.body?.status || "Open").trim();
    const note = String(req.body?.note || "");
    if (!validRecordCode(code) || status.length > 40 || note.length > 8000) {
      res.status(400).json({ message: "The record was not saved." });
      return;
    }
    const item = await store.saveItem({ code, kind: "record", status, note, environment });
    res.json(item);
  });

  app.post("/api/access/grants", async (req, res) => {
    const session = await sessionFrom(req);
    if (!session || !designatedAdministrators().includes(session.email)) {
      res.status(403).json({ message: "Only a designated administrator can grant a role." });
      return;
    }
    const email = cleanEmail(req.body?.email);
    const role = String(req.body?.role || "");
    const environment = currentEnvironment();
    if (req.body?.environment && String(req.body.environment) !== environment) {
      res.status(403).json({ message: "A grant can be made only for this environment." });
      return;
    }
    if (email && email === session.email) {
      res.status(403).json({ message: "Grant a different person. Replacing your own role would remove your administrator access." });
      return;
    }
    if (!email || !isAllowedDomain(email) || !validRole(role) || !validEnvironment(environment)) {
      res.status(400).json({ message: "The grant was not saved. Use an allowed domain, a known role, and one environment." });
      return;
    }
    if (role === "administrator" && !designatedAdministrators().includes(session.email)) {
      res.status(403).json({ message: "Only a designated administrator can grant the administrator role." });
      return;
    }
    res.json(await store.grant({ email, role, environment, grantedBy: session.email }));
  });

  function parseReview(row) {
    if (!row || row.kind !== "review") return null;
    try {
      const parsed = JSON.parse(row.note || "");
      if (!parsed || typeof parsed !== "object") return null;
      return normalizeReview({ ...parsed, code: row.code });
    } catch {
      return null;
    }
  }

  async function grantedActor(req) {
    const session = await sessionFrom(req);
    const environment = currentEnvironment();
    const grant = session ? await store.activeGrant(session.email, environment) : null;
    const decision = decideAccess({
      email: session?.email || "",
      emailVerified: Boolean(session),
      grantRole: grant?.role || null,
      grantRevoked: Boolean(grant?.revoked_at),
    });
    if (!session) return { error: 401, message: "Sign-in is required." };
    if (decision !== "granted") return { error: 403, message: "An administrator has not granted a role for this environment." };
    return { session, grant, environment };
  }

  app.get("/api/workbench", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const rows = await store.listItems(actor.environment);
    res.json({ environment: actor.environment, items: rows.map(parseReview).filter(Boolean) });
  });

  app.post("/api/workbench/items", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!validRecordCode(code)) {
      res.status(400).json({ message: "The record was not saved." });
      return;
    }
    const existing = parseReview((await store.listItems(actor.environment)).find((row) => row.code === code));
    const acting = practiceActor({
      environment: actor.environment,
      designated: designatedAdministrators().includes(actor.session.email),
      grantRole: actor.grant.role,
      email: actor.session.email,
      requestedRole: practiceRoleFrom(req.get("x-practice-role")),
      projectId: req.body?.projectId || existing?.projectId,
      existingProjectId: existing?.projectId,
    });
    if (acting.error) {
      res.status(403).json({ message: acting.error });
      return;
    }
    const latest = await store.latestVersion(code, actor.environment);
    const expected = Number(req.body?.version || 0);
    if (latest && expected !== latest) {
      res.status(409).json({ message: `This record is now version ${latest}. Reload before saving.` });
      return;
    }
    const record = normalizeReview({ ...req.body, code, kind: "review" });
    if (acting.practice) record.projectId = PRACTICE_PROJECT;
    record.preparedBy = existing?.preparedBy || acting.email;
    record.version = Math.max(latest, expected) + 1;
    const block = privilegeDecision({ email: acting.email, role: acting.role }, existing, record);
    if (block) {
      res.status(403).json({ message: block });
      return;
    }
    if (record.status === "Approved") record.reviewedBy = acting.email;
    const saved = await store.saveItem({
      code,
      kind: "review",
      status: record.status,
      note: JSON.stringify(record),
      environment: actor.environment,
    });
    await store.appendVersion({
      code,
      environment: actor.environment,
      version: record.version,
      savedBy: actor.session.email,
      changeNote: acting.practice
        ? `Practice ${acting.role}. ${record.changeNote || "Saved from the workbench."}`.slice(0, 300)
        : (record.changeNote || "Saved from the workbench."),
      snapshot: JSON.stringify(record),
    });
    res.json(parseReview(saved) || record);
  });

  app.post("/api/workbench/practice", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    if (actor.environment !== "development" || actor.grant.role !== "administrator" || !designatedAdministrators().includes(actor.session.email)) {
      res.status(403).json({ message: "Only a designated administrator can load practice records in development." });
      return;
    }
    const items = (await store.listItems(actor.environment)).map(parseReview).filter(Boolean);
    const plan = practiceSeedPlan(items);
    if (plan.blocked.length) {
      res.status(409).json({ message: "A practice code already belongs to another project. No practice record was written.", blocked: plan.blocked });
      return;
    }
    const projects = await store.listProjects(actor.environment);
    if (!projects.some((project) => project.code === PRACTICE_PROJECT)) {
      await store.saveProject({
        environment: actor.environment,
        code: PRACTICE_PROJECT,
        name: "Practice reviews",
        status: "Active",
        ownerEmail: actor.session.email,
        note: "Development samples for create, review, and approve. This project is not the MDC register.",
        createdBy: actor.session.email,
      });
    }
    for (const sample of plan.created) {
      const record = { ...sample, version: 1 };
      await store.saveItem({
        code: record.code,
        kind: "review",
        status: record.status,
        note: JSON.stringify(record),
        environment: actor.environment,
      });
      await store.appendVersion({
        code: record.code,
        environment: actor.environment,
        version: 1,
        savedBy: actor.session.email,
        changeNote: "Practice sample for development testing.",
        snapshot: JSON.stringify(record),
      });
    }
    res.json({
      project: PRACTICE_PROJECT,
      created: plan.created.map((item) => item.code),
      skipped: plan.skipped,
    });
  });

  app.post("/api/workbench/import", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    if (actor.grant.role !== "nstt") {
      res.status(403).json({ message: "Only the NSTT role can import register updates." });
      return;
    }
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 40) : [];
    if (!rows.length) {
      res.status(400).json({ message: "The import file has no register rows." });
      return;
    }
    const current = new Map((await store.listItems(actor.environment)).map((row) => [row.code, parseReview(row)]).filter((entry) => entry[1]));
    const results = [];
    let applied = 0;
    let unchanged = 0;
    let rejected = 0;
    const batchId = randomBytes(8).toString("hex");
    for (const row of rows) {
      const existing = current.get(String(row.code || "").trim().toUpperCase());
      const outcome = applyImportRow(existing, row, actor.session.email);
      if (outcome.result === "applied") {
        const privilege = importPrivilege(actor.grant.role, existing, outcome.record);
        if (privilege) {
          rejected += 1;
          results.push({ code: outcome.code, result: "rejected", message: privilege });
          continue;
        }
      }
      if (outcome.result === "rejected") {
        rejected += 1;
        results.push({ code: outcome.code, result: outcome.result, message: outcome.message });
        continue;
      }
      if (outcome.result === "unchanged") {
        unchanged += 1;
        results.push({ code: outcome.code, result: outcome.result, version: outcome.record.version, message: outcome.message });
        continue;
      }
      await store.saveItem({
        code: outcome.record.code,
        kind: "review",
        status: outcome.record.status,
        note: JSON.stringify(outcome.record),
        environment: actor.environment,
      });
      await store.appendVersion({
        code: outcome.record.code,
        environment: actor.environment,
        version: outcome.record.version,
        savedBy: actor.session.email,
        changeNote: outcome.message,
        batchId,
        snapshot: JSON.stringify(outcome.record),
      });
      current.set(outcome.record.code, outcome.record);
      applied += 1;
      results.push({ code: outcome.code, result: outcome.result, version: outcome.record.version, message: outcome.message });
    }
    await store.saveBatch({
      environment: actor.environment,
      createdBy: actor.session.email,
      label: String(req.body?.label || "Register import").slice(0, 120),
      applied,
      unchanged,
      rejected,
    });
    res.json({ applied, unchanged, rejected, results });
  });

  app.post("/api/workbench/parse", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const file = String(req.body?.file || "");
    if (!file) {
      res.status(400).json({ message: "Choose the register workbook before importing." });
      return;
    }
    try {
      const rows = rowsFromWorkbook(Buffer.from(file, "base64"));
      res.json({ rows: rows.slice(0, 1000) });
    } catch {
      res.status(400).json({ message: "The workbook could not be read. Use the Register sheet from an export." });
    }
  });

  app.get("/api/workbench/export", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const items = (await store.listItems(actor.environment)).map(parseReview).filter(Boolean);
    const file = workbookFromRows(items);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"MDC_Program_Assurance_Register.xlsx\"");
    res.send(file);
  });

  app.get("/api/workbench/versions", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const code = String(req.query.code || "").trim().toUpperCase();
    if (!validRecordCode(code)) {
      res.status(400).json({ message: "Choose a review record to see its versions." });
      return;
    }
    const versions = await store.listVersions(code, actor.environment);
    res.json({ code, versions: versions.map(({ snapshot, ...version }) => version) });
  });

  app.post("/api/workbench/versions/restore", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const code = String(req.body?.code || "").trim().toUpperCase();
    const version = Number(req.body?.version);
    const prior = await store.readVersion(code, actor.environment, version);
    if (!prior?.snapshot) {
      res.status(404).json({ message: "That version was not found." });
      return;
    }
    const latest = await store.latestVersion(code, actor.environment);
    const restored = normalizeReview(JSON.parse(prior.snapshot));
    const current = parseReview((await store.listItems(actor.environment)).find((row) => row.code === code));
    const privilege = restorePrivilege(actor.grant.role, restored, current);
    if (privilege) {
      res.status(403).json({ message: privilege });
      return;
    }
    restored.version = latest + 1;
    if (restored.status === "Approved" || restored.status === "In review") restored.status = "Returned";
    restored.changeNote = `Restored version ${version} as version ${restored.version}. An approved or in-review snapshot comes back as returned.`;
    await store.saveItem({
      code,
      kind: "review",
      status: restored.status,
      note: JSON.stringify(restored),
      environment: actor.environment,
    });
    await store.appendVersion({
      code,
      environment: actor.environment,
      version: restored.version,
      savedBy: actor.session.email,
      changeNote: restored.changeNote,
      snapshot: JSON.stringify(restored),
    });
    res.json(restored);
  });

  app.get("/api/projects", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const saved = await store.listProjects(actor.environment);
    res.json({ projects: [BUILT_IN_PROJECT, ...saved.filter((project) => project.code !== "MDC")] });
  });

  app.post("/api/projects", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const privilege = projectPrivilege(actor.grant.role);
    if (privilege) {
      res.status(403).json({ message: privilege });
      return;
    }
    const code = String(req.body?.code || "").trim().toUpperCase();
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!validNewProjectCode(code) || name.length < 2) {
      res.status(400).json({ message: "Use a short project code and a name. MDC is reserved for the current register." });
      return;
    }
    const saved = await store.saveProject({
      environment: actor.environment,
      code,
      name,
      status: "Active",
      ownerEmail: actor.session.email,
      note: String(req.body?.note || "").slice(0, 500),
      createdBy: actor.session.email,
    });
    if (!saved) {
      res.status(409).json({ message: "That project code already exists." });
      return;
    }
    res.json(saved);
  });

  app.get("/api/library", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const [vendors, parts] = await Promise.all([
      store.listVendors(actor.environment),
      store.listParts(actor.environment),
    ]);
    res.json({ vendors, parts });
  });

  app.post("/api/library/vendors", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const privilege = libraryPrivilege(actor.grant.role);
    if (privilege) {
      res.status(403).json({ message: privilege });
      return;
    }
    const name = String(req.body?.name || "").trim().slice(0, 300);
    if (name.length < 2) {
      res.status(400).json({ message: "Enter the vendor name before saving it." });
      return;
    }
    res.json(await store.saveVendor({
      environment: actor.environment,
      name,
      nameKey: vendorKey(name),
      country: String(req.body?.country || "").slice(0, 80),
      identifier: String(req.body?.identifier || "").slice(0, 80),
      note: String(req.body?.note || "").slice(0, 500),
    }));
  });

  app.post("/api/library/parts", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const privilege = libraryPrivilege(actor.grant.role);
    if (privilege) {
      res.status(403).json({ message: privilege });
      return;
    }
    const code = String(req.body?.code || "").trim().toUpperCase().slice(0, 40);
    const name = String(req.body?.name || "").trim().slice(0, 200);
    if (!/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(code) || name.length < 2) {
      res.status(400).json({ message: "Enter a part code and a part name." });
      return;
    }
    res.json(await store.savePart({
      environment: actor.environment,
      code,
      name,
      drawing: String(req.body?.drawing || "").slice(0, 120),
      vendorName: String(req.body?.vendorName || "").slice(0, 300),
      note: String(req.body?.note || "").slice(0, 500),
    }));
  });

  app.get("/api/sources/status", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    res.json(sourceStatus());
  });

  app.post("/api/sources/lookup", async (req, res) => {
    const actor = await grantedActor(req);
    if (actor.error) {
      res.status(actor.error).json({ message: actor.message });
      return;
    }
    const name = String(req.body?.name || "").trim().slice(0, 200);
    if (name.length < 2) {
      res.status(400).json({ message: "Enter at least two characters before checking sources." });
      return;
    }
    const kind = req.body?.kind === "part" ? "part" : "vendor";
    const subjectKey = `${kind}:${kind === "part" ? name.toUpperCase() : vendorKey(name)}`.slice(0, 180);
    const lookup = await lookupSources({ name, country: String(req.body?.country || "").slice(0, 80) });
    const saved = [];
    for (const result of lookup.results) {
      saved.push(await store.saveLookup({
        environment: actor.environment,
        subjectKey,
        source: result.source,
        observedAt: result.observedAt,
        status: result.status,
        summary: result.summary,
        payload: JSON.stringify(result.payload || {}).slice(0, 4000),
      }));
    }
    res.json({ ...lookup, subjectKey, projectId: cleanProjectId(req.body?.projectId), saved: saved.map(({ payload, ...row }) => row) });
  });

  app.get("/api/access/grants", async (req, res) => {
    const session = await sessionFrom(req);
    if (!session || !designatedAdministrators().includes(session.email)) {
      res.status(403).json({ message: "Only a designated administrator can review grants." });
      return;
    }
    const environment = currentEnvironment();
    if (req.query.environment && String(req.query.environment) !== environment) {
      res.status(403).json({ message: "Grants can be reviewed only for this environment." });
      return;
    }
    res.json({ environment, grants: await store.listGrants(environment) });
  });

  return app;
}
