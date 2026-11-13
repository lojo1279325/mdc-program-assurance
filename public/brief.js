import { ACTIONS, normalizeReview } from "./rules.js";
import { vendorKey } from "./boards.js";

const RANK = { Pending: 0, Low: 1, Medium: 2, High: 3 };

export function namedVendor(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length < 2 || text.length > 80) return "";
  const low = text.toLowerCase();
  if (/^(n\/?a|na|none|unknown|tbd|not named|not assessed|no supplier|unnamed)$/.test(low)) return "";
  if (low.startsWith("no valid") || low.startsWith("not ") || low.includes("not established") || low.includes("no current supplier")) return "";
  return text;
}

export function isPartRecord(item) {
  return Boolean(String(item?.supplier || "").trim() || String(item?.sourceItem || "").trim() || String(item?.drawing || "").trim());
}

export function accuracyConfidence(item) {
  const vendor = namedVendor(item?.supplier);
  const part = String(item?.sourceItem || item?.title || "").trim();
  const evidence = String(item?.evidence || "").trim();
  if (!vendor || part.length < 2 || !evidence) return "Pending";
  const confidence = String(item?.confidence || "");
  return confidence === "High" || confidence === "Medium" || confidence === "Low" ? confidence : "Pending";
}

function weakest(values) {
  return values.reduce((worst, value) => (RANK[value] ?? 0) < (RANK[worst] ?? 0) ? value : worst, "High");
}

export function vendorMap(items) {
  const groups = new Map();
  const unnamed = [];
  for (const raw of items) {
    const item = normalizeReview(raw);
    if (!isPartRecord(item)) continue;
    const part = {
      code: item.code,
      title: item.title || "Untitled part",
      sourceItem: item.sourceItem || "",
      drawing: item.drawing || "",
      action: item.action || "",
      status: item.status,
      confidence: accuracyConfidence(raw),
      risk: item.risk,
      lifecycle: item.lifecycle || "",
      condition: item.condition || "",
    };
    const name = namedVendor(item.supplier);
    if (!name) {
      unnamed.push(part);
      continue;
    }
    const key = vendorKey(name);
    if (!groups.has(key)) groups.set(key, { key, name, parts: [] });
    const group = groups.get(key);
    if (name.length > group.name.length) group.name = name;
    group.parts.push(part);
  }
  const vendors = [...groups.values()].map((group) => {
    group.parts.sort((left, right) => left.code.localeCompare(right.code));
    group.accuracy = weakest(group.parts.map((part) => part.confidence));
    group.approved = group.parts.filter((part) => part.status === "Approved").length;
    group.open = group.parts.length - group.approved;
    return group;
  }).sort((left, right) => right.parts.length - left.parts.length || left.name.localeCompare(right.name));
  unnamed.sort((left, right) => left.code.localeCompare(right.code));
  return { vendors, unnamed };
}

function actionCounts(items) {
  const counts = { "Not set": 0 };
  for (const action of ACTIONS) counts[action] = 0;
  for (const item of items) counts[item.action || "Not set"] += 1;
  return counts;
}

function headlineFor(approved, total) {
  if (!total) return "This project has no review records. The brief will update when a record is saved.";
  if (!approved.length) return "This project is not ready for an executive decision. No record is approved.";
  const actions = new Set(approved.map((item) => item.action));
  if (actions.has("Do not proceed absent resolution")) return "Do not treat this project as clear to proceed. An approved record still requires resolution.";
  if (actions.has("Proceed with active mitigation")) return "Approved records support a decision only where active mitigation is already recorded.";
  if (actions.has("Proceed with protections")) return "Approved records support a decision only with the recorded protections.";
  if (approved.length < total) return "The approved records may proceed. The decision is not complete until the remaining records are approved.";
  return "Every record in this project is approved to proceed.";
}

function chunk(rows, size) {
  const pages = [];
  for (let index = 0; index < rows.length; index += size) pages.push(rows.slice(index, index + size));
  return pages.length ? pages : [[]];
}

function recordRow(item) {
  const condition = item.condition || "No condition is recorded.";
  const lifecycle = item.lifecycle || "No future policy and lifecycle note is recorded.";
  return {
    code: item.code,
    title: item.title || "Untitled review",
    action: item.action || "",
    confidence: item.confidence,
    text: `${condition} ${lifecycle}`,
  };
}

export function decisionBrief(items, options = {}) {
  const reviews = items.map(normalizeReview);
  const map = vendorMap(items);
  const approved = reviews.filter((item) => item.status === "Approved");
  const ready = reviews.filter((item) => ACTIONS.includes(item.action) && item.evidence && item.lifecycle && item.status !== "Approved");
  const missingAction = reviews.filter((item) => !ACTIONS.includes(item.action));
  const missingEvidence = reviews.filter((item) => !item.evidence);
  const missingLifecycle = reviews.filter((item) => !item.lifecycle);
  const pending = reviews.filter((item) => item.confidence === "Pending");
  const counts = actionCounts(approved);
  const projectName = options.projectName || "MDC Program Assurance";
  const generatedOn = options.generatedOn || "";
  const headline = headlineFor(approved, reviews.length);
  const openRows = reviews
    .filter((item) => item.status !== "Approved")
    .slice(0, 12)
    .map((item) => ({
      code: item.code,
      title: item.title || "Untitled review",
      action: item.action || "",
      confidence: item.confidence,
      text: !ACTIONS.includes(item.action)
        ? "This record still needs one of the four actions."
        : !item.evidence
          ? "A fact is missing. Confidence stays pending. The risk band does not change."
          : !item.lifecycle
            ? "This record still needs a future policy and lifecycle note."
            : "This record is not approved, so it is not part of the decision line.",
    }));
  const conditionPages = chunk(approved.map(recordRow), 2);
  const vendorRows = map.vendors.slice(0, 6).map((vendor) => ({
    code: String(vendor.parts.length),
    title: vendor.name,
    action: "",
    confidence: vendor.accuracy,
    text: `${vendor.parts.length} related part${vendor.parts.length === 1 ? "" : "s"}. ${vendor.approved} approved. Accuracy confidence is ${vendor.accuracy}.`,
  }));
  const slides = [
    {
      id: "cover",
      title: "Decision support",
      kicker: [projectName, generatedOn, "Draft for discussion"].filter(Boolean).join(" · "),
      lines: [
        headline,
        "This brief reads the current register for the selected project. It changes when a record is saved or approved.",
        "It does not repeat a static recommendation from an earlier deck, and it is not a legal conclusion.",
        "An executive decision uses approved records only.",
      ],
      rows: [],
    },
    {
      id: "readiness",
      title: "What is ready",
      kicker: "Completion does not create an approval",
      lines: [
        `The project has ${reviews.length} review record${reviews.length === 1 ? "" : "s"}.`,
        `${approved.length} ${approved.length === 1 ? "is" : "are"} approved and can support a decision.`,
        `${ready.length} ${ready.length === 1 ? "is" : "are"} prepared for a different role to review and ${ready.length === 1 ? "is" : "are"} not yet a decision.`,
        `${missingAction.length} still ${missingAction.length === 1 ? "needs" : "need"} one of the four actions.`,
        `${pending.length} ${pending.length === 1 ? "has" : "have"} pending confidence. A missing fact lowers confidence. It does not change the risk band.`,
        `${missingLifecycle.length} still ${missingLifecycle.length === 1 ? "needs" : "need"} a future policy and lifecycle note.`,
      ],
      rows: [],
    },
    {
      id: "decision",
      title: "Decision line",
      kicker: "Approved records only",
      lines: [
        headline,
        `${counts.Proceed} approved record${counts.Proceed === 1 ? "" : "s"} may proceed.`,
        `${counts["Proceed with protections"]} may proceed with documented protections.`,
        `${counts["Proceed with active mitigation"]} may proceed only with active mitigation.`,
        `${counts["Do not proceed absent resolution"]} should not proceed until the open fact is resolved.`,
        "A record that is not approved stays off this line, even when its action is already set.",
      ],
      rows: [],
    },
    ...conditionPages.map((rows, index) => ({
      id: `conditions-${index + 1}`,
      title: index ? "Conditions, continued" : "Conditions on the decision",
      kicker: "Every approved record keeps its condition and lifecycle",
      lines: rows.length
        ? ["Use the recorded condition and lifecycle. Do not add a protection that is not in the record."]
        : ["No approved record has a condition to apply yet."],
      rows,
    })),
    {
      id: "open",
      title: "Still open",
      kicker: "These records are not an executive decision",
      lines: [
        `${reviews.length - approved.length} record${reviews.length - approved.length === 1 ? "" : "s"} remain outside the decision line.`,
        `${missingEvidence.length} are missing a fact. Confidence stays pending for each one.`,
        `${map.unnamed.length} part${map.unnamed.length === 1 ? "" : "s"} have no named vendor. Accuracy confidence stays pending.`,
        openRows.length > 6 ? "The first open records are shown here. The register holds the rest." : "Open a record to complete it. This brief updates on the next save.",
      ],
      rows: openRows.slice(0, 4),
    },
    {
      id: "vendors",
      title: "Vendor concentration",
      kicker: "Accuracy confidence is not a risk color",
      lines: [
        map.vendors.length
          ? `${map.vendors.length} named vendor${map.vendors.length === 1 ? "" : "s"} cover the related parts in this project.`
          : "No named vendor is recorded in this project.",
        "Accuracy confidence is the weakest vendor and part link under that name. Pending means the vendor, the part, or the evidence is missing.",
        "A missing fact does not change the risk band, and a source match does not set the action.",
        map.vendors.length > vendorRows.length ? `${map.vendors.length - vendorRows.length} more vendors are in the vendor map.` : "The vendor map lists every related part.",
      ],
      rows: vendorRows,
    },
    {
      id: "use",
      title: "How to use this brief",
      kicker: "What changed from the earlier deck",
      lines: [
        "The earlier deck was a fixed discussion draft. This brief replaces that snapshot with the current register.",
        "Cost and lead time are not stored here, so this brief does not estimate them.",
        "Published customer expectations are not treated as contract duties unless an approved record states that duty.",
        "Personal names, method notes, and source notes are left out of the export.",
        "Proceed means no material issue on that approved record. Protections mean proceed once the recorded conditions are met. Active mitigation means an owned plan is required now. Do not proceed means stop absent resolution.",
      ],
      rows: [],
    },
  ];
  return {
    projectName,
    projectCode: options.projectCode || "MDC",
    generatedOn,
    headline,
    records: reviews.length,
    approved: approved.length,
    ready: ready.length,
    missingAction: missingAction.length,
    missingEvidence: missingEvidence.length,
    missingLifecycle: missingLifecycle.length,
    pending: pending.length,
    slides,
    vendors: map.vendors,
    unnamed: map.unnamed,
  };
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export function vendorMapCsv(map) {
  const headers = ["Vendor", "Part code", "Part", "Drawing", "Action", "Status", "Accuracy confidence", "Lifecycle", "Condition"];
  const rows = [];
  for (const vendor of map.vendors || []) {
    for (const part of vendor.parts) {
      rows.push([vendor.name, part.code, part.title, part.drawing, part.action || "Not set", part.status, part.confidence, part.lifecycle, part.condition]);
    }
  }
  for (const part of map.unnamed || []) {
    rows.push(["No named vendor", part.code, part.title, part.drawing, part.action || "Not set", part.status, "Pending", part.lifecycle, part.condition]);
  }
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
