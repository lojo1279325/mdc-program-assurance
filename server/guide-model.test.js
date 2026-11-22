import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONS_90, CONSIDERATIONS, CONTRACT_TERMS, DECISIONS, GATES, HELD_FLAGS, PATHWAYS, RISK_ROWS, ROLE_WORKFLOWS, STOP_SIGNS,
  applyGateAction, applyProgramSection, currentGate, defaultRiskRating, designContext, gateApplies, gateBlock, gatePassed,
  lineBenchmark, lineRecheck, nextLineId, nextMilestone, normalizeGate, normalizeProgram, normalizeSelection, pathwaysFor,
  portfolioRow, priorGate, programSectionBlock, publicDatesFor, referenceDesign, roleFields, selectionRecheck,
  selectionSaveBlock, selectionSubmitBlock, snapshotOf, sourcingCoverage, timelineRows,
} from "../public/guide-model.js";
import { PART_FIELDS, SUBSYSTEMS, VENDOR_FIELDS, mergeCatalog } from "../public/catalog-model.js";
import { syntheticSeed } from "./guide-fixtures.js";

const nstt = { email: "preparer@example.com", role: "nstt" };
const cpi = { email: "reviewer@example.com", role: "cpi" };
const trade = { email: "trade@example.com", role: "trade" };
const basis = (changes = {}) => ({ tenancy: "private", power: "island", platform: "nvl72", region: "US", customer: "us", voltage: "480 V", ...changes });
const catalog = () => mergeCatalog(syntheticSeed(), [], {});
const design = { region: "US", design: "A", power: "island", tenancy: "private" };
const line = (changes = {}) => ({ id: "L-01", subsystem: "generator", category: "gas-engine-set", primary: "syn-us-gen", alternate: "syn-de-gen", ...changes });
const held = (gateId, state = "Held") => GATES[gateId].evidence.map(() => ({ state, note: "" }));

test("the reference design follows the tenancy and the destination", () => {
  assert.equal(referenceDesign(basis()), "A");
  assert.equal(referenceDesign(basis({ tenancy: "multi" })), "B");
  assert.equal(referenceDesign(basis({ region: "MY" })), "C");
  assert.equal(referenceDesign(basis({ region: "MY", tenancy: "multi" })), "C");
  assert.deepEqual(designContext({ basis: basis({ region: "EU", power: "grid" }), pathway: 3 }), { region: "EU", design: "A", power: "grid", tenancy: "private" });
});

test("the chip rule starts Green only for a private site with a confirmed United States end customer", () => {
  assert.equal(defaultRiskRating("chips", basis()), "Green");
  assert.equal(defaultRiskRating("chips", basis({ customer: "open" })), "Yellow");
  assert.equal(defaultRiskRating("chips", basis({ tenancy: "multi" })), "Yellow");
  assert.equal(defaultRiskRating("chips", basis({ region: "MY" })), "Yellow");
  assert.ok(RISK_ROWS.every(row => ["Green", "Yellow", "Orange", "Red"].includes(defaultRiskRating(row.id, basis()))));
});

test("each power arrangement offers only its own pathways", () => {
  assert.deepEqual(pathwaysFor("island").map(row => row.id), [1, 2]);
  assert.deepEqual(pathwaysFor("btm").map(row => row.id), [2]);
  assert.deepEqual(pathwaysFor("grid").map(row => row.id), [3]);
  assert.equal(PATHWAYS.length, 3);
  assert.equal(normalizeProgram({ basis: basis({ power: "grid" }), pathway: 1 }).pathway, 3);
});

test("only NSTT prepares the plan, and the design basis must be complete", () => {
  assert.match(programSectionBlock("basis", { basis: basis(), pathway: 1 }, { role: "cpi" }), /Only the NSTT role/);
  assert.equal(programSectionBlock("basis", { basis: basis(), pathway: 1 }, { role: "nstt" }), "");
  assert.match(programSectionBlock("basis", { basis: { ...basis(), region: "" }, pathway: 1 }, { role: "nstt" }), /Choose who uses the site/);
  assert.match(programSectionBlock("basis", { basis: basis({ power: "grid" }), pathway: 1 }, { role: "nstt" }), /pathway that matches/);
  assert.match(programSectionBlock("unknown", {}, { role: "nstt" }), /Choose a section/);
});

test("the design basis is frozen once Gate 0 is passed", () => {
  const current = applyProgramSection(null, "basis", { basis: basis(), pathway: 1 }, nstt, "2026-11-20T10:00:00.000Z");
  const frozen = { role: "nstt", gate0Passed: true, current };
  assert.match(programSectionBlock("basis", { basis: basis({ region: "EU" }), pathway: 1 }, frozen), /frozen at Gate 0/);
  assert.match(programSectionBlock("basis", { basis: basis(), pathway: 2 }, frozen), /frozen at Gate 0/);
  assert.equal(programSectionBlock("basis", { basis: basis({ note: "A note may still change." }), pathway: 1 }, frozen), "");
  assert.equal(programSectionBlock("basis", { basis: basis({ region: "EU" }), pathway: 1 }, { ...frozen, gate0Passed: false }), "");
});

test("a saved section is logged with the role and a readable summary", () => {
  const first = applyProgramSection(null, "basis", { basis: basis(), pathway: 1 }, nstt, "2026-11-20T10:00:00.000Z");
  assert.equal(first.log.length, 1);
  assert.equal(first.log[0].summary, "Design A, islanded, United States, pathway 1.");
  assert.equal(first.log[0].role, "nstt");
  const second = applyProgramSection(first, "milestones", { milestones: [{ id: "basis", date: "2027-01-15" }, { label: "Site handover", date: "2027-09-01" }] }, nstt, "2026-11-21T10:00:00.000Z");
  assert.equal(second.log.length, 2);
  assert.equal(second.basis.region, "US");
  assert.equal(second.milestones.find(row => row.id === "basis").date, "2027-01-15");
  assert.ok(second.milestones.some(row => row.label === "Site handover" && row.date === "2027-09-01"));
});

test("decisions, considerations, risks, milestones, and actions each state what is missing", () => {
  const who = { role: "nstt" };
  const decision = DECISIONS[0];
  assert.match(programSectionBlock("decisions", { decisions: { [decision.id]: { status: "Decided", position: "", decidedOn: "" } } }, who), /Record the position taken and the date/);
  assert.equal(programSectionBlock("decisions", { decisions: { [decision.id]: { status: "Decided", position: "The site is islanded with no grid tie.", decidedOn: "2026-11-20" } } }, who), "");
  const consideration = CONSIDERATIONS[0];
  assert.match(programSectionBlock("considerations", { considerations: { [consideration.id]: { status: "Addressed", note: "" } } }, who), /State the evidence or the reason/);
  const risk = RISK_ROWS[0];
  assert.match(programSectionBlock("risks", { risks: { [risk.id]: { rating: "Red", note: "" } } }, who), /Red is reserved for a confirmed critical barrier/);
  assert.match(programSectionBlock("risks", { risks: { [risk.id]: { rating: "Purple" } } }, who), /Choose Green, Yellow, Orange, or Red/);
  assert.equal(programSectionBlock("risks", { risks: { [risk.id]: { rating: "Orange" } } }, who), "");
  assert.match(programSectionBlock("milestones", { milestones: [{ id: "basis", date: "2027-13-40" }] }, who), /valid date/);
  const action = ACTIONS_90[0].items[0];
  assert.match(programSectionBlock("actions", { actions: { [action.id]: { due: "soon" } } }, who), /valid due date/);
});

test("a gate cannot be sent for decision while evidence is missing", () => {
  const evidence = held(1);
  evidence[2] = { state: "Missing", note: "" };
  assert.match(gateBlock({ gate: 1 }, "ready", { evidence, openItems: [] }, nstt), /Ready for decision is refused while evidence is missing or not reviewed: Outside counsel's written view/);
  const bare = held(1);
  bare[3] = { state: "Not applicable", note: "" };
  assert.match(gateBlock({ gate: 1 }, "ready", { evidence: bare, openItems: [] }, nstt), /State why this evidence is not applicable/);
  bare[3].note = "The supplier contract is not used for this purchase.";
  assert.equal(gateBlock({ gate: 1 }, "ready", { evidence: bare, openItems: [] }, nstt), "");
  assert.match(gateBlock({ gate: 1 }, "ready", { evidence: held(1), openItems: [] }, cpi), /Only the NSTT role prepares gate evidence/);
});

test("a hold needs an open item with an owner and a due date", () => {
  assert.match(gateBlock({ gate: 0 }, "hold", { evidence: held(0, "Missing"), openItems: [] }, nstt), /A hold needs at least one open item/);
  assert.match(gateBlock({ gate: 0 }, "hold", { evidence: held(0, "Missing"), openItems: [{ text: "Get the signed design basis." }] }, nstt), /Give every open item an owner and a due date/);
  const openItems = [{ text: "Get the signed design basis.", owner: "Owner", due: "2026-12-15" }];
  assert.equal(gateBlock({ gate: 0 }, "hold", { evidence: held(0, "Missing"), openItems }, nstt), "");
  const next = applyGateAction({ gate: 0 }, "hold", { evidence: held(0, "Missing"), openItems }, nstt, "2026-11-20T10:00:00.000Z");
  assert.equal(next.status, "Hold");
  assert.equal(next.log[0].note, "0 of 3 evidence items held. 1 open item.");
});

test("the reviewing role decides a gate, and the preparer cannot decide it", () => {
  const ready = applyGateAction({ gate: 0 }, "ready", { evidence: held(0), openItems: [] }, nstt, "2026-11-20T10:00:00.000Z");
  assert.equal(ready.status, "Ready for decision");
  const decide = { result: "Passed", signoffRef: "Owner memo 2026-014" };
  assert.match(gateBlock(ready, "decide", decide, trade), /Only the CPI role records the decision for this gate/);
  assert.match(gateBlock(ready, "decide", decide, { ...cpi, email: nstt.email }), /prepared the gate cannot record its decision/);
  assert.match(gateBlock(ready, "decide", { result: "Passed", signoffRef: "" }, cpi), /Record the reference of the decision signed by the sign-off party: Owner/);
  assert.match(gateBlock(ready, "decide", { result: "Maybe", signoffRef: "Owner memo" }, cpi), /Choose Passed or Passed with conditions/);
  assert.match(gateBlock(ready, "decide", { result: "Passed with conditions", signoffRef: "Owner memo", condition: "" }, cpi), /State the condition/);
  assert.equal(gateBlock(ready, "decide", decide, cpi), "");
  // Gate 0 has no earlier gate, so the order check never applies to it.
  assert.equal(gateBlock(ready, "decide", decide, cpi, { priorPassed: false }), "");
  const purchase = applyGateAction({ gate: 1 }, "ready", { evidence: held(1), openItems: [] }, nstt, "2026-11-20T10:00:00.000Z");
  const counsel = { result: "Passed", signoffRef: "Counsel letter 2026-11-19" };
  assert.equal(gateBlock(purchase, "decide", counsel, trade, { priorPassed: false }), "Gate 0. Design basis frozen must be passed first.");
  assert.match(gateBlock(purchase, "decide", counsel, cpi), /Only the Trade role records the decision for this gate/);
  assert.equal(gateBlock(purchase, "decide", counsel, trade), "");
  // A reviewer may return a gate even when the earlier gate is still open.
  assert.equal(gateBlock(purchase, "return", { note: "Counsel's view does not cover the controller." }, trade, { priorPassed: false }), "");
  assert.match(gateBlock({ gate: 0, status: "In preparation" }, "decide", decide, cpi), /Ready for decision first/);
  const passed = applyGateAction(ready, "decide", decide, cpi, "2026-11-21T10:00:00.000Z");
  assert.equal(passed.status, "Passed");
  assert.equal(passed.decision.role, "cpi");
  assert.ok(gatePassed(passed));
  assert.match(gateBlock(passed, "save", { evidence: held(0), openItems: [] }, nstt), /This gate is passed/);
});

test("open items allow a pass only with a stated condition", () => {
  const openItems = [{ text: "Collect the seal records.", owner: "Supplier", due: "2026-12-20" }];
  const ready = applyGateAction({ gate: 2 }, "ready", { evidence: held(2), openItems }, nstt);
  assert.match(gateBlock(ready, "decide", { result: "Passed", signoffRef: "Engineer note 7" }, cpi), /Open items remain/);
  const input = { result: "Passed with conditions", signoffRef: "Engineer note 7", condition: "Seal records arrive before the first shipment." };
  assert.equal(gateBlock(ready, "decide", input, cpi), "");
  const next = applyGateAction(ready, "decide", input, cpi);
  assert.equal(next.status, "Passed with conditions");
  assert.equal(next.decision.condition, "Seal records arrive before the first shipment.");
});

test("a returned or reopened gate goes back to preparation and keeps its history", () => {
  const ready = applyGateAction({ gate: 0 }, "ready", { evidence: held(0), openItems: [] }, nstt);
  assert.match(gateBlock(ready, "return", { note: "" }, cpi), /State why the gate is returned/);
  const returned = applyGateAction(ready, "return", { note: "The end customer letter is not signed" }, cpi);
  assert.equal(returned.status, "In preparation");
  assert.equal(returned.log.at(-1).note, "The end customer letter is not signed.");
  const passed = applyGateAction(ready, "decide", { result: "Passed", signoffRef: "Owner memo 2026-014" }, cpi);
  assert.match(gateBlock(ready, "reopen", { note: "The region changed to Malaysia." }, nstt), /Only a passed gate can be reopened/);
  assert.match(gateBlock(passed, "reopen", { note: "" }, nstt), /State the change that reopens the gate/);
  assert.match(gateBlock(passed, "reopen", { note: "The region changed to Malaysia." }, trade), /Only the NSTT role or the reviewing role reopens this gate/);
  const reopened = applyGateAction(passed, "reopen", { note: "The region changed to Malaysia." }, nstt);
  assert.equal(reopened.status, "In preparation");
  assert.equal(reopened.decision, null);
  assert.ok(reopened.log.some(row => row.action === "decide"));
});

test("gates run in order, and the grid tie gate applies only when a tie is part of the pathway", () => {
  assert.equal(priorGate(0), null);
  assert.equal(priorGate(3), 2);
  assert.equal(priorGate(5), 0);
  const islanded = { basis: basis(), pathway: 1 };
  const later = { basis: basis(), pathway: 2 };
  assert.equal(gateApplies(5, islanded), false);
  assert.equal(gateApplies(5, later), true);
  assert.match(gateBlock({ gate: 5 }, "save", { evidence: [], openItems: [] }, nstt, { applies: false }), /Gate 5 applies only when a grid tie is part of the pathway/);
  const gates = GATES.map(def => normalizeGate({ status: def.id < 2 ? "Passed" : "Not started" }, def.id));
  assert.equal(currentGate(gates, islanded).id, 2);
  const all = GATES.map(def => normalizeGate({ status: def.id === 5 ? "Not started" : "Passed" }, def.id));
  assert.equal(currentGate(all, islanded).id, -1);
  assert.equal(currentGate(all, later).id, 5);
  assert.deepEqual(GATES.map(def => def.reviewer), ["cpi", "trade", "cpi", "cpi", "trade", "trade"]);
});

test("a sourcing line needs a primary part from its category and an alternate from another parent", () => {
  const all = catalog();
  assert.equal(selectionSaveBlock(line(), all), "");
  assert.match(selectionSaveBlock(line({ subsystem: "" }), all), /Choose the subsystem/);
  assert.match(selectionSaveBlock(line({ category: "switch" }), all), /category that belongs to the subsystem/);
  assert.match(selectionSaveBlock(line({ primary: "missing-part" }), all), /Choose the primary part from the repository/);
  assert.match(selectionSaveBlock(line({ subsystem: "gpu", category: "gpu-server", primary: "syn-us-gen" }), all), /must belong to the chosen category/);
  assert.match(selectionSaveBlock(line({ alternate: "syn-us-gen" }), all), /must be a different part/);
  assert.match(selectionSaveBlock(line({ alternate: "syn-us-50" }), all), /different ultimate parent/);
  assert.match(selectionSaveBlock(line({ primary: "syn-de-gen", alternate: "syn-de2-gen" }), all), /Both parts trace to the same parent company/);
  assert.match(selectionSaveBlock(line({ alternate: "syn-us-gpu" }), all), /alternate part from the same subsystem/);
});

test("a stop sign pauses the line, and a line with no alternate needs a reason", () => {
  const all = catalog();
  const stop = STOP_SIGNS[0].id;
  assert.match(selectionSaveBlock(line({ stops: { [stop]: true } }), all), /Describe what was observed/);
  const stopped = line({ stops: { [stop]: true }, stopNote: "The supplier would not name the factory." });
  assert.equal(selectionSaveBlock(stopped, all), "");
  assert.match(selectionSubmitBlock(stopped, all), /A stop sign is recorded on this line/);
  assert.match(selectionSubmitBlock(line({ alternate: "" }), all), /Name an alternate part, or state why no alternate is available/);
  assert.equal(selectionSubmitBlock(line({ alternate: "", noAlternateReason: "Only one maker builds this engine variant." }), all), "");
  assert.equal(selectionSubmitBlock(line(), all), "");
});

test("a normalized line keeps one checklist row per confirm item and one state per contract term", () => {
  const row = normalizeSelection(line({ checklist: [{ state: "Confirmed", note: "Factory named in the disclosure." }], terms: { [CONTRACT_TERMS[0].id]: "Agreed" }, held: { disclosure: true } }));
  assert.equal(row.checklist.length, SUBSYSTEMS.find(item => item.id === "generator").confirm.length);
  assert.equal(row.checklist[0].state, "Confirmed");
  assert.equal(row.checklist[1].state, "Open");
  assert.equal(row.terms[CONTRACT_TERMS[0].id], "Agreed");
  assert.equal(row.terms[CONTRACT_TERMS[1].id], "Open");
  assert.equal(row.held.disclosure, true);
  assert.deepEqual(Object.keys(row.held), HELD_FLAGS.map(flag => flag.id));
  assert.equal(row.status, "Draft");
});

test("the benchmark of a line uses the proof the line holds and whether it names an alternate", () => {
  const all = catalog();
  const bare = lineBenchmark(line({ primary: "syn-cn-gen", alternate: "" }), all, design);
  assert.equal(bare.posture, "Orange");
  assert.ok(bare.reasons.some(row => row.rule === "alternate" && row.level === "Yellow"));
  assert.ok(bare.reasons.some(row => row.rule === "eo" && row.level === "Orange"));
  const protectedLine = lineBenchmark(line({ primary: "syn-cn-gen", alternate: "syn-us-gen", held: { disclosure: true, counsel: true, protections: true } }), all, design);
  assert.ok(protectedLine.reasons.some(row => row.rule === "eo" && row.level === "Yellow"));
  assert.ok(!protectedLine.reasons.some(row => row.rule === "tier3"));
  assert.ok(!protectedLine.reasons.some(row => row.rule === "alternate"));
  assert.equal(lineBenchmark(line({ primary: "gone" }), all, design), null);
});

test("an approved line is flagged for recheck when its benchmark or the design basis moves", () => {
  const all = catalog();
  const base = normalizeSelection(line());
  const result = lineBenchmark(base, all, design);
  const snapshot = snapshotOf(result, base, design, "2026-11-20T10:00:00.000Z");
  assert.equal(snapshot.posture, "Yellow");
  assert.equal(snapshot.primary, "syn-us-gen");
  assert.deepEqual(snapshot.context, { region: "US", design: "A", power: "island" });
  const approved = { ...base, status: "Approved", decision: { by: cpi.email, role: "cpi", at: "2026-11-20T10:00:00.000Z", note: "", snapshot } };
  assert.deepEqual(lineRecheck(approved, all, design), []);
  assert.deepEqual(selectionRecheck(approved, { ...result, posture: "Orange" }, design), ["The indicated posture moved from Yellow to Orange since approval."]);
  assert.deepEqual(selectionRecheck(approved, { ...result, reasons: [...result.reasons, { rule: "s1260h", level: "Yellow" }] }, design), ["The rules behind the indicated posture changed since approval."]);
  assert.deepEqual(selectionRecheck(approved, result, { ...design, region: "EU" }), ["The design basis changed since approval."]);
  assert.deepEqual(selectionRecheck({ ...base, status: "Draft" }, { ...result, posture: "Orange" }, design), []);
});

test("an open recheck on a vendor or part reaches the line unless the approval came after it", () => {
  const base = normalizeSelection(line());
  const approved = { ...base, status: "Approved", decision: { by: cpi.email, role: "cpi", at: "2026-11-20T10:00:00.000Z", note: "", snapshot: null } };
  const before = { name: "Synthetic Power Corp", recheck: [{ title: "A rule changed before approval.", at: "2026-11-19T10:00:00.000Z" }] };
  const after = { name: "Synthetic Power Corp", recheck: [{ title: "A rule changed after approval.", at: "2026-11-21T10:00:00.000Z" }] };
  assert.deepEqual(selectionRecheck(approved, null, design, [before]), []);
  assert.deepEqual(selectionRecheck(approved, null, design, [after]), ["Synthetic Power Corp: A rule changed after approval."]);
  assert.deepEqual(selectionRecheck({ ...base, status: "Draft" }, null, design, [before]), ["Synthetic Power Corp: A rule changed before approval."]);
});

test("line numbers continue from the highest number in use", () => {
  assert.equal(nextLineId([]), "L-01");
  assert.equal(nextLineId(["L-01", "L-07", "L-03"]), "L-08");
  assert.equal(nextLineId(["L-99"]), "L-100");
});

test("coverage counts subsystems, not lines", () => {
  const coverage = sourcingCoverage([
    line({ status: "Approved" }),
    line({ id: "L-02", primary: "syn-de-gen", alternate: "" }),
    line({ id: "L-03", subsystem: "gpu", category: "gpu-server", primary: "syn-us-gpu", alternate: "", status: "In review", stops: { [STOP_SIGNS[0].id]: true } }),
  ]);
  assert.equal(coverage.subsystems, SUBSYSTEMS.length);
  assert.equal(coverage.withPrimary, 2);
  assert.equal(coverage.withAlternate, 1);
  assert.equal(coverage.approved, 1);
  assert.equal(coverage.lines, 3);
  assert.equal(coverage.inReview, 1);
  assert.equal(coverage.approvedLines, 1);
  assert.equal(coverage.stopped, 1);
});

test("the timeline mixes project milestones with the public rule dates for the region", () => {
  const plan = { basis: basis(), pathway: 1, milestones: [{ id: "purchase", date: "2027-02-01" }] };
  const rows = timelineRows(plan);
  assert.ok(rows.some(row => row.kind === "project" && row.date === "2027-02-01"));
  assert.ok(rows.some(row => row.kind === "rule"));
  assert.deepEqual(rows.map(row => row.date), [...rows.map(row => row.date)].sort());
  assert.ok(publicDatesFor("EU").some(row => /battery passport/i.test(row.label)));
  assert.ok(!publicDatesFor("US").some(row => /battery passport/i.test(row.label)));
  const next = nextMilestone(plan, "2027-01-20");
  assert.ok(next && next.date >= "2027-01-20");
  assert.equal(nextMilestone({ basis: basis(), milestones: [] }, "2999-01-01"), null);
});

test("a portfolio row reports the gate, the coverage, the open items, and the rechecks", () => {
  const project = { code: "QA", name: "QA site Alpha" };
  const empty = portfolioRow({ project, program: null, gates: {}, selections: [], today: "2026-11-22" });
  assert.equal(empty.started, false);
  assert.equal(empty.design, "");
  assert.deepEqual(empty.timeline, []);
  const gates = { 0: { status: "Passed" }, 1: { status: "Hold", openItems: [{ text: "Collect counsel's view.", owner: "Outside counsel", due: "2026-12-10" }, { text: "Closed item.", owner: "NSTT", due: "2026-12-01", closed: true }] } };
  const row = portfolioRow({ project, program: { basis: basis(), pathway: 1 }, gates, selections: [line({ status: "Approved" })], rechecks: 2, today: "2026-11-22" });
  assert.equal(row.started, true);
  assert.equal(row.design, "A");
  assert.equal(row.gate.id, 1);
  assert.equal(row.gate.status, "Hold");
  assert.equal(row.gatesPassed, 1);
  assert.equal(row.gatesTotal, 5);
  assert.equal(row.openItems, 1);
  assert.equal(row.rechecks, 2);
  assert.equal(row.coverage.approved, 1);
  assert.equal(portfolioRow({ project, program: { basis: basis(), pathway: 2 }, gates, selections: [], today: "2026-11-22" }).gatesTotal, 6);
});

test("each role has a workflow, and its fields match the field owners in the repository", () => {
  assert.deepEqual(ROLE_WORKFLOWS.map(row => row.role), ["nstt", "cpi", "trade", "administrator"]);
  assert.ok(ROLE_WORKFLOWS.every(row => row.summary.endsWith(".") && row.steps.every(step => step.area && step.text.endsWith("."))));
  assert.ok(ROLE_WORKFLOWS.filter(row => row.role !== "administrator").every(row => row.steps.length === 5));
  assert.match(ROLE_WORKFLOWS.find(row => row.role === "administrator").steps[0].text, /does not prepare, confirm, or approve/);
  assert.deepEqual(roleFields("administrator"), { vendor: [], part: [] });
  const owned = (role) => ({
    vendor: VENDOR_FIELDS.filter(field => field.owner === role).map(field => field.label),
    part: PART_FIELDS.filter(field => field.owner === role).map(field => field.label),
  });
  for (const role of ["nstt", "cpi", "trade"]) assert.deepEqual(roleFields(role), owned(role));
  assert.deepEqual(roleFields("nstt"), { vendor: [], part: ["Model", "Device tier", "Rating", "Frequency"] });
  assert.equal(roleFields("cpi").vendor.length, 7);
  assert.equal(roleFields("trade").vendor.length, 4);
  assert.equal(roleFields("trade").part.length, 4);
});
