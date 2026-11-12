import { deflateRawSync, inflateRawSync } from "node:zlib";

const HEADERS = [
  "Code",
  "Title",
  "Module",
  "Source item",
  "Supplier",
  "Drawing",
  "Risk",
  "Confidence",
  "Confidence score",
  "Source action category",
  "Action",
  "Status",
  "Owner role",
  "Reviewer role",
  "Stage",
  "Layer",
  "Condition",
  "Lifecycle",
  "Evidence",
  "Open fact",
  "Source status",
  "Version",
  "Change note",
];

const FIELD_BY_HEADER = {
  Code: "code",
  Title: "title",
  Module: "module",
  "Source item": "sourceItem",
  Supplier: "supplier",
  Drawing: "drawing",
  Risk: "risk",
  Confidence: "confidence",
  "Confidence score": "confidenceScore",
  "Source action category": "sourceCategory",
  Action: "action",
  Status: "status",
  "Owner role": "ownerRole",
  "Reviewer role": "reviewerRole",
  Stage: "stage",
  Layer: "layer",
  Condition: "condition",
  Lifecycle: "lifecycle",
  Evidence: "evidence",
  "Open fact": "openFact",
  "Source status": "sourceStatus",
  Version: "version",
  "Change note": "changeNote",
};

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function xmlText(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(parseInt(digits, 16)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function xmlAttr(tag, name) {
  return tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] || "";
}

function columnName(index) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function unzip(buffer) {
  const view = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let eocd = -1;
  const scan = Math.max(0, view.length - 22 - 65535);
  for (let index = view.length - 22; index >= scan; index -= 1) {
    if (view.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("The workbook could not be read.");
  const count = view.readUInt16LE(eocd + 10);
  let cursor = view.readUInt32LE(eocd + 16);
  const files = {};
  for (let item = 0; item < count; item += 1) {
    if (view.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = view.readUInt16LE(cursor + 10);
    const compressedSize = view.readUInt32LE(cursor + 20);
    const nameLength = view.readUInt16LE(cursor + 28);
    const extraLength = view.readUInt16LE(cursor + 30);
    const commentLength = view.readUInt16LE(cursor + 32);
    const localOffset = view.readUInt32LE(cursor + 42);
    const name = view.slice(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const localNameLength = view.readUInt16LE(localOffset + 26);
    const localExtraLength = view.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = view.slice(dataStart, dataStart + compressedSize);
    files[name] = method === 0 ? compressed : inflateRawSync(compressed);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function sharedStrings(xml) {
  if (!xml) return [];
  const text = xml.toString("utf8");
  const items = [];
  for (const block of text.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...block[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => xmlText(match[1]));
    items.push(parts.join(""));
  }
  return items;
}

function sheetRows(xml, strings) {
  const text = xml.toString("utf8");
  const rows = [];
  for (const row of text.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      if (!cell[2]) continue;
      const attrs = cell[2];
      const body = cell[3];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/);
      const type = attrs.match(/\bt="([^"]+)"/);
      const column = ref ? ref[1] : columnName(values.length);
      let index = 0;
      for (const char of column) index = index * 26 + char.charCodeAt(0) - 64;
      const inline = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
      const raw = body.match(/<v>([\s\S]*?)<\/v>/);
      let value = "";
      if (inline) value = xmlText(inline[1]);
      else if (raw && type?.[1] === "s") value = strings[Number(raw[1])] || "";
      else if (raw) value = xmlText(raw[1]);
      values[index - 1] = value;
    }
    rows.push(values);
  }
  return rows;
}

function registerSheetName(files) {
  const workbook = files["xl/workbook.xml"]?.toString("utf8") || "";
  const rels = files["xl/_rels/workbook.xml.rels"]?.toString("utf8") || "";
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*\/?>/g)].map((match) => ({
    name: xmlAttr(match[0], "name"),
    id: xmlAttr(match[0], "r:id"),
  }));
  const named = sheets.find((sheet) => sheet.name === "Register") || sheets[0];
  if (!named?.id) throw new Error("The workbook has no Register sheet.");
  const relation = [...rels.matchAll(/<Relationship\b[^>]*\/?>/g)]
    .map((match) => ({ id: xmlAttr(match[0], "Id"), target: xmlAttr(match[0], "Target") }))
    .find((item) => item.id === named.id);
  if (!relation?.target) throw new Error("The Register sheet could not be found.");
  const target = relation.target.replace(/^\//, "");
  return target.startsWith("xl/") ? target : `xl/${target}`;
}

export function rowsFromWorkbook(buffer) {
  const files = unzip(buffer);
  const path = registerSheetName(files);
  const sheet = files[path];
  if (!sheet) throw new Error("The Register sheet could not be found.");
  const rows = sheetRows(sheet, sharedStrings(files["xl/sharedStrings.xml"]));
  if (!rows.length) return [];
  const headers = rows[0].map((value) => String(value || "").trim());
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      const field = FIELD_BY_HEADER[header];
      if (field) record[field] = row[index] ?? "";
    });
    return record;
  }).filter((record) => String(record.code || "").trim());
}

function sheetXml(rows) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, column) => {
      const ref = `${columnName(column)}${rowIndex + 1}`;
      if (value == null || value === "") return "";
      if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function zip(files) {
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
  const centralOffset = offset;
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...local, ...central, eocd]);
}

export function workbookFromRows(records) {
  const register = [
    HEADERS,
    ...records.map((record) => HEADERS.map((header) => {
      const field = FIELD_BY_HEADER[header];
      const value = record[field];
      return header === "Version" ? Number(value || 0) : value ?? "";
    })),
  ];
  const instructions = [
    ["MDC Program Assurance Workbench"],
    ["Use the Register sheet for a large update. Do not rename the headers or the sheet."],
    ["Leave a cell blank to keep the current value. Type CLEAR to remove a text value."],
    ["Version must match the current record. Export again if a row is rejected as stale."],
    ["Import cannot approve a record. A different role approves after review."],
    ["Hold or Restructure is a source category. It is not one of the four actions."],
    ["A missing fact keeps confidence pending. It does not change the risk band."],
    ["Allowed actions", "Proceed", "Proceed with protections", "Proceed with active mitigation", "Do not proceed absent resolution"],
  ];
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Instructions" sheetId="1" r:id="rId1"/><sheet name="Register" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`,
    "xl/worksheets/sheet1.xml": sheetXml(instructions),
    "xl/worksheets/sheet2.xml": sheetXml(register),
  };
  return zip(files);
}

export { HEADERS };
