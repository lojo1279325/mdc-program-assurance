import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { actionList, applyImportRow, approvalBlock, methodChecklist, metrics, normalizeReview, scorecard } from "../public/rules.js";
import { rowsFromWorkbook, workbookFromRows } from "./sheet.js";

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

test("a source hold category does not become an action", () => {
  const first = applyImportRow(null, {
    code: "P009",
    title: "Bottom frame",
    sourceCategory: "Hold or Restructure",
    action: "",
    risk: "High",
    confidence: "Low",
    evidence: "Source note is on file.",
    lifecycle: "Review if the drawing changes.",
    version: 0,
  }, "analyst@blackengtech.com");
  assert.equal(first.result, "applied");
  assert.equal(first.record.action, "");
  assert.equal(first.record.version, 1);
  assert.equal(first.record.risk, "High");
  assert.equal(first.record.confidence, "Low");
  const blocked = applyImportRow(first.record, { code: "P009", action: "Hold or Restructure", version: 1 }, "analyst@blackengtech.com");
  assert.equal(blocked.result, "rejected");
  const approved = applyImportRow(first.record, { code: "P009", status: "Approved", version: 1 }, "analyst@blackengtech.com");
  assert.match(approved.message, /cannot approve/);
  const stale = applyImportRow(first.record, { code: "P009", title: "Changed title", version: 0 }, "analyst@blackengtech.com");
  assert.match(stale.message, /does not match version 1/);
});

test("a missing imported fact does not change the risk band", () => {
  const result = applyImportRow(null, {
    code: "FB221",
    title: "Added scope",
    risk: "Medium",
    confidence: "High",
    evidence: "",
    lifecycle: "Review at the next gate.",
    version: 0,
  }, "analyst@blackengtech.com");
  assert.equal(result.record.confidence, "Pending");
  assert.equal(result.record.risk, "Medium");
});

test("the register workbook round trip keeps the review key and version", () => {
  const file = workbookFromRows([{ code: "P037", title: "Supply line", version: 2, action: "Proceed with protections", confidence: "Low" }]);
  const rows = rowsFromWorkbook(file);
  assert.equal(rows[0].code, "P037");
  assert.equal(Number(rows[0].version), 2);
  assert.equal(rows[0].action, "Proceed with protections");
});

test("every exported workbook entry has a valid ZIP checksum", () => {
  const file = workbookFromRows([{ code: "S-01", title: "Sample \u00e9quipment", version: 1 }]);
  const checksums = new Map();
  let offset = 0;
  while (file.readUInt32LE(offset) === 0x04034b50) {
    const size = file.readUInt32LE(offset + 18);
    const nameLength = file.readUInt16LE(offset + 26);
    const extraLength = file.readUInt16LE(offset + 28);
    const name = file.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    const bytes = inflateRawSync(file.subarray(start, start + size));
    let checksum = 0xffffffff;
    for (const byte of bytes) {
      checksum ^= byte;
      for (let bit = 0; bit < 8; bit += 1) checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
    }
    checksum = (checksum ^ 0xffffffff) >>> 0;
    assert.equal(file.readUInt32LE(offset + 14), checksum, `Local checksum: ${name}`);
    checksums.set(name, checksum);
    offset = start + size;
  }
  assert.ok(checksums.size > 0);
  let centralCount = 0;
  while (file.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = file.readUInt16LE(offset + 28);
    const extraLength = file.readUInt16LE(offset + 30);
    const commentLength = file.readUInt16LE(offset + 32);
    const name = file.subarray(offset + 46, offset + 46 + nameLength).toString();
    assert.equal(file.readUInt32LE(offset + 16), checksums.get(name), `Central checksum: ${name}`);
    centralCount += 1;
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(centralCount, checksums.size);
  assert.equal(file.readUInt32LE(offset), 0x06054b50);
});

test("a workbook with reversed relationship order keeps the version column", () => {
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Code</t></is></c><c r="B1" t="inlineStr"><is><t>Title</t></is></c><c r="V1" t="inlineStr"><is><t>Version</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>P009</t></is></c><c r="B2" t="inlineStr"><is><t>&#19978;&#28023;</t></is></c><c r="C2"/><c r="V2"><v>0</v></c></row>
</sheetData></worksheet>`;
  const files = {
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="Register" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheet,
  };
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const compressed = deflateRawSync(data);
    const nameBuffer = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    local.push(header, nameBuffer, compressed);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, nameBuffer);
    offset += header.length + nameBuffer.length + compressed.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  const rows = rowsFromWorkbook(Buffer.concat([...local, ...central, eocd]));
  assert.equal(rows[0].code, "P009");
  assert.equal(rows[0].title, "上海");
  assert.equal(Number(rows[0].version), 0);
});
