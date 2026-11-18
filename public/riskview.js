import {
  RISK_ACTIONS, RISK_BANDS, RISK_CONFIDENCE, RISK_FACTS, RISK_RULES, REASSESSMENT_TRIGGERS,
  draftRiskPolicy, evaluateRisk, normalizeRiskAssessment, riskDecisionBlock, riskSummary, triggerStage,
} from "./risk-model.js";
import { recordAccess } from "./privileges.js";
import { vendorKey } from "./boards.js";

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const options = (values, current, empty = "") => `${empty ? `<option value="">${esc(empty)}</option>` : ""}${values.map(value => {
  const [key, label] = Array.isArray(value) ? value : [value, value];
  return `<option value="${esc(key)}" ${key === current ? "selected" : ""}>${esc(label)}</option>`;
}).join("")}`;
const textarea = (name, label, value, help = "", required = false) => `<label class="field">${esc(label)}<textarea name="${esc(name)}" rows="2" maxlength="4000" ${required ? "required" : ""}>${esc(value)}</textarea>${help ? `<span class="field-example">${esc(help)}</span>` : ""}</label>`;
const input = (name, label, value, type = "text", required = false) => `<label class="field">${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${type === "number" ? 'min="0" max="36500" step="1"' : ""} ${required ? "required" : ""} ${type === "date" && name !== "dueOn" ? `max="${new Date().toISOString().slice(0, 10)}"` : ""} /></label>`;
const select = (name, label, values, current, empty = "") => `<label class="field">${esc(label)}<select name="${esc(name)}">${options(values, current, empty)}</select></label>`;
const dateText = (value) => value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";

export function selectedPolicy(assurance, projectId) {
  return assurance?.policy?.payload?.active || { ...draftRiskPolicy(assurance?.policy?.payload?.draft), id: `${projectId}-draft-preview`, status: "Draft" };
}

export function riskRecordPicker(items, current) {
  return `<label class="field risk-picker">Assessment record<select id="risk-record">${options(items.map(item => [item.code, `${item.code} · ${item.title}`]), current?.code, "Choose a record")}</select></label>`;
}

export function riskBanner(record) {
  const summary = riskSummary(record);
  const block = riskDecisionBlock(record);
  if (!record.riskAssessment && !record.reassessment) return `<button type="button" class="ghost" data-open="risk" data-code="${esc(record.code)}">Assess risk</button>`;
  return `<aside class="risk-record-note ${block ? "risk-attention" : ""}">
    <p><strong>${block ? "Decision review required." : "Risk assessment."}</strong> ${esc(block || `${summary.validation}. ${record.reassessment?.pendingCount ? "An event is awaiting materiality review." : "No unresolved material change is recorded."}`)}</p>
    <div class="row-actions"><button type="button" data-open="risk" data-code="${esc(record.code)}">Open risk assessment</button><button type="button" data-open="triggers" data-code="${esc(record.code)}">Review change triggers</button></div>
  </aside>`;
}

export function drawRiskPreview(assessment, policy, record, unsaved = false) {
  const result = evaluateRisk(assessment, policy, unsaved ? { validatedMitigations: [] } : {});
  const final = assessment.validation;
  return `<div class="risk-preview-label"><span>${unsaved ? "Unsaved preview" : "Rule-based assessment"}</span><span class="pill grey">${result.provisional ? "Draft policy" : esc(result.policyVersion)}</span></div>
    <div class="risk-summary-grid" aria-live="polite">
      <div><span>Preliminary / inherent risk</span><strong class="risk-band risk-${result.inherentRisk.toLowerCase().replace(" ", "-")}">${esc(result.inherentRisk)}</strong></div>
      <div><span>Residual risk</span><strong class="risk-band risk-${result.residualRisk.toLowerCase().replace(" ", "-")}">${esc(result.residualRisk)}</strong><small>Only validated controls reduce risk.</small></div>
      <div><span>Evidence confidence</span><strong class="pill grey">${esc(result.confidence)}</strong><small>${result.coverage.answered} of 10 rules have dated supporting evidence.</small></div>
      <div><span>Team final rating</span><strong>${!unsaved && final?.at ? esc(final.finalRisk) : "Not validated"}</strong><small>${!unsaved && final?.at ? `${esc(final.role.toUpperCase())} · ${esc(dateText(final.at))}` : "The assigned reviewer validates this."}</small></div>
    </div>
    ${result.hardStop ? `<p class="risk-stop" role="status">Confirmed applicable prohibition. Critical risk and Do not proceed absent resolution are mandatory until the underlying issue is resolved and re-assessed.</p>` : ""}
    ${result.provisional ? `<p class="risk-policy-note">These qualitative mappings are draft implementation assumptions, not approved client risk appetite. Real assessments require an administrator-approved policy before review and validation.</p>` : ""}
    <div class="risk-output-grid">
      <section><h3>Key risk drivers</h3>${result.drivers.some(row => row.fired) ? `<ul>${result.drivers.filter(row => row.fired).map(row => `<li><strong>${row.id} · ${esc(row.title)}</strong><span>${esc(row.detail)}</span></li>`).join("")}</ul>` : "<p>No supported rule is triggered by the entered facts. Missing information still needs follow-up.</p>"}</section>
      <section><h3>Required actions</h3>${result.requiredActions.length ? `<ul>${result.requiredActions.map(row => `<li><strong>${row.id}</strong><span>${esc(row.text)}</span></li>`).join("")}</ul>` : "<p>Complete the evidence review and confirm the operating context.</p>"}</section>
    </div>
    <details class="risk-rfi"><summary>${result.rfis.length} information request${result.rfis.length === 1 ? "" : "s"} · confidence remains separate</summary><ul>${result.rfis.map(row => `<li><strong>${row.id}.</strong> ${esc(row.text)}</li>`).join("")}</ul></details>`;
}

function factField(key, assessment) {
  const field = RISK_FACTS[key];
  return field.type === "number" ? input(`fact.${key}`, field.label, assessment.facts[key], "number")
    : select(`fact.${key}`, field.label, field.type === "legal"
      ? [["unknown", "Unknown / not checked"], ["no", "Not applicable, with evidence"], ["potential", "Potential match / applicability pending"], ["confirmed", "Confirmed applicable, with evidence"]]
      : [["unknown", "Unknown"], ["yes", "Yes, with evidence"], ["no", "No, with evidence"]], assessment.facts[key]);
}

export function drawRiskAssessment({ items, record, actor, assurance, projectId, loading, error }) {
  const top = `<div class="risk-toolbar">${riskRecordPicker(items, record)}<div class="row-actions"><button type="button" data-risk-refresh>Refresh saved data</button><button type="button" data-open="riskrules">Risk rules</button><button type="button" data-open="triggers">Change triggers</button></div></div>`;
  if (loading || !assurance) return `${top}<section class="pane"><p>${error ? esc(error) : "Loading the selected project's risk policy and change events."}</p></section>`;
  if (!record) return `${top}<section class="pane"><h2>Select a record to assess</h2><p>Choose an existing record, or use Guided analysis to create one. Risk assessments stay linked to a record and its project.</p><button type="button" data-open="analysis">Open guided analysis</button></section>`;
  const policy = record.riskAssessment?.policy || selectedPolicy(assurance, projectId);
  const assessment = normalizeRiskAssessment(record.riskAssessment || { policy, policyVersion: policy.id });
  const result = evaluateRisk(assessment, policy);
  const access = recordAccess(actor, record);
  const preparing = access.mode === "prepare";
  const reviewing = record.status === "In review" && actor.role === record.reviewerRole && actor.email !== record.preparedBy && actor.role !== record.ownerRole;
  const triggers = assurance.triggers.filter(doc => doc.payload.code === record.code && !doc.payload.closedAt);
  const usedFields = new Set();
  const rulePanels = RISK_RULES.map((rule, index) => {
    const driver = result.drivers[index];
    const fields = rule.fields.filter(key => !usedFields.has(key));
    fields.forEach(key => usedFields.add(key));
    const control = assessment.mitigations[rule.id];
    return `<details class="risk-rule" ${index === 0 ? "open" : ""}>
      <summary><span class="risk-rule-id">${rule.id}</span><strong>${esc(rule.title)}</strong><span class="pill ${driver.fired ? "orange" : "grey"}">${driver.fired ? "Triggered" : driver.pending ? "Evidence pending" : "Not triggered"}</span></summary>
      <div class="risk-rule-body"><p class="quiet">${esc(rule.logic)}</p>
        <fieldset ${preparing ? "" : "disabled"}><div class="risk-field-grid">${fields.map(key => factField(key, assessment)).join("")}</div>
          ${rule.id === "RR-08" ? "<p class=\"field-example\">Operational criticality comes from RR-04.</p>" : ""}
          ${textarea(`evidence.${rule.id}.note`, "Evidence and applicability", assessment.evidence[rule.id].note, "State the verified fact, its source, and why it applies to this record.")}
          <div class="risk-field-grid">${input(`evidence.${rule.id}.url`, "Source URL", assessment.evidence[rule.id].url, "url")}${input(`evidence.${rule.id}.checkedOn`, "Checked on", assessment.evidence[rule.id].checkedOn, "date")}</div>
          ${rule.id !== "RR-01" && rule.id !== "RR-10" ? `<details class="risk-control"><summary>Proposed mitigation</summary>
            ${textarea(`mitigation.${rule.id}.control`, "Control and accountable role", control.control)}
            ${textarea(`mitigation.${rule.id}.evidence`, "Control validation evidence", control.evidence)}
            ${select(`mitigation.${rule.id}.targetRisk`, "Proposed residual risk", RISK_BANDS, control.targetRisk, "No proposed reduction")}
          </details>` : ""}
        </fieldset>
      </div></details>`;
  }).join("");
  return `${top}<section class="pane risk-intro"><p class="label">${esc(record.code)} · ${esc(record.title)} · version ${record.version}</p><p>${esc(access.message)}</p>
    ${riskDecisionBlock(record) ? `<p class="risk-attention">${esc(riskDecisionBlock(record))}</p>` : ""}
    <p class="quiet">Use verified client data, external developments, and the approved risk appetite. A logged event does not change a rating or require replacement.</p>
  </section>
  <form id="risk-assessment-form" data-mode="${preparing ? "prepare" : reviewing ? "review" : "locked"}">
    <section class="pane risk-preview" id="risk-preview">${drawRiskPreview(assessment, policy, record)}</section>
    <section class="pane risk-context"><h2>Assessment context</h2>
      <fieldset ${preparing ? "" : "disabled"}>
        ${textarea("scope", "Part, vendor, and operating context", assessment.scope, "Identify the relevant configuration, deployment, location, and boundaries.", true)}
        <div class="risk-field-grid">${select("evidenceConfidence", "Evidence confidence", RISK_CONFIDENCE, assessment.evidenceConfidence)}${select("proposedAction", "Proposed action", RISK_ACTIONS, record.action, "Choose an action")}</div>
        ${textarea("recordEvidence", "Record evidence summary", record.evidence)}
        ${textarea("recordCondition", "Procurement condition or mitigation", record.condition)}
        ${textarea("recordLifecycle", "Future Policy/Lifecycle", record.lifecycle, "State who reviews the record, when, and which changes require reassessment.", true)}
        ${textarea("followUp", "Information requests and next actions", assessment.followUp, "Name the accountable role, missing information, and due date. Do not include personal names.")}
      </fieldset>
    </section>
    <section class="pane"><h2>Ten-rule evidence review</h2><p class="quiet">Expand each relevant rule. Existing evidence remains available during a targeted reassessment.</p>${rulePanels}</section>
    <section class="pane"><h2>Targeted reassessment</h2><fieldset ${preparing ? "" : "disabled"}>
      ${triggers.length ? `<p>Select the events covered by this assessment.</p>${triggers.map(doc => `<label class="risk-check"><input type="checkbox" name="triggerIds" value="${esc(doc.key)}" ${assessment.triggerIds.includes(doc.key) ? "checked" : ""} /><span>${esc(doc.payload.type)} · ${esc(doc.payload.summary)} · ${esc(doc.payload.materiality)}</span></label>`).join("")}` : "<p>No open event is linked to this record.</p>"}
      <p class="quiet">Confirm the factors actually re-assessed. Untouched factors retain their evidence.</p><div class="risk-check-grid">${RISK_RULES.map(rule => `<label class="risk-check"><input type="checkbox" name="reassessedRules" value="${rule.id}" ${assessment.reassessedRules.includes(rule.id) ? "checked" : ""} /><span>${rule.id} · ${esc(rule.title)}</span></label>`).join("")}</div>
    </fieldset></section>
    ${reviewing ? `<section class="pane risk-validation"><h2>Team validation</h2><p>Confirm or override the preliminary result with a clear rationale. A confirmed applicable prohibition cannot be overridden.</p>
      <div class="risk-field-grid">${select("finalRisk", "Final risk rating", RISK_BANDS, assessment.validation?.finalRisk || (RISK_BANDS.includes(result.residualRisk) ? result.residualRisk : ""), "Choose the final risk")}${select("finalConfidence", "Final confidence", RISK_CONFIDENCE, assessment.validation?.confidence || result.confidence)}${select("finalAction", "Final action", RISK_ACTIONS, assessment.validation?.action || record.action, "Choose the final action")}</div>
      ${textarea("validationRationale", "Validation or override rationale", assessment.validation?.rationale, "Explain how the evidence supports the final rating and action.", true)}
      <h3>Validate mitigation effectiveness</h3>${RISK_RULES.filter(rule => assessment.mitigations[rule.id].control && !["RR-01", "RR-10"].includes(rule.id)).map(rule => `<label class="risk-check"><input type="checkbox" name="validatedMitigations" value="${rule.id}" ${assessment.validation?.validatedMitigations.includes(rule.id) ? "checked" : ""} /><span>${rule.id} · ${esc(assessment.mitigations[rule.id].control)}</span></label>`).join("") || "<p>No proposed mitigation is recorded.</p>"}
      <p class="quiet">Save validation first, then approve the record. Source facts remain read-only during review.</p>
    </section>` : ""}
    <div class="risk-actions pane">
      ${preparing ? '<button type="submit" class="primary" value="save">Save assessment</button><button type="button" data-risk-transition="In review">Send to review</button>' : ""}
      ${reviewing ? '<button type="submit" class="primary" value="validate">Validate assessment</button><button type="button" data-risk-transition="Approved">Approve record</button>' : ""}
      ${access.canReturn ? '<button type="button" data-risk-transition="Returned">Return for reassessment</button>' : ""}
      <button type="button" data-open="queue" data-code="${esc(record.code)}">Open record</button>
    </div>
  </form>`;
}

export function readRiskForm(form, record) {
  const data = new FormData(form);
  const assessment = normalizeRiskAssessment(record.riskAssessment || {});
  const next = { ...record, riskAssessment: assessment };
  if (form.dataset.mode === "prepare") {
    assessment.scope = String(data.get("scope") || "");
    assessment.followUp = String(data.get("followUp") || "");
    assessment.evidenceConfidence = data.get("evidenceConfidence") || "Pending";
    assessment.triggerIds = data.getAll("triggerIds");
    assessment.reassessedRules = data.getAll("reassessedRules");
    for (const key of Object.keys(RISK_FACTS)) if (data.has(`fact.${key}`)) assessment.facts[key] = data.get(`fact.${key}`);
    for (const rule of RISK_RULES) {
      for (const key of ["note", "url", "checkedOn"]) assessment.evidence[rule.id][key] = data.get(`evidence.${rule.id}.${key}`) || "";
      for (const key of ["control", "evidence", "targetRisk"]) if (data.has(`mitigation.${rule.id}.${key}`)) assessment.mitigations[rule.id][key] = data.get(`mitigation.${rule.id}.${key}`);
    }
    next.action = data.get("proposedAction") || "";
    next.evidence = data.get("recordEvidence") || "";
    next.condition = data.get("recordCondition") || "";
    next.lifecycle = data.get("recordLifecycle") || "";
    next.confidence = evaluateRisk(assessment).confidence;
  } else if (form.dataset.mode === "review") {
    assessment.validation = {
      ...(assessment.validation || {}),
      finalRisk: data.get("finalRisk"), confidence: data.get("finalConfidence"),
      action: data.get("finalAction"), rationale: data.get("validationRationale"),
      validatedMitigations: data.getAll("validatedMitigations"),
    };
  }
  return next;
}

export function affectedTriggerRecords(form, items, selected) {
  const data = new FormData(form);
  return data.get("scopeKind") === "vendor"
    ? items.filter(item => item.supplier && vendorKey(item.supplier) === vendorKey(data.get("scopeLabel")))
    : items.filter(item => item.code === (data.get("recordCode") || selected?.code));
}

export function drawTriggerScope(items) {
  return `<p><strong>${items.length} affected record${items.length === 1 ? "" : "s"} in this project.</strong> ${esc(items.map(item => item.code).join(", ") || "Choose a record or vendor.")}</p>`;
}

export function drawTriggers({ items, record, actor, assurance, loading, error }) {
  if (loading || !assurance) return `<section class="pane"><p>${error ? esc(error) : "Loading change events."}</p><button type="button" data-risk-refresh>Retry</button></section>`;
  const vendors = [...new Set(items.map(item => item.supplier).filter(Boolean))].sort();
  const canLog = ["nstt", "cpi", "trade"].includes(actor.role);
  const events = [...assurance.triggers].sort((a, b) => Number(Boolean(a.payload.closedAt)) - Number(Boolean(b.payload.closedAt)) || b.savedAt.localeCompare(a.savedAt));
  const pending = events.filter(doc => !doc.payload.closedAt && doc.payload.materiality === "Pending").length;
  const material = events.filter(doc => !doc.payload.closedAt && doc.payload.materiality === "Material change").length;
  return `<section class="pane risk-intro"><div class="risk-toolbar"><div><h2>Keep assessments current</h2><p>${pending} awaiting materiality review · ${material} material events open · ${events.length} event-record links</p></div><div class="row-actions"><button type="button" data-risk-refresh>Refresh saved data</button><button type="button" data-risk-export="triggers">Export change log</button></div></div>
    <ol class="risk-process">${["Identify change", "Determine materiality", "Re-assess affected factors", "Confirm or revise recommendation", "Document disposition"].map((step, index) => `<li><span>${index + 1}</span>${step}</li>`).join("")}</ol>
    <p class="quiet">Logging changes no rating or recommendation. A material event holds the affected record out of the current decision line until reassessment and disposition are complete.</p>
  </section>
  <details class="pane risk-log" ${events.length ? "" : "open"}><summary><strong>Log a new change</strong></summary>
    ${canLog ? `<form id="trigger-log-form" class="form"><div class="risk-field-grid">
      ${select("type", "Event category", REASSESSMENT_TRIGGERS.map(item => [item.id, `${item.id} · ${item.title}`]), "T-01")}
      ${select("scopeKind", "Affected scope", [["record", "One record"], ["vendor", "Vendor records in this project"]], "record")}
      ${select("recordCode", "Affected record", items.map(item => [item.code, `${item.code} · ${item.title}`]), record?.code, "Choose a record")}
      ${select("scopeLabel", "Affected vendor", vendors, record?.supplier, "Choose a vendor")}
    </div><p id="trigger-type-help" class="quiet">${esc(REASSESSMENT_TRIGGERS[0].event)}</p>
      <div id="trigger-scope-preview" class="risk-scope">${drawTriggerScope(record ? [record] : [])}</div>
      ${textarea("summary", "What changed", "", "Describe the event, affected configuration, and reason for review.", true)}
      ${textarea("sourceNote", "Supporting evidence", "", "Record the evidence. A source match alone is not a legal conclusion.", true)}
      <div class="risk-field-grid">${input("sourceUrl", "Source URL", "", "url")}${input("observedOn", "Observed on", new Date().toISOString().slice(0, 10), "date", true)}<label class="field">Review due date<input type="date" name="dueOn" /></label></div>
      <button type="submit" class="primary">Log event</button>
    </form>` : "<p>The administrator role can read events and configure policy. Use an expressly granted working role, or the isolated practice project, to log an event.</p>"}
  </details>
  <section class="risk-events"><h2>Change register</h2>${events.length ? events.map(doc => {
    const event = doc.payload;
    const target = items.find(item => item.code === event.code);
    const canReview = target && actor.role === target.reviewerRole && actor.email !== target.preparedBy && actor.role !== target.ownerRole && !event.closedAt;
    return `<details class="pane risk-event"><summary><span class="risk-rule-id">${esc(event.code)}</span><strong>${esc(event.summary)}</strong><span class="pill ${event.materiality === "Material change" && !event.closedAt ? "orange" : "grey"}">${esc(triggerStage(event))}</span></summary>
      <div class="risk-rule-body"><p class="quiet">${esc(event.type)} · observed ${esc(event.observedOn)} · ${event.dueOn ? `due ${esc(event.dueOn)}` : "No review due date"} · version ${doc.version}</p>
        <p>${esc(event.sourceNote)}</p>${event.sourceUrl ? `<a href="${esc(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open event evidence</a>` : ""}
        <p><strong>Materiality:</strong> ${esc(event.materiality)}. ${esc(event.rationale)}</p><p><strong>Affected rules:</strong> ${esc(event.rules.join(", "))}</p>
        ${event.reviewedAt ? `<p class="quiet">${esc(event.reviewedRole.toUpperCase())} reviewed on ${esc(dateText(event.reviewedAt))}.</p>` : ""}
        ${event.disposition ? `<p><strong>Disposition:</strong> ${esc(event.disposition)}. ${esc(event.dispositionNote)}</p>` : ""}
        ${canReview ? `<form class="trigger-review-form" data-key="${esc(doc.key)}" data-version="${doc.version}">
          ${select("materiality", "Materiality determination", ["Pending", "No material change", "Material change"], event.materiality)}
          ${textarea("rationale", "Materiality rationale", event.rationale, "Explain which facts or conclusions are affected.", true)}
          <div class="risk-check-grid">${RISK_RULES.map(rule => `<label class="risk-check"><input name="rules" type="checkbox" value="${rule.id}" ${event.rules.includes(rule.id) ? "checked" : ""} /><span>${rule.id} · ${esc(rule.title)}</span></label>`).join("")}</div>
          <button type="submit" value="materiality">Save materiality review</button>
          ${event.materiality === "Material change" ? `<hr />${select("disposition", "Result of reassessment", ["Confirmed recommendation", "Revised recommendation"], event.disposition === "Revised recommendation" ? event.disposition : "Confirmed recommendation")}
            ${textarea("dispositionNote", "Disposition and next action", event.dispositionNote)}
            <div class="row-actions"><button type="submit" value="resolve">Complete disposition</button><button type="submit" value="escalate">Escalate for resolution</button></div><p class="field-example">Completion requires a new approved assessment covering this event and its affected rules. Escalation keeps the material event open.</p>` : ""}
        </form>` : `<p class="quiet">${event.closedAt ? "This event is closed. A later change needs a new event." : "The assigned different-person reviewer determines materiality and records disposition."}</p>`}
        <div class="row-actions"><button type="button" data-open="risk" data-code="${esc(event.code)}">Open affected assessment</button><button type="button" data-risk-history="trigger" data-key="${esc(doc.key)}">Event history</button></div>
      </div></details>`;
  }).join("") : '<div class="pane"><p>No event has been logged for this project. Nothing is being monitored automatically.</p></div>'}</section>`;
}

export function drawRiskRules({ assurance, actor, loading, error }) {
  if (loading || !assurance) return `<section class="pane"><p>${error ? esc(error) : "Loading risk policy."}</p><button type="button" data-risk-refresh>Retry</button></section>`;
  const document = assurance.policy;
  const policy = draftRiskPolicy(document.payload.draft);
  const active = document.payload.active;
  const admin = actor.role === "administrator";
  return `<section class="pane risk-intro"><div class="risk-toolbar"><div><h2>Risk Rules Register</h2><p>${active ? `Active policy ${esc(active.id)}. Approved ${esc(dateText(active.approvedAt))}.` : "No approved risk-appetite policy is recorded for this project."}</p></div><button type="button" data-risk-refresh>Refresh saved data</button></div>
    <p>Ten qualitative rules generate an explainable preliminary result. The highest triggered risk floor applies; missing facts produce information requests. No numerical weights are supplied by the draft.</p><p class="risk-policy-note">The proposed floors are implementation assumptions awaiting administrator approval. A saved draft does not replace an active policy. Approving a new version requires affected existing risk assessments to be revalidated.</p>
  </section>
  <form id="risk-policy-form" data-version="${document.version}" class="pane"><fieldset ${admin ? "" : "disabled"}>
    <h2>Rule mapping</h2><div class="risk-rules-table"><table><thead><tr><th>Rule</th><th>Qualitative decision logic</th><th>Proposed minimum risk</th></tr></thead><tbody>${RISK_RULES.map(rule => {
      const bands = rule.id === "RR-01" ? ["Critical"] : ["RR-02", "RR-04"].includes(rule.id) ? ["High", "Critical"] : ["Moderate", "High", "Critical"];
      return `<tr><td><strong>${rule.id}</strong><br />${esc(rule.title)}</td><td>${esc(rule.logic)}</td><td>${rule.id === "RR-10" ? "Re-assessment only" : `<label class="visually-hidden" for="floor-${rule.id}">${rule.id} minimum risk</label><select id="floor-${rule.id}" name="floor.${rule.id}">${options(bands, policy.floors[rule.id])}</select>`}</td></tr>`;
    }).join("")}</tbody></table></div>
    <h2>Client risk appetite</h2>
    ${textarea("appetiteReference", "Client risk-appetite approval reference", policy.appetiteReference, "Use the approved policy or decision reference. Do not assume the draft is client-approved.")}
    <div class="risk-field-grid">${textarea("criticalOperations", "Critical operations and acceptable exposure", policy.criticalOperations)}${textarea("concentrationTolerance", "Concentration tolerance", policy.concentrationTolerance)}</div>
    ${input("defaultRecoveryDays", "Default required recovery / switching time (days)", policy.defaultRecoveryDays, "number")}
    <p class="field-example">Optional. A record-specific operational requirement takes precedence. A blank policy and record requirement stays unknown.</p>
    ${textarea("mitigationExpectations", "Mitigation expectations", policy.mitigationExpectations)}
    ${textarea("escalationThreshold", "Escalation and no-go thresholds", policy.escalationThreshold)}
    ${textarea("lifecycle", "Future Policy/Lifecycle", policy.lifecycle, "Set the review cadence, responsible role, and events that require a policy update.")}
    ${admin ? '<label class="risk-check"><input type="checkbox" name="acknowledge" /><span>I have reviewed the mapping and client approval reference. I understand that a new approved version requires affected assessments to be revalidated.</span></label><div class="row-actions"><button type="submit" value="save">Save draft rules</button><button type="submit" value="approve" class="primary">Approve rules</button></div>' : "<p>Only a designated administrator can save or approve this configuration. It does not grant that administrator an analysis or reviewer role.</p>"}
  </fieldset>${document.version ? `<button type="button" data-risk-history="policy" data-key="${esc(document.key)}">Policy history</button>` : ""}</form>`;
}

export function readPolicyForm(form) {
  const data = new FormData(form);
  const draft = Object.fromEntries(data.entries());
  draft.floors = Object.fromEntries(RISK_RULES.map(rule => [rule.id, data.get(`floor.${rule.id}`)]));
  return { draft: draftRiskPolicy(draft), version: Number(form.dataset.version), acknowledge: data.has("acknowledge") };
}

export function riskRegisterRows(items) {
  return [
    ["Code", "Title", "Status", "Recorded risk", "Preliminary / inherent risk", "Residual risk", "Final risk", "Confidence", "Action", "Validation", "Policy version", "Key risk drivers", "Information requests", "Reassessment status", "Future Policy/Lifecycle"],
    ...items.map(item => {
      const summary = riskSummary(item);
      return [item.code, item.title, item.status, item.risk, summary.inherentRisk, summary.residualRisk, summary.finalRisk, item.confidence, item.action, summary.validation, summary.policyVersion, summary.drivers, summary.followUp, summary.reassessment, item.lifecycle];
    }),
  ];
}

export function triggerRegisterRows(documents) {
  return [
    ["Event", "Record", "Type", "Scope", "Summary", "Observed on", "Review due", "Evidence", "Source URL", "Materiality", "Rationale", "Affected rules", "Reviewer role", "Reviewed at", "Disposition", "Next action", "Closed at", "Version"],
    ...documents.map(doc => {
      const item = doc.payload;
      return [doc.key, item.code, item.type, item.scopeKind, item.summary, item.observedOn, item.dueOn, item.sourceNote, item.sourceUrl, item.materiality, item.rationale, item.rules.join("; "), item.reviewedRole, item.reviewedAt, item.disposition, item.dispositionNote, item.closedAt, doc.version];
    }),
  ];
}
