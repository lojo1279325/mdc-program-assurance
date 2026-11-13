import test from "node:test";
import assert from "node:assert/strict";
import { rowsToCsv } from "../public/csv.js";

test("CSV exports retain review-note history and escape quoted text", () => {
  const updates = [{ note: 'A sample "quoted" review.', role: "cpi" }];
  const csv = rowsToCsv([{ code: "S-01", updates, title: "Line one\nLine two" }]);
  assert.match(csv, /^code,updates,title\n/);
  assert.ok(csv.includes(JSON.stringify(updates).replaceAll('"', '""')));
  assert.doesNotMatch(csv, /\[object Object\]/);
  assert.ok(csv.includes('"Line one\nLine two"'));
  assert.equal(rowsToCsv([]), "");
});
