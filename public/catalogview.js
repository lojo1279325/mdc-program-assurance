// Screens for the vendor and part repository and the regulatory watch.
// Every function returns HTML text or plain data. Nothing here reads the page or the network.
import {
  CATEGORIES, FIELD_ROLE_LABEL, SOURCE_TIERS, SUBSYSTEMS, WATCH_TOPICS,
  alternates, benchmark, categoryOf, countryName, fieldsFor, isMissing, partTitle, programDay, safeUrl, subsystemOf, topicOf, valueOf, vendorOf,
} from "./catalog-model.js";

export const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
export const options = (values, current, empty = "") => `${empty ? `<option value="">${esc(empty)}</option>` : ""}${values.map(value => {
  const [key, label] = Array.isArray(value) ? value : [value, value];
  return `<option value="${esc(key)}" ${String(key) === String(current ?? "") ? "selected" : ""}>${esc(label)}</option>`;
}).join("")}`;
export const dateText = (value) => {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "Not recorded" : new Date(time).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
};
export const dayText = (value) => /^\d{4}-\d{2}-\d{2}/.test(String(value || ""))
  ? new Date(`${String(value).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })
  : "No date";
export const roleName = (role) => FIELD_ROLE_LABEL[role] || { administrator: "Administrator", system: "Scheduled check" }[role] || "Unassigned";
const TONE = { Green: "green", Yellow: "yellow", Orange: "orange", Red: "red" };
export const pill = (level, text = level) => `<span class="pill ${TONE[level] || "grey"}">${esc(text)}</span>`;
export const tierLabel = (tier) => SOURCE_TIERS[String(tier)] || "";
export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function sourceLink(source) {
  const url = safeUrl(source?.url);
  let label = String(source?.label || "");
  if (!label && url) { try { label = new URL(url).hostname; } catch { label = "Source"; } }
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label || "No source recorded");
}

export function showValue(def, value) {
  if (isMissing(value)) return String(value) === "Not assessed" ? "Not assessed" : "n.a.";
  if (def?.country && /^[A-Z]{2}$/.test(String(value))) return `${countryName(value)} (${value})`;
  return String(value);
}

const FIT_TONE = { "Likely fit": "ok", "Does not fit": "no", "Likely does not fit": "no" };
const fitTag = (status) => `<span class="fit-tag ${FIT_TONE[status] || "open"}">${esc(status)}</span>`;
const contextText = (context) => {
  const region = { US: "United States", MY: "Malaysia", EU: "European Union" }[context?.region] || "United States";
  const power = { island: "islanded plant", btm: "generation behind the meter", grid: "grid supply with backup" }[context?.power] || "islanded plant";
  return `${region}, Design ${context?.design || "A"}, ${power}`;
};

// ---------- Benchmark ----------

// The benchmark of one part: posture, confidence, the rule behind each result, requests, and fit.
export function drawBenchmark(result, { analysis = null, context = null } = {}) {
  if (!result) return `<p class="block">This part is no longer in the repository. Choose another part.</p>`;
  const readings = new Map((analysis?.criteria || []).map(row => [row.id, row]));
  const groups = ["Functional", "Design", "Compliance"].map(group => [group, result.fit.filter(row => row.group === group)]).filter(([, rows]) => rows.length);
  const fitRow = (row) => {
    const reading = readings.get(row.id);
    return `<div class="fit-row">
      <div class="fit-what"><strong>${esc(row.label)}</strong><span>${esc(row.expect)}</span><span class="fit-cite">Criterion source: ${sourceLink(row.cite)}</span></div>
      <div class="fit-read"><span class="label">Repository reading</span>${fitTag(row.status)}<span>${esc(row.basis)}</span></div>
      <div class="fit-read"><span class="label">AI reading</span>${reading
    ? `${fitTag(reading.reading)}<span>${esc(reading.basis)}</span>${reading.source?.url ? `<span class="fit-cite">${sourceLink(reading.source)}${tierLabel(reading.tier) ? ` · ${esc(tierLabel(reading.tier))}` : ""}</span>` : ""}`
    : `<span class="quiet">No AI reading is recorded for this point.</span>`}</div>
    </div>`;
  };
  return `<div class="bm">
    <div class="bm-top">
      <div><span class="label">Indicated posture</span><strong>${pill(result.posture)}</strong><small>${esc(result.action)}</small></div>
      <div><span class="label">Evidence confidence</span><strong>${pill("", result.confidence.label)}</strong><small>${result.confidence.confirmed} of ${result.confidence.total} rule fields are confirmed by the owning role. ${result.confidence.sourced} carry a cited source.</small></div>
      <div><span class="label">Function and design fit</span><strong>${fitTag(result.fitSummary)}</strong><small>${plural(result.fit.length, "criterion", "criteria")} for this part type${context ? ` in ${esc(contextText(context))}` : ""}.</small></div>
      <div><span class="label">Review route</span><strong class="bm-route">${result.tradeFlag ? "Trade review" : "CPI review"}</strong><small>${result.tradeFlag ? "A trade rule applies to this part." : "No trade rule applies to this part."}</small></div>
    </div>
    <p class="quiet">The posture is an indication from the rules below. The reviewing role makes the decision. A missing fact lowers confidence and adds an information request. It does not raise the posture.</p>
    <div class="bm-cols">
      <section><h4>Rules behind the posture</h4>${result.reasons.length
    ? `<ul class="bm-rules">${result.reasons.map(row => `<li>${pill(row.level)}<span>${esc(row.text)} <span class="fit-cite">${sourceLink(row.cite)}</span></span></li>`).join("")}</ul>`
    : `<p class="quiet">No rule raises the posture for this part.</p>`}</section>
      <section><h4>Information requests</h4>${result.requests.length
    ? `<ul class="bm-requests">${result.requests.map(text => `<li>${esc(text)}</li>`).join("")}</ul>`
    : `<p class="quiet">No information request is open.</p>`}</section>
    </div>
    <h4>Fit against the design basis</h4>
    ${groups.length ? groups.map(([group, rows]) => `<div class="fit-group"><p class="fit-group-title">${esc(group)}</p>${rows.map(fitRow).join("")}</div>`).join("") : `<p class="quiet">No fit criterion applies to this part type.</p>`}
  </div>`;
}

const sentenceCase = (value) => { const word = String(value || ""); return word.charAt(0).toUpperCase() + word.slice(1); };

// States the ultimate parent in a sentence, or that the registry reports none.
function parentLine(vendor) {
  const parent = valueOf(vendor, "ultimateParent");
  if (isMissing(parent)) return "No ultimate parent is on record";
  if (/^none reported|^no parent/i.test(parent)) {
    const home = isMissing(valueOf(vendor, "hqCountry")) ? valueOf(vendor, "parentCountry") : valueOf(vendor, "hqCountry");
    return `No parent company reported${isMissing(home) ? "" : `. Headquarters: ${countryName(home)}`}`;
  }
  const country = valueOf(vendor, "parentCountry");
  return `Ultimate parent: ${parent}${isMissing(country) ? "" : `, ${countryName(country)}`}`;
}

// One line for a recommended alternate, used by the sourcing screen and the repository.
export function alternateRows(part, catalog, context, { pick = false, current = "" } = {}) {
  const rows = part ? alternates(part, catalog, context, 5) : [];
  if (!rows.length) return `<p class="quiet">The repository holds no alternate in this category from a different ultimate parent that fits this design basis. Add a part, or record why no alternate is available.</p>`;
  return `<ol class="alt-list">${rows.map(row => `<li>
    <div><strong>${esc(partTitle(row.vendor?.name || row.part.vendor, row.part.name))}</strong>
      <span class="quiet">${esc(parentLine(row.vendor))}. ${esc(row.result.action)}. Confidence: ${esc(row.result.confidence.label)}.${row.recheck ? " A recheck is open on this part or its vendor." : ""}</span></div>
    <div class="alt-side">${pill(row.result.posture)}${fitTag(row.result.fitSummary)}${pick
    ? (current === row.part.id ? `<span class="quiet">Selected</span>` : `<button type="button" data-pick-alternate="${esc(row.part.id)}">Use as alternate</button>`)
    : `<button type="button" data-repo-open="${esc(row.part.id)}" data-repo-kind="parts">Open</button>`}</div>
  </li>`).join("")}</ol>
  <p class="quiet">Alternates come from a different ultimate parent, exclude any part at Red or with a stated misfit, and are ranked by posture and then by confidence.</p>`;
}

// ---------- Repository ----------

const awaiting = (entry, role) => fieldsFor(entry.kind).filter(def => def.owner === role && (entry.fields[def.id].state === "baseline" || entry.fields[def.id].stale));

// Counts the entries that still hold an unconfirmed field owned by the role.
export function fieldQueue(catalog, role) {
  const count = (rows) => rows.filter(entry => awaiting(entry, role).length).length;
  return { vendors: count(catalog?.vendors || []), parts: count(catalog?.parts || []) };
}

export function repositoryRows(ctx) {
  const { catalog, ui, role, used = { vendors: [], parts: [] } } = ctx;
  const kind = ui.repoKind === "parts" ? "parts" : "vendors";
  const query = String(ui.repoQuery || "").trim().toLowerCase();
  const vendorParts = (vendor) => catalog.parts.filter(part => part.vendor === vendor.id);
  return catalog[kind].filter(entry => {
    const vendor = kind === "parts" ? vendorOf(catalog, entry) : entry;
    if (ui.repoSubsystem) {
      const inSubsystem = (part) => categoryOf(part.category)?.subsystem === ui.repoSubsystem;
      if (kind === "parts" ? !inSubsystem(entry) : !vendorParts(entry).some(inSubsystem)) return false;
    }
    if (ui.repoFilter === "used" && !used[kind].includes(entry.id)) return false;
    if (ui.repoFilter === "mine" && !awaiting(entry, role).length) return false;
    if (ui.repoFilter === "recheck" && !entry.recheck.length) return false;
    if (ui.repoFilter === "custom" && !entry.custom) return false;
    if (!query) return true;
    const text = [entry.name, ...(entry.names || []), vendor?.name, kind === "parts" ? categoryOf(entry.category)?.label : entry.domain, valueOf(vendor, "ultimateParent"), countryName(valueOf(vendor, "hqCountry"))].join(" ").toLowerCase();
    return query.split(/\s+/).every(word => text.includes(word));
  }).map(entry => ({ entry, title: kind === "parts" ? partTitle(vendorOf(catalog, entry)?.name || entry.vendor, entry.name) : entry.name }))
    .sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }))
    .map(row => row.entry);
}

export function drawRepositoryList(ctx) {
  const { catalog, ui, context } = ctx;
  const kind = ui.repoKind === "parts" ? "parts" : "vendors";
  const rows = repositoryRows(ctx);
  if (!rows.length) return `<p class="quiet repo-empty">No ${kind === "parts" ? "part" : "vendor"} matches. Clear the search or the filters${ctx.role === "nstt" ? ", or add a new entry" : ""}.</p>`;
  const SCREEN = { "No match": "Green", "Similar name": "Yellow", Match: "Red" };
  return rows.slice(0, 150).map(entry => {
    const on = ui.repoEntry === entry.id;
    if (kind === "vendors") {
      const screening = valueOf(entry, "screening");
      return `<button type="button" class="item ${on ? "on" : ""}" data-repo-entry="${esc(entry.id)}" ${on ? 'aria-current="true"' : ""}>
        <strong>${esc(entry.name)}</strong>
        <small>${esc(isMissing(valueOf(entry, "hqCountry")) ? "Headquarters not sourced" : countryName(valueOf(entry, "hqCountry")))} · ${plural(catalog.parts.filter(part => part.vendor === entry.id).length, "part")}</small>
        <span class="pills">${pill(SCREEN[screening] || "", `Screening: ${isMissing(screening) ? "not run" : screening}`)}${entry.recheck.length ? `<span class="pill orange">Recheck needed</span>` : ""}${entry.custom ? `<span class="pill grey">Added by the team</span>` : ""}</span>
      </button>`;
    }
    const result = benchmark(entry, catalog, context);
    return `<button type="button" class="item ${on ? "on" : ""}" data-repo-entry="${esc(entry.id)}" ${on ? 'aria-current="true"' : ""}>
      <strong>${esc(partTitle(vendorOf(catalog, entry)?.name || entry.vendor, entry.name))}</strong>
      <small>${esc(categoryOf(entry.category)?.label || "")} · Tier ${esc(String(valueOf(entry, "deviceTier")).replace("Tier ", ""))}</small>
      <span class="pills">${pill(result.posture)}<span class="pill grey">Confidence ${esc(result.confidence.label)}</span>${entry.recheck.length ? `<span class="pill orange">Recheck needed</span>` : ""}${entry.custom ? `<span class="pill grey">Added by the team</span>` : ""}</span>
    </button>`;
  }).join("") + (rows.length > 150 ? `<p class="quiet repo-empty">Showing the first 150 of ${rows.length}. Narrow the search to see the rest.</p>` : "");
}

function fieldState(field) {
  if (field.stale) return { tag: "recheck", text: "Recheck needed", note: `The sourced value changed${field.changedAt ? ` on ${dateText(field.changedAt)}` : ""} after the ${roleName(field.role)} role recorded this field. The sourced value is now ${field.baselineValue}.` };
  if (field.state === "confirmed") return { tag: "confirmed", text: "Confirmed", note: `${roleName(field.role)} role, ${dateText(field.at)}.` };
  if (field.state === "changed") {
    const reason = /[.!?]$/.test(String(field.reason || "").trim()) ? String(field.reason).trim() : `${String(field.reason || "").trim()}.`;
    const none = isMissing(field.baselineValue);
    return { tag: "changed", text: none ? "Entered by role" : "Changed by role", note: `${roleName(field.role)} role, ${dateText(field.at)}. Reason: ${reason} ${none ? "No sourced value was on record." : `The sourced value was ${field.baselineValue}.`}` };
  }
  return {
    tag: "sourced", text: isMissing(field.value) ? "No value yet" : field.tier === "R" ? "Entered, not confirmed" : "Sourced, not confirmed",
    note: field.changedAt ? `The sourced value changed from ${field.changedFrom || "an earlier value"} on ${dateText(field.changedAt)}.` : "",
  };
}

function changeForm(def, field) {
  const value = def.options
    ? `<label class="field">New value<select name="value" required>${options(def.options, field.value, "Choose a value")}</select></label>`
    : `<label class="field">New value<input name="value" required maxlength="400" value="${esc(isMissing(field.value) ? "" : field.value)}" ${def.country ? 'pattern="[A-Z]{2}|n\\.a\\." placeholder="US"' : ""} /><span class="field-example">${esc(def.help || "")}</span></label>`;
  return `<form class="field-change-form form" data-field="${esc(def.id)}">
    <div class="grid-2">${value}
      <label class="field">Source address<input name="sourceUrl" type="url" maxlength="600" placeholder="https://" /><span class="field-example">${def.id === "eoType" ? "A Department of Energy determination needs its government address." : "The page that states the new value."}</span></label>
      <label class="field">Source name<input name="sourceLabel" maxlength="160" placeholder="Supplier disclosure dated November 20, 2026" /></label>
      <label class="field">What the source states (optional)<input name="detail" maxlength="700" /></label>
    </div>
    <label class="field">Reason for the change<textarea name="reason" rows="2" required minlength="8" maxlength="600"></textarea><span class="field-example">One full sentence. The reason is kept in the history.</span></label>
    <div class="row-actions"><button class="primary" type="submit">Save change</button><button type="button" data-field-edit="">Cancel</button></div>
  </form>`;
}

function fieldRows(entry, ctx) {
  const defs = fieldsFor(entry.kind);
  return `<div class="frows">${defs.map(def => {
    const field = entry.fields[def.id];
    const mine = ctx.role === def.owner;
    const state = fieldState(field);
    const canConfirm = mine && (field.state === "baseline" || field.stale) && !isMissing(field.baselineValue);
    const editing = mine && ctx.ui.repoField === def.id;
    return `<article class="frow ${mine ? "mine" : ""}" data-field-row="${esc(def.id)}">
      <div class="frow-main">
        <p class="frow-label">${esc(def.label)} <span class="owner-tag">${esc(roleName(def.owner))}${def.rule ? " · used by a rule" : ""}</span></p>
        <p class="frow-value">${esc(showValue(def, field.value))}</p>
        ${field.detail ? `<p class="frow-detail">${esc(field.detail)}</p>` : ""}
      </div>
      <div class="frow-source">
        <span class="label">Source</span>
        <span>${sourceLink(field.source)}</span>
        <span class="quiet">${field.unchecked ? "Run the analysis or enter the value." : `${field.source?.url || !isMissing(field.value) ? `${esc(tierLabel(field.tier) || "Program rule")} · as of ` : "Checked "}${esc(dayText(field.asOf))}`}</span>
      </div>
      <div class="frow-state">
        <span class="state-tag ${state.tag}">${esc(state.text)}</span>
        ${state.note ? `<span class="quiet">${esc(state.note)}</span>` : ""}
        ${mine ? `<div class="row-actions">
          ${canConfirm ? `<button type="button" data-field-action="confirm" data-field="${esc(def.id)}">${field.stale ? "Confirm new value" : "Confirm"}</button>` : ""}
          <button type="button" data-field-edit="${esc(def.id)}" aria-expanded="${editing}">${isMissing(field.value) ? "Enter value" : "Change"}</button>
          ${field.state !== "baseline" ? `<button type="button" data-field-action="reset" data-field="${esc(def.id)}">Return to sourced value</button>` : ""}
        </div>` : ""}
      </div>
      ${editing ? changeForm(def, field) : ""}
    </article>`;
  }).join("")}</div>`;
}

function recheckBlock(entry, ctx) {
  if (!entry.recheck.length) return "";
  return `<section class="recheck-box" role="status"><h3>Recheck needed</h3>${entry.recheck.map(row => `<article>
    <p><strong>${esc(row.title)}</strong>${row.url ? ` ${sourceLink({ label: "Open the source", url: row.url })}` : ""}</p>
    ${row.kind === "review"
    ? `<p class="quiet">The ${esc(roleName(row.role))} role recorded this watch item as material on ${esc(dateText(row.at))}. ${esc(row.note)}</p>
       ${ctx.role === row.role
      ? `<form class="recheck-clear-form form" data-review="${esc(row.reviewId)}"><label class="field">What was checked<textarea name="note" rows="2" required minlength="8" maxlength="600"></textarea></label><div class="row-actions"><button type="submit">Clear this recheck</button></div></form>`
      : `<p class="quiet">Only the ${esc(roleName(row.role))} role clears this recheck.</p>`}`
    : `<p class="quiet">The ${esc(roleName(row.role))} role confirms the new value or changes it in the field list.</p>`}
  </article>`).join("")}</section>`;
}

const STEP_TONE = { read: "ok", complete: "ok", unavailable: "no", failed: "no" };
const ORIGIN = { registry: "Registry", list: "Government list", ai: "AI analysis", rule: "Program rule" };

export function drawAnalysis(entry, ctx) {
  const analysis = entry.analysis;
  const canRun = ["nstt", "cpi", "trade"].includes(ctx.role);
  const running = ctx.analyzing === `${entry.kind}:${entry.id}`;
  const scope = entry.kind === "vendor"
    ? "It checks the US Consolidated Screening List, the FCC Covered List, the Section 1260H list, the legal entity registry, and the SEC registrant list. The AI step then looks for the facts that are still open and cites the page for each one."
    : "It applies the program rules for this part type. The AI step then reads the maker's published data for the rating, frequency, standards, and assembly country, and gives a reading for each fit criterion with the page it relied on.";
  return `<section class="analysis" aria-live="polite">
    <div class="section-heading"><h3>Fact-based analysis</h3>${canRun ? `<button type="button" class="primary" data-analyze="${esc(entry.id)}" ${running ? "disabled" : ""}>${running ? "Analysis running" : analysis ? "Run the analysis again" : "Run the analysis"}</button>` : ""}</div>
    <p class="quiet">${scope} The analysis fills only fields that no role has recorded, and it keeps a value that rests on an equal or better source. Each value stays unconfirmed until the owning role confirms it.</p>
    ${running ? `<p class="guide-banner">The analysis is running. It can take up to a minute.</p>` : ""}
    ${!analysis ? `<p class="quiet">No analysis has run for this entry. The values shown come from the repository baseline as of ${esc(dayText(ctx.catalog.asOf))}.</p>` : `
      <p class="analysis-meta">Last run ${esc(dateText(analysis.at))} by the ${esc(roleName(analysis.role))} role${analysis.model ? ` with ${esc(analysis.model)}` : ""}.${analysis.context ? ` Design basis used: ${esc(contextText(analysis.context))}.` : ""}</p>
      ${analysis.message ? `<p class="${analysis.status === "failed" ? "block" : "locked-note"}">${esc(analysis.message)}</p>` : ""}
      <ol class="analysis-steps">${(analysis.steps || []).map(step => `<li><span class="fit-tag ${STEP_TONE[step.status] || "open"}">${esc(sentenceCase(step.status))}</span><span><strong>${esc(step.label)}.</strong>${step.note ? ` ${esc(step.note)}` : ""}</span></li>`).join("")}</ol>
      ${(analysis.fields || []).length ? `<div class="table-scroll"><table class="analysis-table"><thead><tr><th>Field</th><th>Value found</th><th>Source</th><th>Result</th></tr></thead><tbody>${analysis.fields.map(row => `<tr>
        <td>${esc(row.label)}</td><td>${esc(showValue(fieldsFor(entry.kind).find(def => def.id === row.id), row.value))}</td>
        <td>${sourceLink(row.source)}<span class="quiet"> ${esc([ORIGIN[row.origin], tierLabel(row.tier)].filter(Boolean).join(" · "))}</span></td>
        <td>${row.applied ? (row.recited ? "Source updated." : "Filled as a sourced value.") : "No change."} ${esc(row.note || "")}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${analysis.summary ? `<p class="analysis-summary"><strong>${(analysis.steps || []).some(step => step.id === "ai" && step.status === "read") ? "Summary from the AI analysis." : "Summary."}</strong> ${esc(analysis.summary)}</p>` : ""}`}
  </section>`;
}

function historyBlock(entry) {
  if (!entry.log.length) return "";
  const label = { confirm: "Confirmed", change: "Changed", reset: "Returned to sourced value", analyze: "Analysis", add: "Added", "clear-recheck": "Recheck cleared" };
  const defs = fieldsFor(entry.kind);
  return `<details class="history"><summary>History (${entry.log.length})</summary><ul>${[...entry.log].reverse().map(row => `<li><span class="quiet">${esc(dateText(row.at))} · ${esc(roleName(row.role))}</span> ${esc(label[row.action] || row.action)}${row.field ? ` ${esc(defs.find(def => def.id === row.field)?.label || row.field)}` : ""}${row.from !== undefined && row.to !== undefined ? ` from ${esc(row.from)} to ${esc(row.to)}` : ""}. ${esc(row.note || "")}</li>`).join("")}</ul></details>`;
}

// Names the roles that confirm the fields on this kind of record, so a role with no field here is told who has them.
function whoConfirms(kind, role) {
  if (!["nstt", "cpi", "trade"].includes(role)) return "The NSTT, CPI, and Trade roles confirm or change their own fields.";
  const defs = fieldsFor(kind);
  if (defs.some(def => def.owner === role)) return `The ${roleName(role)} role confirms or changes the fields marked ${roleName(role)}.`;
  const owners = [...new Set(defs.map(def => def.owner))].map(roleName);
  const names = owners.length > 2 ? `${owners.slice(0, -1).join(", ")}, and ${owners.at(-1)}` : owners.join(" and ");
  return `The ${names} ${owners.length === 1 ? "role confirms or changes" : "roles confirm or change"} the fields on a ${kind} record.`;
}

function entryDetail(ctx) {
  const { catalog, ui, role, context } = ctx;
  const kind = ui.repoKind === "parts" ? "part" : "vendor";
  const entry = (kind === "part" ? catalog.parts : catalog.vendors).find(row => row.id === ui.repoEntry);
  if (!entry) return `<div class="pane repo-detail"><p class="quiet">Choose a ${kind} from the list to see its cited fields, its analysis, and its history.</p></div>`;
  const mineOpen = awaiting(entry, role).filter(def => !isMissing(entry.fields[def.id].baselineValue));
  const vendor = kind === "part" ? vendorOf(catalog, entry) : entry;
  const head = kind === "vendor"
    ? `<p class="kicker">Vendor${entry.domain ? ` · ${esc(entry.domain)}` : ""}${entry.custom ? " · Added by the team" : ""}</p><h2>${esc(entry.name)}</h2>`
    : `<p class="kicker">Part · ${esc(categoryOf(entry.category)?.label || "")} · ${esc(subsystemOf(categoryOf(entry.category)?.subsystem)?.label || "")}${entry.custom ? " · Added by the team" : ""}</p><h2>${esc(partTitle(vendor?.name || entry.vendor, entry.name))}</h2>
       <p><button type="button" class="text-button" data-repo-open="${esc(entry.vendor)}" data-repo-kind="vendors">Open the vendor record</button></p>`;
  const parts = kind === "vendor" ? catalog.parts.filter(part => part.vendor === entry.id) : [];
  return `<div class="pane repo-detail">
    ${head}
    ${recheckBlock(entry, ctx)}
    ${kind === "part" ? `<section><h3>Benchmark for ${esc(ctx.projectName)}</h3><p class="quiet">Design basis: ${esc(contextText(context))}.${ctx.basisSaved ? "" : " The design basis is not saved yet, so the default applies."}</p>${drawBenchmark(benchmark(entry, catalog, context), { analysis: entry.analysis, context })}</section>
      <section><h3>Alternates from a different ultimate parent</h3>${alternateRows(entry, catalog, context)}</section>` : ""}
    <section>
      <div class="section-heading"><h3>Cited fields</h3>${mineOpen.length > 1 ? `<button type="button" data-confirm-all="${esc(mineOpen.map(def => def.id).join(","))}">Confirm my ${mineOpen.length} sourced values</button>` : ""}</div>
      <p class="quiet">Each value starts from the most trusted public source found. ${esc(whoConfirms(kind, role))} A change needs a reason and is kept in the history.</p>
      ${fieldRows(entry, ctx)}
    </section>
    ${drawAnalysis(entry, ctx)}
    ${parts.length ? `<section><h3>Parts from this vendor</h3><div class="chip-list">${parts.map(part => `<button type="button" data-repo-open="${esc(part.id)}" data-repo-kind="parts">${esc(part.name)} <span class="quiet">${esc(categoryOf(part.category)?.label || "")}</span></button>`).join("")}</div></section>` : ""}
    ${historyBlock(entry)}
  </div>`;
}

function addForm(ctx) {
  const { catalog, ui } = ctx;
  if (ui.repoAdd === "vendor") {
    return `<form id="repo-add-form" class="form pane" data-kind="vendor">
      <h2>Add a vendor</h2>
      <p class="quiet">Enter the registered legal name. The workbench checks the screening list, the FCC Covered List, the Section 1260H list, the legal entity registry, and the SEC registrant list at once. It then runs the AI analysis. Every value stays unconfirmed until the owning role confirms it.</p>
      <div class="grid-2">
        <label class="field">Legal name<input name="legalName" required minlength="2" maxlength="160" /></label>
        <label class="field">Website (optional)<input name="website" maxlength="200" placeholder="example.com" /></label>
      </div>
      <div class="row-actions"><button class="primary" type="submit">Add the vendor and run the analysis</button><button type="button" data-repo-add="">Cancel</button></div>
    </form>`;
  }
  const vendors = [...catalog.vendors].sort((a, b) => a.name.localeCompare(b.name));
  return `<form id="repo-add-form" class="form pane" data-kind="part">
    <h2>Add a part</h2>
    <p class="quiet">Choose the maker and the part type. The program rules set the device tier and the rule fields for that type. The AI analysis then looks for the rating, frequency, standards, and assembly country with a cited page for each one.</p>
    <div class="grid-2">
      <label class="field">Vendor<select name="vendor" required>${options(vendors.map(row => [row.id, row.name]), ui.repoKind === "vendors" ? ui.repoEntry : "", "Choose a vendor")}</select><span class="field-example">Add the vendor first when it is new.</span></label>
      <label class="field">Part type<select name="category" required><option value="">Choose a part type</option>${SUBSYSTEMS.map(group => `<optgroup label="${esc(group.label)}">${CATEGORIES.filter(row => row.subsystem === group.id).map(row => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join("")}</optgroup>`).join("")}</select></label>
      <label class="field">Model<input name="model" required minlength="2" maxlength="160" /><span class="field-example">Write the model as the maker writes it.</span></label>
      <label class="field">Maker's product page (optional)<input name="sourceUrl" type="url" maxlength="600" placeholder="https://" /></label>
    </div>
    <div class="row-actions"><button class="primary" type="submit">Add the part and run the analysis</button><button type="button" data-repo-add="">Cancel</button></div>
  </form>`;
}

export function drawRepository(ctx) {
  const { catalog, loading, error, role, ui, raw } = ctx;
  if (error) return `<section class="pane"><p class="block">${esc(error)}</p><div class="row-actions"><button type="button" data-guide-reload="catalog">Try again</button></div></section>`;
  if (!catalog) return `<section class="pane"><p class="quiet">${loading ? "Loading the repository." : "The repository is not loaded yet."}</p></section>`;
  const queue = fieldQueue(catalog, role);
  const rechecks = catalog.vendors.filter(row => row.recheck.length).length + catalog.parts.filter(row => row.recheck.length).length;
  const owned = ["nstt", "cpi", "trade"].includes(role) ? { vendor: fieldsFor("vendor").filter(def => def.owner === role), part: fieldsFor("part").filter(def => def.owner === role) } : null;
  const kind = ui.repoKind === "parts" ? "parts" : "vendors";
  return `<section class="repo-head">
    <p class="guide-banner">${owned
    ? `You act as ${esc(roleName(role))}. ${["vendor", "part"].map(type => owned[type].length
      ? `On a ${type} you confirm or change ${plural(owned[type].length, "field")}: ${esc(owned[type].map(def => def.label).join(", "))}.`
      : `Other roles own the ${type} fields.`).join(" ")}`
    : "You read the repository. The NSTT, CPI, and Trade roles confirm or change their own fields."}${catalog.practice ? " Practice edits go to a practice copy and leave the shared repository unchanged." : ""}</p>
    <div class="metrics repo-metrics">
      <div class="metric"><strong>${catalog.vendors.length}</strong><span>Vendors</span></div>
      <div class="metric"><strong>${catalog.parts.length}</strong><span>Parts</span></div>
      <div class="metric"><strong>${owned ? queue.vendors + queue.parts : 0}</strong><span>${owned ? `Entries with ${role === "nstt" ? "an" : "a"} ${esc(roleName(role))} field to confirm` : "Entries awaiting your role"}</span></div>
      <div class="metric"><strong>${rechecks}</strong><span>Entries with an open recheck</span></div>
    </div>
    <p class="quiet">Baseline as of ${esc(dayText(catalog.asOf))}. ${raw?.screenedAt ? `Vendor names were last screened ${esc(dateText(raw.screenedAt))}${raw.listDate ? ` against the list dated ${esc(dayText(raw.listDate))}` : ""}.` : "The daily check has not screened the vendor names yet."} A value of n.a. means no trusted public source was found.</p>
  </section>
  <div class="repo-toolbar">
    <div class="status-filters" role="group" aria-label="Record type">
      <button type="button" data-repo-kind-switch="vendors" aria-pressed="${kind === "vendors"}">Vendors</button>
      <button type="button" data-repo-kind-switch="parts" aria-pressed="${kind === "parts"}">Parts</button>
    </div>
    <label class="field">Search<input id="repo-search" type="search" value="${esc(ui.repoQuery || "")}" maxlength="80" placeholder="Name, parent, country, or part type" autocomplete="off" /></label>
    <label class="field">Subsystem<select id="repo-subsystem">${options(SUBSYSTEMS.map(row => [row.id, row.label]), ui.repoSubsystem, "All subsystems")}</select></label>
    <label class="field">Show<select id="repo-filter">${options([["used", "Used on this project's sourcing lines"], ["mine", "With a field for my role to confirm"], ["recheck", "With an open recheck"], ["custom", "Added by the team"]], ui.repoFilter, "All entries")}</select></label>
    ${role === "nstt" ? `<div class="row-actions"><button type="button" data-repo-add="vendor">Add vendor</button><button type="button" data-repo-add="part">Add part</button></div>` : ""}
  </div>
  ${ui.repoAdd && role === "nstt" ? addForm(ctx) : ""}
  <div class="split repo-split">
    <div class="list" id="repo-list" aria-label="${kind === "parts" ? "Parts" : "Vendors"}">${drawRepositoryList(ctx)}</div>
    ${entryDetail(ctx)}
  </div>`;
}

// ---------- Regulatory watch ----------

// Items that carry a topic owned by the role and hold no decision from that role yet.
export function watchQueue(watch, role) {
  const reviews = new Map((watch?.reviews || []).map(row => [row.itemId, row]));
  return (watch?.items || []).filter(item => (item.topics || []).some(id => topicOf(id)?.role === role) && !reviews.get(item.id)?.payload?.dispositions?.[role]);
}

const DAY = 24 * 60 * 60 * 1000;
// Names only the counts that are not zero, as in "1 vendor and 2 parts".
const tally = (vendors, parts) => [vendors ? plural(vendors, "vendor") : "", parts ? plural(parts, "part") : ""].filter(Boolean).join(" and ");

// The daily update: what the checks read, what is new, what changed, and what needs a decision.
export function dailyDigest({ watch = null, catalog = null, lines = [], projectName = "", context = {}, now = Date.now() } = {}) {
  const since = now - DAY;
  const within = (value) => { const time = Date.parse(value); return !Number.isNaN(time) && time >= since && time <= now + 60 * 1000; };
  const allRuns = watch?.runs || [];
  const last = allRuns[0] || null;
  const runs = allRuns.filter(run => within(run.at));
  const items = (watch?.items || []).filter(item => within(item.foundAt));
  const leads = items.filter(item => item.lead).length;
  const changed = new Map();
  for (const run of [...runs].reverse()) {
    for (const row of run.screening?.changed || []) {
      const first = changed.get(row.id);
      changed.set(row.id, { id: row.id, name: row.name, from: first?.from ?? row.from, fromDetail: first ? first.fromDetail : row.fromDetail || "", to: row.to });
    }
  }
  const screening = [...changed.values()].filter(row => row.from !== row.to);
  // A changed screening result moves the benchmark at once. Each part is benchmarked with the earlier result and with the current one.
  const postures = [];
  for (const row of catalog ? screening : []) {
    const vendor = catalog.vendors.find(entry => entry.id === row.id);
    const field = vendor?.fields?.screening;
    // A value entered by Trade stands until Trade rechecks it, so the benchmark has not moved.
    if (!field || field.state === "changed") continue;
    const before = { ...vendor, fields: { ...vendor.fields, screening: { ...field, value: row.from, detail: row.fromDetail, stale: false } } };
    const earlier = { ...catalog, vendors: catalog.vendors.map(entry => entry === vendor ? before : entry) };
    for (const part of catalog.parts.filter(entry => entry.vendor === vendor.id)) {
      const was = benchmark(part, earlier, context).posture;
      const is = benchmark(part, catalog, context).posture;
      if (was !== is) postures.push({ id: part.id, name: partTitle(vendor.name, part.name), from: was, to: is });
    }
  }
  const material = [];
  for (const review of watch?.reviews || []) {
    for (const row of Object.values(review.payload?.dispositions || {})) {
      if (row.materiality === "Material" && within(row.at)) material.push({ title: review.payload.title, role: row.role, vendors: row.affected?.vendors?.length || 0, parts: row.affected?.parts?.length || 0 });
    }
  }
  const awaitingRole = { trade: watchQueue(watch, "trade").length, cpi: watchQueue(watch, "cpi").length };
  const rechecks = { vendors: (catalog?.vendors || []).filter(row => row.recheck?.length).length, parts: (catalog?.parts || []).filter(row => row.recheck?.length).length };
  const flagged = lines.filter(line => line.reasons?.length);
  const bullets = [];
  if (!last) bullets.push({ kind: "check", text: "No check has run yet. Choose Check now to read the sources." });
  else {
    const read = (last.sources || []).filter(row => row.status === "read").length;
    const down = (last.sources || []).filter(row => row.status === "unavailable");
    const connected = (last.sources || []).filter(row => row.status !== "not connected").length;
    bullets.push({
      kind: "check",
      text: `${runs.length ? "" : "No check ran in the last 24 hours. "}The last check ran ${dateText(last.at)} and read ${read} of ${connected} connected sources.${down.length ? ` Unavailable: ${down.map(row => row.label).join("; ")}.` : ""}${last.screening?.status === "read" ? ` It screened ${last.screening.checked} vendor names.` : last.screening?.status ? " The screening list could not be read, so earlier results stand." : ""}`,
    });
  }
  bullets.push({
    kind: "items",
    text: items.length
      ? `${plural(items.length, "new item")} arrived in the last 24 hours: ${items.length - leads} from government sources and ${plural(leads, "press lead")}. A press lead changes nothing until a government source confirms it.`
      : "No new item arrived in the last 24 hours.",
  });
  bullets.push({
    kind: "screening",
    text: screening.length
      ? `The screening result changed for ${screening.map(row => `${row.name} (from ${row.from} to ${row.to})`).join("; ")}. Trade confirms each one before it is relied on.`
      : "No vendor screening result changed.",
  });
  if (postures.length) bullets.push({
    kind: "posture",
    text: `The changed screening results move the indicated posture of ${plural(postures.length, "part")}${projectName ? ` for ${projectName}` : ""}: ${postures.slice(0, 12).map(row => `${row.name} (from ${row.from} to ${row.to})`).join("; ")}${postures.length > 12 ? `; and ${postures.length - 12} more` : ""}. The benchmark and the ranked alternates already use the new results.`,
  });
  for (const row of material) bullets.push({ kind: "material", text: `The ${roleName(row.role)} role recorded “${row.title}” as material. ${tally(row.vendors, row.parts) ? `It flags ${tally(row.vendors, row.parts)} for recheck.` : "It flags no vendor or part for recheck."}` });
  if (awaitingRole.trade || awaitingRole.cpi) bullets.push({ kind: "review", text: `Items waiting for a materiality decision: ${[["Trade", awaitingRole.trade], ["CPI", awaitingRole.cpi]].filter(([, count]) => count).map(([name, count]) => `${name} ${count}`).join(", ")}.` });
  if (rechecks.vendors || rechecks.parts) bullets.push({ kind: "recheck", text: `${tally(rechecks.vendors, rechecks.parts)} ${rechecks.vendors + rechecks.parts === 1 ? "carries" : "carry"} an open recheck in the repository.` });
  if (flagged.length) bullets.push({ kind: "lines", text: `${plural(flagged.length, "sourcing line")}${projectName ? ` in ${projectName}` : ""} ${flagged.length === 1 ? "needs" : "need"} a second look: ${flagged.map(line => `${line.id} (${String(line.reasons[0]).replace(/\.$/, "")})`).join("; ")}. Approved decisions stay as recorded until a role reopens them.` });
  const action = Boolean(screening.length || material.length || awaitingRole.trade || awaitingRole.cpi || rechecks.vendors || rechecks.parts || flagged.length);
  return {
    day: programDay(now),
    headline: action ? "Action is needed on the items below." : "No change needs action today.",
    action, bullets,
    postures,
    counts: { runs: runs.length, newItems: items.length, leads, screeningChanges: screening.length, postureChanges: postures.length, material: material.length, awaiting: awaitingRole, rechecks, lines: flagged.length },
  };
}

export const digestText = (digest) => [`Daily regulatory and sourcing update, ${dayText(digest.day)}`, "", digest.headline, "", ...digest.bullets.map(row => `- ${row.text}`), ""].join("\n");

function dispositionText(row) {
  const flagged = tally(row.affected?.vendors?.length || 0, row.affected?.parts?.length || 0);
  return `The ${roleName(row.role)} role recorded ${row.materiality} on ${dateText(row.at)}. ${row.note}${row.materiality === "Material" ? (flagged ? ` Flagged for recheck: ${flagged}.` : " No vendor or part was flagged for recheck.") : ""}`;
}

function reviewForm(item, review, ctx) {
  const { role, catalog } = ctx;
  const mineTopics = WATCH_TOPICS.filter(topic => topic.role === role);
  const earlier = review?.payload?.dispositions?.[role];
  const checked = new Set(earlier?.topics || (item.topics || []).filter(id => topicOf(id)?.role === role));
  const named = (item.vendors || []).map(id => catalog?.vendors.find(row => row.id === id)).filter(Boolean);
  const picked = new Set(earlier?.vendors || named.map(row => row.id));
  const others = [...(catalog?.vendors || [])].filter(row => !named.includes(row)).sort((a, b) => a.name.localeCompare(b.name));
  const extra = others.filter(row => picked.has(row.id)).length;
  return `<form class="watch-review-form form" data-item="${esc(item.id)}" data-version="${esc(review?.version || 0)}">
    <p class="quiet">Material flags the affected vendors, parts, and sourcing lines for recheck. It does not change an approved decision.</p>
    <div class="grid-2">
      <label class="field">Decision<select name="materiality" required>${options(["Material", "Not material"], earlier?.materiality, "Choose")}</select></label>
      <label class="field">Confirming government source${item.lead ? "" : " (optional)"}<input name="confirmUrl" type="url" maxlength="600" placeholder="https://" value="${esc(earlier?.confirmUrl || "")}" /><span class="field-example">${item.lead ? "This item is a press lead. A material decision needs the government page that confirms it." : "Add the page that states the change, when it differs from the item."}</span></label>
    </div>
    <fieldset class="check-set"><legend>Rule topics this affects</legend>${mineTopics.map(topic => `<label class="check"><input type="checkbox" name="topics" value="${esc(topic.id)}" ${checked.has(topic.id) ? "checked" : ""} />${esc(topic.label)}</label>`).join("")}</fieldset>
    <fieldset class="check-set"><legend>Vendors this affects</legend>
      ${named.length ? named.map(row => `<label class="check"><input type="checkbox" name="vendors" value="${esc(row.id)}" ${picked.has(row.id) ? "checked" : ""} />${esc(row.name)}</label>`).join("") : `<p class="quiet">The item names no vendor in the repository.</p>`}
      <details class="more-vendors" ${extra ? "open" : ""}><summary>Add other vendors from the repository${extra ? ` (${extra} chosen)` : ""}</summary>
        <div class="check-scroll">${others.map(row => `<label class="check"><input type="checkbox" name="vendors" value="${esc(row.id)}" ${picked.has(row.id) ? "checked" : ""} />${esc(row.name)}</label>`).join("")}</div>
      </details>
      <label class="check"><input type="checkbox" name="broad" ${earlier?.broad ? "checked" : ""} />This applies to every vendor and part under the chosen topics.</label>
    </fieldset>
    <label class="field">Reason<textarea name="note" rows="2" required minlength="8" maxlength="600">${esc(earlier?.note || "")}</textarea><span class="field-example">One full sentence. State what changed and why it matters, or why it does not.</span></label>
    <div class="row-actions"><button class="primary" type="submit">Record the decision</button><button type="button" data-watch-item="">Cancel</button></div>
  </form>`;
}

function watchItem(item, ctx, reviews) {
  const { role, ui } = ctx;
  const review = reviews.get(item.id);
  const rows = Object.values(review?.payload?.dispositions || {});
  const mine = (item.topics || []).some(id => topicOf(id)?.role === role);
  const done = Boolean(review?.payload?.dispositions?.[role]);
  const open = ui.watchItem === item.id && mine;
  const names = (item.vendors || []).map(id => ctx.catalog?.vendors.find(row => row.id === id)?.name).filter(Boolean);
  return `<article class="watch-item ${item.lead ? "lead" : ""}">
    <p class="kicker">${esc(item.sourceLabel)} · ${esc(tierLabel(item.tier))} · ${esc(dayText(item.date))}${item.publisher ? ` · ${esc(item.publisher)}` : ""}</p>
    <h3>${safeUrl(item.url) ? `<a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>` : esc(item.title)}</h3>
    ${item.summary ? `<p class="watch-summary">${esc(item.summary)}</p>` : ""}
    <div class="pills">${item.lead ? `<span class="pill yellow">Press lead. Confirm on a government page.</span>` : ""}${(item.topics || []).map(id => `<span class="pill grey">${esc(topicOf(id)?.label || id)} · ${esc(roleName(topicOf(id)?.role))}</span>`).join("")}${names.map(name => `<span class="pill grey">Names ${esc(name)}</span>`).join("")}</div>
    ${rows.map(row => `<p class="watch-decision ${row.materiality === "Material" ? "material" : ""}">${esc(dispositionText(row))}</p>`).join("")}
    ${mine && !open ? `<div class="row-actions"><button type="button" data-watch-item="${esc(item.id)}">${done ? "Change my decision" : "Record materiality"}</button></div>` : ""}
    ${!mine && !rows.length ? `<p class="quiet">The ${esc([...new Set((item.topics || []).map(id => roleName(topicOf(id)?.role)))].join(" or ") || "Trade")} role records materiality for this item.</p>` : ""}
    ${open ? reviewForm(item, review, ctx) : ""}
  </article>`;
}

function runRow(run) {
  const sources = run.sources || [];
  const read = sources.filter(row => row.status === "read").length;
  const down = sources.filter(row => row.status === "unavailable").length;
  const changed = run.screening?.changed || [];
  const trigger = { scheduled: "Scheduled daily check", "catch-up": "Catch-up on open", manual: "Check now" }[run.trigger] || "Check";
  return `<details class="run"><summary><strong>${esc(dateText(run.at))}</strong><span>${esc(trigger)} · ${esc(roleName(run.role))}</span><span>${plural(run.added || 0, "new item")} · ${read} read · ${down} unavailable · ${plural(changed.length, "screening change")}</span></summary>
    <p class="quiet">${run.since ? `Items dated from ${esc(dayText(run.since))}. ` : ""}${run.screening?.status === "read" ? `The screening list was read and ${esc(run.screening.checked)} vendor names were checked.` : `The screening list was not read. ${esc(run.screening?.note || "")}`}${Number.isFinite(run.durationMs) ? ` The run took ${plural(Math.max(1, Math.round(run.durationMs / 1000)), "second")}.` : ""}</p>
    ${changed.length ? `<ul class="bm-requests">${changed.map(row => `<li>${esc(row.name)}: from ${esc(row.from)} to ${esc(row.to)}.</li>`).join("")}</ul>` : ""}
    <div class="table-scroll"><table><thead><tr><th>Source</th><th>Status</th><th>Found</th><th>New</th><th>Note</th></tr></thead><tbody>${sources.map(row => `<tr>
      <td>${sourceLink({ label: row.label, url: row.page })}<span class="quiet"> ${esc(row.lead ? "Press lead" : tierLabel(row.tier))}</span></td>
      <td><span class="fit-tag ${STEP_TONE[row.status] || "open"}">${esc(sentenceCase(row.status))}</span></td><td>${esc(row.found ?? 0)}</td><td>${esc(row.added ?? 0)}</td><td>${esc(row.note || "")}</td></tr>`).join("")}</tbody></table></div>
  </details>`;
}

// The schedule line states what the record shows: a schedule that is arriving, one that is ready and silent, or none.
export function scheduleText(state) {
  const fallback = "The workbench runs a catch-up check when it is opened after 20 hours, and any role can choose Check now.";
  if (state?.scheduled) return `A scheduled check runs every day.${state.lastScheduledAt ? ` The last scheduled check ran on ${dateText(state.lastScheduledAt)}.` : ""}`;
  if (state?.scheduleReady) return `The scheduled check is ready in this environment. No scheduled check has arrived in the last 36 hours. Ask an administrator to confirm that the scheduler is running. ${fallback}`;
  return `This environment has no scheduled check. ${fallback}`;
}

export function drawWatch(ctx) {
  const { watch, catalog, loading, error, role, ui, digest, running } = ctx;
  if (error) return `<section class="pane"><p class="block">${esc(error)}</p><div class="row-actions"><button type="button" data-guide-reload="watch">Try again</button></div></section>`;
  if (!watch) return `<section class="pane"><p class="quiet">${loading ? "Loading the watch log." : "The watch log is not loaded yet."}</p></section>`;
  const reviews = new Map(watch.reviews.map(row => [row.itemId, row]));
  const queue = watchQueue(watch, role);
  const decided = watch.items.filter(item => Object.keys(reviews.get(item.id)?.payload?.dispositions || {}).length);
  const reviewer = WATCH_TOPICS.some(topic => topic.role === role);
  const tab = ["mine", "all", "decided", "rechecks", "runs", "sources"].includes(ui.watchTab) ? ui.watchTab : reviewer ? "mine" : "all";
  const byTopic = (rows) => ui.watchTopic ? rows.filter(item => (item.topics || []).includes(ui.watchTopic)) : rows;
  const list = (rows, empty) => rows.length ? byTopic(rows).slice(0, 60).map(item => watchItem(item, ctx, reviews)).join("") || `<p class="quiet">No item carries this topic.</p>` : `<p class="quiet">${esc(empty)}</p>`;
  const flagged = [...(catalog?.vendors || []), ...(catalog?.parts || [])].filter(entry => entry.recheck.length);
  const last = watch.state.lastRunAt;
  const eo = topicOf("eo14420");
  const panel = {
    mine: () => list(queue, reviewer ? "No item is waiting for your decision." : "Your role records no materiality decision. Open All items to read the log."),
    all: () => list(watch.items, "No item has been found yet. Choose Check now to read the sources."),
    decided: () => list(decided, "No materiality decision is recorded yet."),
    rechecks: () => flagged.length ? `<div class="recheck-list">${flagged.map(entry => `<article><div><strong>${esc(entry.kind === "part" ? partTitle(vendorOf(catalog, entry)?.name || entry.vendor, entry.name) : entry.name)}</strong><span class="quiet">${entry.kind === "part" ? "Part" : "Vendor"} · ${esc(entry.recheck.map(row => `${row.title} (${roleName(row.role)})`).join(" "))}</span></div><button type="button" data-repo-open="${esc(entry.id)}" data-repo-kind="${entry.kind === "part" ? "parts" : "vendors"}">Open in the repository</button></article>`).join("")}</div>` : `<p class="quiet">No vendor or part carries an open recheck.</p>`,
    runs: () => watch.runs.length ? watch.runs.map(runRow).join("") : `<p class="quiet">No check has run yet.</p>`,
    sources: () => `<p class="guide-banner">${esc(eo?.help || "")}</p>
      <h3>Sources read on every check</h3>
      <div class="table-scroll"><table><thead><tr><th>Source</th><th>Trust tier</th><th>How it is used</th></tr></thead><tbody>${watch.sources.map(row => `<tr><td>${sourceLink({ label: row.label, url: row.page })}</td><td>${esc(tierLabel(row.tier))}</td><td>${row.lead ? "Press lead. It prompts a check of the government page and changes nothing by itself." : "Primary source. A reviewer records whether a change is material."}</td></tr>`).join("")}</tbody></table></div>
      <h3>Sources that cannot be read automatically</h3>
      <ul class="plain-list">${watch.notConnected.map(row => `<li><strong>${sourceLink({ label: row.label, url: row.page })}.</strong> ${esc(row.note)}</li>`).join("")}</ul>
      <h3>Rule topics and the role that decides</h3>
      <ul class="plain-list">${WATCH_TOPICS.map(topic => `<li><strong>${esc(topic.label)}.</strong> ${esc(roleName(topic.role))} records materiality.</li>`).join("")}</ul>`,
  };
  const tabs = [["mine", `For my decision (${queue.length})`], ["all", `All items (${watch.items.length})`], ["decided", `Decisions recorded (${decided.length})`], ["rechecks", `Open rechecks (${flagged.length})`], ["runs", `Check log (${watch.runs.length})`], ["sources", "Sources"]];
  return `<section class="pane watch-head">
    <div class="section-heading"><h2>Daily update</h2><div class="row-actions"><button type="button" class="primary" data-watch-run ${running || watch.state.running ? "disabled" : ""}>${running || watch.state.running ? "Check running" : "Check now"}</button><button type="button" data-watch-download>Download the update</button></div></div>
    <p class="digest-headline ${digest.action ? "action" : ""}">${esc(digest.headline)}</p>
    <ul class="digest">${digest.bullets.map(row => `<li class="digest-${esc(row.kind)}">${esc(row.text)}</li>`).join("")}</ul>
    <p class="quiet">${last ? `Last check: ${esc(dateText(last))}.` : "No check has run yet."} ${esc(scheduleText(watch.state))} Every check is logged with the sources it read. Items are never deleted.</p>
  </section>
  <div class="watch-toolbar">
    <div class="status-filters" role="group" aria-label="Watch sections">${tabs.map(([id, label]) => `<button type="button" data-watch-tab="${id}" aria-pressed="${tab === id}">${esc(label)}</button>`).join("")}</div>
    ${["mine", "all", "decided"].includes(tab) ? `<label class="field">Rule topic<select id="watch-topic">${options(WATCH_TOPICS.map(topic => [topic.id, topic.label]), ui.watchTopic, "All topics")}</select></label>` : ""}
  </div>
  <section class="watch-panel" data-watch-panel="${tab}">${panel[tab]()}</section>`;
}
