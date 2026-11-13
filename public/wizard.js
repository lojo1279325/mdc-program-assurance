import { ACTIONS, CONFIDENCE, RISK, STAGES, approvalBlock } from "./rules.js";
import { ROLE_LABEL, recordAccess, roleSummary } from "./privileges.js";

const PREPARE_STEPS = [
  { id: "why", stage: "Why", title: "Why this part is in the review", body: "State why this part is in the review. A source category is not an action.", fields: ["title"] },
  { id: "what", stage: "What", title: "What the part is", body: "Record the part code, the drawing, and the review layer.", fields: ["sourceItem", "drawing", "layer"] },
  { id: "when", stage: "When", title: "When it must be reviewed again", body: "Record the future policy and lifecycle. Every part needs this note before approval.", fields: ["lifecycle"] },
  { id: "where", stage: "Where", title: "Where it sits in the supply", body: "Record where the part sits in the supply, such as the module or the site use.", fields: ["module"] },
  { id: "who", stage: "Who", title: "Who supplies it", body: "Record the named vendor. A placeholder sentence is not a vendor. Do not merge two different written names.", fields: ["supplier"] },
  { id: "how", stage: "How", title: "How to proceed", body: "Choose one of the four actions. A missing fact keeps confidence pending. It does not change the risk band.", fields: ["action", "condition", "evidence", "openFact", "risk", "confidence"] },
  { id: "handoff", stage: "Handoff", title: "Send it to a different role", body: "Send the record to the assigned reviewer. You cannot approve a record you prepared.", fields: [] },
];

const REVIEW_STEPS = [
  { id: "queue", title: "Open a record waiting on your role", body: "Choose a record that is in review and assigned to your role. You can read every record. You can act only on the records assigned to you." },
  { id: "facts", title: "Check the facts for your role", body: "Check the part, the drawing, and the supplier. Do not change those fields." },
  { id: "evidence", title: "Check the evidence", body: "If a fact is missing, confidence stays pending and the risk band stays as recorded. Return the record instead of filling the gap yourself." },
  { id: "note", title: "Record your review note", body: "Add a review note. The note is the review. It is not a new analysis." },
  { id: "decision", title: "Return or approve", body: "Approve only if you did not prepare the record, you are the assigned reviewer, the action is set, and the evidence and lifecycle are recorded. Otherwise return it." },
];

const ADMIN_STEPS = [
  { id: "role", title: "Confirm your role", body: "You grant access for this environment. You do not prepare or approve an analysis." },
  { id: "grant", title: "Grant a working role", body: "Grant Administrator, NSTT, CPI, or Trade to a different person on an allowed domain. A domain match is not a grant. This grant does not apply to production, and it does not replace your own access." },
  { id: "project", title: "Create a project only if a new review set is needed", body: "The current register stays on MDC. A new project starts empty. Do not move existing records by import." },
  { id: "sequence", title: "Read the analysis sequence", body: "The analysis sequence is Why, What, When, Where, Who, then How. NSTT prepares it. CPI reviews parts and suppliers. Trade reviews trade-sensitive conditions. A different person in the reviewer role approves." },
  { id: "result", title: "Read the decision line", body: "Open the brief when you need the decision line. It uses approved records only. This role cannot approve a record." },
];

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function analysisRecord(role, items, selectedCode) {
  const records = Array.isArray(items) ? items : [];
  const selected = records.find((item) => item.code === selectedCode) || null;
  const waiting = records.filter((item) => item.status === "In review" && (item.reviewerRole === role || (role === "trade" && item.tradeSensitive)));
  const ownedOpen = records.filter((item) => item.ownerRole === role && (item.status === "Open" || item.status === "Returned"));
  if (selected && (waiting.some((item) => item.code === selected.code) || ownedOpen.some((item) => item.code === selected.code))) return selected;
  if (role === "cpi" || role === "trade") return waiting[0] || ownedOpen[0] || selected;
  if (role === "nstt") return ownedOpen[0] || selected;
  return selected;
}

export function analysisSteps(role, record) {
  if (role === "administrator") return ADMIN_STEPS;
  if (record && record.ownerRole === role && (record.status === "Open" || record.status === "Returned")) return PREPARE_STEPS;
  if (role === "cpi" || role === "trade") return REVIEW_STEPS;
  return PREPARE_STEPS;
}

function fieldControl(name, record) {
  const value = record?.[name] ?? "";
  if (name === "title" || name === "supplier" || name === "sourceItem" || name === "drawing" || name === "module") {
    return `<label class="field">${esc(labelFor(name))} <input name="${name}" value="${esc(value)}" /></label>`;
  }
  if (name === "lifecycle" || name === "condition" || name === "evidence" || name === "openFact") {
    return `<label class="field">${esc(labelFor(name))} <textarea name="${name}">${esc(value)}</textarea></label>`;
  }
  if (name === "action") {
    return `<label class="field">Action <select name="action"><option value="">Not set</option>${ACTIONS.map((item) => `<option value="${esc(item)}" ${item === value ? "selected" : ""}>${esc(item)}</option>`).join("")}</select></label>`;
  }
  if (name === "risk") {
    return `<label class="field">Risk <select name="risk">${RISK.map((item) => `<option value="${esc(item)}" ${item === value ? "selected" : ""}>${esc(item)}</option>`).join("")}</select></label>`;
  }
  if (name === "confidence") {
    return `<label class="field">Confidence <select name="confidence">${CONFIDENCE.map((item) => `<option value="${esc(item)}" ${item === value ? "selected" : ""}>${esc(item)}</option>`).join("")}</select></label>`;
  }
  if (name === "layer") {
    const layers = ["Identification", "Part significance", "Supply-chain resilience", "Governance", "Recommendation"];
    return `<label class="field">Layer <select name="layer">${layers.map((item) => `<option value="${esc(item)}" ${item === value ? "selected" : ""}>${esc(item)}</option>`).join("")}</select></label>`;
  }
  return "";
}

function labelFor(name) {
  return {
    title: "Purpose",
    supplier: "Vendor",
    sourceItem: "Part code",
    drawing: "Drawing",
    module: "Where it is used",
    lifecycle: "Future policy and lifecycle",
    condition: "Condition",
    evidence: "Evidence",
    openFact: "Open fact",
  }[name] || name;
}

function factList(record) {
  if (!record) return "<p>No record is selected.</p>";
  const rows = [
    ["Code", record.code],
    ["Purpose", record.title || "Not recorded"],
    ["Part", record.sourceItem || "Not recorded"],
    ["Drawing", record.drawing || "Not recorded"],
    ["Vendor", record.supplier || "Not recorded"],
    ["Action", record.action || "Not set"],
    ["Confidence", record.confidence],
    ["Risk", record.risk],
    ["Lifecycle", record.lifecycle || "Not recorded"],
    ["Evidence", record.evidence || "Not recorded"],
    ["Status", record.status],
    ["Reviewer", ROLE_LABEL[record.reviewerRole] || record.reviewerRole],
  ];
  return rows.map(([label, value]) => `<p><strong>${esc(label)}.</strong> ${esc(value)}</p>`).join("");
}

export function drawWizard({ role = "", step = 0, record = null, waiting = [], environment = "development", canGrant = false, grants = [], actorEmail = "" }) {
  const steps = analysisSteps(role, record);
  const index = Math.min(Math.max(0, step), Math.max(0, steps.length - 1));
  const current = steps[index];
  const access = recordAccess({ role }, record);
  const reviewRole = role === "cpi" || role === "trade";
  const mode = role === "administrator"
    ? "administer"
    : access.mode === "prepare" || (role === "nstt" && !record)
      ? "prepare"
      : access.mode === "review" || reviewRole
        ? "review"
        : "locked";
  const stepButtons = steps.map((item, itemIndex) => `<button type="button" class="${itemIndex === index ? "on" : ""}" data-wizard-step="${itemIndex}">${itemIndex + 1}. ${esc(item.title)}</button>`).join("");
  let panel = `<p class="kicker">Step ${index + 1} of ${steps.length}${current.stage ? ` · ${esc(current.stage)}` : ""}</p><h2>${esc(current.title)}</h2><p>${esc(current.body)}</p>`;
  if (mode === "prepare") {
    if (reviewRole && !waiting.length) panel += `<p class="quiet">No record is waiting on ${esc(ROLE_LABEL[role] || role)} for review.</p>`;
    if (!record) {
      panel += `<p>Start one analysis in the selected project. It stays Open until you send it to a different role.</p><div class="row-actions"><button type="button" class="primary" data-wizard="start">Start this analysis</button></div>`;
    } else if (current.id === "handoff") {
      panel += `${factList(record)}<p>Assigned reviewer: ${esc(ROLE_LABEL[record.reviewerRole] || record.reviewerRole)}. ${record.tradeSensitive ? "This record is trade sensitive, so Trade must add a note before approval." : "Trade adds a note only when the record is trade sensitive."}</p><div class="row-actions"><button type="button" class="primary" data-wizard="send">Send to review</button></div>`;
    } else {
      panel += `<form class="form" id="wizard-form"><div class="grid-2">${current.fields.map((field) => fieldControl(field, record)).join("")}</div><div class="row-actions"><button type="submit" class="primary">Save this step</button></div></form>`;
    }
  } else if (mode === "review") {
    const choices = waiting.slice(0, 12).map((item) => `<button type="button" class="item code-link" data-code="${esc(item.code)}" data-open="analysis">${esc(item.code)} ${esc(item.title || "Untitled")}</button>`).join("");
    panel += choices ? `<div class="pills">${choices}</div>` : `<p>No record is waiting on ${esc(ROLE_LABEL[role] || role)} in this project.</p>`;
    panel += factList(record);
    if (current.id === "note" && access.canNote) {
      panel += `<form class="form" id="wizard-form"><label class="field">Review note <textarea name="update"></textarea></label><div class="row-actions"><button type="submit" class="primary">Save note</button></div></form>`;
    }
    if (current.id === "decision") {
      const block = record ? approvalBlock({ role, email: actorEmail }, record) : "Select a record before approval.";
      panel += `<p class="locked-note">${esc(block || access.message)}</p><div class="row-actions">${access.canReturn ? `<button type="button" data-wizard="return">Return</button>` : ""}${access.canApprove && !block ? `<button type="button" class="primary" data-wizard="approve">Approve</button>` : ""}</div>`;
    }
    if (access.mode !== "review") panel += `<p class="locked-note">${esc(access.message || roleSummary(role))}</p>`;
  } else {
    if (current.id === "grant") {
      panel += canGrant
        ? `<form class="form" id="grant-form"><div class="grid-2"><label class="field">Email <input name="email" type="email" required /></label><label class="field">Role <select name="role"><option value="administrator">Administrator</option><option value="nstt">NSTT</option><option value="cpi">CPI</option><option value="trade">Trade</option></select></label></div><p class="quiet">This grant is saved for ${esc(environment)} only.</p><div class="row-actions"><button type="submit" class="primary">Grant role</button></div></form>`
        : `<p>Only a designated administrator can grant a role for this environment.</p>`;
      if (grants.length) {
        panel += `<ul class="grant-list">${grants.slice(0, 12).map((grant) => `<li>${esc(grant.email)} · ${esc(ROLE_LABEL[grant.role] || grant.role)}${grant.revokedAt ? " · revoked" : ""}</li>`).join("")}</ul>`;
      }
    }
    if (current.id === "project") {
      panel += `<div class="row-actions"><button type="button" data-open="projects">Open projects</button></div>`;
    }
    if (current.id === "sequence") {
      panel += `<div class="pills">${STAGES.map((stage) => `<span class="pill">${esc(stage)}</span>`).join("")}</div>`;
    }
    if (current.id === "result") {
      panel += `<div class="row-actions"><button type="button" data-open="brief">Open brief</button><button type="button" data-open="present">Open presentation</button></div>`;
    }
  }
  if (mode === "locked") {
    panel += `<p class="locked-note">${esc(access.message || roleSummary(role))}</p>`;
    if (role === "nstt") panel += `<div class="row-actions"><button type="button" class="primary" data-wizard="start">Start a new analysis</button></div>`;
  }
  if (mode === "prepare" && role === "nstt" && record && index === 0) {
    panel += `<div class="row-actions"><button type="button" data-wizard="start">Start a new analysis</button></div>`;
  }
  panel += `<div class="row-actions"><button type="button" data-wizard="prev">Previous</button><button type="button" data-wizard="next">Next</button></div>`;
  return `<div class="wizard"><div class="wizard-steps" aria-label="Analysis steps">${stepButtons}</div><article class="wizard-panel"><p class="locked-note">${esc(roleSummary(role))}</p>${panel}</article></div>`;
}
