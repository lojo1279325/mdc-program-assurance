import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import {
  RISK_RULES, REASSESSMENT_TRIGGERS, draftRiskPolicy, normalizeRiskAssessment, evaluateRisk,
  policyApprovalBlock, riskValidationBlock, decisionEligible, normalizeTrigger, riskSummary, safeSource, validDate,
} from "../public/risk-model.js";
import { syntheticAssessment, syntheticPolicy, syntheticRecord, syntheticValidation } from "./risk-fixtures.js";
import { rowsToCsv } from "../public/csv.js";
import { riskRegisterRows, triggerRegisterRows, drawRiskAssessment, drawRiskRules, drawTriggers } from "../public/riskview.js";
import { decisionBrief, vendorMap } from "../public/brief.js";
import { executiveSlides, slideNotes } from "../public/presentation-model.js";
import { workbookFromRows, rowsFromWorkbook } from "./sheet.js";
import { applyImportRow } from "../public/rules.js";

test("the source supplies ten distinct rules and ten distinct event categories", () => {
  assert.equal(new Set(RISK_RULES.map(x => x.id)).size, 10);
  assert.equal(new Set(REASSESSMENT_TRIGGERS.map(x => x.id)).size, 10);
  assert.ok(REASSESSMENT_TRIGGERS.every(x => x.rules.every(id => RISK_RULES.some(rule => rule.id === id))));
});

test("missing facts create information requests, not an elevated risk rating", () => {
  const result = evaluateRisk({});
  assert.equal(result.inherentRisk, "Not assessed");
  assert.equal(result.confidence, "Pending");
  assert.equal(result.rfis.length, 10);
  assert.equal(result.hardStop, false);
});

test("the same complete facts yield the same low-risk result", () => {
  const first = evaluateRisk(syntheticAssessment());
  assert.deepEqual(first, evaluateRisk(syntheticAssessment()));
  assert.equal(first.inherentRisk, "Low");
  assert.equal(first.confidence, "High");
  assert.equal(first.coverage.answered, 10);
});

const triggered = [
  ["RR-01", { prohibition: "confirmed" }, "Critical"],
  ["RR-02", { designation: "confirmed" }, "High"],
  ["RR-03", { ownershipNexus: "yes" }, "Moderate"],
  ["RR-04", { critical: "yes", redundancy: "no" }, "High"],
  ["RR-05", { singleSource: "yes", qualifiedAlternate: "no" }, "Moderate"],
  ["RR-06", { switchDays: 11 }, "Moderate"],
  ["RR-07", { commonDependency: "yes" }, "Moderate"],
  ["RR-08", { critical: "yes", connected: "yes", remoteAccess: "yes", remoteControlled: "no" }, "High"],
  ["RR-09", { supplierDeterioration: "yes" }, "Moderate"],
  ["RR-10", { materialChange: "yes" }, "Low"],
];
for (const [id, facts, rating] of triggered) {
  test(`${id} applies its qualitative rule without a numeric score`, () => {
    const result = evaluateRisk(syntheticAssessment({ facts }));
    assert.equal(result.inherentRisk, rating);
    assert.equal(result.drivers.find(rule => rule.id === id).fired, true);
    assert.ok(result.requiredActions.some(rule => rule.id === id));
    assert.equal("score" in result, false);
  });
}

test("unknown ownership reduces confidence without increasing the known risk", () => {
  const result = evaluateRisk(syntheticAssessment({ facts: { ownershipKnown: "unknown", ownershipNexus: "unknown" } }));
  assert.equal(result.inherentRisk, "Not assessed");
  assert.equal(result.confidence, "Pending");
  assert.ok(result.rfis.some(x => x.id === "RR-03"));
});

test("pending information never erases a supported high risk", () => {
  const result = evaluateRisk(syntheticAssessment({ facts: { critical: "yes", redundancy: "no", ownershipKnown: "unknown" } }));
  assert.equal(result.inherentRisk, "High");
  assert.equal(result.confidence, "Pending");
});

test("proposed controls receive no credit until independently validated", () => {
  const assessment = syntheticAssessment({ facts: { singleSource: "yes", qualifiedAlternate: "no" }, mitigations: {
    "RR-05": { control: "Synthetic reserve stock.", evidence: "Synthetic inspection.", targetRisk: "Low" },
  } });
  assert.equal(evaluateRisk(assessment).residualRisk, "Moderate");
  const reduced = evaluateRisk(assessment, null, { validatedMitigations: ["RR-05"] });
  assert.equal(reduced.inherentRisk, "Moderate");
  assert.equal(reduced.residualRisk, "Low");
  assert.match(riskValidationBlock(assessment, syntheticValidation({ validatedMitigations: ["RR-06"] })), /Complete the control/);
});

test("a confirmed applicable prohibition cannot be reduced or approved as Proceed", () => {
  const assessment = syntheticAssessment({ facts: { prohibition: "confirmed" }, mitigations: {
    "RR-01": { control: "Proposed offset.", evidence: "Synthetic.", targetRisk: "Low" },
  } });
  assert.equal(evaluateRisk(assessment, null, { validatedMitigations: ["RR-01"] }).residualRisk, "Critical");
  assert.match(riskValidationBlock(assessment, syntheticValidation()), /cannot be overridden/);
  assert.equal(riskValidationBlock(assessment, syntheticValidation({ finalRisk: "Critical", action: "Do not proceed absent resolution" })), "");
});

test("draft policies cannot validate real assessments but remain usable in isolated practice", () => {
  const assessment = syntheticAssessment({ policy: { ...syntheticPolicy(), status: "Draft" } });
  assert.match(riskValidationBlock(assessment, syntheticValidation()), /approve/);
  assert.equal(riskValidationBlock(assessment, syntheticValidation(), { practice: true }), "");
  assert.match(policyApprovalBlock({}), /risk-appetite/);
  assert.equal(policyApprovalBlock(syntheticPolicy()), "");
  assert.equal(draftRiskPolicy({ floors: { "RR-01": "Low" } }).floors["RR-01"], "Critical");
});

test("potential list matches are unresolved legal checks, not confirmed designations", () => {
  const assessment = syntheticAssessment({ facts: { designation: "potential" } });
  assert.equal(evaluateRisk(assessment).drivers.find(x => x.id === "RR-02").fired, false);
  assert.match(riskValidationBlock(assessment, syntheticValidation({ confidence: "Pending" })), /Resolve the pending/);
});

test("missing and future-dated evidence cannot support high confidence", () => {
  const assessment = syntheticAssessment();
  assessment.evidence["RR-07"].checkedOn = "2999-01-01";
  assert.equal(evaluateRisk(assessment).confidence, "Pending");
  assert.match(riskValidationBlock(assessment, syntheticValidation()), /confidence/);
  assert.match(riskValidationBlock(assessment, syntheticValidation({ confidence: "Pending" })), /follow-up/);
  assessment.followUp = "The preparing role obtains the missing evidence before the next review.";
  assert.equal(riskValidationBlock(assessment, syntheticValidation({ confidence: "Pending" })), "");
});

test("record-specific recovery requirements take precedence over policy defaults", () => {
  const policy = { ...syntheticPolicy(), defaultRecoveryDays: 3 };
  assert.equal(evaluateRisk(syntheticAssessment({ policy, facts: { recoveryDays: null } })).inherentRisk, "Moderate");
  assert.equal(evaluateRisk(syntheticAssessment({ policy, facts: { recoveryDays: 10 } })).inherentRisk, "Low");
});

test("unsafe URLs and impossible dates are rejected without network requests", () => {
  assert.equal(safeSource("javascript:alert(1)"), "");
  assert.equal(safeSource("https://user:secret@example.org"), "");
  assert.equal(safeSource("https://example.org/evidence"), "https://example.org/evidence");
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-02-28"), true);
  assert.equal(normalizeRiskAssessment({ evidence: { "RR-01": { url: "data:text/html,unsafe" } } }).evidence["RR-01"].url, "");
});

test("material and policy holds exclude prior approvals without rewriting them", () => {
  const record = syntheticRecord({ status: "Approved" });
  assert.equal(decisionEligible(record), true);
  for (const reassessment of [{ materialCount: 1 }, { policyChanged: true }]) {
    const held = { ...record, reassessment };
    assert.equal(decisionEligible(held), false);
    assert.equal(held.status, "Approved");
    const brief = decisionBrief([held]);
    assert.equal(brief.approved, 0);
    assert.equal(vendorMap([held]).vendors[0].approved, 0);
    assert.match(JSON.stringify(brief), /re-assessment|policy changed/i);
    assert.ok(executiveSlides(brief).flatMap(slideNotes).some(text => /hold|re-assessment|policy changed/i.test(text)));
  }
  assert.equal(decisionEligible({ ...record, reassessment: { pendingCount: 1 } }), true);
});

test("risk exports carry the model outputs and omit reviewer identities", () => {
  const assessment = syntheticAssessment({ validation: { ...syntheticValidation(), at: "2026-01-02T00:00:00Z", by: "private-name@blackengtech.com", role: "cpi" } });
  const record = syntheticRecord({ status: "Approved", riskAssessment: assessment, version: 2 });
  const csv = rowsToCsv(riskRegisterRows([record]));
  assert.match(csv, /inherent risk/i);
  assert.match(csv, /Team validated/);
  assert.match(csv, /QA-v1/);
  assert.doesNotMatch(csv, /private-name@/);
  const workbook = workbookFromRows([record]);
  assert.equal(rowsFromWorkbook(workbook)[0].code, record.code);
  let cursor = 0;
  const entries = [];
  while (workbook.readUInt32LE(cursor) === 0x04034b50) {
    const size = workbook.readUInt32LE(cursor + 18);
    const start = cursor + 30 + workbook.readUInt16LE(cursor + 26) + workbook.readUInt16LE(cursor + 28);
    const body = workbook.subarray(start, start + size);
    entries.push((workbook.readUInt16LE(cursor + 8) === 8 ? inflateRawSync(body) : body).toString("utf8"));
    cursor = start + size;
  }
  assert.ok(entries.some(xml => xml.includes("Team validated")));
  assert.ok(entries.some(xml => xml.includes("QA-v1")));
  const eventCsv = rowsToCsv(triggerRegisterRows([{ key: "test-Q-01", version: 1, payload: normalizeTrigger({ code: "Q-01", summary: "=HYPERLINK(\"unsafe\")" }) }]));
  assert.ok(eventCsv.includes("'=HYPERLINK"));
  assert.doesNotMatch(csv, /^0,1,2/);
});

test("new Moderate ratings round-trip without converting historical Medium ratings", () => {
  const record = syntheticRecord({ risk: "Moderate", version: 1 });
  const rows = rowsFromWorkbook(workbookFromRows([record]));
  assert.equal(rows[0].risk, "Moderate");
  assert.equal(applyImportRow(null, { ...rows[0], version: 0 }, "preparer@blackengtech.com").record.risk, "Moderate");
  assert.equal(syntheticRecord({ risk: "Medium" }).risk, "Medium");
});

test("the new views escape input and keep read-only and empty states explicit", () => {
  const record = syntheticRecord({ title: "<img src=x onerror=alert(1)>" });
  const assurance = { policy: { version: 0, payload: { draft: {}, active: null } }, triggers: [] };
  const view = drawRiskAssessment({ items: [record], record, assurance, actor: { role: "administrator" }, projectId: "QA" });
  assert.doesNotMatch(view, /<img src=x/);
  assert.match(view, /&lt;img/);
  assert.doesNotMatch(view, /value="save">Save assessment/);
  assert.match(drawRiskRules({ assurance, actor: { role: "cpi" } }), /<fieldset disabled>/);
  assert.match(drawTriggers({ items: [], assurance, actor: { role: "cpi" }, projectId: "QA" }), /No event has been logged/);
  assert.match(drawRiskAssessment({ items: [], actor: {}, projectId: "QA", error: "Unavailable" }), /Unavailable/);
});

test("confidence uses neutral grey styling and trigger due dates allow future dates", async () => {
  const css = await readFile(new URL("../public/workbench.css", import.meta.url), "utf8");
  assert.match(css, /risk-summary-grid strong\.pill[^}]+background:#eef0f2;color:#43515d/);
  const source = await readFile(new URL("../public/riskview.js", import.meta.url), "utf8");
  assert.match(source, /name !== "dueOn"/);
});
