import test from "node:test";
import assert from "node:assert/strict";
import { approvalBlock, normalizeReview } from "../public/rules.js";
import { importPrivilege, libraryPrivilege, privilegeDecision, projectPrivilege, restorePrivilege } from "../public/privileges.js";
import { analysisRecord, drawWizard } from "../public/wizard.js";

const ready = normalizeReview({
  code: "P010",
  title: "Valve",
  action: "Proceed with protections",
  evidence: "Drawing is on file.",
  lifecycle: "Review if the drawing changes.",
  ownerRole: "nstt",
  reviewerRole: "cpi",
  status: "In review",
  preparedBy: "analyst@blackengtech.com",
  risk: "Medium",
  confidence: "Low",
});

test("an administrator cannot prepare or approve an analysis record", () => {
  const actor = { email: "lead@blackengtech.com", role: "administrator" };
  assert.match(privilegeDecision(actor, null, { ...ready, status: "Open" }), /does not prepare or approve/);
  assert.match(approvalBlock(actor, ready), /does not approve/);
  assert.match(privilegeDecision(actor, ready, { ...ready, status: "Approved" }), /does not prepare or approve/);
});

test("nstt can prepare and send, but cannot approve or change the reviewer", () => {
  const actor = { email: "analyst@blackengtech.com", role: "nstt" };
  const open = { ...ready, status: "Open" };
  const incomplete = { ...open, evidence: "", lifecycle: "" };
  assert.equal(privilegeDecision(actor, null, { code: "R-40", title: "New review", ownerRole: "nstt", reviewerRole: "cpi", status: "Open" }), "");
  assert.equal(privilegeDecision(actor, open, { ...open, title: "Valve body" }), "");
  assert.match(privilegeDecision(actor, incomplete, { ...incomplete, status: "In review" }), /after the action/);
  assert.equal(privilegeDecision(actor, open, { ...open, status: "In review" }), "");
  assert.match(privilegeDecision(actor, ready, { ...ready, status: "Open" }), /Wait for a return/);
  assert.match(privilegeDecision(actor, open, { ...open, reviewerRole: "trade" }), /cannot change the assigned reviewer/);
  assert.match(privilegeDecision(actor, ready, { ...ready, status: "Approved" }), /cannot approve/);
});

test("the assigned reviewer can approve without changing the analysis", () => {
  const reviewer = { email: "reviewer@alvarezandmarsal.com", role: "cpi" };
  assert.equal(privilegeDecision(reviewer, ready, { ...ready, status: "Approved" }), "");
  assert.match(privilegeDecision(reviewer, ready, { ...ready, action: "Proceed", status: "Approved" }), /cannot change the analysis/);
  assert.match(privilegeDecision({ email: "other@alvarezandmarsal.com", role: "trade" }, ready, { ...ready, status: "Approved" }), /assigned reviewer/);
});

test("a trade-sensitive record needs a trade note before another reviewer approves", () => {
  const sensitive = { ...ready, tradeSensitive: true, reviewerRole: "cpi" };
  assert.match(approvalBlock({ email: "reviewer@alvarezandmarsal.com", role: "cpi" }, sensitive), /trade review note/);
  const noted = { ...sensitive, updates: [{ role: "trade", text: "No listed party was identified in the connected sources." }] };
  assert.equal(approvalBlock({ email: "reviewer@alvarezandmarsal.com", role: "cpi" }, noted), "");
  assert.equal(privilegeDecision({ email: "trade@alvarezandmarsal.com", role: "trade" }, sensitive, { ...sensitive, updates: [{ role: "trade", text: "Checked." }] }), "");
});

test("import, restore, project, and library writes stay with the owning role", () => {
  assert.match(importPrivilege("cpi", null, ready), /Only the NSTT role/);
  assert.match(importPrivilege("nstt", { ...ready, ownerRole: "cpi" }, ready), /another role/);
  assert.equal(importPrivilege("nstt", null, { ...ready, status: "Open", ownerRole: "nstt" }), "");
  assert.match(restorePrivilege("cpi", ready, ready), /preparing role/);
  assert.equal(restorePrivilege("nstt", ready, { ...ready, status: "Open" }), "");
  assert.match(restorePrivilege("nstt", ready, { ...ready, status: "Approved" }), /assigned reviewer/);
  assert.match(projectPrivilege("nstt"), /administrator/);
  assert.equal(projectPrivilege("administrator"), "");
  assert.match(libraryPrivilege("trade"), /read the library/);
  assert.equal(libraryPrivilege("nstt"), "");
});

test("each role opens a record it can act on", () => {
  const items = [
    { code: "FB001", status: "In review", ownerRole: "nstt", reviewerRole: "cpi", tradeSensitive: false },
    { code: "FB002", status: "Open", ownerRole: "nstt", reviewerRole: "cpi", tradeSensitive: false },
    { code: "R-04", status: "Open", ownerRole: "trade", reviewerRole: "nstt", tradeSensitive: true },
  ];
  assert.equal(analysisRecord("nstt", items, "FB001").code, "FB002");
  assert.equal(analysisRecord("cpi", items, "FB002").code, "FB001");
  assert.equal(analysisRecord("trade", items, "FB001").code, "R-04");
});

test("the NSTT wizard can prepare and send, and cannot approve", () => {
  const open = { ...ready, status: "Open" };
  const handoff = drawWizard({ role: "nstt", step: 6, record: open, actorEmail: "analyst@blackengtech.com" });
  assert.match(handoff, /Send to review/);
  assert.equal(handoff.includes("Approve"), false);
  assert.match(drawWizard({ role: "nstt", step: 0, record: open }), /Start a new analysis/);
  assert.match(drawWizard({ role: "nstt", step: 5, record: open }), /does not change the risk band/);
});

test("CPI can return an incomplete review and cannot approve it", () => {
  const incomplete = { ...ready, action: "", status: "In review" };
  const decision = drawWizard({ role: "cpi", step: 4, record: incomplete, waiting: [incomplete], actorEmail: "reviewer@alvarezandmarsal.com" });
  assert.match(decision, /Return/);
  assert.match(decision, /Approval requires an action/);
  assert.equal(decision.includes(">Approve<"), false);
  assert.equal(decision.includes("name=\"title\""), false);
});

test("Trade prepares its open record when nothing is waiting, and can note a sensitive review without approving it", () => {
  const owned = { ...ready, code: "R-04", status: "Open", ownerRole: "trade", reviewerRole: "nstt", tradeSensitive: true };
  const prepare = drawWizard({ role: "trade", step: 0, record: owned, waiting: [] });
  assert.match(prepare, /No record is waiting on Trade for review/);
  assert.match(prepare, /Save and continue/);
  const sensitive = { ...ready, tradeSensitive: true, reviewerRole: "cpi", status: "In review" };
  const note = drawWizard({ role: "trade", step: 3, record: sensitive, waiting: [sensitive], actorEmail: "trade@alvarezandmarsal.com" });
  assert.match(note, /Save note/);
  const decision = drawWizard({ role: "trade", step: 4, record: sensitive, waiting: [sensitive], actorEmail: "trade@alvarezandmarsal.com" });
  assert.equal(decision.includes(">Approve<"), false);
  const assigned = drawWizard({ role: "trade", step: 4, record: { ...ready, reviewerRole: "trade", status: "In review" }, actorEmail: "trade@alvarezandmarsal.com" });
  assert.match(assigned, /data-wizard="approve"/);
});

test("the wizard follows the signed-in role and does not print a preparer email", () => {
  const nstt = drawWizard({ role: "nstt", step: 5, record: { ...ready, status: "Open" }, environment: "development" });
  assert.match(nstt, /How to proceed/);
  assert.match(nstt, /does not change the risk band/);
  assert.match(nstt, /Example: Proceed with protections/);
  assert.match(nstt, /field-tip/);
  assert.match(nstt, /Choose a standard note, or write your own/);
  assert.match(nstt, /name="action"/);
  assert.equal(nstt.includes("Wuxi"), false);
  assert.equal(nstt.includes("analyst@blackengtech.com"), false);
  const admin = drawWizard({ role: "administrator", step: 1, canGrant: true, environment: "development", grants: [{ email: "analyst@blackengtech.com", role: "nstt" }] });
  assert.match(admin, /Grant Administrator, NSTT, CPI, or Trade/);
  assert.match(admin, /value="administrator"/);
  assert.match(admin, /does not apply to production/);
  assert.equal(admin.includes("Approve"), false);
  const trade = drawWizard({ role: "trade", step: 4, record: { ...ready, reviewerRole: "trade" }, waiting: [{ ...ready, reviewerRole: "trade" }] });
  assert.match(trade, /Return or approve/);
  assert.match(trade, /Approve/);
});
