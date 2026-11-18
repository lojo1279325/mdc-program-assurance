import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./app.js";
import { createMemory } from "./store.js";
import { syntheticRecord, syntheticAssessment, syntheticPolicy, syntheticValidation } from "./risk-fixtures.js";
import { REASSESSMENT_TRIGGERS, decisionEligible } from "../public/risk-model.js";
import { riskFile, riskPostgres } from "./risk-store.js";

process.env.APP_ENV = "development";
process.env.ADMIN_EMAILS = "qa-admin@blackengtech.com";
const users = {
  administrator: "qa-admin@blackengtech.com", nstt: "qa-preparer@blackengtech.com",
  cpi: "qa-reviewer@alvarezandmarsal.com", trade: "qa-trade@blackengtech.com",
};

async function harness(t) {
  const store = createMemory();
  const sessions = {};
  for (const [role, email] of Object.entries(users)) {
    await store.grant({ email, role, environment: "development", grantedBy: users.administrator });
    sessions[role] = (await store.createSession(email, "synthetic-test")).id;
  }
  const server = createServer(createApp({ store }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (role, route, body, extra = {}) => {
    const response = await fetch(`${base}${route}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...(sessions[role] ? { Cookie: `sid=${sessions[role]}` } : {}), ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const approvePolicy = (projectId = "QA", version = 0, changes = {}) => request("administrator", "/api/assurance/policy", {
    projectId, version, action: "approve", acknowledge: true, draft: { ...syntheticPolicy(), ...changes },
  });
  const save = (role, record, extra) => request(role, "/api/workbench/items", record, extra);
  const create = async (overrides = {}) => {
    const result = await save("nstt", syntheticRecord(overrides));
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  const record = async code => (await request("nstt", "/api/workbench")).body.items.find(item => item.code === code);
  const event = (codes = ["Q-01"], overrides = {}) => request("nstt", "/api/assurance/triggers", {
    projectId: "QA", batchId: `batch-${Math.random().toString(36).slice(2)}`, type: "T-08",
    scopeKind: "record", summary: "Synthetic supply change.", observedOn: "2026-01-01",
    dueOn: "2027-01-01", sourceNote: "Synthetic observation, not a real event.", codes, ...overrides,
  });
  const reviewEvent = (document, body, role = "cpi") => request(role, `/api/assurance/triggers/${document.key}`, {
    projectId: document.projectId, version: document.version, ...body,
  });
  const assessAndApprove = async (item, assessment = syntheticAssessment()) => {
    let result = await save("nstt", { ...item, riskAssessment: assessment });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    result = await save("nstt", { ...result.body, status: "In review" });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    result = await save("cpi", { ...result.body, riskAssessment: { ...result.body.riskAssessment, validation: syntheticValidation() } });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    result = await save("cpi", { ...result.body, status: "Approved" });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  return { store, request, approvePolicy, save, create, record, event, reviewEvent, assessAndApprove };
}

test("risk routes require both sign-in and an exact allowed-domain grant", async t => {
  const h = await harness(t);
  assert.equal((await h.request(null, "/api/assurance?project=QA")).status, 401);
  for (const email of ["ungranted@blackengtech.com", "qa@blackengtech.com.attacker.invalid"]) {
    const session = await h.store.createSession(email, "synthetic");
    assert.equal((await h.request(null, "/api/assurance?project=QA", null, { Cookie: `sid=${session.id}` })).status, 403);
  }
  assert.equal((await h.request("nstt", "/api/assurance?project=QA")).status, 200);
  assert.equal((await h.request("administrator", "/api/assurance?project=PRACTICE")).status, 200);
});

test("only the designated administrator can version and approve a policy", async t => {
  const h = await harness(t);
  const body = { projectId: "QA", version: 0, action: "approve", acknowledge: true, draft: syntheticPolicy() };
  for (const role of ["nstt", "cpi", "trade"]) assert.equal((await h.request(role, "/api/assurance/policy", body)).status, 403);
  assert.equal((await h.request("administrator", "/api/assurance/policy", { ...body, acknowledge: false })).status, 400);
  assert.equal((await h.request("administrator", "/api/assurance/policy", { ...body, draft: {} })).status, 400);
  const saved = await h.approvePolicy();
  assert.equal(saved.status, 200);
  assert.equal(saved.body.payload.active.id, "QA-v1");
  assert.equal((await h.approvePolicy()).status, 409);
  const history = await h.request("nstt", "/api/assurance/history?project=QA&kind=policy&key=QA");
  assert.equal(history.body.history.length, 1);
  assert.equal((await h.request("nstt", "/api/assurance/history?project=OTHER&kind=policy&key=QA")).status, 404);
});

test("draft policy is visible but cannot enter real review", async t => {
  const h = await harness(t);
  const item = await h.create({ riskAssessment: syntheticAssessment() });
  assert.equal(item.riskAssessment.policy.status, "Draft");
  assert.equal((await h.save("nstt", { ...item, status: "In review" })).status, 403);
  assert.equal((await h.approvePolicy()).status, 200);
  const refreshed = await h.save("nstt", item);
  assert.equal(refreshed.body.riskAssessment.policyVersion, "QA-v1");
  assert.equal((await h.save("nstt", { ...refreshed.body, status: "In review" })).status, 200);
});

test("reviewer validation is server-stamped and preserves separate approval", async t => {
  const h = await harness(t);
  await h.approvePolicy();
  const item = await h.create();
  const final = await h.assessAndApprove(item);
  assert.equal(final.riskAssessment.validation.by, users.cpi);
  assert.match(final.riskAssessment.validation.inputDigest, /^[a-f0-9]{64}$/);
  assert.equal(final.status, "Approved");
  assert.equal(decisionEligible(await h.record(item.code)), true);
  assert.equal((await h.save("nstt", { ...final, title: "Unauthorised change" })).status, 403);
  assert.equal((await h.save("administrator", { ...final, status: "Returned" })).status, 403);
});

test("forged validations, reviewer fact edits, and wrong-role approvals are blocked", async t => {
  const h = await harness(t);
  await h.approvePolicy();
  let item = await h.create({ riskAssessment: syntheticAssessment({ validation: { ...syntheticValidation(), at: "2000-01-01", by: users.cpi } }) });
  assert.equal(item.riskAssessment.validation, null);
  assert.equal((await h.save("nstt", { ...item, status: "Approved" })).status, 403);
  item = (await h.save("nstt", { ...item, status: "In review" })).body;
  const forged = { ...item, riskAssessment: { ...item.riskAssessment, validation: { ...syntheticValidation(), at: "2000-01-01", by: users.administrator } } };
  assert.equal((await h.save("trade", forged)).status, 403);
  assert.equal((await h.save("nstt", forged)).status, 403);
  assert.equal((await h.save("cpi", { ...forged, title: "Altered by reviewer" })).status, 403);
  const saved = await h.save("cpi", forged);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.riskAssessment.validation.by, users.cpi);
  assert.notEqual(saved.body.riskAssessment.validation.at, "2000-01-01");
  assert.equal((await h.save("trade", { ...saved.body, status: "Approved" })).status, 403);
});

test("confirmed legal findings require a dated source and hard stops survive review", async t => {
  const h = await harness(t);
  await h.approvePolicy();
  const assessment = syntheticAssessment({ facts: { prohibition: "confirmed" } });
  assessment.evidence["RR-01"].url = "";
  assert.equal((await h.save("nstt", syntheticRecord({ riskAssessment: assessment }))).status, 403);
  assessment.evidence["RR-01"].url = "https://example.org/synthetic";
  let item = await h.create({ riskAssessment: assessment });
  item = (await h.save("nstt", { ...item, status: "In review" })).body;
  assert.equal((await h.save("cpi", { ...item, riskAssessment: { ...item.riskAssessment, validation: syntheticValidation() } })).status, 403);
  const validation = syntheticValidation({ finalRisk: "Critical", action: "Do not proceed absent resolution" });
  const valid = await h.save("cpi", { ...item, riskAssessment: { ...item.riskAssessment, validation } });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.risk, "Critical");
  assert.equal(valid.body.action, "Do not proceed absent resolution");
});

test("all ten categories log without changing the record or recommendation", async t => {
  const h = await harness(t);
  const item = await h.create();
  for (const type of REASSESSMENT_TRIGGERS.map(x => x.id)) {
    const result = await h.event([item.code], { type });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.triggers[0].payload.type, type);
  }
  const saved = await h.record(item.code);
  assert.equal(saved.version, item.version);
  assert.equal(saved.action, item.action);
  assert.equal(saved.risk, item.risk);
  assert.equal(saved.reassessment.pendingCount, 10);
  assert.equal(saved.reassessment.materialCount, 0);
});

test("vendor scope is exact and cross-project or forged trigger links are rejected", async t => {
  const h = await harness(t);
  await h.create();
  await h.create({ code: "Q-02" });
  await h.create({ code: "Q-03", projectId: "OTHER" });
  assert.equal((await h.event(["Q-01"], { scopeKind: "vendor", scopeLabel: "Synthetic Supplier" })).status, 400);
  const vendor = await h.event(["Q-01", "Q-02"], { scopeKind: "vendor", scopeLabel: "Synthetic Supplier" });
  assert.equal(vendor.status, 200);
  assert.equal(vendor.body.triggers.length, 2);
  assert.equal((await h.event(["Q-03"])).status, 400);
  assert.equal((await h.event(["Q-01"], { sourceUrl: "javascript:alert(1)" })).status, 400);
  assert.equal((await h.event(["Q-01"], { observedOn: "2999-01-01" })).status, 400);
  assert.equal((await h.event(["Q-01"], { dueOn: "2026-02-30" })).status, 400);
  assert.equal((await h.event(["Q-01"], { type: "T-99" })).status, 400);
  assert.equal((await h.save("nstt", { ...(await h.record("Q-01")), riskAssessment: syntheticAssessment({ triggerIds: ["forged-other-record"] }) })).status, 403);
});

test("no material change closes with rationale and immutable history", async t => {
  const h = await harness(t);
  await h.create();
  const document = (await h.event()).body.triggers[0];
  const review = { action: "materiality", materiality: "No material change", rationale: "The synthetic change does not affect this part." };
  assert.equal((await h.reviewEvent(document, review, "nstt")).status, 403);
  assert.equal((await h.reviewEvent(document, { ...review, rationale: "" })).status, 400);
  const done = await h.reviewEvent(document, review);
  assert.equal(done.status, 200);
  assert.ok(done.body.payload.closedAt);
  assert.equal(done.body.payload.disposition, "Confirmed recommendation");
  assert.equal((await h.reviewEvent(document, review)).status, 409);
  assert.equal((await h.reviewEvent(done.body, review)).status, 409);
  const history = await h.request("cpi", `/api/assurance/history?project=QA&kind=trigger&key=${document.key}`);
  assert.equal(history.body.history.length, 2);
  assert.equal(history.body.history[1].payload.materiality, "Pending");
});

test("material changes require targeted reassessment and approved disposition", async t => {
  const h = await harness(t);
  await h.approvePolicy();
  let item = await h.assessAndApprove(await h.create());
  const logged = (await h.event()).body.triggers[0];
  const reviewed = await h.reviewEvent(logged, { action: "materiality", materiality: "Material change", rationale: "Synthetic recovery assumptions changed.", rules: ["RR-06"] });
  assert.equal(reviewed.status, 200);
  let document = reviewed.body;
  assert.equal(decisionEligible(await h.record(item.code)), false);
  assert.equal((await h.record(item.code)).status, "Approved");
  assert.equal((await h.reviewEvent(document, { action: "resolve", disposition: "Confirmed recommendation", dispositionNote: "Too early." })).status, 400);
  const escalation = await h.reviewEvent(document, { action: "escalate", dispositionNote: "Obtain a revised recovery plan." });
  assert.equal(escalation.status, 200);
  assert.equal(escalation.body.payload.closedAt, "");
  document = escalation.body;
  item = (await h.save("cpi", { ...item, status: "Returned" })).body;
  const assessment = { ...item.riskAssessment, triggerIds: [document.key], reassessedRules: ["RR-06"] };
  item = await h.assessAndApprove(item, assessment);
  assert.equal(decisionEligible(await h.record(item.code)), false);
  const prematureClose = await h.reviewEvent(document, { action: "resolve", disposition: "Escalated", dispositionNote: "The issue is still unresolved." });
  assert.equal(prematureClose.status, 400);
  const open = (await h.request("cpi", "/api/assurance?project=QA")).body.triggers.find(row => row.key === document.key);
  assert.equal(open.payload.closedAt, "");
  assert.equal(open.version, document.version);
  const closed = await h.reviewEvent(document, { action: "resolve", disposition: "Confirmed recommendation", dispositionNote: "The revised evidence supports the current recommendation." });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.ok(closed.body.payload.closedAt);
  assert.equal(decisionEligible(await h.record(item.code)), true);
});

test("approving a new policy holds prior risk assessments without changing history", async t => {
  const h = await harness(t);
  await h.approvePolicy();
  const item = await h.assessAndApprove(await h.create());
  await h.approvePolicy("QA", 1, { defaultRecoveryDays: 9 });
  const current = await h.record(item.code);
  assert.equal(current.version, item.version);
  assert.equal(current.riskAssessment.policyVersion, "QA-v1");
  assert.equal(current.reassessment.policyChanged, true);
  assert.equal(decisionEligible(current), false);
});

test("concurrent saves allow one winner and one conflict without losing history", async t => {
  const h = await harness(t);
  const item = await h.create();
  const results = await Promise.all([
    h.save("nstt", { ...item, title: "Synthetic concurrent edit A" }),
    h.save("nstt", { ...item, title: "Synthetic concurrent edit B" }),
  ]);
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
  const versions = await h.store.listVersions(item.code, "development");
  assert.equal(versions.length, 2);
  assert.equal((await h.record(item.code)).title, results.find(x => x.status === 200).body.title);
});

test("risk history cannot be stripped through normal saves, imports, or restore", async t => {
  const h = await harness(t);
  await h.approvePolicy();
  let item = await h.create();
  const preRiskVersion = item.version;
  item = (await h.save("nstt", { ...item, riskAssessment: syntheticAssessment() })).body;
  assert.equal((await h.save("nstt", { ...item, riskAssessment: null })).status, 403);
  assert.equal((await h.save("nstt", { ...item, projectId: "OTHER" })).status, 403);
  const imported = await h.request("nstt", "/api/workbench/import", { rows: [{ code: item.code, version: item.version, title: "Synthetic import update" }] });
  assert.equal(imported.body.applied, 1);
  item = await h.record(item.code);
  assert.ok(item.riskAssessment);
  const restored = await h.request("nstt", "/api/workbench/versions/restore", { code: item.code, version: preRiskVersion });
  assert.equal(restored.status, 200);
  assert.ok(restored.body.riskAssessment);
  assert.equal(restored.body.riskAssessment.validation, null);
  const inReview = await h.save("nstt", { ...restored.body, status: "In review" });
  assert.equal(inReview.status, 200);
  const blocked = await h.request("nstt", "/api/workbench/import", { rows: [{ code: item.code, version: inReview.body.version, title: "Attempt during review" }] });
  assert.equal(blocked.body.rejected, 1);
  assert.equal((await h.request("nstt", "/api/workbench/versions/restore", { code: item.code, version: preRiskVersion })).status, 403);
});

test("practice role headers cannot change real records or administrator grants", async t => {
  const h = await harness(t);
  const item = await h.create();
  const grants = await h.store.listGrants("development");
  assert.equal((await h.save("administrator", { ...item, title: "Not permitted" }, { "x-practice-role": "nstt" })).status, 403);
  const body = { projectId: "QA", codes: [item.code], batchId: "synthetic-batch", type: "T-08", scopeKind: "record", summary: "Synthetic", sourceNote: "Synthetic", observedOn: "2026-01-01" };
  assert.equal((await h.request("administrator", "/api/assurance/triggers", body)).status, 403);
  assert.equal((await h.request("administrator", "/api/assurance/triggers", body, { "x-practice-role": "nstt" })).status, 403);
  assert.deepEqual(await h.store.listGrants("development"), grants);
});

test("file-backed policy history survives reopening and rejects stale versions", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "mdc-risk-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fs = await import("node:fs");
  const filename = path.join(directory, "synthetic.json");
  const read = () => fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, "utf8")) : {};
  const write = value => fs.writeFileSync(filename, JSON.stringify(value));
  const first = riskFile(read, write);
  const input = { environment: "development", projectId: "QA", kind: "policy", key: "QA", expectedVersion: 0, savedBy: users.administrator, payload: { draft: syntheticPolicy() } };
  assert.equal((await first.saveRiskDocument(input)).version, 1);
  const reopened = riskFile(read, write);
  assert.equal((await reopened.readRiskDocument("development", "policy", "QA")).version, 1);
  assert.equal((await reopened.listRiskHistory("development", "policy", "QA")).length, 1);
  assert.equal(await reopened.saveRiskDocument(input), null);
  assert.equal(await reopened.readRiskDocument("production", "policy", "QA"), null);
});

test("PostgreSQL risk writes bind data and use one atomic history statement", async () => {
  let call;
  const pool = { query: async (sql, params) => { call = { sql, params }; return { rows: [] }; } };
  const store = riskPostgres(pool, async () => {});
  await store.saveRiskDocument({ environment: "development", projectId: "QA", kind: "policy", key: "QA", expectedVersion: 0, savedBy: users.administrator, payload: { note: "Synthetic ' value" } });
  assert.match(call.sql, /WITH saved AS/);
  assert.match(call.sql, /risk_documents.version = \$9/);
  assert.match(call.sql, /INSERT INTO risk_document_versions/);
  assert.equal(call.sql.includes("Synthetic"), false);
  assert.ok(call.params.some(x => typeof x === "string" && x.includes("Synthetic")));
});
