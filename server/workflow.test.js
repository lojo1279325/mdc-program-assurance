import test from "node:test";
import assert from "node:assert/strict";
import { actionList, approvalBlock, methodChecklist, metrics, normalizeReview, scorecard } from "../public/rules.js";

test("a missing fact lowers confidence and leaves risk unchanged", () => {
  const record = normalizeReview({ code: "R-01", risk: "High", confidence: "High", evidence: "", lifecycle: "Review at the next gate." });
  assert.equal(record.confidence, "Pending");
  assert.equal(record.risk, "High");
});

test("the preparer cannot approve the same record", () => {
  const record = normalizeReview({
    code: "R-02",
    action: "Proceed",
    evidence: "Source note is on file.",
    lifecycle: "Revisit if the source changes.",
    ownerRole: "nstt",
    preparedBy: "analyst@blackengtech.com",
  });
  assert.match(approvalBlock({ email: "analyst@blackengtech.com", role: "cpi" }, record), /cannot approve/);
  assert.equal(approvalBlock({ email: "reviewer@alvarezandmarsal.com", role: "cpi" }, record), "");
});

test("the owner role cannot approve its own draft", () => {
  const record = normalizeReview({
    code: "R-03",
    action: "Proceed with protections",
    evidence: "Condition is documented.",
    lifecycle: "Confirm the protection before award.",
    ownerRole: "nstt",
    preparedBy: "analyst@blackengtech.com",
  });
  assert.match(approvalBlock({ email: "lead@alvarezandmarsal.com", role: "nstt" }, record), /different role/);
});

test("scorecard counts follow the current records", () => {
  const items = methodChecklist();
  items[0] = normalizeReview({ ...items[0], action: "Proceed", evidence: "Named source.", lifecycle: "Annual review.", confidence: "High" });
  items[1] = normalizeReview({ ...items[1], action: "Do not proceed absent resolution", evidence: "Open ownership fact.", lifecycle: "Hold until resolved.", risk: "High" });
  const card = scorecard(items);
  assert.equal(card.count.records, 7);
  assert.equal(items[0].stage, "Why");
  assert.equal(actionList(items).some((item) => item.text.includes("should not proceed")), true);
  assert.equal(card.count.byAction.Proceed, 1);
  assert.equal(card.count.byAction["Do not proceed absent resolution"], 1);
  assert.equal(metrics(items).pendingConfidence >= 1, true);
  assert.equal(items[1].risk, "High");
});
