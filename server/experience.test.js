import test from "node:test";
import assert from "node:assert/strict";
import { workPlan, drawStart, drawRoster, drawRecordPath, drawQuickGuide } from "../public/experience.js";
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

test("start page tailors focus and quick actions to each role", () => {
  const items = [
    { code: "Q-01", title: "Returned item", status: "Returned", ownerRole: "nstt", reviewerRole: "cpi" },
    { code: "Q-02", title: "In CPI review", status: "In review", ownerRole: "nstt", reviewerRole: "cpi", reassessment: { pendingCount: 1 } },
    { code: "Q-03", title: "Trade item", status: "In review", ownerRole: "nstt", reviewerRole: "cpi", tradeSensitive: true },
    { code: "Q-04", title: "Held", status: "Approved", ownerRole: "nstt", reviewerRole: "cpi", reassessment: { materialCount: 1 } },
  ];
  const base = { items, projectName: "Synthetic", practice: false, canPractice: false, signedIn: true };
  const nstt = drawStart({ ...base, actor: { role: "nstt" } });
  assert.match(nstt, /Returned to you<\/span><strong>1</);
  assert.match(nstt, /Reassessment holds<\/span><strong>1</);
  assert.match(nstt, /data-task="new"[^>]*>New analysis/);
  assert.match(nstt, /Your default role/);
  const cpi = drawStart({ ...base, actor: { role: "cpi" }, roleSource: "project", defaultRole: "trade" });
  assert.match(cpi, /Waiting for your review<\/span><strong>2</);
  assert.match(cpi, /Events to classify<\/span><strong>1</);
  assert.match(cpi, /Assigned for this project\. Your default role is Trade/);
  assert.doesNotMatch(cpi, /New analysis/);
  const trade = drawStart({ ...base, actor: { role: "trade" } });
  assert.match(trade, /Trade-sensitive records<\/span><strong>1</);
  const admin = drawStart({ ...base, actor: { role: "administrator" }, roster: null });
  assert.doesNotMatch(admin, /Your focus/);
  assert.doesNotMatch(admin, /Quick role assignment/);
  assert.match(admin, /Manage access grants/);
});

test("quick role assignment lists members per project and escapes content", () => {
  const roster = {
    projects: [{ code: "MDC", name: "MDC Program Assurance" }, { code: "QA", name: "<b>Synthetic</b>" }],
    members: [{ email: "qa-one@blackengtech.com", role: "cpi" }, { email: "x\"<i>@blackengtech.com", role: "nstt" }],
    rosters: { MDC: { version: 0, assignments: {} }, QA: { version: 2, assignments: { "qa-one@blackengtech.com": "nstt" } } },
  };
  const markup = drawRoster(roster, { project: "QA" });
  assert.match(markup, /<option value="QA" selected>/);
  assert.match(markup, /Assigned NSTT in QA/);
  assert.match(markup, /<option value="nstt" selected>/);
  assert.match(markup, /Default \(CPI\)/);
  assert.doesNotMatch(markup, /<b>Synthetic|<i>/);
  assert.doesNotMatch(markup, /PRACTICE|value="administrator"/);
  assert.match(markup, /do not take a working role/);
  assert.match(drawRoster(roster, { project: "NOPE" }), /<option value="MDC" selected>/);
  assert.match(drawRoster(roster, { project: "QA", saving: "qa-one@blackengtech.com" }), /disabled/);
  const home = drawStart({ actor: { role: "administrator" }, items: [], projectName: "MDC", practice: false, canPractice: true, signedIn: true, roster, rosterProject: "QA" });
  assert.match(home, /Quick role assignment/);
  assert.match(home, /2 team members/);
});
