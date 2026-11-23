import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./app.js";
import { createMemory } from "./store.js";
import { guideFile, guidePostgres } from "./guide-store.js";
import { clearScreeningCache, longDate } from "./analysis.js";
import { agentReply, syntheticNetwork } from "./guide-fixtures.js";
import { WATCH_PARTITION } from "./watch.js";
import { CATALOG_SEED } from "../public/catalog-seed.js";
import { categoryOf, mergeCatalog } from "../public/catalog-model.js";
import { GATES } from "../public/guide-model.js";

process.env.APP_ENV = "development";
process.env.ADMIN_EMAILS = "qa-admin@blackengtech.com";
const users = {
  administrator: "qa-admin@blackengtech.com", nstt: "qa-preparer@blackengtech.com",
  cpi: "qa-reviewer@alvarezandmarsal.com", trade: "qa-trade@blackengtech.com",
};
const P = "MDC";
// Entries of the repository seed that these tests rely on.
const GENSET = "caterpillar-g3520k";
const GENSET_ALTERNATE = "innio-jenbacher-j620";
const GENSET_THIRD = "wartsila-wartsila-34sg";
const LISTED_GENSET = "cummins-hsk78g";
const TRADE_UPS = "huawei-ups5000-h";
const UPS_ALTERNATE = "vertiv-liebert-exl-s1";

const basis = (changes = {}) => ({ tenancy: "private", power: "island", platform: "nvl72", region: "US", customer: "us", voltage: "480 V", ...changes });
const held = (count) => Array.from({ length: count }, () => ({ state: "Held", note: "" }));
const gensetLine = (changes = {}) => ({ subsystem: "generator", category: "gas-engine-set", primary: GENSET, alternate: GENSET_ALTERNATE, ...changes });
const noEmail = (body) => assert.equal(JSON.stringify(body).includes("@"), false, "The response carries an email address.");

async function harness(t) {
  const store = createMemory();
  const sessions = {};
  for (const [role, email] of Object.entries(users)) {
    await store.grant({ email, role, environment: "development", grantedBy: users.administrator });
    sessions[role] = (await store.createSession(email, "synthetic-test")).id;
  }
  const net = syntheticNetwork();
  clearScreeningCache();
  const server = createServer(createApp({ store, fetchImpl: net.fetchImpl }));
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
  const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
  const refused = (result, status, message) => { assert.equal(result.status, status, JSON.stringify(result.body)); assert.equal(result.body.message, message); };
  const saveBasis = (role = "nstt", version = 0, changes = {}, pathway = 1, projectId = P, extra = {}) =>
    request(role, "/api/guide/save", { projectId, version, section: "basis", data: { basis: basis(changes), pathway } }, extra);
  const gate = (role, body) => request(role, "/api/guide/gate", { projectId: P, ...body });
  const line = (role, body) => request(role, "/api/guide/selection", { projectId: P, ...body });
  const field = (role, body, extra) => request(role, "/api/catalog/field", { projectId: P, ...body }, extra);
  const entry = (role, body, extra) => request(role, "/api/catalog/entry", { projectId: P, ...body }, extra);
  const analyze = (role, body, extra) => request(role, "/api/catalog/analyze", { projectId: P, ...body }, extra);
  const review = (role, body, extra) => request(role, "/api/watch/review", { projectId: P, ...body }, extra);
  // The working repository as a signed-in reader sees it.
  const catalog = async (role = "nstt", projectId = P, extra = {}) => {
    const body = ok(await request(role, `/api/catalog?project=${projectId}`, null, extra));
    return mergeCatalog(CATALOG_SEED, body.documents, { practice: body.practice, auto: body.auto, reviews: body.reviews });
  };
  return { store, net, request, ok, refused, saveBasis, gate, line, field, entry, analyze, review, catalog };
}

// ---------- Access ----------

test("every guide, repository, portfolio, and watch route needs a sign-in, and an unknown project is not found", async (t) => {
  const { request, refused, saveBasis } = await harness(t);
  for (const route of ["/api/guide?project=MDC", "/api/catalog?project=MDC", "/api/portfolio", "/api/watch?project=MDC"]) {
    refused(await request("", route), 401, "Sign-in is required.");
  }
  for (const route of ["/api/guide/save", "/api/guide/gate", "/api/guide/selection", "/api/catalog/field", "/api/catalog/entry", "/api/catalog/analyze", "/api/watch/run", "/api/watch/review"]) {
    refused(await request("", route, { projectId: P }), 401, "Sign-in is required.");
  }
  refused(await request("nstt", "/api/guide?project=ZZZ"), 404, "This project was not found.");
  refused(await saveBasis("nstt", 0, {}, 1, "ZZZ"), 404, "This project was not found.");
});

test("a new project starts with no design basis, six gates that are not started, and no sourcing lines", async (t) => {
  const { request, ok, refused, gate, line } = await harness(t);
  const guide = ok(await request("cpi", "/api/guide?project=MDC"));
  assert.equal(guide.projectId, P);
  assert.equal(guide.practice, false);
  assert.equal(guide.program, null);
  assert.deepEqual(guide.gates.map(row => [row.gate, row.version, row.payload.status]), [0, 1, 2, 3, 4, 5].map(id => [id, 0, "Not started"]));
  assert.deepEqual(guide.selections, []);
  refused(await gate("nstt", { gate: 0, action: "save", version: 0, evidence: [], openItems: [] }), 400, "Save the design basis in Program plan before preparing a gate.");
  refused(await line("nstt", { action: "save", line: gensetLine() }), 400, "Save the design basis in Program plan before adding sourcing lines.");
});

// ---------- Program plan and gates ----------

test("the design basis is prepared by NSTT, saved by version, and frozen once Gate 0 passes", async (t) => {
  const { request, ok, refused, saveBasis, gate } = await harness(t);
  refused(await saveBasis("cpi"), 403, "Only the NSTT role prepares the program plan.");
  refused(await saveBasis("administrator"), 403, "Only the NSTT role prepares the program plan.");
  const saved = ok(await saveBasis("nstt"));
  assert.equal(saved.program.version, 1);
  assert.equal(saved.program.payload.pathway, 1);
  assert.deepEqual(saved.program.payload.log.map(row => [row.role, row.section, row.summary]), [["nstt", "basis", "Design A, islanded, United States, pathway 1."]]);
  noEmail(saved);
  refused(await saveBasis("nstt", 0, { region: "EU" }), 409, "This entry changed in another session. Reload before saving.");
  refused(await saveBasis("nstt", "x", { region: "EU" }), 409, "This entry changed in another session. Reload before saving.");

  ok(await gate("nstt", { gate: 0, action: "ready", version: 0, evidence: held(3), openItems: [] }));
  ok(await gate("cpi", { gate: 0, action: "decide", version: 1, result: "Passed", signoffRef: "Owner memo 2026-014" }));
  refused(await saveBasis("nstt", 1, { region: "EU" }), 400, "The design basis is frozen at Gate 0. Reopen Gate 0 with a reason before changing it.");

  // Reopening Gate 0 with a reason lets the basis change, and a grid tie brings Gate 5 into scope.
  refused(await gate("nstt", { gate: 5, action: "save", version: 0, evidence: held(3), openItems: [] }), 400, "Gate 5 applies only when a grid tie is part of the pathway. Change the pathway in the design basis first.");
  refused(await gate("trade", { gate: 0, action: "reopen", version: 2, note: "The customer changed the platform." }), 403, "Only the NSTT role or the reviewing role reopens this gate.");
  refused(await gate("nstt", { gate: 0, action: "reopen", version: 2, note: "" }), 400, "State the change that reopens the gate.");
  const reopened = ok(await gate("nstt", { gate: 0, action: "reopen", version: 2, note: "The customer changed the platform" })).gate;
  assert.equal(reopened.payload.status, "In preparation");
  assert.equal(reopened.payload.decision, null);
  assert.deepEqual(reopened.payload.log.map(row => [row.role, row.action, row.note]), [
    ["nstt", "ready", "3 of 3 evidence items held. 0 open items."],
    ["cpi", "decide", "Passed. Sign-off reference: Owner memo 2026-014."],
    ["nstt", "reopen", "The customer changed the platform."],
  ]);
  const changed = ok(await saveBasis("nstt", 1, { power: "grid" }, 3)).program;
  assert.equal(changed.payload.log.at(-1).summary, "Design A, grid-fed with backup, United States, pathway 3.");
  const gridGate = ok(await gate("nstt", { gate: 5, action: "save", version: 0, evidence: held(3), openItems: [] })).gate;
  assert.equal(gridGate.payload.status, "In preparation");
  const portfolio = ok(await request("nstt", "/api/portfolio")).rows.find(row => row.projectId === P);
  assert.equal(portfolio.gatesTotal, 6);
  assert.equal(portfolio.gate.id, 0);
});

test("gate evidence is prepared by NSTT, and a gate is ready only when its evidence is held or explained", async (t) => {
  const { ok, refused, saveBasis, gate } = await harness(t);
  ok(await saveBasis());
  refused(await gate("nstt", { gate: 9, action: "save", version: 0 }), 400, "Choose a gate.");
  refused(await gate("nstt", { gate: 0, action: "erase", version: 0 }), 400, "Choose a gate action.");
  refused(await gate("cpi", { gate: 0, action: "save", version: 0, evidence: held(3), openItems: [] }), 403, "Only the NSTT role prepares gate evidence.");
  refused(await gate("nstt", { gate: 0, action: "ready", version: 0, evidence: [{ state: "Held" }, { state: "Missing" }, { state: "Held" }], openItems: [] }), 400,
    "Ready for decision is refused while evidence is missing or not reviewed: Statement that no grid tie is built, for an islanded design. Record a hold with an open item, or collect the evidence.");
  refused(await gate("nstt", { gate: 0, action: "ready", version: 0, evidence: [{ state: "Held" }, { state: "Not applicable", note: "" }, { state: "Held" }], openItems: [] }), 400,
    "State why this evidence is not applicable: Statement that no grid tie is built, for an islanded design.");
  refused(await gate("nstt", { gate: 0, action: "hold", version: 0, evidence: held(3), openItems: [] }), 400, "A hold needs at least one open item with an owner and a due date.");
  refused(await gate("nstt", { gate: 0, action: "save", version: 0, evidence: held(3), openItems: [{ text: "Confirm the tenancy model with the owner" }] }), 400, "Give every open item an owner and a due date.");

  const openItems = [{ text: "Confirm the tenancy model with the owner", owner: "Owner", due: "2026-12-01" }];
  const hold = ok(await gate("nstt", { gate: 0, action: "hold", version: 0, evidence: held(3), openItems })).gate;
  assert.equal(hold.payload.status, "Hold");
  assert.equal(hold.payload.log.at(-1).note, "3 of 3 evidence items held. 1 open item.");
  assert.equal(hold.payload.preparedByYou, true);
  const ready = ok(await gate("nstt", { gate: 0, action: "ready", version: 1, evidence: held(3), openItems })).gate;
  assert.equal(ready.payload.status, "Ready for decision");
});

test("a gate decision belongs to the gate's reviewing role, follows gate order, and records the signed reference", async (t) => {
  const { store, request, ok, refused, saveBasis, gate } = await harness(t);
  ok(await saveBasis());
  const openItems = [{ text: "Confirm the tenancy model with the owner", owner: "Owner", due: "2026-12-01" }];
  refused(await gate("trade", { gate: 1, action: "decide", version: 0, result: "Passed", signoffRef: "Counsel letter 2026-11-19" }), 400, "The gate must be Ready for decision first.");
  ok(await gate("nstt", { gate: 0, action: "ready", version: 0, evidence: held(3), openItems }));
  ok(await gate("nstt", { gate: 1, action: "ready", version: 0, evidence: held(4), openItems: [] }));

  for (const role of ["trade", "nstt", "administrator"]) {
    refused(await gate(role, { gate: 0, action: "decide", version: 1, result: "Passed", signoffRef: "Owner memo 2026-014" }), 403, "Only the CPI role records the decision for this gate.");
  }
  refused(await gate("nstt", { gate: 0, action: "return", version: 1, note: "The tenancy evidence is not signed." }), 403, "Only the CPI role records the decision for this gate.");
  refused(await gate("trade", { gate: 1, action: "decide", version: 1, result: "Passed", signoffRef: "Counsel letter 2026-11-19" }), 400, "Gate 0. Design basis frozen must be passed first.");
  refused(await gate("cpi", { gate: 0, action: "return", version: 1, note: "" }), 400, "State why the gate is returned to preparation.");
  refused(await gate("cpi", { gate: 0, action: "decide", version: 1, result: "Passed", signoffRef: "Owner memo 2026-014" }), 400, "Open items remain. Close them, or record Passed with conditions and state the condition.");
  refused(await gate("cpi", { gate: 0, action: "decide", version: 1, result: "Failed", signoffRef: "Owner memo 2026-014" }), 400, "Choose Passed or Passed with conditions.");
  refused(await gate("cpi", { gate: 0, action: "decide", version: 1, result: "Passed with conditions", signoffRef: "...." }), 400, "Record the reference of the decision signed by the sign-off party: Owner.");
  refused(await gate("cpi", { gate: 0, action: "decide", version: 1, result: "Passed with conditions", signoffRef: "Owner memo 2026-014", condition: "" }), 400, "State the condition in a full sentence.");
  refused(await gate("cpi", { gate: 0, action: "decide", version: 0, result: "Passed with conditions", signoffRef: "Owner memo 2026-014", condition: "The owner confirms the tenancy model." }), 409, "This entry changed in another session. Reload before saving.");

  const returned = ok(await gate("cpi", { gate: 0, action: "return", version: 1, note: "The tenancy evidence is not signed" })).gate;
  assert.equal(returned.payload.status, "In preparation");
  assert.deepEqual([returned.payload.log.at(-1).action, returned.payload.log.at(-1).note], ["return", "The tenancy evidence is not signed."]);
  ok(await gate("nstt", { gate: 0, action: "ready", version: 2, evidence: held(3), openItems }));

  // A typed reference and typed notes read as full sentences in the record.
  const decided = ok(await gate("cpi", {
    gate: 0, action: "decide", version: 3, result: "Passed with conditions", signoffRef: "Owner memo 2026-014.",
    condition: "The owner confirms the tenancy model by December 1", note: "Decided in the weekly program review",
  })).gate;
  assert.equal(decided.payload.status, "Passed with conditions");
  assert.equal(decided.payload.preparedByYou, false);
  assert.deepEqual({ ...decided.payload.decision, at: "" }, {
    result: "Passed with conditions", condition: "The owner confirms the tenancy model by December 1.", signoffRef: "Owner memo 2026-014",
    note: "Decided in the weekly program review.", role: "cpi", at: "",
  });
  assert.equal(decided.payload.log.at(-1).note, "Passed with conditions. Sign-off reference: Owner memo 2026-014. Condition: The owner confirms the tenancy model by December 1.");
  refused(await gate("nstt", { gate: 0, action: "save", version: 4, evidence: held(3), openItems: [] }), 400, "This gate is passed. Reopen it with a reason before changing its evidence.");
  noEmail(decided);

  // Gate 1 belongs to Trade, and a passed gate with conditions lets the next gate proceed.
  refused(await gate("cpi", { gate: 1, action: "decide", version: 1, result: "Passed", signoffRef: "Counsel letter 2026-11-19" }), 403, "Only the Trade role records the decision for this gate.");
  const released = ok(await gate("trade", { gate: 1, action: "decide", version: 1, result: "Passed", signoffRef: "Counsel letter 2026-11-19" })).gate;
  assert.equal(released.payload.status, "Passed");
  const portfolio = ok(await request("cpi", "/api/portfolio")).rows.find(row => row.projectId === P);
  assert.deepEqual([portfolio.gatesPassed, portfolio.gatesTotal, portfolio.gate.id, portfolio.openItems], [2, 5, 2, 1]);

  // The person who prepared a gate does not decide it, even after a change of role.
  ok(await gate("nstt", { gate: 2, action: "ready", version: 0, evidence: held(GATES[2].evidence.length), openItems: [] }));
  await store.grant({ email: users.nstt, role: GATES[2].reviewer, environment: "development", grantedBy: users.administrator });
  refused(await gate("nstt", { gate: 2, action: "decide", version: 1, result: "Passed", signoffRef: "Engineering sign-off 2026-031" }), 403, "The person who prepared the gate cannot record its decision.");
});

// ---------- Sourcing lines ----------

test("a sourcing line moves from draft to review to approval, and every step is kept in its history", async (t) => {
  const { store, request, ok, refused, saveBasis, line } = await harness(t);
  ok(await saveBasis());
  refused(await line("cpi", { action: "save", line: gensetLine() }), 403, "Only the NSTT role prepares sourcing lines.");
  refused(await line("nstt", { action: "delete", id: "L-01" }), 400, "Choose an action for the sourcing line.");
  refused(await line("nstt", { action: "submit", id: "L-09", version: 0 }), 404, "This sourcing line was not found in the selected project.");
  refused(await line("nstt", { action: "save", line: gensetLine({ primary: "nope" }) }), 400, "Choose the primary part from the repository. Add the part first when it is new.");

  // A draft may be saved without an alternate. Review needs an alternate or the reason there is none.
  const draft = ok(await line("nstt", { action: "save", line: gensetLine({ alternate: "" }) }), 201).selection;
  assert.deepEqual([draft.id, draft.version, draft.payload.status, draft.payload.preparedByYou], ["L-01", 1, "Draft", true]);
  assert.equal(draft.payload.log.at(-1).note, "Primary: Caterpillar G3520K. No alternate is named.");
  refused(await line("cpi", { action: "submit", id: "L-01", version: 1 }), 403, "Only the NSTT role sends a sourcing line to review.");
  refused(await line("nstt", { action: "submit", id: "L-01", version: 1 }), 400, "Name an alternate part, or state why no alternate is available.");
  refused(await line("nstt", { action: "reopen", id: "L-01", version: 1, note: "The line is already a draft here." }), 400, "Only an approved line, or a line in review, can be reopened.");
  const named = ok(await line("nstt", { action: "save", id: "L-01", version: 1, line: gensetLine() })).selection;
  assert.equal(named.payload.log.at(-1).note, "Primary: Caterpillar G3520K. Alternate: Jenbacher J620.");

  const submitted = ok(await line("nstt", { action: "submit", id: "L-01", version: 2 })).selection;
  assert.deepEqual([submitted.payload.status, submitted.payload.reviewerRole], ["In review", "cpi"]);
  assert.deepEqual([submitted.payload.submitted.posture, submitted.payload.submitted.tradeFlag, submitted.payload.submitted.primary, submitted.payload.submitted.alternate], ["Yellow", false, GENSET, GENSET_ALTERNATE]);
  assert.deepEqual(submitted.payload.submitted.context, { region: "US", design: "A", power: "island" });
  assert.equal(submitted.payload.log.at(-1).note, "The CPI role reviews this line. The indicated posture was Yellow and the confidence was Pending.");
  refused(await line("nstt", { action: "save", id: "L-01", version: 3, line: gensetLine({ note: "A late change." }) }), 400, "This line is in review. The reviewer returns it, or NSTT withdraws it, before it changes.");
  for (const role of ["trade", "nstt", "administrator"]) refused(await line(role, { action: "approve", id: "L-01", version: 3 }), 403, "Only the CPI role reviews this line.");

  // The reviewer returns the line with a reason. NSTT corrects it and sends it again.
  refused(await line("cpi", { action: "return", id: "L-01", version: 3, note: "no" }), 400, "State why the line is returned in a full sentence.");
  const returned = ok(await line("cpi", { action: "return", id: "L-01", version: 3, note: "The alternate shares a factory with the primary" })).selection;
  assert.deepEqual([returned.payload.status, returned.payload.log.at(-1).action, returned.payload.log.at(-1).note], ["Returned", "return", "The alternate shares a factory with the primary."]);
  const corrected = ok(await line("nstt", { action: "save", id: "L-01", version: 4, line: gensetLine({ alternate: GENSET_THIRD }) })).selection;
  assert.deepEqual([corrected.payload.status, corrected.payload.reviewerRole], ["Returned", "cpi"]);
  ok(await line("nstt", { action: "submit", id: "L-01", version: 5 }));

  // NSTT may withdraw a line from review. The reviewer may not.
  refused(await line("cpi", { action: "reopen", id: "L-01", version: 6, note: "The reviewer cannot withdraw this line." }), 403, "Only the NSTT role withdraws a line from review.");
  refused(await line("nstt", { action: "reopen", id: "L-01", version: 6, note: "" }), 400, "State why the line is withdrawn in a full sentence.");
  const withdrawn = ok(await line("nstt", { action: "reopen", id: "L-01", version: 6, note: "The supplier changed the engine variant" })).selection;
  assert.deepEqual([withdrawn.payload.status, withdrawn.payload.reviewerRole, withdrawn.payload.log.at(-1).action, withdrawn.payload.log.at(-1).note], ["Draft", "", "withdraw", "The supplier changed the engine variant."]);
  ok(await line("nstt", { action: "submit", id: "L-01", version: 7 }));
  refused(await line("cpi", { action: "approve", id: "L-01", version: 7 }), 409, "This entry changed in another session. Reload before saving.");

  const approved = ok(await line("cpi", { action: "approve", id: "L-01", version: 8 })).selection;
  assert.equal(approved.payload.status, "Approved");
  assert.equal(approved.payload.preparedByYou, false);
  assert.deepEqual([approved.payload.decision.role, approved.payload.decision.note, approved.payload.decision.snapshot.posture, approved.payload.decision.snapshot.alternate], ["cpi", "", "Yellow", GENSET_THIRD]);
  assert.equal(approved.payload.log.at(-1).note, "The indicated posture was Yellow and the confidence was Pending.");
  refused(await line("nstt", { action: "save", id: "L-01", version: 9, line: gensetLine() }), 400, "This line is approved. Reopen it with a reason before changing it.");
  refused(await line("cpi", { action: "approve", id: "L-01", version: 9 }), 400, "Only a line in review can be decided.");
  noEmail(approved);

  const coverage = ok(await request("administrator", "/api/portfolio")).rows.find(row => row.projectId === P).coverage;
  assert.deepEqual([coverage.lines, coverage.withPrimary, coverage.withAlternate, coverage.approved, coverage.approvedLines, coverage.inReview], [1, 1, 1, 1, 1, 0]);

  // Reopening an approved line keeps the earlier approval in its history.
  refused(await line("trade", { action: "reopen", id: "L-01", version: 9, note: "Trade does not review this line." }), 403, "Only the NSTT role or the reviewing role reopens this line.");
  refused(await line("cpi", { action: "reopen", id: "L-01", version: 9, note: "" }), 400, "State the change that reopens the line in a full sentence.");
  const reopened = ok(await line("cpi", { action: "reopen", id: "L-01", version: 9, note: "The maker announced a new factory for this engine." })).selection;
  assert.deepEqual([reopened.payload.status, reopened.payload.decision, reopened.payload.submitted], ["Draft", null, null]);
  assert.match(reopened.payload.log.at(-1).note, /^The maker announced a new factory for this engine\. The earlier approval by the CPI role on [A-Z][a-z]+ \d{1,2}, \d{4} at Yellow stays in this history\.$/);
  assert.deepEqual(reopened.payload.log.map(row => row.action), ["save", "save", "submit", "return", "save", "submit", "withdraw", "submit", "approve", "reopen"]);

  // The person who prepared a line does not review it, even after a change of role.
  ok(await line("nstt", { action: "submit", id: "L-01", version: 10 }));
  await store.grant({ email: users.nstt, role: "cpi", environment: "development", grantedBy: users.administrator });
  refused(await line("nstt", { action: "approve", id: "L-01", version: 11 }), 403, "The person who prepared the line cannot review it.");
});

test("a line that touches a trade rule goes to Trade, and an Orange line is approved only with a stated mitigation", async (t) => {
  const { ok, refused, saveBasis, line } = await harness(t);
  ok(await saveBasis());
  ok(await line("nstt", { action: "save", line: { subsystem: "switchgear", category: "ups", primary: TRADE_UPS, alternate: UPS_ALTERNATE } }), 201);
  const submitted = ok(await line("nstt", { action: "submit", id: "L-01", version: 1 })).selection;
  assert.deepEqual([submitted.payload.reviewerRole, submitted.payload.submitted.posture, submitted.payload.submitted.tradeFlag], ["trade", "Orange", true]);
  assert.equal(submitted.payload.log.at(-1).note, "The Trade role reviews this line. The indicated posture was Orange and the confidence was Pending.");
  refused(await line("cpi", { action: "approve", id: "L-01", version: 2 }), 403, "Only the Trade role reviews this line.");
  refused(await line("trade", { action: "approve", id: "L-01", version: 2 }), 400, "An Orange line proceeds only with active mitigation. State the mitigation and its conditions in a full sentence.");
  const approved = ok(await line("trade", { action: "approve", id: "L-01", version: 2, note: "Counsel's written view is held and the unit ships with firmware reloaded on site" })).selection;
  assert.equal(approved.payload.status, "Approved");
  assert.equal(approved.payload.decision.note, "Counsel's written view is held and the unit ships with firmware reloaded on site.");
  assert.equal(approved.payload.decision.snapshot.action, "Proceed with active mitigation");
  assert.equal(approved.payload.log.at(-1).note, "The indicated posture was Orange and the confidence was Pending. Counsel's written view is held and the unit ships with firmware reloaded on site.");
});

test("a Red posture keeps a line out of review, and a new trade rule sends a line in CPI review back to NSTT", async (t) => {
  const { ok, refused, saveBasis, line, field } = await harness(t);
  ok(await saveBasis());
  ok(await line("nstt", { action: "save", line: gensetLine({ primary: LISTED_GENSET, alternate: GENSET }) }), 201);
  // Trade records a Department of Energy determination against the part. The source must be a government address.
  const change = { kind: "part", id: LISTED_GENSET, action: "change", field: "eoType", value: "Determination recorded", reason: "Synthetic test determination.", version: 0 };
  refused(await field("trade", { ...change, sourceUrl: "https://news.example.org/story" }), 400, "Cite the Department of Energy determination with its government address.");
  ok(await field("trade", { ...change, sourceUrl: "https://www.energy.gov/synthetic-test" }));
  refused(await line("nstt", { action: "submit", id: "L-01", version: 1 }), 400,
    "The indicated posture is Red. Choose another primary part, or have the owning role correct the facts in the repository, before the line goes to review.");

  // A second line is in CPI review when Trade records a listing against its vendor.
  ok(await line("nstt", { action: "save", line: gensetLine() }), 201);
  const submitted = ok(await line("nstt", { action: "submit", id: "L-02", version: 1 })).selection;
  assert.equal(submitted.payload.reviewerRole, "cpi");
  ok(await field("trade", { kind: "vendor", id: "caterpillar", action: "change", field: "section1260h", value: "Listed", reason: "Synthetic test listing for the review flow.", sourceUrl: "https://www.federalregister.gov/d/2026-00001", version: 0 }));
  refused(await line("cpi", { action: "approve", id: "L-02", version: 2 }), 400, "A trade rule now applies to this line. Return it so that NSTT sends it to Trade review.");
  ok(await line("cpi", { action: "return", id: "L-02", version: 2, note: "A trade rule now applies to the vendor of the primary part." }));
  const again = ok(await line("nstt", { action: "submit", id: "L-02", version: 3 })).selection;
  assert.deepEqual([again.payload.reviewerRole, again.payload.submitted.tradeFlag], ["trade", true]);
});

test("a stop sign pauses the line and holds Gate 1 until it is resolved", async (t) => {
  const { request, ok, refused, saveBasis, gate, line } = await harness(t);
  ok(await saveBasis());
  ok(await gate("nstt", { gate: 0, action: "ready", version: 0, evidence: held(3), openItems: [] }));
  ok(await gate("cpi", { gate: 0, action: "decide", version: 1, result: "Passed", signoffRef: "Owner memo 2026-014" }));
  ok(await gate("nstt", { gate: 1, action: "ready", version: 0, evidence: held(4), openItems: [] }));
  ok(await line("nstt", { action: "save", line: gensetLine() }), 201);

  refused(await line("nstt", { action: "save", id: "L-01", version: 1, line: gensetLine({ stops: { factory: true } }) }), 400, "Describe what was observed for the stop sign.");
  const stopped = ok(await line("nstt", { action: "save", id: "L-01", version: 1, line: gensetLine({ stops: { factory: true }, stopNote: "The factory named on the packing list differs from the disclosed site." }) })).selection;
  assert.equal(stopped.payload.stops.factory, true);
  refused(await line("nstt", { action: "submit", id: "L-01", version: 2 }), 400, "A stop sign is recorded on this line. Pause the purchase and resolve it before the line goes to review.");
  refused(await gate("trade", { gate: 1, action: "decide", version: 1, result: "Passed", signoffRef: "Counsel letter 2026-11-19" }), 400, "A stop sign is recorded on L-01. Resolve it before purchase orders are released.");
  assert.equal(ok(await request("nstt", "/api/portfolio")).rows.find(row => row.projectId === P).coverage.stopped, 1);

  ok(await line("nstt", { action: "save", id: "L-01", version: 2, line: gensetLine() }));
  const released = ok(await gate("trade", { gate: 1, action: "decide", version: 1, result: "Passed", signoffRef: "Counsel letter 2026-11-19" })).gate;
  assert.equal(released.payload.status, "Passed");
  assert.equal(ok(await request("nstt", "/api/portfolio")).rows.find(row => row.projectId === P).coverage.stopped, 0);
});

// ---------- Vendor and part repository ----------

test("a repository field is confirmed or changed only by the role that owns it, with a reason and a usable source", async (t) => {
  const { request, ok, refused, field, catalog } = await harness(t);
  const start = ok(await request("nstt", "/api/catalog?project=MDC"));
  assert.deepEqual([start.practice, start.documents, start.reviews, start.screenedAt], [false, [], [], ""]);

  // Ownership: CPI owns identity and origin, Trade owns list and control fields, NSTT owns engineering fields.
  refused(await field("trade", { kind: "vendor", id: "caterpillar", action: "confirm", field: "hqCountry", version: 0 }), 403, "Only the CPI role confirms or changes this field: Headquarters country.");
  refused(await field("administrator", { kind: "vendor", id: "caterpillar", action: "confirm", field: "hqCountry", version: 0 }), 403, "Only the CPI role confirms or changes this field: Headquarters country.");
  refused(await field("nstt", { kind: "part", id: LISTED_GENSET, action: "change", field: "eoType", value: "Not named", reason: "A reading by the wrong role.", version: 0 }), 403, "Only the Trade role confirms or changes this field: Executive Order 14420 listed type.");
  refused(await field("trade", { kind: "part", id: "nope", action: "confirm", field: "eoType", version: 0 }), 404, "This entry was not found in the repository.");
  refused(await field("nstt", { kind: "part", id: LISTED_GENSET, action: "confirm", field: "nope", version: 0 }), 400, "Choose a field that belongs to this record.");
  refused(await field("nstt", { kind: "part", id: LISTED_GENSET, action: "erase", field: "rating", version: 0 }), 400, "Choose Confirm, Change, or Reset.");

  // Confirming keeps the sourced value and records who confirmed it and from which source.
  const confirmed = ok(await field("cpi", { kind: "vendor", id: "caterpillar", action: "confirm", field: "hqCountry", version: 0 })).document;
  assert.deepEqual([confirmed.kind, confirmed.key, confirmed.version], ["catalog-vendor", "caterpillar", 1]);
  assert.deepEqual({ ...confirmed.payload.fields.hqCountry, at: "" }, { state: "confirmed", baseline: "US", role: "cpi", at: "" });
  assert.deepEqual([confirmed.payload.log[0].action, confirmed.payload.log[0].to, confirmed.payload.log[0].note], ["confirm", "US", "Confirmed the sourced value from GLEIF legal entity record."]);
  noEmail(confirmed);
  refused(await field("cpi", { kind: "part", id: GENSET, action: "confirm", field: "assemblyCountry", version: 0 }), 400, "There is no value to confirm yet. Enter the value and its source.");

  // A change needs an allowed value, a reason, and a safe address.
  const change = { kind: "part", id: LISTED_GENSET, action: "change", field: "eoType", version: 0 };
  refused(await field("trade", { ...change, value: "Banned", reason: "A value that is not on the list." }), 400, "Choose one of: Not named, Possible, Listed, Determination recorded.");
  refused(await field("trade", { ...change, value: "Possible", reason: "" }), 400, "State the reason for the change in a full sentence.");
  refused(await field("cpi", { kind: "part", id: GENSET, action: "change", field: "assemblyCountry", value: "Germany", reason: "Supplier letter dated November 20.", version: 0 }), 400, "Use a two-letter country code, or n.a. when the country is not yet disclosed.");
  refused(await field("cpi", { kind: "part", id: GENSET, action: "change", field: "assemblyCountry", value: "DE", reason: "Supplier letter dated November 20.", sourceUrl: "javascript:alert(1)", version: 0 }), 400, "Use an HTTP or HTTPS source address without credentials.");
  const changed = ok(await field("cpi", { kind: "part", id: GENSET, action: "change", field: "assemblyCountry", value: "DE", reason: "Supplier letter dated November 20", sourceLabel: "Supplier letter", version: 0 })).document;
  assert.deepEqual({ ...changed.payload.fields.assemblyCountry, at: "" }, {
    state: "changed", value: "DE", detail: "", source: { label: "Supplier letter", url: "" }, reason: "Supplier letter dated November 20.", baseline: "n.a.", role: "cpi", at: "",
  });
  assert.deepEqual([changed.payload.log[0].from, changed.payload.log[0].to, changed.payload.log[0].note], ["n.a.", "DE", "Supplier letter dated November 20."]);

  // The reader's repository shows the changed value, and a reset returns the sourced value.
  let part = (await catalog("administrator")).parts.find(row => row.id === GENSET);
  assert.deepEqual([part.fields.assemblyCountry.value, part.fields.assemblyCountry.state], ["DE", "changed"]);
  refused(await field("cpi", { kind: "part", id: GENSET, action: "reset", field: "assemblyCountry", version: 0 }), 409, "This entry changed in another session. Reload before saving.");
  const reset = ok(await field("cpi", { kind: "part", id: GENSET, action: "reset", field: "assemblyCountry", version: 1 })).document;
  assert.deepEqual(reset.payload.fields, {});
  assert.deepEqual([reset.payload.log.at(-1).action, reset.payload.log.at(-1).from, reset.payload.log.at(-1).to, reset.payload.log.at(-1).note], ["reset", "DE", "n.a.", "Returned to the sourced value. It is no longer confirmed."]);
  refused(await field("cpi", { kind: "part", id: GENSET, action: "reset", field: "assemblyCountry", version: 2 }), 400, "This field has no confirmation or change to remove.");
  part = (await catalog()).parts.find(row => row.id === GENSET);
  assert.deepEqual([part.fields.assemblyCountry.value, part.fields.assemblyCountry.state], ["n.a.", "baseline"]);
});

test("NSTT adds a vendor and a part, the first checks fill sourced fields, and a repeated entry is refused", async (t) => {
  const { net, ok, refused, entry, catalog } = await harness(t);
  refused(await entry("cpi", { kind: "vendor", legalName: "Synthetic Controls GmbH" }), 403, "Only the NSTT role adds a vendor or a part to the repository.");
  refused(await entry("nstt", { kind: "vendor", legalName: "S" }), 400, "Enter the vendor's legal name.");
  refused(await entry("nstt", { kind: "vendor", legalName: "Synthetic Controls GmbH", website: "not a site" }), 400, "Write the website as a domain name, such as example.com.");
  // A vendor that is already held is found under another spelling of its name.
  for (const legalName of ["Caterpillar Inc.", "CATERPILLAR INCORPORATED"]) {
    refused(await entry("nstt", { kind: "vendor", legalName }), 400, "This vendor is already in the repository as Caterpillar. Open it and confirm or change its fields.");
  }
  assert.equal(net.state.calls.length, 0);

  const added = ok(await entry("nstt", { kind: "vendor", legalName: "Synthetic Controls GmbH", website: "https://www.synthetic-controls.example/about" }), 201);
  assert.deepEqual([added.id, added.kind, added.filled, added.document.key, added.document.version], ["synthetic-controls-gmbh", "vendor", 9, "synthetic-controls-gmbh", 1]);
  assert.equal(added.document.payload.custom.domain, "synthetic-controls.example");
  assert.deepEqual(Object.keys(added.document.payload.auto), ["legalName", "hqCountry", "jurisdiction", "lei", "ultimateParent", "parentCountry", "fccCovered", "section1260h", "screening"]);
  assert.deepEqual(added.document.payload.analysis.steps.map(step => [step.id, step.status]), [["registry", "read"], ["sec", "read"], ["lists", "read"], ["screening", "read"], ["ai", "not run"]]);
  assert.equal(added.document.payload.log[0].note, "The vendor is new to the repository. The first checks filled: Legal name, Headquarters country, Legal jurisdiction, Legal Entity Identifier, Ultimate parent, Ultimate parent country, FCC Covered List, Section 1260H list, Screening list result.");
  noEmail(added);
  refused(await entry("nstt", { kind: "vendor", legalName: "Synthetic Controls GmbH" }), 400, "This vendor is already in the repository as Synthetic Controls GmbH. Open it and confirm or change its fields.");

  // Each filled value names its source, and none of them is confirmed until its owning role says so.
  const vendor = (await catalog("cpi")).vendors.find(row => row.id === "synthetic-controls-gmbh");
  assert.equal(vendor.custom, true);
  assert.deepEqual([vendor.fields.hqCountry.value, vendor.fields.hqCountry.source.label, vendor.fields.hqCountry.tier, vendor.fields.hqCountry.state], ["DE", "GLEIF legal entity record", 2, "baseline"]);
  assert.deepEqual([vendor.fields.screening.value, vendor.fields.screening.tier], ["No match", 1]);

  const partBody = { kind: "part", vendor: "synthetic-controls-gmbh", category: "plant-control", model: "SC-900" };
  refused(await entry("nstt", { ...partBody, vendor: "nope" }), 400, "Choose the vendor that makes this part. Add the vendor first when it is new.");
  refused(await entry("nstt", { ...partBody, category: "nope" }), 400, "Choose the part category.");
  refused(await entry("nstt", { ...partBody, model: "" }), 400, "Enter the model as the maker writes it.");
  refused(await entry("nstt", { ...partBody, sourceUrl: "ftp://files.example/sc-900" }), 400, "Use an HTTP or HTTPS address for the maker's product page.");
  refused(await entry("nstt", { kind: "part", vendor: "caterpillar", category: "gas-engine-set", model: "G 3520 K" }), 400, "This part is already in the repository as G3520K. Open it and confirm or change its fields.");
  const part = ok(await entry("nstt", { ...partBody, sourceUrl: "https://www.synthetic-controls.example/products/sc-900" }), 201);
  assert.deepEqual([part.id, part.kind, part.filled], ["synthetic-controls-gmbh-sc-900", "part", 0]);
  assert.deepEqual(part.document.payload.custom.fields.model, ["SC-900", "Synthetic Controls GmbH product page", "https://www.synthetic-controls.example/products/sc-900", 4, "NSTT entered this address. The workbench did not read the page."]);
  assert.equal(part.document.payload.log[0].note, "The part is new under Synthetic Controls GmbH. The first checks filled no field.");
  refused(await entry("nstt", { ...partBody, model: "sc 900" }), 400, "This part is already in the repository as SC-900. Open it and confirm or change its fields.");

  // The new part can be chosen for a sourcing line at once.
  const merged = await catalog();
  assert.equal(merged.parts.find(row => row.id === "synthetic-controls-gmbh-sc-900").vendor, "synthetic-controls-gmbh");
  assert.equal(merged.vendors.length, CATALOG_SEED.vendors.length + 1);
});

test("the analysis runs for the three working roles, reports a missing connection plainly, and is limited in frequency", async (t) => {
  const { ok, refused, entry, analyze } = await harness(t);
  delete process.env.PERPLEXITY_API_KEY;
  ok(await entry("nstt", { kind: "vendor", legalName: "Synthetic Controls GmbH", website: "synthetic-controls.example" }), 201);
  refused(await analyze("administrator", { kind: "vendor", id: "synthetic-controls-gmbh" }), 403, "The NSTT, CPI, or Trade role runs the analysis. The administrator role reads the result.");
  refused(await analyze("nstt", { kind: "vendor", id: "nope" }), 404, "This entry was not found in the repository.");

  const first = ok(await analyze("nstt", { kind: "vendor", id: "synthetic-controls-gmbh" })).document;
  assert.equal(first.version, 2);
  assert.equal(first.payload.analysis.status, "not connected");
  assert.equal(first.payload.analysis.message, "The AI analysis is not connected. An administrator adds a Perplexity API key to the server settings to turn it on. The list and registry checks ran.");
  assert.equal(first.payload.analysis.role, "nstt");
  // The values filled when the vendor was added are carried, not logged a second time.
  assert.equal(first.payload.analysis.fields.every(row => row.applied && row.carried), true);
  assert.equal(first.payload.log.at(-1).note, "No field changed. The AI step is not connected.");
  noEmail(first);
  refused(await analyze("cpi", { kind: "vendor", id: "synthetic-controls-gmbh" }), 429, "This entry was analyzed less than 30 seconds ago. Wait a moment before running the analysis again.");
});

test("the AI analysis fills only values that cite a retrieved page, and it never replaces what a role recorded", async (t) => {
  const { net, ok, field, entry, analyze, catalog } = await harness(t);
  process.env.PERPLEXITY_API_KEY = "synthetic-test-key";
  t.after(() => { delete process.env.PERPLEXITY_API_KEY; });
  ok(await entry("nstt", { kind: "vendor", legalName: "Synthetic Controls GmbH", website: "synthetic-controls.example" }), 201);
  // CPI records the headquarters country before the analysis runs.
  ok(await field("cpi", { kind: "vendor", id: "synthetic-controls-gmbh", action: "change", field: "hqCountry", value: "AT", reason: "The commercial register extract shows the seat in Vienna.", sourceUrl: "https://www.justiz.gv.at/synthetic-extract", version: 1 }));

  const page = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001234567";
  let task = "";
  net.state.agent = (body) => {
    task = body.input;
    return agentReply({
      fields: [
        { id: "cik", value: "1234567", sourceUrl: page, sourceTitle: "EDGAR", quote: "CIK 0001234567" },
        { id: "hqCountry", value: "DE", sourceUrl: page, sourceTitle: "EDGAR", quote: "Germany" },
      ],
      summary: "The company files with the SEC",
      pages: [{ url: page, title: "EDGAR", snippet: "Synthetic Controls GmbH CIK 0001234567 Germany", fetched: true }],
    });
  };
  const done = ok(await analyze("trade", { kind: "vendor", id: "synthetic-controls-gmbh" })).document;
  const sent = net.state.calls.filter(call => call.url.includes("api.perplexity.ai"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://api.perplexity.ai/v1/agent");
  assert.equal(sent[0].headers.authorization, "Bearer synthetic-test-key");
  // The analysis asks only for the field that is still open. The field CPI recorded is not asked for.
  assert.match(task, /^Company under review: Synthetic Controls GmbH\./);
  assert.match(task, /\n- cik: /);
  assert.equal(/\n- hqCountry: /.test(task), false);
  assert.deepEqual([done.payload.analysis.status, done.payload.analysis.role, done.payload.analysis.model, done.payload.analysis.summary], ["complete", "trade", "synthetic-model", "The company files with the SEC."]);
  assert.equal(JSON.stringify(done).includes("synthetic-test-key"), false);
  // The cited value is filled with its page, its source tier, and the quoted text.
  const added = done.payload.analysis.fields.filter(row => !row.carried);
  assert.deepEqual(added.map(row => [row.id, row.value, row.origin, row.applied, row.tier, row.source.url]), [["cik", "0001234567", "ai", true, 1, page]]);
  assert.deepEqual(done.payload.auto.cik, {
    value: "0001234567", source: { label: "EDGAR", url: page }, tier: 1, asOf: done.payload.auto.cik.asOf,
    detail: `Found by the AI analysis on ${longDate(done.payload.analysis.at)}. The cited page is quoted as: \u201cCIK 0001234567\u201d.`,
  });
  assert.equal(done.payload.analysis.steps.at(-1).note, "1 value was filled with a cited source. 0 values were dropped for lack of a usable source. 1 page was retrieved.");
  assert.deepEqual([done.payload.log.at(-1).action, done.payload.log.at(-1).role, done.payload.log.at(-1).note], ["analyze", "trade", "Filled or refreshed from cited sources: SEC registrant number."]);
  // The role's change stays in force.
  assert.deepEqual([done.payload.fields.hqCountry.state, done.payload.fields.hqCountry.value], ["changed", "AT"]);
  const vendor = (await catalog("cpi")).vendors.find(row => row.id === "synthetic-controls-gmbh");
  assert.deepEqual([vendor.fields.hqCountry.value, vendor.fields.hqCountry.state], ["AT", "changed"]);
  noEmail(done);
});

// ---------- Portfolio and practice ----------

test("the portfolio lists each project with its gate, coverage, and next date, and keeps practice work for the designated administrator", async (t) => {
  const { request, ok, refused, saveBasis } = await harness(t);
  const empty = ok(await request("trade", "/api/portfolio"));
  assert.match(empty.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(empty.rows.map(row => [row.projectId, row.practice, row.started]), [[P, false, false]]);
  ok(await saveBasis());
  const row = ok(await request("trade", "/api/portfolio")).rows[0];
  assert.deepEqual([row.started, row.design, row.region, row.power, row.pathway], [true, "A", "US", "island", 1]);
  assert.deepEqual(row.gate, { id: 0, label: "Gate 0. Design basis frozen", short: "Design basis frozen", status: "Not started" });
  assert.deepEqual([row.gatesPassed, row.gatesTotal, row.openItems, row.rechecks], [0, 5, 0, 0]);
  assert.deepEqual(row.coverage, { subsystems: 8, withPrimary: 0, withAlternate: 0, approved: 0, lines: 0, inReview: 0, approvedLines: 0, stopped: 0 });
  assert.equal(row.timeline.length > 0, true);
  assert.equal(row.timeline.every(item => item.kind === "rule"), true);
  noEmail(row);
  // A dated project milestone joins the public rule dates. The next date is the earliest one that is not in the past.
  ok(await request("nstt", "/api/guide/save", { projectId: P, version: 1, section: "milestones", data: { milestones: [{ id: "service", date: "2999-12-31" }] } }));
  const dated = ok(await request("trade", "/api/portfolio"));
  const next = dated.rows[0].nextMilestone;
  assert.equal(next.date >= dated.today, true);
  assert.equal(["Project milestone", "Public rule date"].includes(next.kind), true);
  assert.deepEqual(dated.rows[0].timeline.filter(item => item.kind === "project"), [{ date: "2999-12-31", label: "First building in service (Gate 4)", kind: "project" }]);

  // Practice work is entered under a practice role by the designated administrator only.
  const practiceRole = { "x-practice-role": "nstt" };
  refused(await request("nstt", "/api/guide?project=PRACTICE", null, practiceRole), 403, "Only a designated administrator can use a practice role in development.");
  refused(await request("administrator", "/api/guide?project=MDC", null, practiceRole), 403, "A practice role can change only the practice project. The MDC register stays unchanged.");
  refused(await saveBasis("administrator", 0, {}, 1, "PRACTICE"), 403, "Only the NSTT role prepares the program plan.");
  ok(await saveBasis("administrator", 0, { region: "EU" }, 1, "PRACTICE", practiceRole));
  assert.deepEqual(ok(await request("administrator", "/api/portfolio")).rows.map(item => [item.projectId, item.practice, item.region]), [[P, false, "US"], ["PRACTICE", true, "EU"]]);
  assert.deepEqual(ok(await request("nstt", "/api/portfolio")).rows.map(item => item.projectId), [P]);
});

test("practice entries, field changes, and watch readings stay apart from the MDC records", async (t) => {
  const { store, request, ok, entry, field, review, catalog } = await harness(t);
  const asNstt = { "x-practice-role": "nstt" };
  const asCpi = { "x-practice-role": "cpi" };
  const asTrade = { "x-practice-role": "trade" };
  const added = ok(await request("administrator", "/api/catalog/entry", { projectId: "PRACTICE", kind: "vendor", legalName: "Synthetic Practice Works Ltd", website: "practice-works.example" }, asNstt), 201);
  assert.equal(added.document.key, "practice:synthetic-practice-works-ltd");
  ok(await request("administrator", "/api/catalog/field", { projectId: "PRACTICE", kind: "vendor", id: "caterpillar", action: "confirm", field: "hqCountry", version: 0 }, asCpi));

  const practice = await catalog("administrator", "PRACTICE", asCpi);
  assert.equal(practice.vendors.some(row => row.id === "synthetic-practice-works-ltd"), true);
  assert.equal(practice.vendors.find(row => row.id === "caterpillar").fields.hqCountry.state, "confirmed");
  const real = await catalog("cpi");
  assert.equal(real.vendors.some(row => row.id === "synthetic-practice-works-ltd"), false);
  assert.equal(real.vendors.find(row => row.id === "caterpillar").fields.hqCountry.state, "baseline");
  // The real repository accepts its own record for the same vendor at version 0.
  ok(await field("cpi", { kind: "vendor", id: "caterpillar", action: "confirm", field: "hqCountry", version: 0 }));

  // A practice reading of a watch item is stored apart and opens no recheck on the real repository.
  ok(await request("cpi", "/api/watch/run", { trigger: "manual" }));
  const rule = ok(await request("nstt", "/api/watch?project=MDC")).items.find(row => row.sourceId === "fr-bis");
  ok(await request("administrator", "/api/watch/review", { projectId: "PRACTICE", itemId: rule.id, topics: ["chips"], materiality: "Material", note: "A practice reading of the rule for training.", version: 0 }, asTrade));
  assert.deepEqual(ok(await request("trade", "/api/watch?project=MDC")).reviews, []);
  assert.equal((await catalog("trade")).parts.some(row => row.recheck.length), false);
  const practiceWatch = ok(await request("administrator", "/api/watch?project=PRACTICE", null, asTrade));
  assert.deepEqual([practiceWatch.practice, practiceWatch.reviews.map(row => row.itemId)], [true, [rule.id]]);
  assert.equal((await catalog("administrator", "PRACTICE", asTrade)).parts.some(row => row.recheck.length), true);
  ok(await review("trade", { itemId: rule.id, topics: ["chips"], materiality: "Not material", note: "The rule covers items outside the program scope.", version: 0 }));

  const partitions = (await store.listGuideDocuments("development", "", {})).map(doc => `${doc.projectId}|${doc.kind}|${doc.key}`);
  assert.equal(partitions.includes("*catalog-practice|catalog-vendor|practice:synthetic-practice-works-ltd"), true);
  assert.equal(partitions.includes("*catalog-practice|catalog-vendor|practice:caterpillar"), true);
  assert.equal(partitions.includes("*catalog|catalog-vendor|caterpillar"), true);
  assert.equal(partitions.includes(`*watch-practice|watch-review|practice:${rule.id}`), true);
  assert.equal(partitions.includes(`*watch|watch-review|${rule.id}`), true);
});

// ---------- Regulatory watch ----------

test("a watch check is recorded with its sources, new items appear once, and repeat checks are limited", async (t) => {
  const { request, ok } = await harness(t);
  const empty = ok(await request("nstt", "/api/watch?project=MDC"));
  assert.deepEqual(empty.state, { lastRunAt: "", lastTrigger: "", runs: 0, running: false, scheduled: false, scheduleReady: false, lastScheduledAt: "" });
  assert.deepEqual([empty.runs, empty.items, empty.reviews], [[], [], []]);
  assert.equal(empty.sources.length, 20);
  assert.deepEqual(empty.notConnected.map(row => row.id), ["mofcom", "fcc-page", "ferc", "nerc"]);
  assert.equal(empty.sources.filter(row => row.lead).every(row => row.tier === 5), true);

  const ran = ok(await request("cpi", "/api/watch/run", { trigger: "manual" }));
  assert.deepEqual([ran.status, ran.added, ran.unavailable], ["ran", 3, 0]);
  assert.deepEqual(ok(await request("nstt", "/api/watch/run", { trigger: "manual" })), { status: "recent", message: "The watch ran less than a minute ago. Wait a moment before checking again.", added: 0, screeningChanged: 0, unavailable: 0 });
  assert.deepEqual(ok(await request("nstt", "/api/watch/run", { trigger: "catch-up" })), { status: "recent", message: "", added: 0, screeningChanged: 0, unavailable: 0 });

  const watch = ok(await request("administrator", "/api/watch?project=MDC"));
  assert.deepEqual([watch.state.runs, watch.state.lastTrigger, watch.state.running], [1, "manual", false]);
  assert.equal(watch.runs.length, 1);
  // The run names the role that asked for it, never the person.
  assert.deepEqual([watch.runs[0].trigger, watch.runs[0].role, watch.runs[0].added, "by" in watch.runs[0]], ["manual", "cpi", 3, false]);
  assert.equal(watch.runs[0].sources.length, 24);
  assert.deepEqual(watch.runs[0].sources.filter(row => row.status === "not connected").map(row => row.id), ["mofcom", "fcc-page", "ferc", "nerc"]);
  assert.equal(watch.runs[0].screening.status, "read");
  assert.equal(watch.runs[0].screening.checked, CATALOG_SEED.vendors.length);
  assert.deepEqual(watch.items.map(row => [row.sourceId, row.tier, row.lead, row.topics, row.vendors]), [
    ["cisa-ics", 1, false, ["ics"], ["siemens"]],
    ["fr-bis", 1, false, ["chips"], []],
    ["news-fcc", 5, true, ["fcc"], []],
  ]);
  assert.match(watch.screening.at, /^\d{4}-\d{2}-\d{2}T/);
  noEmail(watch);
});

test("a watch item is read by the role that owns its topic, and a material reading opens rechecks on the affected entries", async (t) => {
  const { request, ok, refused, field, review, line, saveBasis, catalog } = await harness(t);
  ok(await request("cpi", "/api/watch/run", { trigger: "manual" }));
  const items = ok(await request("nstt", "/api/watch?project=MDC")).items;
  const rule = items.find(row => row.sourceId === "fr-bis");
  const advisory = items.find(row => row.sourceId === "cisa-ics");
  const lead = items.find(row => row.lead);
  const reading = (item, changes = {}) => ({ itemId: item.id, topics: item.topics, materiality: "Material", note: "This changes what the program must check.", version: 0, ...changes });

  refused(await review("trade", reading(rule, { itemId: "nope" })), 404, "This item was not found in the watch log.");
  refused(await review("trade", reading(rule, { topics: [] })), 400, "Choose at least one rule topic for this item.");
  for (const role of ["cpi", "nstt", "administrator"]) refused(await review(role, reading(rule)), 403, "Only the Trade role records materiality for US chip export rules.");
  refused(await review("trade", reading(rule, { topics: ["chips", "ics"] })), 403, "Only the CPI role records materiality for Control system security advisories.");
  refused(await review("trade", reading(rule, { materiality: "Maybe" })), 400, "Choose Material or Not material.");
  refused(await review("trade", reading(rule, { note: "ok" })), 400, "State the reason in a full sentence.");
  refused(await review("trade", reading(rule, { confirmUrl: "javascript:alert(1)" })), 400, "Use an HTTP or HTTPS address for the confirming source.");

  // A press item is a lead. It becomes material only with the government source that confirms it.
  refused(await review("trade", reading(lead)), 400, "A press item is a lead. Add the address of the government source that confirms it before recording it as material.");
  refused(await review("trade", reading(lead, { confirmUrl: "https://www.reuters.com/synthetic-story" })), 400, "A press item is a lead. Add the address of the government source that confirms it before recording it as material.");
  const dismissed = ok(await review("trade", reading(lead, { materiality: "Not material", note: "The report repeats a notice that is already in the repository" })));
  assert.deepEqual(dismissed.affected, { vendors: [], parts: [] });
  assert.equal(dismissed.review.payload.dispositions.trade.note, "The report repeats a notice that is already in the repository.");

  // A not material reading opens nothing. A material reading names the entries to recheck.
  const first = ok(await review("trade", reading(rule, { materiality: "Not material", note: "The rule covers items outside the program scope" })));
  assert.deepEqual([first.review.version, first.affected], [1, { vendors: [], parts: [] }]);
  refused(await review("trade", reading(rule)), 409, "This entry changed in another session. Reload before saving.");
  const second = ok(await review("trade", reading(rule, { version: 1, note: "The rule changes chip licensing for the program" })));
  assert.equal(second.review.version, 2);
  assert.equal(second.affected.vendors.length, 0);
  assert.equal(second.affected.parts.includes("nvidia-vera-rubin-nvl72"), true);
  assert.deepEqual(second.review.payload.log.map(row => [row.role, row.materiality, row.note, row.parts > 0]), [
    ["trade", "Not material", "The rule covers items outside the program scope.", false],
    ["trade", "Material", "The rule changes chip licensing for the program.", true],
  ]);
  noEmail(second);

  const material = ok(await review("cpi", reading(advisory, { note: "The advisory names a controller family in the repository", vendors: ["siemens", "nope"] })));
  assert.deepEqual(material.review.payload.dispositions.cpi.vendors, ["siemens"]);
  assert.deepEqual(material.affected.vendors, ["siemens"]);
  assert.equal(material.affected.parts.length > 0 && material.affected.parts.every(id => id.startsWith("siemens-")), true);

  // The affected entries carry an open recheck that only the owning role clears, with a statement of what was checked.
  let merged = await catalog("nstt");
  const vendor = merged.vendors.find(row => row.id === "siemens");
  assert.deepEqual(vendor.recheck.map(row => [row.kind, row.role, row.topics, row.title]), [["review", "cpi", ["ics"], advisory.title]]);
  const controller = merged.parts.find(row => row.id === material.affected.parts[0]);
  const open = controller.recheck[0];
  const clear = { kind: "part", id: controller.id, action: "clear-recheck", reviewId: open.reviewId, note: "The advisory was read and this controller is not affected", version: 0 };
  refused(await field("trade", clear), 403, "Only the CPI role clears this recheck.");
  refused(await field("cpi", { ...clear, note: "" }), 400, "State what was checked in a full sentence.");
  refused(await field("cpi", { ...clear, reviewId: "nope" }), 400, "This recheck is no longer open. Reload to see the current state.");
  const cleared = ok(await field("cpi", clear)).document;
  assert.deepEqual(cleared.payload.cleared.map(row => [row.reviewId, row.role, row.note]), [[open.reviewId, "cpi", "The advisory was read and this controller is not affected."]]);
  assert.equal(cleared.payload.log.at(-1).note, `${advisory.title}. The advisory was read and this controller is not affected.`);
  merged = await catalog("nstt");
  assert.deepEqual(merged.parts.find(row => row.id === controller.id).recheck, []);
  assert.equal(merged.vendors.find(row => row.id === "siemens").recheck.length, 1);
  refused(await field("cpi", { ...clear, version: 1 }), 400, "This recheck is no longer open. Reload to see the current state.");

  // A sourcing line whose part carries an open recheck is counted in the portfolio.
  ok(await saveBasis());
  assert.equal(ok(await request("nstt", "/api/portfolio")).rows[0].rechecks, 0);
  const stillOpen = merged.parts.find(row => row.vendor === "siemens" && row.recheck.length);
  ok(await line("nstt", { action: "save", line: { subsystem: categoryOf(stillOpen.category).subsystem, category: stillOpen.category, primary: stillOpen.id, alternate: "" } }), 201);
  assert.equal(ok(await request("nstt", "/api/portfolio")).rows[0].rechecks, 1);
});

test("a recorded decision stays in the watch log after its item leaves the recent checks, and it can still be corrected", async (t) => {
  const { store, request, ok, review, catalog } = await harness(t);
  ok(await request("cpi", "/api/watch/run", { trigger: "manual" }));
  const first = ok(await request("trade", "/api/watch?project=MDC"));
  const rule = first.items.find(row => row.sourceId === "fr-bis");
  assert.equal(first.items.length, 3);
  ok(await review("trade", { itemId: rule.id, topics: ["chips"], materiality: "Not material", note: "The rule covers items outside the program scope.", version: 0 }));

  // Sixty later checks find nothing new. The check that found the rule is no longer among the checks the log reads.
  await new Promise(resolve => setTimeout(resolve, 5));
  const start = Date.parse(first.runs[0].at);
  for (let index = 1; index <= 60; index += 1) {
    const at = new Date(start + index * 60 * 60 * 1000).toISOString();
    await store.saveGuideDocument({
      environment: "development", projectId: WATCH_PARTITION, kind: "watch-run", key: `run-later-${index}`, expectedVersion: 0, savedBy: "system",
      payload: { at, trigger: "scheduled", role: "system", since: "", sources: [], screening: { status: "read", checked: 0, changed: [], note: "" }, added: 0, items: [] },
    });
  }
  const later = ok(await request("trade", "/api/watch?project=MDC"));
  assert.equal(later.runs.some(row => row.at === first.runs[0].at), false);
  // The decided item is listed as it was found, with its decision.
  assert.deepEqual(later.items.find(row => row.id === rule.id), rule);
  assert.equal(later.reviews.find(row => row.itemId === rule.id).payload.dispositions.trade.materiality, "Not material");
  for (const role of ["nstt", "cpi", "administrator"]) assert.deepEqual(ok(await request(role, "/api/watch?project=MDC")).items.find(row => row.id === rule.id), rule, role);

  // Trade corrects the decision. The correction is saved by version, and the item stays whole.
  const corrected = ok(await review("trade", { itemId: rule.id, topics: ["chips"], materiality: "Material", note: "The rule changes chip licensing for the program.", version: 1 }));
  assert.equal(corrected.review.version, 2);
  assert.equal(corrected.affected.parts.includes("nvidia-vera-rubin-nvl72"), true);
  assert.deepEqual(corrected.review.payload.log.map(row => row.materiality), ["Not material", "Material"]);
  const after = ok(await request("trade", "/api/watch?project=MDC"));
  assert.deepEqual(after.items.find(row => row.id === rule.id), rule);
  assert.equal((await catalog("nstt")).parts.find(row => row.id === "nvidia-vera-rubin-nvl72").recheck.length, 1);
  noEmail(after);
});

test("the scheduled check runs only with the shared secret and is recorded as a system run", async (t) => {
  const { store, request, ok, refused } = await harness(t);
  const schedule = async () => { const { scheduled, scheduleReady, lastScheduledAt } = ok(await request("nstt", "/api/watch?project=MDC")).state; return [scheduled, scheduleReady, lastScheduledAt]; };
  delete process.env.CRON_SECRET;
  refused(await request("", "/api/watch/cron"), 503, "The scheduled check is not configured.");
  assert.deepEqual(await schedule(), [false, false, ""]);
  process.env.CRON_SECRET = "synthetic-cron-secret";
  t.after(() => { delete process.env.CRON_SECRET; });
  refused(await request("", "/api/watch/cron"), 401, "The scheduled check was refused.");
  refused(await request("", "/api/watch/cron", null, { Authorization: "Bearer wrong-secret-value-000" }), 401, "The scheduled check was refused.");
  refused(await request("administrator", "/api/watch/cron"), 401, "The scheduled check was refused.");
  refused(await request("", "/api/watch/cron", null, { Authorization: "synthetic-cron-secret" }), 401, "The scheduled check was refused.");
  // The secret alone makes the schedule ready. It is active once a scheduled check arrives.
  assert.deepEqual(await schedule(), [false, true, ""]);
  assert.deepEqual(ok(await request("", "/api/watch/cron", null, { Authorization: "Bearer synthetic-cron-secret" })), { status: "ran", added: 3, screeningChanged: ok(await request("nstt", "/api/watch?project=MDC")).runs[0].screening.changed.length });
  const watch = ok(await request("nstt", "/api/watch?project=MDC"));
  assert.deepEqual([watch.state.lastTrigger, watch.state.runs, watch.runs[0].role, watch.runs[0].trigger], ["scheduled", 1, "system", "scheduled"]);
  // A scheduled check that arrived shows that a schedule works in this environment.
  assert.deepEqual(await schedule(), [true, true, watch.runs[0].at]);
  noEmail(watch);

  // The schedule stops counting as active when no scheduled check has arrived for 36 hours, or when the secret is removed.
  const state = await store.readGuideDocument("development", "watch-state", "state");
  const stale = new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString();
  await store.saveGuideDocument({ environment: "development", projectId: "*watch", kind: "watch-state", key: "state", expectedVersion: state.version, savedBy: "system", payload: { ...state.payload, lastScheduledAt: stale } });
  assert.deepEqual(await schedule(), [false, true, stale]);
  delete process.env.CRON_SECRET;
  assert.deepEqual(await schedule(), [false, false, stale]);
});

// ---------- Project roles ----------

// A second project, and the way an administrator assigns a working role in it.
async function withProjectRoles({ request, ok }) {
  ok(await request("administrator", "/api/projects", { code: "QA", name: "Synthetic QA project" }));
  return async (email, role, projectId = "QA") => {
    const version = ok(await request("administrator", "/api/access/project-roles")).rosters[projectId].version;
    return request("administrator", "/api/access/project-roles", { projectId, email, role, version });
  };
}
const QA = { projectId: "QA" };

test("the plan, the gates, and the sourcing lines follow the role held in the project named in the request", async (t) => {
  const h = await harness(t);
  const { request, ok, refused, saveBasis, gate, line } = h;
  const assign = await withProjectRoles(h);
  // In the QA project the default preparer reviews as CPI, and the default reviewer prepares as NSTT.
  ok(await assign(users.nstt, "cpi"));
  ok(await assign(users.cpi, "nstt"));
  assert.deepEqual(ok(await request("nstt", "/api/session")).projectRoles, { QA: "cpi" });

  // MDC has no assignment, so each person keeps the environment role there.
  ok(await saveBasis("nstt"));
  refused(await saveBasis("cpi", 1), 403, "Only the NSTT role prepares the program plan.");
  ok(await gate("nstt", { gate: 0, action: "ready", version: 0, evidence: held(3), openItems: [] }));
  refused(await gate("nstt", { gate: 0, action: "decide", version: 1, result: "Passed", signoffRef: "Owner memo 2026-014" }), 403, "Only the CPI role records the decision for this gate.");
  refused(await line("cpi", { action: "save", line: gensetLine() }), 403, "Only the NSTT role prepares sourcing lines.");

  // QA: the plan and the gate evidence belong to the person who holds NSTT there.
  refused(await saveBasis("nstt", 0, {}, 1, "QA"), 403, "Only the NSTT role prepares the program plan.");
  const plan = ok(await saveBasis("cpi", 0, {}, 1, "QA")).program;
  assert.deepEqual(plan.payload.log.map(row => row.role), ["nstt"]);
  refused(await gate("nstt", { ...QA, gate: 0, action: "ready", version: 0, evidence: held(3), openItems: [] }), 403, "Only the NSTT role prepares gate evidence.");
  ok(await gate("cpi", { ...QA, gate: 0, action: "ready", version: 0, evidence: held(3), openItems: [] }));
  refused(await gate("cpi", { ...QA, gate: 0, action: "decide", version: 1, result: "Passed", signoffRef: "Owner memo 2026-021" }), 403, "Only the CPI role records the decision for this gate.");
  const decided = ok(await gate("nstt", { ...QA, gate: 0, action: "decide", version: 1, result: "Passed", signoffRef: "Owner memo 2026-021" })).gate;
  assert.deepEqual([decided.payload.status, decided.payload.decision.role], ["Passed", "cpi"]);
  assert.deepEqual(decided.payload.log.map(row => [row.role, row.action]), [["nstt", "ready"], ["cpi", "decide"]]);
  noEmail(decided);

  // QA: a sourcing line is prepared and reviewed under the same project roles.
  refused(await line("nstt", { ...QA, action: "save", line: gensetLine() }), 403, "Only the NSTT role prepares sourcing lines.");
  ok(await line("cpi", { ...QA, action: "save", line: gensetLine() }), 201);
  const submitted = ok(await line("cpi", { ...QA, action: "submit", id: "L-01", version: 1 })).selection;
  assert.deepEqual([submitted.payload.status, submitted.payload.reviewerRole], ["In review", "cpi"]);
  refused(await line("cpi", { ...QA, action: "approve", id: "L-01", version: 2 }), 403, "Only the CPI role reviews this line.");

  // The person who prepared the line does not review it after the assignment is removed.
  assert.deepEqual(ok(await assign(users.cpi, "")).roster.assignments, { [users.nstt]: "cpi" });
  refused(await line("cpi", { ...QA, action: "approve", id: "L-01", version: 2 }), 403, "The person who prepared the line cannot review it.");
  const approved = ok(await line("nstt", { ...QA, action: "approve", id: "L-01", version: 2 })).selection;
  assert.deepEqual([approved.payload.status, approved.payload.decision.role, approved.payload.preparedByYou], ["Approved", "cpi", false]);
  assert.deepEqual(approved.payload.log.map(row => [row.role, row.action]), [["nstt", "save"], ["nstt", "submit"], ["cpi", "approve"]]);

  // An administrator reads every project and takes no working role in any of them.
  refused(await assign(users.administrator, "nstt"), 403, "Administrators manage access and do not take a working role.");
  refused(await saveBasis("administrator", 1, { region: "EU" }, 1, "QA"), 403, "Only the NSTT role prepares the program plan.");
  refused(await line("administrator", { ...QA, action: "reopen", id: "L-01", version: 3, note: "An administrator does not reopen a line." }), 403, "Only the NSTT role or the reviewing role reopens this line.");
  const rows = ok(await request("administrator", "/api/portfolio")).rows;
  assert.deepEqual(rows.filter(row => ["MDC", "QA"].includes(row.projectId)).map(row => [row.projectId, row.gatesPassed, row.coverage.approvedLines]), [["MDC", 0, 0], ["QA", 1, 1]]);
});

test("the shared repository and the regulatory watch use the role held in the project that is open", async (t) => {
  const h = await harness(t);
  const { request, ok, refused, field, entry, analyze, review } = h;
  const assign = await withProjectRoles(h);
  ok(await assign(users.nstt, "cpi"));

  // The same person is refused under the MDC role and accepted under the QA role. The entry is one shared record.
  const confirm = { kind: "vendor", id: "caterpillar", action: "confirm", field: "hqCountry", version: 0 };
  refused(await field("nstt", confirm), 403, "Only the CPI role confirms or changes this field: Headquarters country.");
  const confirmed = ok(await field("nstt", { ...QA, ...confirm })).document;
  assert.deepEqual([confirmed.version, confirmed.payload.fields.hqCountry.state, confirmed.payload.fields.hqCountry.role, confirmed.payload.log[0].role], [1, "confirmed", "cpi", "cpi"]);
  const shared = ok(await request("trade", "/api/catalog?project=MDC")).documents.find(doc => doc.key === "caterpillar");
  assert.deepEqual([shared.version, shared.payload.fields.hqCountry.state], [1, "confirmed"]);

  // Adding an entry is NSTT work. The QA role refuses it, and the MDC role still allows it.
  refused(await entry("nstt", { ...QA, kind: "vendor", legalName: "Synthetic Controls GmbH" }), 403, "Only the NSTT role adds a vendor or a part to the repository.");
  ok(await entry("nstt", { kind: "vendor", legalName: "Synthetic Controls GmbH" }), 201);
  // The analysis is open to the three working roles, so it runs under either role and names the role it ran under.
  const analyzed = ok(await analyze("nstt", { ...QA, kind: "vendor", id: "caterpillar", version: 1 })).document;
  assert.equal(analyzed.payload.analysis.role, "cpi");

  // A check asked for from the QA project is recorded under the QA role, and a reading follows the same rule.
  assert.equal(ok(await request("nstt", "/api/watch/run", { ...QA, trigger: "manual" })).status, "ran");
  const watch = ok(await request("nstt", "/api/watch?project=QA"));
  assert.deepEqual([watch.runs[0].trigger, watch.runs[0].role], ["manual", "cpi"]);
  const advisory = watch.items.find(row => row.sourceId === "cisa-ics");
  const reading = { itemId: advisory.id, topics: advisory.topics, materiality: "Not material", note: "The advisory covers a product outside the program scope", version: 0 };
  refused(await review("nstt", reading), 403, "Only the CPI role records materiality for Control system security advisories.");
  const read = ok(await review("nstt", { ...QA, ...reading }));
  assert.deepEqual(read.review.payload.log.map(row => [row.role, row.materiality]), [["cpi", "Not material"]]);
  noEmail(read);

  // A person with no assignment in QA keeps the environment role there.
  const rule = watch.items.find(row => row.sourceId === "fr-bis");
  const tradeReading = { itemId: rule.id, topics: rule.topics, materiality: "Not material", note: "The rule covers items outside the program scope", version: 0 };
  refused(await review("nstt", { ...QA, ...tradeReading }), 403, "Only the Trade role records materiality for US chip export rules.");
  ok(await review("trade", { ...QA, ...tradeReading }));
});

// ---------- Storage ----------

test("guide documents are saved by version, kept in history, and listed newest first when a limit is given", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "mdc-guide-test-"));
  const file = path.join(directory, "guide.json");
  try {
    await writeFile(file, "{}");
    let data = JSON.parse(await readFile(file, "utf8"));
    const read = () => data;
    const write = (next) => { data = JSON.parse(JSON.stringify(next)); };
    const store = guideFile(read, write);
    const input = { environment: "development", projectId: "QA", kind: "guide-program", key: "QA", savedBy: users.nstt };
    const first = await store.saveGuideDocument({ ...input, expectedVersion: 0, payload: { note: "first" } });
    assert.deepEqual([first.version, first.projectId, first.payload], [1, "QA", { note: "first" }]);
    assert.equal(await store.saveGuideDocument({ ...input, expectedVersion: 0, payload: { note: "stale" } }), null);
    assert.equal(await store.saveGuideDocument({ ...input, expectedVersion: 4, payload: { note: "stale" } }), null);
    const second = await guideFile(read, write).saveGuideDocument({ ...input, expectedVersion: 1, payload: { note: "second" } });
    assert.equal(second.version, 2);
    assert.equal((await store.readGuideDocument("development", "guide-program", "QA")).payload.note, "second");
    assert.equal(await store.readGuideDocument("production", "guide-program", "QA"), null);
    assert.deepEqual((await store.listGuideHistory("development", "guide-program", "QA")).map(row => [row.version, row.payload.note]), [[2, "second"], [1, "first"]]);
    for (const key of ["run-1", "run-2", "run-3"]) {
      await store.saveGuideDocument({ ...input, projectId: "*watch", kind: "watch-run", key, expectedVersion: 0, payload: { key } });
      await new Promise(resolve => setTimeout(resolve, 3));
    }
    assert.deepEqual((await store.listGuideDocuments("development", "*watch", { kinds: ["watch-run"], limit: 2 })).map(row => row.key), ["run-3", "run-2"]);
    assert.deepEqual((await store.listGuideDocuments("development", "QA")).map(row => row.kind), ["guide-program"]);
    assert.equal((await store.listGuideDocuments("development", "", { kinds: ["watch-run"] })).length, 3);
    assert.equal((await store.listGuideDocuments("production")).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the database store saves a guide document and its history in one statement, with values passed as parameters", async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  let ensured = 0;
  const store = guidePostgres(pool, async () => { ensured += 1; });
  const saved = await store.saveGuideDocument({ environment: "development", projectId: "QA", kind: "guide-program", key: "QA", expectedVersion: 0, savedBy: users.nstt, payload: { note: "Synthetic ' value" } });
  assert.equal(saved, null);
  assert.match(calls[0].sql, /WITH saved AS/);
  assert.match(calls[0].sql, /guide_documents\.version = \$9/);
  assert.match(calls[0].sql, /INSERT INTO guide_document_versions/);
  assert.equal(calls[0].sql.includes("Synthetic"), false);
  assert.ok(calls[0].params.some(value => typeof value === "string" && value.includes("Synthetic")));
  await store.listGuideDocuments("development", "*watch", { kinds: ["watch-run"], limit: 9999 });
  assert.match(calls[1].sql, /ORDER BY saved_at DESC LIMIT \$4/);
  assert.deepEqual(calls[1].params, ["development", "*watch", ["watch-run"], 500]);
  await store.listGuideDocuments("development");
  assert.deepEqual(calls[2].params, ["development", "", null]);
  assert.equal(ensured, 3);
});
