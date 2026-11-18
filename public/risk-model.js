// The source provides qualitative rules, not numerical weights.
// Proposed floors below remain draft until an administrator approves a policy.
export const RISK_ENGINE = "qualitative-rules-1";
export const RISK_BANDS = ["Low", "Moderate", "High", "Critical"];
export const RISK_CONFIDENCE = ["High", "Medium", "Low", "Pending"];
export const RISK_ACTIONS = ["Proceed", "Proceed with protections", "Proceed with active mitigation", "Do not proceed absent resolution"];
export const RISK_SOURCE = "SoftBank-Assessment-Triggers-Risk-Rules-DRAFT.docx";
export const RISK_RULES = [
  { id: "RR-01", title: "Legal / Regulatory Prohibition", logic: "Applicable prohibition or material restriction → Critical / Escalate", floor: "Critical", group: "Legal and ownership", fields: ["prohibition"], action: "Confirm the applicable authority, transaction scope, and any authorization with Trade or counsel. Do not proceed absent resolution." },
  { id: "RR-02", title: "Restricted / High-Risk Entity", logic: "Material government/restricted-party designation → High / Enhanced Diligence", floor: "High", group: "Legal and ownership", fields: ["designation"], action: "Complete enhanced diligence and establish the designation's effect on the actual transaction." },
  { id: "RR-03", title: "Ownership / Control", logic: "Material ownership or government nexus → Increase Risk; unknown ownership → Reduce Confidence / RFI", floor: "Moderate", group: "Legal and ownership", fields: ["ownershipKnown", "ownershipNexus"], action: "Verify ownership and control. Request missing beneficial-ownership information." },
  { id: "RR-04", title: "Criticality / Redundancy", logic: "Critical operational impact + inadequate redundancy → High Criticality", floor: "High", group: "Operations and supply", fields: ["critical", "redundancy"], action: "Document operational consequences and a tested redundancy or recovery plan." },
  { id: "RR-05", title: "Source Concentration", logic: "Sole/single source + no qualified alternate → Increase Risk, particularly for critical parts", floor: "Moderate", group: "Operations and supply", fields: ["singleSource", "qualifiedAlternate"], action: "Qualify an independent alternate or document an owned continuity plan." },
  { id: "RR-06", title: "Lead Time / Recovery", logic: "Replacement or switching time exceeds operational requirement → Increase Risk", floor: "Moderate", group: "Operations and supply", fields: ["switchDays", "recoveryDays"], action: "Bring replacement or switching time within the documented operational requirement." },
  { id: "RR-07", title: "Common Dependency", logic: "Alternatives share OEM, factory, geography or critical sub-tier → Maintain Concentration Risk", floor: "Moderate", group: "Operations and supply", fields: ["commonDependency"], action: "Test alternate independence across OEM, factory, geography, and critical sub-tiers." },
  { id: "RR-08", title: "Cyber / Remote Access", logic: "Critical connected equipment + inadequately controlled remote access → Increase Risk / Mitigate", floor: "High", group: "Technology and change", fields: ["critical", "connected", "remoteAccess", "remoteControlled"], action: "Validate remote-access restrictions, monitoring, and the controls that limit operational impact." },
  { id: "RR-09", title: "Supplier Deterioration", logic: "Material financial, capacity, delivery, quality or cyber deterioration → Increase Risk / Re-Assess", floor: "Moderate", group: "Technology and change", fields: ["supplierDeterioration"], action: "Re-assess the affected performance or security factors and update the continuity plan." },
  { id: "RR-10", title: "Material Change", logic: "Change in regulation, ownership, manufacturing, design, deployment or sourcing → Re-Assess affected risk factors", floor: "", group: "Technology and change", fields: ["materialChange"], action: "Log the change, determine materiality, and document a targeted re-assessment and disposition." },
];

export const REASSESSMENT_TRIGGERS = [
  { id: "T-01", title: "Regulatory / Government Action", event: "A new or changed executive order, law, regulation, agency action, tariff, or trade measure materially affects the vendor, part, technology, or country of origin.", rules: ["RR-01", "RR-02", "RR-10"] },
  { id: "T-02", title: "Restricted / High-Risk Designation", event: "A vendor, parent, affiliate, OEM, or critical sub-tier is added to a sanctions, export-control, FCC Covered List, forced-labor, debarment, or comparable restriction.", rules: ["RR-01", "RR-02", "RR-03"] },
  { id: "T-03", title: "Ownership / Control Change", event: "An acquisition, restructuring, new parent or joint venture, government nexus, or newly identified beneficial ownership materially changes the vendor profile.", rules: ["RR-03", "RR-07"] },
  { id: "T-04", title: "Country / Manufacturing Change", event: "Production, final assembly, critical inputs, software or firmware development, or key sourcing moves to a different country or facility.", rules: ["RR-01", "RR-03", "RR-05", "RR-07"] },
  { id: "T-05", title: "Product / Technology Change", event: "Material changes occur to OEM, specifications, firmware, software, remote access, network connectivity, or control functionality.", rules: ["RR-04", "RR-07", "RR-08"] },
  { id: "T-06", title: "Critical Sub-Tier Change", event: "A material Tier 2 or Tier 3 supplier changes, is newly identified, or introduces new geographic, ownership, or concentration exposure.", rules: ["RR-02", "RR-03", "RR-05", "RR-07"] },
  { id: "T-07", title: "Material Adverse Vendor Event", event: "A significant enforcement, financial-distress, cyber, recall, quality, counterfeit, corruption, or certification event occurs.", rules: ["RR-02", "RR-08", "RR-09"] },
  { id: "T-08", title: "Supply / Performance Deterioration", event: "Missed milestones, longer lead times, capacity constraints, or recurring quality issues threaten supply or deployment.", rules: ["RR-05", "RR-06", "RR-09"] },
  { id: "T-09", title: "Alternate-Source Deterioration", event: "An approved alternate becomes unavailable, fails qualification, develops comparable exposure, or is no longer operationally viable.", rules: ["RR-05", "RR-06", "RR-07"] },
  { id: "T-10", title: "Deployment / Criticality Change", event: "The part moves into a more critical application, becomes a single point of failure, enters grid or bulk-power-system scope, or materially increases the consequence of failure.", rules: ["RR-01", "RR-04", "RR-06", "RR-08"] },
];

export const RISK_FACTS = {
  prohibition: { label: "Applicable prohibition or material restriction", type: "legal" },
  designation: { label: "Material government or restricted-party designation", type: "legal" },
  ownershipKnown: { label: "Ownership and control are established", type: "choice" },
  ownershipNexus: { label: "Material ownership or government nexus", type: "choice" },
  critical: { label: "Critical operational impact", type: "choice" },
  redundancy: { label: "Adequate operational redundancy", type: "choice" },
  singleSource: { label: "Sole or single source", type: "choice" },
  qualifiedAlternate: { label: "A qualified alternate is available", type: "choice" },
  switchDays: { label: "Replacement or switching time (days)", type: "number" },
  recoveryDays: { label: "Required recovery or switching time (days)", type: "number" },
  commonDependency: { label: "Alternates share an OEM, factory, geography, or critical sub-tier", type: "choice" },
  connected: { label: "Equipment is connected", type: "choice" },
  remoteAccess: { label: "Remote access exists", type: "choice" },
  remoteControlled: { label: "Remote access is adequately controlled", type: "choice" },
  supplierDeterioration: { label: "Material supplier deterioration", type: "choice" },
  materialChange: { label: "A material regulatory, supplier, technology, or deployment change occurred", type: "choice" },
};

export const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
export const rankRisk = (value) => RISK_BANDS.indexOf(value === "Medium" ? "Moderate" : value);
export const maxRisk = (values) => values.reduce((result, value) => rankRisk(value) > rankRisk(result) ? value : result, "Not assessed");
export const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function safeSource(value) {
  try { const url = new URL(text(value, 1500)); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}
const number = (value) => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 36500 ? Number(value) : null;
const choices = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const uniqueRules = (values) => [...new Set((Array.isArray(values) ? values : []).filter(id => RISK_RULES.some(rule => rule.id === id)))];

export function draftRiskPolicy(input = {}) {
  const floors = {};
  for (const rule of RISK_RULES) {
    const allowed = rule.id === "RR-01" ? ["Critical"] : ["RR-02", "RR-04"].includes(rule.id) ? ["High", "Critical"] : rule.id === "RR-10" ? [""] : ["Moderate", "High", "Critical"];
    floors[rule.id] = choices(input.floors?.[rule.id], allowed, rule.floor);
  }
  return {
    engine: RISK_ENGINE, source: RISK_SOURCE, floors,
    defaultRecoveryDays: number(input.defaultRecoveryDays),
    appetiteReference: text(input.appetiteReference),
    criticalOperations: text(input.criticalOperations),
    concentrationTolerance: text(input.concentrationTolerance),
    mitigationExpectations: text(input.mitigationExpectations),
    escalationThreshold: text(input.escalationThreshold),
    lifecycle: text(input.lifecycle),
  };
}

export function policyApprovalBlock(policy) {
  const value = draftRiskPolicy(policy);
  for (const [key, label] of Object.entries({
    appetiteReference: "risk-appetite approval reference", criticalOperations: "critical operations",
    concentrationTolerance: "concentration tolerance", mitigationExpectations: "mitigation expectations",
    escalationThreshold: "escalation and no-go thresholds", lifecycle: "future policy and lifecycle",
  })) if (!value[key]) return `Record the ${label} before approving this policy.`;
  return "";
}

export function normalizeRiskAssessment(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const facts = {};
  for (const [key, field] of Object.entries(RISK_FACTS)) {
    facts[key] = field.type === "number" ? number(input.facts?.[key]) : choices(input.facts?.[key], field.type === "legal" ? ["unknown", "no", "potential", "confirmed"] : ["unknown", "yes", "no"], "unknown");
  }
  const evidence = {};
  const mitigations = {};
  for (const rule of RISK_RULES) {
    const item = input.evidence?.[rule.id] || {};
    evidence[rule.id] = { note: text(item.note), url: safeSource(item.url), checkedOn: validDate(item.checkedOn) ? item.checkedOn : "" };
    const control = input.mitigations?.[rule.id] || {};
    mitigations[rule.id] = { control: text(control.control), evidence: text(control.evidence), targetRisk: choices(control.targetRisk, RISK_BANDS, "") };
  }
  const validation = input.validation && typeof input.validation === "object" ? {
    finalRisk: choices(input.validation.finalRisk, RISK_BANDS, ""),
    confidence: choices(input.validation.confidence, RISK_CONFIDENCE, "Pending"),
    action: choices(input.validation.action, RISK_ACTIONS, ""),
    rationale: text(input.validation.rationale),
    validatedMitigations: uniqueRules(input.validation.validatedMitigations),
    by: text(input.validation.by, 120), role: text(input.validation.role, 24),
    at: text(input.validation.at, 40), recordVersion: Number(input.validation.recordVersion) || 0,
    inputDigest: text(input.validation.inputDigest, 128),
  } : null;
  return {
    facts, evidence, mitigations, validation,
    evidenceConfidence: choices(input.evidenceConfidence, RISK_CONFIDENCE, "Pending"),
    scope: text(input.scope), followUp: text(input.followUp),
    reassessedRules: uniqueRules(input.reassessedRules),
    triggerIds: [...new Set((Array.isArray(input.triggerIds) ? input.triggerIds : []).map(id => text(id, 100)).filter(Boolean))].slice(0, 300),
    policyVersion: text(input.policyVersion, 100),
    policy: input.policy ? { ...draftRiskPolicy(input.policy), id: text(input.policy.id, 100), status: input.policy.status === "Approved" ? "Approved" : "Draft" } : null,
  };
}

export function assessmentInputs(input) {
  const item = normalizeRiskAssessment(input);
  if (!item) return null;
  const { validation, ...prepared } = item;
  return prepared;
}

function ruleState(rule, facts, policy) {
  const f = facts;
  switch (rule.id) {
    case "RR-01": return { fired: f.prohibition === "confirmed", pending: ["unknown", "potential"].includes(f.prohibition), used: ["prohibition"] };
    case "RR-02": return { fired: f.designation === "confirmed", pending: ["unknown", "potential"].includes(f.designation), used: ["designation"] };
    case "RR-03": return { fired: f.ownershipNexus === "yes", pending: f.ownershipKnown !== "yes" || f.ownershipNexus === "unknown", used: ["ownershipKnown", "ownershipNexus"] };
    case "RR-04": return { fired: f.critical === "yes" && f.redundancy === "no", used: f.critical === "no" ? ["critical"] : ["critical", "redundancy"] };
    case "RR-05": return { fired: f.singleSource === "yes" && f.qualifiedAlternate === "no", used: f.singleSource === "no" ? ["singleSource"] : ["singleSource", "qualifiedAlternate"] };
    case "RR-06": {
      const requirement = f.recoveryDays ?? policy.defaultRecoveryDays;
      return { fired: f.switchDays != null && requirement != null && f.switchDays > requirement, pending: f.switchDays == null || requirement == null, used: ["switchDays", "recoveryDays"], detail: f.switchDays != null && requirement != null ? `${f.switchDays} days compared with a ${requirement}-day requirement.` : "Record replacement or switching time and the operational requirement." };
    }
    case "RR-07": return { fired: f.commonDependency === "yes", used: ["commonDependency"] };
    case "RR-08": {
      const used = ["critical"];
      if (f.critical !== "no") used.push("connected");
      if (f.critical !== "no" && f.connected !== "no") used.push("remoteAccess");
      if (f.critical !== "no" && f.connected !== "no" && f.remoteAccess !== "no") used.push("remoteControlled");
      return { fired: f.critical === "yes" && f.connected === "yes" && f.remoteAccess === "yes" && f.remoteControlled === "no", used };
    }
    case "RR-09": return { fired: f.supplierDeterioration === "yes", used: ["supplierDeterioration"] };
    case "RR-10": return { fired: f.materialChange === "yes", used: ["materialChange"] };
    default: return { fired: false, pending: true, used: [] };
  }
}

export function evaluateRisk(input, policyInput, options = {}) {
  const item = normalizeRiskAssessment(input) || normalizeRiskAssessment({});
  const stored = policyInput || item.policy || {};
  const policy = { ...draftRiskPolicy(stored), id: stored.id || "draft-preview", status: stored.status || "Draft" };
  const rfis = [];
  const drivers = [];
  const floors = [];
  const residualFloors = [];
  const validated = options.validatedMitigations ?? item.validation?.validatedMitigations ?? [];
  let answered = 0;
  for (const rule of RISK_RULES) {
    const state = ruleState(rule, item.facts, policy);
    const unknown = state.used.filter(key => item.facts[key] === "unknown" || (item.facts[key] == null && !(key === "recoveryDays" && policy.defaultRecoveryDays != null)));
    const source = item.evidence[rule.id];
    const sourceMissing = !source.note || !source.checkedOn || source.checkedOn > new Date().toISOString().slice(0, 10);
    const pending = Boolean(state.pending || unknown.length || sourceMissing);
    if (pending) rfis.push({
      id: rule.id,
      text: unknown.length ? `Confirm ${unknown.map(key => RISK_FACTS[key].label.toLowerCase()).join("; ")}.`
        : sourceMissing ? `Record dated evidence for ${rule.title.toLowerCase()}.`
        : rule.id === "RR-03" ? "Obtain the missing ownership and control information."
        : `Resolve the pending ${rule.title.toLowerCase()} determination.`,
    });
    else answered += 1;
    const floor = state.fired ? policy.floors[rule.id] : "";
    const mitigation = item.mitigations[rule.id];
    const validatedControl = validated.includes(rule.id) && mitigation.control && mitigation.evidence && mitigation.targetRisk && rule.id !== "RR-01";
    const residualFloor = validatedControl && rankRisk(mitigation.targetRisk) < rankRisk(floor) ? mitigation.targetRisk : floor;
    if (floor) { floors.push(floor); residualFloors.push(residualFloor); }
    drivers.push({
      id: rule.id, title: rule.title, fired: state.fired, pending, floor, residualFloor,
      detail: state.detail || (state.fired ? rule.logic : pending ? "Further information is required." : "The recorded facts do not trigger this rule."),
      requiredAction: state.fired ? rule.action : "", mitigationValidated: Boolean(validatedControl),
    });
  }
  const inherentRisk = floors.length ? maxRisk(floors) : rfis.length ? "Not assessed" : "Low";
  const residualRisk = residualFloors.length ? maxRisk(residualFloors) : inherentRisk;
  return {
    engine: RISK_ENGINE, policyVersion: policy.id, provisional: policy.status !== "Approved",
    inherentRisk, residualRisk, confidence: rfis.length ? "Pending" : item.evidenceConfidence,
    hardStop: item.facts.prohibition === "confirmed",
    legalPending: ["unknown", "potential"].includes(item.facts.prohibition) || ["unknown", "potential"].includes(item.facts.designation),
    drivers, rfis, requiredActions: drivers.filter(item => item.fired).map(item => ({ id: item.id, text: item.requiredAction })),
    coverage: { answered, total: RISK_RULES.length },
  };
}

export function riskValidationBlock(input, validation, { practice = false } = {}) {
  const item = normalizeRiskAssessment(input);
  if (!item) return "Prepare a risk assessment first.";
  const v = normalizeRiskAssessment({ ...item, validation }).validation;
  const result = evaluateRisk(item, item.policy, { validatedMitigations: v?.validatedMitigations || [] });
  if (!practice && result.provisional) return "An administrator must approve the risk-appetite policy before a real assessment is validated.";
  if (!v?.finalRisk || !v.action || !v.rationale) return "Record the final risk, action, and validation rationale.";
  if (!item.scope) return "Record the assessment scope and operating context.";
  if (result.legalPending) return "Resolve the pending legal applicability and designation checks before approval.";
  if (result.hardStop && (v.finalRisk !== "Critical" || v.action !== RISK_ACTIONS[3])) return "A confirmed applicable prohibition requires Critical risk and Do not proceed absent resolution. It cannot be overridden.";
  const level = { Pending: 0, Low: 1, Medium: 2, High: 3 };
  if (level[v.confidence] > level[result.confidence]) return "Final confidence cannot exceed the support in the recorded evidence.";
  if (result.rfis.length && !item.followUp) return "Assign follow-up for the missing information. Confidence must remain Pending.";
  for (const id of v.validatedMitigations) {
    const mitigation = item.mitigations[id];
    if (id === "RR-01") return "A mitigation cannot remove a confirmed applicable prohibition.";
    if (!mitigation?.control || !mitigation.evidence || !mitigation.targetRisk) return `Complete the control, evidence, and residual risk for ${id} before validating it.`;
  }
  return "";
}

export function riskDecisionBlock(record) {
  if (record?.reassessment?.materialCount) return "A material change still needs re-assessment and disposition.";
  if (record?.reassessment?.policyChanged) return "The applicable risk policy changed. Re-validate the affected assessment.";
  const assessment = normalizeRiskAssessment(record?.riskAssessment);
  if (assessment && !assessment.validation?.at) return "The risk assessment still needs team validation.";
  if (assessment?.validation && (record.risk !== assessment.validation.finalRisk || record.action !== assessment.validation.action || record.confidence !== assessment.validation.confidence)) return "The recorded decision does not match the validated risk assessment.";
  return "";
}

export function decisionEligible(record) {
  return record?.status === "Approved" && !riskDecisionBlock(record);
}

export function riskSummary(record) {
  const item = normalizeRiskAssessment(record?.riskAssessment);
  const result = item ? evaluateRisk(item) : null;
  return {
    policyVersion: item?.policyVersion || "",
    inherentRisk: result?.inherentRisk || "",
    residualRisk: result?.residualRisk || "",
    finalRisk: item?.validation?.finalRisk || "",
    validation: item?.validation?.at ? "Team validated" : item ? "Pending validation" : "Not started",
    drivers: result?.drivers.filter(row => row.fired).map(row => `${row.id}: ${row.title}`).join("; ") || "",
    followUp: result?.rfis.map(row => `${row.id}: ${row.text}`).join("; ") || "",
    reassessment: riskDecisionBlock(record) || (record?.reassessment?.pendingCount ? "Materiality review pending" : "No open material change"),
  };
}

export function normalizeTrigger(input = {}) {
  const type = REASSESSMENT_TRIGGERS.find(row => row.id === input.type) || REASSESSMENT_TRIGGERS[0];
  return {
    id: text(input.id, 100), projectId: text(input.projectId, 12), code: text(input.code, 20),
    type: type.id, summary: text(input.summary), sourceNote: text(input.sourceNote), sourceUrl: safeSource(input.sourceUrl),
    observedOn: validDate(input.observedOn) ? input.observedOn : "", dueOn: validDate(input.dueOn) ? input.dueOn : "",
    rules: uniqueRules(input.rules?.length ? input.rules : type.rules),
    materiality: choices(input.materiality, ["Pending", "No material change", "Material change"], "Pending"),
    rationale: text(input.rationale), reviewedBy: text(input.reviewedBy, 120), reviewedRole: text(input.reviewedRole, 24),
    reviewedAt: text(input.reviewedAt, 40), recordVersion: Number(input.recordVersion) || 0,
    disposition: choices(input.disposition, ["", "Confirmed recommendation", "Revised recommendation", "Escalated"], ""),
    dispositionNote: text(input.dispositionNote), closedAt: text(input.closedAt, 40),
    reportedBy: text(input.reportedBy, 120), reportedRole: text(input.reportedRole, 24), reportedAt: text(input.reportedAt, 40),
    batchId: text(input.batchId, 50), scopeKind: input.scopeKind === "vendor" ? "vendor" : "record", scopeLabel: text(input.scopeLabel, 120),
  };
}

export function triggerStage(trigger) {
  const item = normalizeTrigger(trigger);
  return item.closedAt ? "Closed" : item.materiality === "Pending" ? "Determine materiality" : "Targeted re-assessment";
}
