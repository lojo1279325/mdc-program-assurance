import test from "node:test";
import assert from "node:assert/strict";
import { accuracyConfidence, decisionBrief, namedVendor, vendorMap, vendorMapCsv } from "../public/brief.js";
import { drawPresentation } from "../public/present.js";
import { briefToPptx } from "../public/pptx.js";
import { normalizeReview } from "../public/rules.js";

test("a missing vendor fact stays pending and does not change the risk band", () => {
  const raw = {
    code: "R-41",
    title: "Valve",
    supplier: "No valid current supplier literal is established.",
    risk: "High",
    confidence: "High",
    evidence: "Drawing on file.",
    lifecycle: "Review if the drawing changes.",
  };
  const saved = normalizeReview(raw);
  assert.equal(saved.risk, "High");
  assert.equal(namedVendor(raw.supplier), "");
  assert.equal(accuracyConfidence(raw), "Pending");
  const map = vendorMap([raw, { code: "R-07", title: "Purpose of the review", layer: "Identification" }]);
  assert.equal(map.vendors.length, 0);
  assert.equal(map.unnamed[0].code, "R-41");
  assert.equal(map.unnamed[0].risk, "High");
});

test("accuracy confidence follows the vendor and part link, not approval", () => {
  const strong = { code: "P101", title: "Valve", supplier: "Harbor Check Components", sourceItem: "HC-11", evidence: "Drawing on file.", confidence: "High", risk: "Medium", lifecycle: "" };
  const weak = { code: "P102", title: "Valve spare", supplier: "harbor check components", sourceItem: "HC-12", evidence: "", confidence: "High", risk: "Low", lifecycle: "Review later." };
  assert.equal(accuracyConfidence(strong), "High");
  assert.equal(normalizeReview(weak).confidence, "Pending");
  assert.equal(normalizeReview(weak).risk, "Low");
  const map = vendorMap([strong, weak]);
  assert.equal(map.vendors.length, 1);
  assert.equal(map.vendors[0].parts.length, 2);
  assert.equal(map.vendors[0].accuracy, "Pending");
});

test("the decision line uses approved records only", () => {
  const open = { code: "R-51", title: "Frame", supplier: "North Line Components", action: "Proceed", evidence: "Named source.", lifecycle: "Annual review.", confidence: "High", status: "Open" };
  const blocked = { code: "R-52", title: "Cabinet", supplier: "North Line Components", action: "Do not proceed absent resolution", evidence: "Open ownership fact.", lifecycle: "Do not buy until the owner is named.", confidence: "Medium", status: "Approved", condition: "Resolve the owner before any order." };
  const waiting = decisionBrief([open], { projectName: "Pilot Check", projectCode: "PILOT", generatedOn: "November 13, 2026" });
  assert.match(waiting.headline, /not ready for an executive decision/);
  assert.equal(waiting.approved, 0);
  const decided = decisionBrief([open, blocked], { projectName: "Pilot Check", projectCode: "PILOT" });
  assert.match(decided.headline, /should not|Do not treat/i);
  assert.equal(decided.slides.find((slide) => slide.id === "decision").lines[0], decided.headline);
  assert.doesNotMatch(decided.slides.map((slide) => slide.lines.join(" ")).join(" "), /purchase order/i);
  assert.doesNotMatch(JSON.stringify(decided), /@/);
});

test("the export leaves out personal names and keeps the current headline", () => {
  const brief = decisionBrief([
    { code: "R-61", title: "Fitting", supplier: "Harbor Check Components", action: "Proceed with protections", evidence: "Internal method note.", lifecycle: "Review if the drawing changes.", confidence: "Medium", status: "Approved", preparedBy: "analyst@blackengtech.com", condition: "Keep the recorded protection." },
  ], { projectName: "Pilot Check", projectCode: "PILOT", generatedOn: "November 13, 2026" });
  const bytes = briefToPptx(brief);
  const text = new TextDecoder().decode(bytes);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(text, /Approved records support a decision only with the recorded protections/);
  assert.match(text, /Draft for discussion/);
  assert.doesNotMatch(text, /analyst@/);
  assert.doesNotMatch(text, /Internal method note/);
  const csv = vendorMapCsv({ vendors: brief.vendors, unnamed: brief.unnamed });
  assert.match(csv, /Harbor Check Components/);
  assert.match(csv, /Accuracy confidence/);
  assert.doesNotMatch(csv, /analyst@/);
  assert.doesNotMatch(csv, /Internal method note/);
  const panel = drawPresentation(brief, 4);
  assert.match(panel, /Live presentation/);
  assert.match(panel, /Slide previews/);
  assert.match(drawPresentation(brief, 0), /Harbor Check Components/);
  assert.match(panel, /executive-slide/);
  assert.match(panel, /data-presentation-zoom/);
  assert.doesNotMatch(panel, /Proceed with acti\.\.\./);
  assert.doesNotMatch(panel, /analyst@/);
});
