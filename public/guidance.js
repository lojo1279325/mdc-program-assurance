import { ACTIONS, CONFIDENCE, LAYERS, RISK, STAGES } from "./rules.js";

export const STANDARD_COUNTRIES = [
  "United States",
  "China",
  "Japan",
  "South Korea",
  "Taiwan",
  "Germany",
  "Netherlands",
  "Singapore",
  "Malaysia",
  "Vietnam",
  "India",
  "Mexico",
  "Canada",
  "United Kingdom",
  "France",
  "Ireland",
  "Israel",
  "Thailand",
  "Australia",
  "Sweden",
];

export const STANDARD_MODULES = [
  "IT container",
  "Power path",
  "Cooling path",
  "Network path",
  "Site infrastructure",
];

const CONDITION_NOTES = [
  "Document the protection before the next buy.",
  "Name the second source before the next buy.",
  "Keep the inspection right in the purchase terms.",
  "Record the export classification before shipment.",
];

const LIFECYCLE_NOTES = [
  "Revisit before the next purchase order.",
  "Revisit if the vendor, the drawing, or the export rule changes.",
  "Revisit at the next program gate.",
  "Revisit when the missing fact is supplied.",
];

const EVIDENCE_NOTES = [
  "The drawing revision and its date are on the source.",
  "The supplier legal name is written on the source.",
  "The specification page names this part.",
  "The source does not state this fact.",
];

const OPEN_FACT_NOTES = [
  "Country of manufacture is not on the source.",
  "Export classification is not recorded.",
  "A second source is not named.",
  "Vendor ownership is not confirmed.",
];

const REVIEW_NOTES = [
  "Checked the drawing revision and the named vendor.",
  "The missing fact is still open, so confidence stays pending.",
  "Returned for the preparing role to record the lifecycle.",
  "Trade note recorded. The analysis was not changed.",
];

export const FIELD_GUIDE = {
  title: {
    label: "Purpose",
    tone: "identity",
    help: "State why this part is in the review. Use the part name and its use. A source category is not an action.",
    example: "Example: Frame that holds the hall racks.",
  },
  supplier: {
    label: "Vendor",
    tone: "identity",
    help: "Record the legal name as written on the source. Do not merge two different written names. A placeholder sentence is not a vendor.",
    example: "Example: The legal name as written, including Ltd. or Inc.",
    suggest: "vendors",
  },
  sourceItem: {
    label: "Part code",
    tone: "identity",
    help: "Record the part code as written on the drawing or the register. Do not invent a code when the source does not show one.",
    example: "Example: The code as written, such as P-100.",
    suggest: "parts",
  },
  drawing: {
    label: "Drawing",
    tone: "identity",
    help: "Record the drawing number and revision. If the revision is missing, say that in the open fact.",
    example: "Example: DWG-100 Rev A.",
    suggest: "drawings",
  },
  module: {
    label: "Where it is used",
    tone: "identity",
    help: "Record where the part sits in the supply, such as the module or the site use.",
    example: "Example: IT container, primary power path.",
    suggest: "modules",
  },
  layer: {
    label: "Layer",
    tone: "decision",
    kind: "select",
    help: "Choose the review layer. Identification names the part. Part significance says why it matters. Supply-chain resilience covers continuity. Governance covers control and trade. Recommendation is the action.",
    example: "Example: Part significance, when the question is why this part matters.",
    choices: LAYERS,
  },
  stage: {
    label: "Stage",
    tone: "decision",
    kind: "select",
    help: "Choose the stage in the sequence. The sequence is Why, What, When, Where, Who, then How.",
    example: "Example: Who, when this step records the vendor.",
    choices: STAGES,
  },
  risk: {
    label: "Risk",
    tone: "risk",
    kind: "select",
    help: "Choose the risk band from the facts you have. A missing fact does not move this band. It keeps confidence pending.",
    example: "Example: Not assessed, until the facts support a band.",
    choices: RISK,
  },
  confidence: {
    label: "Confidence",
    tone: "note",
    kind: "select",
    help: "Choose how complete the facts are. High, Medium, Low, or Pending. A missing fact forces Pending. Confidence is not a risk color.",
    example: "Example: Pending, when the country of manufacture is not on the source.",
    choices: CONFIDENCE,
  },
  action: {
    label: "Action",
    tone: "decision",
    kind: "select",
    help: "Choose one of the four actions. Proceed. Proceed with protections. Proceed with active mitigation. Do not proceed absent resolution. Leave it unset until the record supports one.",
    example: "Example: Proceed with protections, when a documented protection is enough.",
    choices: ["", ...ACTIONS],
    labels: { "": "Not set" },
  },
  projectId: {
    label: "Project",
    tone: "identity",
    kind: "select",
    help: "Choose the project that should hold this record. Saving into another project creates a new version. It does not delete the current register.",
    example: "Example: MDC for the current register.",
  },
  condition: {
    label: "Condition",
    tone: "note",
    kind: "note",
    help: "Write the protection or mitigation this record needs. A standard note is a starting sentence. It is not a decision until you save it for this part.",
    example: "Example: Name the second source before the next buy.",
    starters: CONDITION_NOTES,
  },
  lifecycle: {
    label: "Future policy and lifecycle",
    tone: "note",
    kind: "note",
    help: "Write when this part must be reviewed again. Every part needs this note before approval.",
    example: "Example: Revisit before the next purchase order.",
    starters: LIFECYCLE_NOTES,
  },
  evidence: {
    label: "Evidence",
    tone: "note",
    kind: "note",
    help: "Write the fact that supports the record, and where it came from. If the fact is missing, say that. A missing fact keeps confidence pending and does not change the risk band.",
    example: "Example: The specification page names this part.",
    starters: EVIDENCE_NOTES,
  },
  openFact: {
    label: "Open fact",
    tone: "note",
    kind: "note",
    help: "Write the fact that is still missing. Do not turn a missing fact into a higher risk band.",
    example: "Example: Country of manufacture is not on the source.",
    starters: OPEN_FACT_NOTES,
  },
  tradeSensitive: {
    label: "Trade sensitive",
    tone: "risk",
    kind: "select",
    help: "Choose Yes when a trade note is required before a non-Trade reviewer can approve. Choose No when trade review is not required for this record.",
    example: "Example: Yes, when the part has an export condition.",
    choices: ["no", "yes"],
    labels: {
      no: "No. Trade review is not required.",
      yes: "Yes. Trade must add a note before approval.",
    },
  },
  update: {
    label: "Review note",
    tone: "note",
    kind: "note",
    help: "Write what you checked. The note is the review. It is not a new analysis, and it does not change the action.",
    example: "Example: Checked the drawing revision and the named vendor.",
    starters: REVIEW_NOTES,
  },
  vendorName: {
    label: "Vendor name",
    tone: "identity",
    help: "Add the legal name as you want it kept in the library. A saved name can exist before a review does.",
    example: "Example: The legal name as written, including Ltd. or Inc.",
    suggest: "vendors",
  },
  country: {
    label: "Country",
    tone: "identity",
    help: "Record the country of the named legal entity. This list is a writing aid. It is not a screening result.",
    example: "Example: Japan.",
    suggest: "countries",
  },
  identifier: {
    label: "Identifier",
    tone: "identity",
    help: "Record a registration number or another source identifier. Leave it blank if the source does not show one.",
    example: "Example: A company number from the source.",
  },
  vendorNote: {
    label: "Note",
    tone: "note",
    help: "Write what this library name is used for. Do not put a screening conclusion here.",
    example: "Example: Named vendor for the power path review.",
  },
  partCode: {
    label: "Part code",
    tone: "identity",
    help: "Record the part code as written. A saved code can exist before a review does.",
    example: "Example: The code as written, such as P-100.",
    suggest: "parts",
  },
  partName: {
    label: "Part name",
    tone: "identity",
    help: "Record the part name as written on the source. Do not shorten it into a different name.",
    example: "Example: Container frame.",
    suggest: "partNames",
  },
  partVendor: {
    label: "Vendor name",
    tone: "identity",
    help: "Record the vendor that supplies this part, using the name as written. Do not merge two different written names.",
    example: "Example: The same legal name used in the vendor library.",
    suggest: "vendors",
  },
  projectCode: {
    label: "Project code",
    tone: "identity",
    help: "Use a short code of letters and numbers. It starts with a letter. The current register stays on MDC.",
    example: "Example: POWER.",
  },
  projectName: {
    label: "Project name",
    tone: "identity",
    help: "Write the name people will see when they open this project. A new project starts empty.",
    example: "Example: Site power review.",
  },
  projectNote: {
    label: "Note",
    tone: "note",
    help: "Write what this project covers. Do not move existing records by typing them here.",
    example: "Example: Reviews for the site power path only.",
  },
  sourceName: {
    label: "Name",
    tone: "identity",
    help: "Enter the vendor or part name you want checked. A match is a source note. It does not set the action or the risk band.",
    example: "Example: The legal name as written.",
    suggest: "vendors",
  },
  sourceKind: {
    label: "Kind",
    tone: "decision",
    kind: "select",
    help: "Choose Vendor or Part so the check is stored against the right library name.",
    example: "Example: Vendor, when you are checking a company name.",
    choices: ["vendor", "part"],
    labels: { vendor: "Vendor", part: "Part" },
  },
  grantEmail: {
    label: "Email",
    tone: "identity",
    help: "Enter the work email of a different person on blackengtech.com or alvarezandmarsal.com. A matching domain is not a grant. You cannot grant a role to yourself.",
    example: "Example: name@alvarezandmarsal.com.",
  },
  grantRole: {
    label: "Role",
    tone: "decision",
    kind: "select",
    help: "Choose the least role this person needs. Administrator grants access. NSTT prepares. CPI reviews parts and suppliers. Trade reviews trade conditions. This grant applies only to this environment.",
    example: "Example: NSTT, when the person will prepare records.",
    choices: ["administrator", "nstt", "cpi", "trade"],
    labels: { administrator: "Administrator", nstt: "NSTT", cpi: "CPI", trade: "Trade" },
  },
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.slice(0, 80);
}

export function knownValues(items = [], library = {}) {
  return {
    vendors: unique([...(library.vendors || []).map((row) => row.name), ...items.map((item) => item.supplier)]),
    parts: unique([...(library.parts || []).map((row) => row.code), ...items.map((item) => item.sourceItem)]),
    partNames: unique([...(library.parts || []).map((row) => row.name)]),
    drawings: unique([...(library.parts || []).map((row) => row.drawing), ...items.map((item) => item.drawing)]),
    modules: unique([...STANDARD_MODULES, ...items.map((item) => item.module)]),
    countries: unique([...STANDARD_COUNTRIES, ...(library.vendors || []).map((row) => row.country)]),
  };
}

export function guideBanner() {
  return `<details class="field-help"><summary>Field help and action colors</summary><p>Open Guide beside a field for help. Examples show the type of information to enter. Known-name suggestions do not replace source verification.</p><div class="color-key" aria-label="Action colors"><span class="pill green">Proceed</span><span class="pill yellow">Proceed with protections</span><span class="pill orange">Proceed with active mitigation</span><span class="pill red">Do not proceed absent resolution</span><span class="pill grey">Confidence stays grey</span></div></details>`;
}

export function fieldBox({ key, name, value = "", suggestions = [], choices = null, idPrefix = "field", required = false, type = "text" }) {
  const guide = FIELD_GUIDE[key] || {
    label: name,
    tone: "note",
    help: "Record the fact for this field. Use the wording from the source.",
    example: "Example: The wording from the source.",
  };
  const fieldName = name || key;
  const tipId = `${idPrefix}-${fieldName}-tip`;
  const exampleId = `${idPrefix}-${fieldName}-example`;
  const listId = `${idPrefix}-${fieldName}-list`;
  const current = value ?? "";
  const head = `<span class="field-label">${esc(guide.label)} <button type="button" class="field-mark" aria-expanded="false" aria-describedby="${tipId}">Guide</button></span>`;
  const example = `<span class="field-example" id="${exampleId}">${esc(guide.example)}</span>`;
  const requiredAttr = required ? " required" : "";
  let control = "";
  if (guide.kind === "select") {
    const items = choices || guide.choices || [];
    control = `<select name="${esc(fieldName)}" aria-label="${esc(guide.label)}"${requiredAttr} aria-describedby="${exampleId}">${items.map((item) => {
      const optionValue = typeof item === "object" ? item.value : item;
      const optionLabel = typeof item === "object" ? item.label : (guide.labels?.[optionValue] || optionValue || "Not set");
      return `<option value="${esc(optionValue)}" ${String(optionValue) === String(current) ? "selected" : ""}>${esc(optionLabel)}</option>`;
    }).join("")}</select>`;
  } else if (guide.kind === "note") {
    const starter = `<select data-fill="${esc(fieldName)}" aria-label="Standard note for ${esc(guide.label)}"><option value="">Choose a standard note, or write your own</option>${(guide.starters || []).map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}</select>`;
    control = `${starter}<textarea name="${esc(fieldName)}" aria-label="${esc(guide.label)}"${requiredAttr} aria-describedby="${exampleId}">${esc(current)}</textarea>`;
  } else {
    const known = suggestions.length ? `<datalist id="${listId}">${suggestions.map((item) => `<option value="${esc(item)}"></option>`).join("")}</datalist>` : "";
    const listAttr = suggestions.length ? ` list="${listId}"` : "";
    control = `<input name="${esc(fieldName)}" aria-label="${esc(guide.label)}" type="${esc(type)}" value="${esc(current)}"${listAttr}${requiredAttr} aria-describedby="${exampleId}" />${known}`;
  }
  const tip = `<span class="field-tip" id="${tipId}" role="tooltip">${esc(guide.help)}</span>`;
  return `<div class="field tone-${esc(guide.tone || "note")}">${head}${control}${example}${tip}</div>`;
}
