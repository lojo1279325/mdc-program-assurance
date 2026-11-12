import test from "node:test";
import assert from "node:assert/strict";
import { approvalBlock, normalizeReview } from "../public/rules.js";
import {
  buildLibrary,
  cleanProjectId,
  completionBoard,
  filterProject,
  ownerBoard,
  userBoard,
  workflowBoard,
} from "../public/boards.js";
import { lookupSources, mapCsl, mapRegister, mapSayari } from "./sources.js";

test("a blank project stays on the built-in register", () => {
  const items = [
    normalizeReview({ code: "R-11", title: "Frame", supplier: "North Line Components" }),
    normalizeReview({ code: "R-12", title: "Pump", projectId: "POWER", supplier: "North Line Components" }),
  ];
  assert.equal(cleanProjectId(""), "MDC");
  assert.equal(filterProject(items, "MDC").length, 1);
  assert.equal(filterProject(items, "POWER")[0].code, "R-12");
  assert.equal(items[0].risk, "Not assessed");
});

test("completion and workflow counts do not treat pending confidence as a risk change", () => {
  const items = [
    normalizeReview({ code: "R-21", action: "Proceed", evidence: "Named source.", lifecycle: "Annual review.", confidence: "High", risk: "Low", status: "Open", stage: "What" }),
    normalizeReview({ code: "R-22", evidence: "", lifecycle: "Hold the lifecycle.", confidence: "High", risk: "High", status: "In review", stage: "Who" }),
  ];
  assert.equal(items[1].confidence, "Pending");
  assert.equal(items[1].risk, "High");
  const completion = completionBoard(items);
  assert.equal(completion.gates.find((gate) => gate.id === "action").done, 1);
  assert.equal(completion.pendingConfidence, 1);
  const flow = workflowBoard(items);
  assert.equal(flow.byStatus.Open, 1);
  assert.equal(flow.byStatus["In review"], 1);
  assert.equal(flow.byStage.What, 1);
});

test("my work separates the preparer from the reviewer", () => {
  const items = [
    normalizeReview({ code: "R-31", preparedBy: "analyst@blackengtech.com", ownerRole: "nstt", reviewerRole: "cpi", status: "In review", action: "Proceed", evidence: "Fact.", lifecycle: "Review later." }),
    normalizeReview({ code: "R-32", preparedBy: "reviewer@alvarezandmarsal.com", ownerRole: "cpi", reviewerRole: "nstt", status: "Returned" }),
  ];
  const mine = userBoard(items, { email: "analyst@blackengtech.com", role: "nstt" });
  assert.equal(mine.prepared.length, 1);
  assert.equal(mine.waiting.length, 0);
  const reviewer = userBoard(items, { email: "reviewer@alvarezandmarsal.com", role: "cpi" });
  assert.equal(reviewer.waiting[0].code, "R-31");
  assert.equal(ownerBoard(items).find((row) => row.role === "nstt").inReview, 1);
  assert.match(approvalBlock({ email: "analyst@blackengtech.com", role: "cpi" }, items[0]), /cannot approve/);
});

test("the library keeps the current evaluation and does not invent an action", () => {
  const items = [
    normalizeReview({ code: "P101", title: "Valve", supplier: "North Line Components", sourceItem: "P101", action: "Proceed with protections", risk: "Medium", evidence: "Drawing on file.", lifecycle: "Review if the drawing changes.", projectId: "MDC" }),
    normalizeReview({ code: "P102", title: "Valve spare", supplier: "north   line components", sourceItem: "P102", projectId: "POWER", risk: "High" }),
  ];
  const library = buildLibrary(items, [{ name: "North Line Components", country: "US", identifier: "NL-1", note: "Saved name." }], [], "MDC");
  assert.equal(library.vendors.length, 1);
  assert.equal(library.vendors[0].evaluations, 1);
  assert.equal(library.vendors[0].otherProjects, 1);
  assert.equal(library.vendors[0].current.action, "Proceed with protections");
  assert.equal(library.vendors[0].current.risk, "Medium");
  assert.equal(library.parts.find((part) => part.code === "P102").evaluations, 0);
});

test("a public or Sayari match does not become an action", async () => {
  const register = mapRegister({ results: [{ title: "Export notice", publication_date: "2026-01-02", html_url: "https://www.federalregister.gov/documents/example", document_number: "2026-00001" }] }, "2026-11-12T00:00:00.000Z");
  assert.equal(register.status, "matched");
  assert.equal(register.action, undefined);
  const screening = mapCsl({ results: [] }, "2026-11-12T00:00:00.000Z");
  assert.equal(screening.status, "no match");
  const sayari = mapSayari({ data: [{ id: "abc", label: "NORTH LINE COMPONENTS", countries: ["USA"], risk: { cpi_score: { level: "relevant" } } }] }, "2026-11-12T00:00:00.000Z");
  assert.equal(sayari.status, "matched");
  assert.equal(sayari.payload.results[0].risk, undefined);
  assert.doesNotMatch(sayari.summary, /Proceed/);

  const calls = [];
  const result = await lookupSources({ name: "North Line" }, {
    env: {},
    fetch: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ results: [] }) };
    },
  });
  assert.equal(result.results.find((item) => item.source === "Sayari").status, "not connected");
  assert.equal(result.results.find((item) => item.source === "US Consolidated Screening List").status, "not connected");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /federalregister\.gov/);
});
