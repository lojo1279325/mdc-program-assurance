import test from "node:test";
import assert from "node:assert/strict";
import { workPlan, drawStart, drawRecordPath, drawQuickGuide } from "../public/experience.js";
import { drawWizard } from "../public/wizard.js";
import { drawPresentation } from "../public/present.js";
import { decisionBrief } from "../public/brief.js";
import { practiceSamples } from "./practice.js";

test("next actions respect the preparing, review, and administrator roles", () => {
  const samples = practiceSamples();
  const nstt = workPlan({ role: "nstt" }, samples);
  const cpi = workPlan({ role: "cpi" }, samples);
  const trade = workPlan({ role: "trade" }, samples);
  const admin = workPlan({ role: "administrator" }, samples);
  assert.equal(nstt.next.code, "S-01");
  assert.equal(cpi.next.code, "S-02");
  assert.equal(trade.next.code, "S-03");
  assert.equal(admin.task, "access");
  assert.equal(admin.next, null);
  assert.equal(workPlan({ role: "nstt" }, []).task, "new");
  assert.equal(workPlan({ role: "cpi" }, []).task, "queue");
  const returned = { ...samples[0], code: "S-04", status: "Returned" };
  assert.equal(workPlan({ role: "nstt" }, [...samples, returned]).next.code, "S-04");
  assert.equal(workPlan({ role: "cpi" }, [{ ...samples[1], status: "Approved" }]).next, null);
});

test("start page keeps sample mode explicit and escapes record content", () => {
  const markup = drawStart({
    actor: { role: "nstt" }, items: [{ ...practiceSamples()[0], title: "<script>bad</script>" }],
    projectName: "Practice reviews", practice: true, canPractice: true, signedIn: true,
  });
  assert.match(markup, /Practice only/);
  assert.match(markup, /Continue analysis/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.doesNotMatch(markup, /@development.local/);
  assert.match(drawStart({ signedIn: false }), /Sign in to open your work/);
  assert.match(drawRecordPath(practiceSamples()[1], { role: "cpi" }), /Open review/);
  assert.match(drawRecordPath(practiceSamples()[0], { role: "administrator" }), /View analysis/);
});

test("wizard exposes current step, safe progression, and disabled boundaries", () => {
  const samples = practiceSamples();
  const first = drawWizard({ role: "nstt", record: samples[0], items: samples });
  assert.match(first, /aria-current="step"/);
  assert.match(first, /Save and continue/);
  assert.match(first, /aria-label="Purpose"/);
  assert.match(first, / required/);
  assert.match(first, /data-wizard="prev" disabled/);
  const last = drawWizard({ role: "nstt", step: 6, record: samples[0], items: samples });
  assert.match(last, /data-wizard="next" disabled/);
  const review = drawWizard({ role: "cpi", step: 3, record: samples[1], waiting: [samples[1]] });
  assert.match(review, /Save note and continue/);
  assert.match(review, /record-facts/);
});

test("presentation readiness changes after approval without excluding open records", () => {
  const samples = practiceSamples();
  const before = decisionBrief(samples, { projectName: "Practice reviews", projectCode: "PRACTICE" });
  assert.match(drawPresentation(before, 1), /No approved record is available/);
  const after = decisionBrief(samples.map((item) => item.code === "S-02" ? { ...item, status: "Approved" } : item), { projectName: "Practice reviews", projectCode: "PRACTICE" });
  assert.equal(after.approved, 1);
  assert.equal(after.records, 3);
  assert.match(drawPresentation(after, 1), /1 approved record is available/);
  assert.doesNotMatch(drawPresentation(after, 1), /No approved record is available/);
});

test("quick guide follows the current role and keeps practice explicit", () => {
  const admin = drawQuickGuide({ view: "analysis", role: "administrator", projectName: "MDC", practice: false });
  assert.match(admin, /Administrators manage grants and projects/);
  const prepare = drawQuickGuide({ view: "analysis", role: "nstt", projectName: "<sample>", practice: true });
  assert.match(prepare, /Save each step/);
  assert.match(prepare, /Practice only/);
  assert.match(prepare, /&lt;sample&gt;/);
  assert.doesNotMatch(prepare, /<sample>/);
  const review = drawQuickGuide({ view: "analysis", role: "cpi", projectName: "Practice reviews" });
  assert.match(review, /cannot approve your own preparation/);
  const presentation = drawQuickGuide({ view: "present", role: "trade", projectName: "MDC" });
  assert.match(presentation, /Download PowerPoint keeps the same layouts/);
});
