import test from "node:test";
import assert from "node:assert/strict";
import { executiveSlides, slideNotes } from "../public/presentation-model.js";
import { PRESENTATION_LAYOUTS } from "../public/presentation-layouts.js";
import { decisionBrief } from "../public/brief.js";
import { briefToPptx } from "../public/pptx.js";
import { drawPresentation } from "../public/present.js";
import { practiceSamples } from "./practice.js";

test("all eight reference layouts retain their native graphics and text positions", () => {
  const brief = decisionBrief(practiceSamples(), { projectCode: "PRACTICE", projectName: "Practice reviews" });
  const slides = executiveSlides(brief);
  assert.equal(slides.length, 8);
  slides.forEach((slide, index) => {
    assert.equal(slide.shapes.length, PRESENTATION_LAYOUTS[index].length);
    for (const shape of slide.shapes) {
      const source = PRESENTATION_LAYOUTS[index].find((candidate) => candidate.slot === shape.slot);
      assert.equal(shape.x, source.x);
      assert.equal(shape.y, source.y);
      if (shape.type === "text") assert.ok(shape.lines.length);
    }
  });
  assert.match(drawPresentation(brief, 7), /Slide 8 of 8/);
  assert.match(drawPresentation(brief, 0, { readable: true }), /data-readable="true"/);
});

test("presentation separates approval, evidence confidence, and risk", () => {
  const samples = practiceSamples();
  const draft = decisionBrief(samples);
  assert.equal(draft.approved, 0);
  const notes = slideNotes(executiveSlides(draft)[0]).join("\n");
  assert.match(notes, /Status: Open/);
  assert.match(notes, /Future Policy\/Lifecycle:/);
  assert.match(notes, /Risk:/);
  assert.match(notes, /Confidence:/);
  const approved = decisionBrief(samples.map((item, index) => index === 1 ? { ...item, status: "Approved" } : item));
  assert.equal(approved.approved, 1);
  assert.match(executiveSlides(approved)[0].subtitle, /1 of 3/);
});

test("exports include complete notes, editable shapes, no personal metadata, and all eight slides", () => {
  const samples = practiceSamples().map((item) => ({ ...item, preparedBy: "hidden@example.com", evidence: "PRIVATE METHOD NOTE" }));
  const brief = decisionBrief(samples);
  const text = new TextDecoder().decode(briefToPptx(brief));
  assert.equal((text.match(/<p:sld xmlns/g) || []).length, 8);
  assert.equal((text.match(/<p:notes xmlns/g) || []).length, 8);
  assert.ok((text.match(/<p:sp>/g) || []).length > 300);
  assert.match(text, /typeface="Arial"/);
  assert.match(text, /Future Policy\/Lifecycle:/);
  assert.doesNotMatch(text, /hidden@example.com|PRIVATE METHOD NOTE|<p:pic>/);
});

test("empty and oversized source fields remain explicit and recoverable", () => {
  const empty = executiveSlides(decisionBrief([]));
  assert.match(empty[0].title, /Build the register/);
  assert.match(slideNotes(empty[1]).join("\n"), /No approved record/);
  const long = "Very long source statement. ".repeat(60);
  const sample = { ...practiceSamples()[0], supplier: "Example Supplier " + "Long ".repeat(50), condition: long, lifecycle: long };
  const slides = executiveSlides(decisionBrief([sample], { projectName: "Long ".repeat(100) }));
  assert.ok(slides[0].overflow.length > 0);
  assert.ok(slideNotes(slides[0]).join("\n").includes(long.trim()));
  assert.match(slideNotes(slides[1]).join("\n"), /not a purchasing approval|no approved|No approved/i);
});
