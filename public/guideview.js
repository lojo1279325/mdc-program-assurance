// Screens for the program plan, the sourcing workflow, and the portfolio.
// Every function returns HTML text or plain data. Nothing here reads the page or the network.
import {
  ACTIONS_90, ACTION_STATES, BUILDING_BLOCKS, CHECK_STATES, CONSIDERATIONS, CONSIDERATION_STATES, CONTRACT_TERMS, CORE_DESIGN, CUSTOMER,
  DECISIONS, DECISION_STATES, DEFAULT_MILESTONES, DELIVERY_ROLES, DESIGN_RULE, DEVICE_TIERS, EVIDENCE_STATES, GATES, GATE_RESULTS, GATE_RULES,
  HELD_FLAGS, OPEN_ITEM_OWNERS, PLATFORMS, POWER, POWER_RULES, RATINGS, RATING_MEANING, REFERENCE_DESIGNS, REGIONAL_KITS, RISK_ROWS,
  ROLE_WORKFLOWS, SELECTION_CRITERIA, SELECTION_RULE, STOP_SIGNS, TENANCY, TERM_STATES, TIER_RULE, UPDATE_TRIGGERS,
  currentGate, defaultRiskRating, designContext, gateApplies, gatePassed, lineBenchmark, lineRecheck, normalizeProgram, normalizeSelection,
  pathwaysFor, priorGate, referenceDesign, roleFields, selectionSubmitBlock, sourcingCoverage, stopSigns, timelineRows,
} from "./guide-model.js";
import { CATEGORIES, REGIONS, SUBSYSTEMS, categoryOf, partTitle, programDay, subsystemOf, vendorOf } from "./catalog-model.js";
import { alternateRows, dateText, dayText, drawBenchmark, esc, options, pill, plural, roleName, sourceLink } from "./catalogview.js";

const STATUS_TONE = {
  "Not started": "sourced", "In preparation": "changed", Hold: "recheck", "Ready for decision": "changed", Passed: "confirmed", "Passed with conditions": "confirmed",
  Draft: "sourced", "In review": "changed", Returned: "recheck", Approved: "confirmed",
  Open: "sourced", Decided: "confirmed", Done: "confirmed", "Not applicable": "sourced", "In progress": "changed", Addressed: "confirmed",
};
const statusTag = (status) => `<span class="state-tag ${STATUS_TONE[status] || "sourced"}">${esc(status)}</span>`;
const today = () => programDay();
// A date field accepts today in New York or today where the reader sits, whichever is later.
const latestDay = () => {
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return local > today() ? local : today();
};
const cites = (rows) => (rows || []).filter(row => row?.label).map(sourceLink).join("; ");
const labelOf = (rows, id) => rows.find(row => row.id === id)?.label || "";
const partName = (catalog, id) => {
  const part = catalog?.parts.find(row => row.id === id);
  return part ? partTitle(vendorOf(catalog, part)?.name || part.vendor, part.name) : "";
};
const history = (rows, title, line) => rows?.length
  ? `<details class="history"><summary>${esc(title)} (${rows.length})</summary><ul>${[...rows].reverse().map(row => `<li><span class="quiet">${esc(dateText(row.at))} · ${esc(roleName(row.role))}</span> ${line(row)}</li>`).join("")}</ul></details>`
  : "";
const GATE_ACTION = { save: "Evidence saved", hold: "Hold recorded", ready: "Marked ready for decision", decide: "Decision recorded", return: "Returned to preparation", reopen: "Reopened" };
const LINE_ACTION = { save: "Saved", submit: "Sent to review", approve: "Approved", return: "Returned", reopen: "Reopened", withdraw: "Withdrawn from review" };
const SECTION_LABEL = { basis: "Design basis", milestones: "Milestones", decisions: "Decisions", considerations: "Design considerations", risks: "Risk register", actions: "First 90 days" };
const stateMessage = (ctx, what) => ctx.error
  ? `<section class="pane"><p class="block">${esc(ctx.error)}</p><div class="row-actions"><button type="button" data-guide-reload="${esc(what)}">Try again</button></div></section>`
  : `<section class="pane"><p class="quiet">${ctx.loading ? "Loading saved work for this project." : "Saved work for this project is not loaded yet."}</p></section>`;

// ---------- Form readers. Each takes FormData and returns the shape the server expects. ----------

const reader = (data) => (name) => String(data.get(name) ?? "").trim();

export function readBasisForm(data) {
  const get = reader(data);
  return {
    basis: { tenancy: get("tenancy"), power: get("power"), platform: get("platform"), region: get("region"), customer: get("customer"), voltage: get("voltage"), note: get("note") },
    pathway: Number(get("pathway")),
  };
}

export function readProgramSection(section, data) {
  const get = reader(data);
  if (section === "milestones") {
    const rows = DEFAULT_MILESTONES.map(row => ({ id: row.id, date: get(`milestone.${row.id}`) }));
    const used = new Set();
    for (let index = 0; index < 14; index += 1) if (get(`custom.${index}.label`) && get(`custom.${index}.id`)) used.add(get(`custom.${index}.id`));
    let next = 1;
    for (let index = 0; index < 14; index += 1) {
      const label = get(`custom.${index}.label`);
      if (!label) continue;
      let id = get(`custom.${index}.id`);
      if (!id) { while (used.has(`m${next}`)) next += 1; id = `m${next}`; used.add(id); }
      rows.push({ id, label, date: get(`custom.${index}.date`) });
    }
    return { milestones: rows };
  }
  if (section === "decisions") return { decisions: Object.fromEntries(DECISIONS.map(row => [row.id, { status: get(`decision.${row.id}.status`), position: get(`decision.${row.id}.position`), decidedOn: get(`decision.${row.id}.decidedOn`), note: get(`decision.${row.id}.note`) }])) };
  if (section === "considerations") return { considerations: Object.fromEntries(CONSIDERATIONS.map(row => [row.id, { status: get(`consideration.${row.id}.status`), note: get(`consideration.${row.id}.note`) }])) };
  if (section === "risks") return { risks: Object.fromEntries(RISK_ROWS.map(row => [row.id, { rating: get(`risk.${row.id}.rating`), openFact: get(`risk.${row.id}.openFact`), action: get(`risk.${row.id}.action`), note: get(`risk.${row.id}.note`) }])) };
  return { actions: Object.fromEntries(ACTIONS_90.flatMap(block => block.items).map(row => [row.id, { status: get(`action.${row.id}.status`), due: get(`action.${row.id}.due`), note: get(`action.${row.id}.note`) }])) };
}

export function readGateForm(data, gateId) {
  const get = reader(data);
  const evidence = GATES[gateId].evidence.map((_, index) => ({ state: get(`evidence.${index}.state`), note: get(`evidence.${index}.note`) }));
  const openItems = [];
  for (let index = 0; index < 24; index += 1) {
    const text = get(`item.${index}.text`);
    if (text) openItems.push({ text, owner: get(`item.${index}.owner`), due: get(`item.${index}.due`), closed: data.has(`item.${index}.closed`) });
  }
  return { evidence, openItems };
}

export function readSelectionForm(data) {
  const get = reader(data);
  const subsystem = get("subsystem");
  return {
    subsystem, category: get("category"), primary: get("primary"), alternate: get("alternate"), noAlternateReason: get("noAlternateReason"), note: get("note"),
    checklist: (subsystemOf(subsystem)?.confirm || []).map((_, index) => ({ state: get(`check.${index}.state`) || "Open", note: get(`check.${index}.note`) })),
    terms: Object.fromEntries(CONTRACT_TERMS.map(row => [row.id, get(`term.${row.id}`) || "Open"])),
    stops: Object.fromEntries(STOP_SIGNS.map(row => [row.id, data.has(`stop.${row.id}`)])),
    stopNote: get("stopNote"),
    held: Object.fromEntries(HELD_FLAGS.map(row => [row.id, data.has(`held.${row.id}`)])),
  };
}

// ---------- Program plan ----------

const PROGRAM_TABS = [["basis", "Design basis"], ["gates", "Gates"], ["decisions", "Decisions and actions"], ["considerations", "Design considerations"], ["risks", "Risk register"], ["milestones", "Milestones"], ["roles", "Responsibilities"]];

// What the chosen basis sets: the reference design, the rules for the power arrangement, and the regional kit.
export function drawBasisPreview(draft) {
  const plan = normalizeProgram({ basis: draft?.basis, pathway: draft?.pathway });
  const { basis } = plan;
  const design = referenceDesign(basis);
  const kit = REGIONAL_KITS[basis.region];
  const platform = PLATFORMS.find(row => row.id === basis.platform);
  const pathway = pathwaysFor(basis.power).find(row => row.id === plan.pathway);
  return `<section class="pane basis-result">
    <h2>Reference design that follows from the basis</h2>
    <div class="design-cards">${Object.values(REFERENCE_DESIGNS).map(row => `<article class="design-card ${row.id === design ? "on" : ""}" ${row.id === design ? 'aria-current="true"' : ""}>
      <span class="design-letter" aria-hidden="true">${row.id}</span>
      <div><h3>Design ${row.id}. ${esc(row.label)}${row.id === design ? ` <span class="state-tag confirmed">Applies</span>` : ""}</h3>
        <ul><li><strong>Fits:</strong> ${esc(row.fit)}</li><li><strong>Key moves:</strong> ${esc(row.moves)}</li><li><strong>Watch:</strong> ${esc(row.watch)}</li></ul></div>
    </article>`).join("")}</div>
    <h3>What the choices set</h3>
    <ul class="plain-list">
      <li><strong>Users.</strong> ${esc(TENANCY.find(row => row.id === basis.tenancy).sets)}</li>
      <li><strong>Power.</strong> ${esc(POWER.find(row => row.id === basis.power).sets)}</li>
      <li><strong>Pathway.</strong> ${esc(pathway.text)}</li>
      <li><strong>Chip platform.</strong> ${esc(platform.facts)}${platform.cites.length ? ` <span class="fit-cite">${cites(platform.cites)}</span>` : ""}</li>
      <li><strong>End customer.</strong> ${esc(labelOf(CUSTOMER, basis.customer))}.</li>
    </ul>
  </section>
  <section class="pane">
    <h2>Rules for ${esc(labelOf(POWER, basis.power).toLowerCase())}</h2>
    <dl class="rule-list">${POWER_RULES.map(row => `<div><dt>${esc(row.label)}</dt><dd>${esc(row[basis.power].text)} <span class="fit-cite">${sourceLink(row[basis.power].cite)}</span></dd></div>`).join("")}</dl>
  </section>
  <section class="pane">
    <h2>Regional kit: ${esc(kit.label)}</h2>
    <p class="quiet">${esc(kit.power)}.</p>
    <dl class="rule-list">${kit.rows.map(row => `<div><dt>${esc(row.topic)}</dt><dd>${esc(row.text)} <span class="fit-cite">${cites(row.cites)}</span></dd></div>`).join("")}</dl>
  </section>
  <section class="pane">
    <h2>Core design and building blocks</h2>
    <ul class="tick-list">${CORE_DESIGN.map(text => `<li>${esc(text)}</li>`).join("")}</ul>
    <div class="table-scroll"><table><thead><tr><th>Building block</th><th>Design</th><th>Source</th><th>Prove</th></tr></thead><tbody>${BUILDING_BLOCKS.map(row => `<tr><td><strong>${esc(row.label)}</strong></td><td>${esc(row.design)}</td><td>${esc(row.source)}</td><td>${esc(row.prove)}</td></tr>`).join("")}</tbody></table></div>
  </section>`;
}

function gateTrack(plan, program, selected) {
  const current = currentGate(plan.gates.map(row => row.payload), program);
  return `<ol class="gate-track">${GATES.map(def => {
    const gate = plan.gates[def.id].payload;
    const applies = gateApplies(def.id, program);
    return `<li><button type="button" data-gate="${def.id}" class="${selected === def.id ? "on" : ""} ${current.id === def.id ? "current" : ""}" aria-pressed="${selected === def.id}">
      <span class="gate-no">Gate ${def.id}${current.id === def.id ? " · current" : ""}</span><strong>${esc(def.short)}</strong>${applies ? statusTag(gate.status) : `<span class="state-tag sourced">Not in this pathway</span>`}
    </button></li>`;
  }).join("")}</ol>`;
}

function basisTab(ctx, program, gate0Passed) {
  const canPrepare = ctx.role === "nstt";
  const draft = ctx.ui.basisDraft || { basis: program.basis, pathway: program.pathway };
  const shown = normalizeProgram({ basis: draft.basis, pathway: draft.pathway });
  const { basis } = shown;
  const select = (name, label, rows, current, help = "") => `<label class="field">${esc(label)}<select name="${name}" data-basis-live>${options(rows.map(row => [row.id, row.label]), current)}</select>${help ? `<span class="field-example">${esc(help)}</span>` : ""}</label>`;
  return `${!ctx.plan.program ? `<p class="guide-banner">No program plan is saved for this project. ${canPrepare ? "Choose the design basis and save it to start the plan." : "The NSTT role starts the plan by saving the design basis."}</p>` : ""}
  <form id="basis-form" class="form pane">
    <h2>Design basis</h2>
    <fieldset ${canPrepare && !gate0Passed ? "" : "disabled"}><legend class="visually-hidden">Design basis</legend>
      <div class="grid-2">
        ${select("tenancy", "Who uses the site", TENANCY, basis.tenancy)}
        ${select("power", "How the site is powered", POWER, basis.power)}
        ${select("platform", "Chip platform", PLATFORMS, basis.platform)}
        ${select("region", "Region", REGIONS, basis.region)}
        ${select("customer", "End customer", CUSTOMER, basis.customer, "Record the confirmation only when it is held in writing.")}
        <label class="field">Pathway<select name="pathway" data-basis-live>${options(pathwaysFor(basis.power).map(row => [row.id, row.label]), shown.pathway)}</select><span class="field-example">The pathways offered follow the power arrangement.</span></label>
        <label class="field">Distribution voltage<input name="voltage" maxlength="40" value="${esc(basis.voltage)}" placeholder="480 V AC" /></label>
      </div>
      <label class="field">Note on the basis<textarea name="note" rows="2" maxlength="600">${esc(basis.note)}</textarea></label>
    </fieldset>
    ${gate0Passed ? `<p class="locked-note">The design basis is frozen at Gate 0. Reopen Gate 0 with a reason before changing it.</p>`
    : canPrepare ? `<div class="row-actions"><button class="primary" type="submit">Save the design basis</button></div>`
      : `<p class="locked-note">You read the plan as ${esc(roleName(ctx.role))}. The NSTT role prepares it.</p>`}
  </form>
  <div id="basis-preview">${drawBasisPreview(draft)}</div>`;
}

function gateDetail(ctx, program) {
  const { plan, role } = ctx;
  const gates = plan.gates.map(row => row.payload);
  const current = currentGate(gates, program);
  const id = Number.isInteger(ctx.ui.gate) && GATES[ctx.ui.gate] ? ctx.ui.gate : Math.max(0, current.id);
  const def = GATES[id];
  const record = plan.gates[id];
  const gate = record.payload;
  const applies = gateApplies(id, program);
  const prior = priorGate(id);
  const priorPassed = prior === null || gatePassed(gates[prior]);
  const passed = gatePassed(gate);
  const started = Boolean(plan.program);
  const canPrepare = role === "nstt" && !passed && applies && started;
  const canDecide = role === def.reviewer && gate.status === "Ready for decision";
  const canReopen = passed && ["nstt", def.reviewer].includes(role);
  const items = [...gate.openItems, { text: "", owner: "", due: "", closed: false }, { text: "", owner: "", due: "", closed: false }];
  const lines = plan.selections.map(row => row.payload);
  const stopped = id === 1 ? lines.filter(line => stopSigns(line).length) : [];
  const moved = id === 1 && gate.decision?.at ? lines.filter(line => line.primaryChangedAt && line.primaryChangedAt > gate.decision.at) : [];
  return `${gateTrack(plan, program, id)}
  <section class="pane gate-detail" data-gate-detail="${id}" data-version="${record.version}">
    <div class="section-heading"><h2>${esc(def.label)}</h2>${applies ? statusTag(gate.status) : `<span class="state-tag sourced">Not in this pathway</span>`}</div>
    <dl class="record-facts">
      <div><dt>Decision</dt><dd>${esc(def.decision)}</dd></div>
      <div><dt>Sign-off party</dt><dd>${esc(def.signoff)}</dd></div>
      <div><dt>Recorded in the workbench by</dt><dd>${esc(roleName(def.reviewer))} role, after ${prior === null ? "the evidence is held" : `${esc(GATES[prior].label.split(".")[0])} is passed`}</dd></div>
      <div><dt>Prepared</dt><dd>${gate.preparedAt ? `${esc(dateText(gate.preparedAt))} by the NSTT role` : "Not prepared yet"}</dd></div>
    </dl>
    ${!applies ? `<p class="locked-note">Gate 5 applies only when a grid tie is part of the pathway. This plan follows Pathway 1, an islanded plant.</p>` : ""}
    ${!started ? `<p class="locked-note">Save the design basis before preparing a gate.</p>` : ""}
    ${gate.decision ? `<p class="ok"><strong>${esc(gate.decision.result)}.</strong> Recorded by the ${esc(roleName(gate.decision.role))} role on ${esc(dateText(gate.decision.at))}. Signed decision: ${esc(gate.decision.signoffRef)}.${gate.decision.condition ? ` Condition: ${esc(gate.decision.condition)}` : ""}${gate.decision.note ? ` Note: ${esc(gate.decision.note)}` : ""}</p>` : ""}
    ${stopped.length ? `<p class="block">Gate 1 cannot pass while a stop sign is recorded on ${esc(stopped.map(line => line.id).join(", "))}. Resolve each one in the sourcing workflow.</p>` : ""}
    ${moved.length ? `<p class="block" role="status">The primary part on ${esc(moved.map(line => line.id).join(", "))} changed after this gate was decided. Reopen Gate 1 so the change is reviewed before purchase.</p>` : ""}
    <form id="gate-form" class="form" data-gate="${id}">
      <fieldset ${canPrepare ? "" : "disabled"}><legend>Evidence this gate needs</legend>
        <div class="evidence-rows">${def.evidence.map((label, index) => `<div class="evidence-row">
          <p><strong>${esc(label)}</strong></p>
          <label class="field">Status<select name="evidence.${index}.state">${options(EVIDENCE_STATES, gate.evidence[index].state, "Not reviewed")}</select></label>
          <label class="field">Reference or reason<input name="evidence.${index}.note" maxlength="400" value="${esc(gate.evidence[index].note)}" placeholder="Document name and date" /></label>
        </div>`).join("")}</div>
      </fieldset>
      <fieldset ${canPrepare ? "" : "disabled"}><legend>Open items</legend>
        <p class="quiet">Missing evidence holds the gate. Log each gap with an owner and a due date.</p>
        <div class="evidence-rows">${items.map((item, index) => `<div class="item-row">
          <label class="field">Open item<input name="item.${index}.text" maxlength="300" value="${esc(item.text)}" ${index >= gate.openItems.length ? 'placeholder="Add an open item"' : ""} /></label>
          <label class="field">Owner<select name="item.${index}.owner">${options(OPEN_ITEM_OWNERS, item.owner, "Choose")}</select></label>
          <label class="field">Due<input name="item.${index}.due" type="date" value="${esc(item.due)}" /></label>
          <label class="check"><input type="checkbox" name="item.${index}.closed" ${item.closed ? "checked" : ""} />Closed</label>
        </div>`).join("")}</div>
      </fieldset>
      ${canPrepare ? `<div class="row-actions"><button type="submit" name="action" value="save">Save evidence</button><button type="submit" name="action" value="hold">Record a hold</button><button class="primary" type="submit" name="action" value="ready">Ready for decision</button></div>`
    : passed || !applies || !started ? "" : `<p class="locked-note">The NSTT role prepares the evidence. You read it as ${esc(roleName(role))}.</p>`}
    </form>
    ${canDecide ? (gate.preparedByYou
    ? `<p class="locked-note">You prepared this gate. Another person in the ${esc(roleName(def.reviewer))} role records the decision.</p>`
    : `<form id="gate-decision-form" class="form decision-box" data-gate="${id}">
        <h3>Record the decision</h3>
        ${priorPassed ? "" : `<p class="block">${esc(GATES[prior].label)} must be passed before this gate can pass. You can still return this gate to preparation.</p>`}
        <div class="grid-2">
          <label class="field">Result<select name="result">${options(GATE_RESULTS, "Passed")}</select></label>
          <label class="field">Reference of the signed decision<input name="signoffRef" maxlength="200" placeholder="${esc(def.signoff)} decision memo, with its date" /><span class="field-example">Sign-off party: ${esc(def.signoff)}. Record where the signed decision is filed.</span></label>
        </div>
        <label class="field">Condition (for Passed with conditions)<textarea name="condition" rows="2" maxlength="600"></textarea></label>
        <label class="field">Note, or the reason for a return<textarea name="note" rows="2" maxlength="600"></textarea></label>
        <div class="row-actions"><button class="primary" type="submit" name="action" value="decide">Record the decision</button><button type="submit" name="action" value="return">Return to preparation</button></div>
      </form>`) : ""}
    ${gate.status === "Ready for decision" && !canDecide ? `<p class="locked-note">This gate waits for the ${esc(roleName(def.reviewer))} role to record the decision.</p>` : ""}
    ${canReopen ? `<form id="gate-reopen-form" class="form decision-box" data-gate="${id}">
      <h3>Reopen this gate</h3>
      <label class="field">The change that reopens the gate<textarea name="note" rows="2" required minlength="8" maxlength="600"></textarea><span class="field-example">A new factory, engine variant, controller, tenant, or power arrangement reopens the gate that covered it. The earlier decision stays in the history.</span></label>
      <div class="row-actions"><button type="submit">Reopen the gate</button></div>
    </form>` : ""}
    ${history(gate.log, "Gate history", row => `<strong>${esc(GATE_ACTION[row.action] || row.action)}.</strong> ${esc(row.note)}`)}
  </section>
  <section class="pane"><h2>Gate rules</h2><ul class="plain-list">${GATE_RULES.map(row => `<li><strong>${esc(row.label)}</strong> ${esc(row.text)}</li>`).join("")}</ul></section>`;
}

const lock = (canPrepare, role, started) => !started
  ? `<p class="locked-note">Save the design basis first. The other sections open once the plan exists.</p>`
  : canPrepare ? "" : `<p class="locked-note">You read the plan as ${esc(roleName(role))}. The NSTT role prepares it.</p>`;

function decisionsTab(ctx, program) {
  const started = Boolean(ctx.plan.program);
  const canPrepare = ctx.role === "nstt" && started;
  return `<form id="decisions-form" class="form pane">
    <h2>Decisions to make now</h2>
    ${lock(canPrepare, ctx.role, started)}
    <fieldset ${canPrepare ? "" : "disabled"}><legend class="visually-hidden">Decisions</legend>
      ${DECISIONS.map((row, index) => {
    const saved = program.decisions[row.id];
    return `<article class="plan-row">
          <div class="plan-what"><h3>${index + 1}. ${esc(row.label)} ${statusTag(saved.status)}</h3><p><strong>Recommended position.</strong> ${esc(row.position)}</p><p class="quiet">Decided by: ${esc(row.who)}. When: ${esc(row.when)}.</p></div>
          <div class="plan-entry">
            <div class="grid-2">
              <label class="field">Status<select name="decision.${row.id}.status">${options(DECISION_STATES, saved.status)}</select></label>
              <label class="field">Decided on<input type="date" name="decision.${row.id}.decidedOn" value="${esc(saved.decidedOn)}" max="${latestDay()}" /></label>
            </div>
            <label class="field">Position taken<textarea name="decision.${row.id}.position" rows="2" maxlength="800">${esc(saved.position)}</textarea></label>
            <label class="field">Note<input name="decision.${row.id}.note" maxlength="600" value="${esc(saved.note)}" /></label>
          </div>
        </article>`;
  }).join("")}
    </fieldset>
    ${canPrepare ? `<div class="row-actions"><button class="primary" type="submit">Save decisions</button></div>` : ""}
  </form>
  <form id="actions-form" class="form pane">
    <h2>First 90 days</h2>
    <fieldset ${canPrepare ? "" : "disabled"}><legend class="visually-hidden">Actions</legend>
      ${ACTIONS_90.map(block => `<h3 class="plan-block">${esc(block.block)}</h3>${block.items.map(row => {
    const saved = program.actions[row.id];
    return `<div class="action-row">
            <p>${esc(row.text)}</p>
            <label class="field">Status<select name="action.${row.id}.status">${options(ACTION_STATES, saved.status)}</select></label>
            <label class="field">Due<input type="date" name="action.${row.id}.due" value="${esc(saved.due)}" /></label>
            <label class="field">Note<input name="action.${row.id}.note" maxlength="400" value="${esc(saved.note)}" /></label>
          </div>`;
  }).join("")}`).join("")}
    </fieldset>
    ${canPrepare ? `<div class="row-actions"><button class="primary" type="submit">Save actions</button></div>` : ""}
  </form>`;
}

function considerationsTab(ctx, program) {
  const started = Boolean(ctx.plan.program);
  const canPrepare = ctx.role === "nstt" && started;
  return `<form id="considerations-form" class="form pane">
    <h2>Ten design considerations</h2>
    <p class="guide-banner">${esc(DESIGN_RULE)}</p>
    ${lock(canPrepare, ctx.role, started)}
    <fieldset ${canPrepare ? "" : "disabled"}><legend class="visually-hidden">Design considerations</legend>
      ${CONSIDERATIONS.map((row, index) => {
    const saved = program.considerations[row.id];
    return `<article class="plan-row">
          <div class="plan-what"><h3>${index + 1}. ${esc(row.label)} ${statusTag(saved.status)}</h3><p><strong>Why it matters.</strong> ${esc(row.why)}</p><p><strong>Require.</strong> ${esc(row.require)}</p><p class="fit-cite">${sourceLink(row.cite)}</p></div>
          <div class="plan-entry">
            <label class="field">Status<select name="consideration.${row.id}.status">${options(CONSIDERATION_STATES, saved.status)}</select></label>
            <label class="field">Evidence held, or the reason it does not apply<textarea name="consideration.${row.id}.note" rows="2" maxlength="600">${esc(saved.note)}</textarea></label>
          </div>
        </article>`;
  }).join("")}
    </fieldset>
    ${canPrepare ? `<div class="row-actions"><button class="primary" type="submit">Save design considerations</button></div>` : ""}
  </form>
  <section class="pane">
    <h2>Device tiers and the proof each one needs</h2>
    <p class="quiet">${esc(TIER_RULE)}</p>
    <div class="tier-cards">${DEVICE_TIERS.map(row => `<article><h3>${esc(row.id)}. ${esc(row.label)}</h3><p>${esc(row.what)}</p><p class="quiet">${esc(row.examples)}</p><ul class="tick-list">${row.proof.map(text => `<li>${esc(text)}</li>`).join("")}</ul></article>`).join("")}</div>
  </section>`;
}

function risksTab(ctx, program) {
  const started = Boolean(ctx.plan.program);
  const canPrepare = ctx.role === "nstt" && started;
  const rating = (row) => program.risks[row.id].rating || defaultRiskRating(row.id, program.basis);
  return `<section class="pane">
    <h2>Risk register at a glance</h2>
    <div class="risk-strip">${RISK_ROWS.map((row, index) => `<div class="risk-cell ${rating(row).toLowerCase()}"><span>${index + 1}</span><strong>${esc(row.label)}</strong>${pill(rating(row))}</div>`).join("")}</div>
    <dl class="rating-key">${RATINGS.map(level => `<div><dt>${pill(level)}</dt><dd>${esc(RATING_MEANING[level])}</dd></div>`).join("")}</dl>
    <p class="quiet">A missing fact lowers confidence. It does not raise a rating. Red is kept for a confirmed critical barrier.</p>
  </section>
  <form id="risks-form" class="form pane">
    <h2>Ten risks, with the open fact and the action</h2>
    ${lock(canPrepare, ctx.role, started)}
    <fieldset ${canPrepare ? "" : "disabled"}><legend class="visually-hidden">Risk register</legend>
      ${RISK_ROWS.map((row, index) => {
    const saved = program.risks[row.id];
    const base = defaultRiskRating(row.id, program.basis);
    return `<article class="plan-row">
          <div class="plan-what"><h3>${index + 1}. ${esc(row.label)} ${pill(rating(row))}</h3><p>${esc(row.why)}</p>
            <p class="quiet">Guide rating for this basis: ${esc(base)}.${row.ratingNote ? ` ${esc(row.ratingNote)}` : ""}</p>
            <p class="quiet">Open fact in the guide: ${esc(row.openFact)} Action in the guide: ${esc(row.action)}</p></div>
          <div class="plan-entry">
            <label class="field">Rating<select name="risk.${row.id}.rating">${options(RATINGS, saved.rating, `Guide rating (${base})`)}</select></label>
            <label class="field">Open fact now<input name="risk.${row.id}.openFact" maxlength="500" value="${esc(saved.openFact)}" /></label>
            <label class="field">Action now<input name="risk.${row.id}.action" maxlength="500" value="${esc(saved.action)}" /></label>
            <label class="field">Note<input name="risk.${row.id}.note" maxlength="600" value="${esc(saved.note)}" /><span class="field-example">Red needs a note that states the confirmed barrier.</span></label>
          </div>
        </article>`;
  }).join("")}
    </fieldset>
    ${canPrepare ? `<div class="row-actions"><button class="primary" type="submit">Save the risk register</button></div>` : ""}
  </form>
  <section class="pane"><h2>Changes that trigger an update</h2><ul class="plain-list">${UPDATE_TRIGGERS.map(row => `<li>${esc(row.text)}</li>`).join("")}</ul><p class="quiet">The regulatory watch reads the public sources for these changes every day.</p></section>`;
}

// A dated list of project milestones and public rule dates, with today marked.
export function drawTimeline(rows, day = today()) {
  if (!rows.length) return `<p class="quiet">No dated milestone is recorded yet.</p>`;
  let marked = false;
  const mark = () => { marked = true; return `<li class="tl-today"><span>Today, ${esc(dayText(day))}</span></li>`; };
  return `<ol class="timeline">${rows.map(row => `${!marked && row.date >= day ? mark() : ""}<li class="tl-${row.kind === "project" ? "project" : "rule"} ${row.date < day ? "past" : ""}">
    <span class="tl-date">${esc(dayText(row.date))}${row.approx ? " (calculated)" : ""}</span>
    <span class="tl-text"><strong>${row.kind === "project" ? "Project milestone" : "Public rule date"}.</strong> ${esc(row.label)}${row.cite?.label ? ` <span class="fit-cite">${sourceLink(row.cite)}</span>` : ""}</span>
  </li>`).join("")}${marked ? "" : mark()}</ol>`;
}

function milestonesTab(ctx, program) {
  const started = Boolean(ctx.plan.program);
  const canPrepare = ctx.role === "nstt" && started;
  const custom = program.milestones.filter(row => !DEFAULT_MILESTONES.some(item => item.id === row.id));
  const extra = [...custom, { id: "", label: "", date: "" }, { id: "", label: "", date: "" }];
  return `<form id="milestones-form" class="form pane">
    <h2>Project milestones</h2>
    ${lock(canPrepare, ctx.role, started)}
    <fieldset ${canPrepare ? "" : "disabled"}><legend class="visually-hidden">Milestones</legend>
      <div class="grid-2">${DEFAULT_MILESTONES.map(row => `<label class="field">${esc(row.label)}<input type="date" name="milestone.${row.id}" value="${esc(program.milestones.find(item => item.id === row.id)?.date || "")}" /></label>`).join("")}</div>
      <h3 class="plan-block">Other milestones</h3>
      ${extra.map((row, index) => `<div class="milestone-row"><input type="hidden" name="custom.${index}.id" value="${esc(row.id)}" />
        <label class="field">Milestone<input name="custom.${index}.label" maxlength="120" value="${esc(row.label)}" ${row.id ? "" : 'placeholder="Add a milestone"'} /></label>
        <label class="field">Date<input type="date" name="custom.${index}.date" value="${esc(row.date)}" /></label></div>`).join("")}
      <p class="quiet">Clear the name of a milestone to remove it.</p>
    </fieldset>
    ${canPrepare ? `<div class="row-actions"><button class="primary" type="submit">Save milestones</button></div>` : ""}
  </form>
  <section class="pane"><h2>Timeline</h2><p class="quiet">Project milestones sit beside the public rule dates for ${esc(labelOf(REGIONS, program.basis.region))}.</p>${drawTimeline(timelineRows(program))}</section>`;
}

function rolesTab(ctx) {
  return `<section class="pane">
    <h2>Standard workflow for each role</h2>
    <p class="quiet">Each role has one job on every screen. The reviewer is never the person who prepared the work.</p>
    <div class="role-cards">${ROLE_WORKFLOWS.map(row => {
    const fields = roleFields(row.role);
    return `<article class="${row.role === ctx.role ? "on" : ""}">
        <h3>${esc(row.label)}${row.role === ctx.role ? ` <span class="state-tag confirmed">Your role</span>` : ""}</h3>
        <p>${esc(row.summary)}</p>
        <ol>${row.steps.map(step => `<li><strong>${esc(step.area)}.</strong> ${esc(step.text)}</li>`).join("")}</ol>
        ${fields.vendor.length || fields.part.length ? `<p class="role-fields"><strong>Vendor fields this role confirms or changes:</strong> ${esc(fields.vendor.join(", ") || "None")}.</p><p class="role-fields"><strong>Part fields:</strong> ${esc(fields.part.join(", ") || "None")}.</p>` : `<p class="role-fields">This role reads every field and changes none.</p>`}
      </article>`;
  }).join("")}</div>
  </section>
  <section class="pane">
    <h2>Delivery team in the guide</h2>
    <div class="role-cards">${DELIVERY_ROLES.map(group => `<article><h3>${esc(group.group)}</h3>${group.note ? `<p class="quiet">${esc(group.note)}</p>` : ""}<ul class="plain-list">${group.roles.map(row => `<li><strong>${esc(row.label)}.</strong> ${esc(row.does)}</li>`).join("")}</ul></article>`).join("")}</div>
    <h3>How to select the delivery team</h3>
    <p>${esc(SELECTION_RULE)}</p>
    <ul class="plain-list">${SELECTION_CRITERIA.map(row => `<li><strong>${esc(row.label)}.</strong> ${esc(row.text)}</li>`).join("")}</ul>
  </section>`;
}

export function drawProgram(ctx) {
  if (ctx.error || !ctx.plan) return stateMessage(ctx, "plan");
  const { plan, ui } = ctx;
  const program = normalizeProgram(plan.program?.payload);
  const gates = plan.gates.map(row => row.payload);
  const design = referenceDesign(program.basis);
  const current = currentGate(gates, program);
  const tab = PROGRAM_TABS.some(([id]) => id === ui.programTab) ? ui.programTab : "basis";
  const lastLog = plan.program?.payload.log.at(-1);
  const body = {
    basis: () => basisTab(ctx, program, gatePassed(gates[0])),
    gates: () => gateDetail(ctx, program),
    decisions: () => decisionsTab(ctx, program),
    considerations: () => considerationsTab(ctx, program),
    risks: () => risksTab(ctx, program),
    milestones: () => milestonesTab(ctx, program),
    roles: () => rolesTab(ctx),
  };
  const openItems = gates.reduce((sum, gate) => sum + gate.openItems.filter(item => !item.closed).length, 0);
  return `<section class="plan-summary">
    <div class="plan-design"><span class="design-letter" aria-hidden="true">${plan.program ? design : "?"}</span><div>
      <p class="kicker">${esc(ctx.projectName)}${plan.practice ? " · practice copy" : ""}</p>
      <strong>${plan.program ? `Design ${design}. ${esc(REFERENCE_DESIGNS[design].label)}` : "No design basis saved"}</strong>
      <span class="quiet">${plan.program ? `${esc(labelOf(REGIONS, program.basis.region))} · ${esc(POWER.find(row => row.id === program.basis.power).short)} · ${esc(labelOf(PLATFORMS, program.basis.platform))} · Pathway ${program.pathway}` : "Start with the design basis."}</span>
    </div></div>
    <div class="plan-facts">
      <div><span class="label">Current gate</span><strong>${current.id < 0 ? "All gates passed" : `Gate ${current.id}. ${esc(current.short)}`}</strong><span class="quiet">${esc(current.status)}</span></div>
      <div><span class="label">Open gate items</span><strong>${openItems}</strong></div>
      <div><span class="label">Saved</span><strong>${plan.program ? `Version ${plan.program.version}` : "Not saved"}</strong><span class="quiet">${plan.program ? `${esc(dateText(plan.program.savedAt))}${lastLog ? `, ${esc(roleName(lastLog.role))} role` : ""}` : ""}</span></div>
    </div>
  </section>
  <div class="status-filters plan-tabs" role="group" aria-label="Program plan sections">${PROGRAM_TABS.map(([id, label]) => `<button type="button" data-program-tab="${id}" aria-pressed="${tab === id}">${esc(label)}</button>`).join("")}</div>
  <div class="plan-body" data-program-panel="${tab}">${body[tab]()}</div>
  ${history(plan.program?.payload.log, "Plan history", row => `<strong>${esc(SECTION_LABEL[row.section] || row.section)}.</strong> ${esc(row.summary)}`)}`;
}

// ---------- Sourcing workflow ----------

// A draft keeps the choices coherent: the category belongs to the subsystem and each part belongs where it is used.
export function settleDraft(input, catalog) {
  const line = normalizeSelection(input);
  const subsystem = subsystemOf(line.subsystem) || SUBSYSTEMS[0];
  const categories = CATEGORIES.filter(row => row.subsystem === subsystem.id);
  const category = categories.find(row => row.id === line.category) || categories[0];
  const primary = catalog.parts.find(part => part.id === line.primary && part.category === category.id);
  const alternate = catalog.parts.find(part => part.id === line.alternate && categoryOf(part.category)?.subsystem === subsystem.id && part.id !== primary?.id);
  return normalizeSelection({ ...line, subsystem: subsystem.id, category: category.id, primary: primary?.id || "", alternate: alternate?.id || "", checklist: input?.subsystem === subsystem.id ? line.checklist : [] });
}

function lineSummary(row, catalog, context) {
  const line = row.payload;
  const result = lineBenchmark(line, catalog, context);
  const recheck = lineRecheck(line, catalog, context);
  return `<span class="pills">${statusTag(line.status)}${result ? pill(result.posture) : ""}${stopSigns(line).length ? `<span class="pill red">Stop sign</span>` : ""}${recheck.length ? `<span class="pill orange">Recheck needed</span>` : ""}</span>`;
}

function lineEditor(ctx, context) {
  const { plan, catalog, role, ui } = ctx;
  const record = plan.selections.find(row => row.id === ui.line) || null;
  const isNew = ui.line === "new";
  if (!record && !isNew) {
    return `<div class="pane line-editor"><h2>Choose a line</h2><p class="quiet">Choose a sourcing line from the list${role === "nstt" ? ", or add a line under a subsystem" : ""}. Each line walks one part from design fit to a primary and an alternate source.</p>
      <ol class="steps-picture"><li><strong>1. Design fit</strong><span>Subsystem, part type, and device tier.</span></li><li><strong>2. Primary</strong><span>Vendor and part, benchmarked against the rules.</span></li><li><strong>3. Alternate</strong><span>A second source from a different ultimate parent.</span></li><li><strong>4. Confirm</strong><span>Checklist, contract terms, and stop signs.</span></li><li><strong>5. Review</strong><span>CPI or Trade approves or returns the line.</span></li></ol></div>`;
  }
  const saved = record ? record.payload : normalizeSelection({ subsystem: ui.newSubsystem || SUBSYSTEMS[0].id });
  const editable = role === "nstt" && (isNew || ["Draft", "Returned"].includes(saved.status));
  const base = editable && ui.lineDraft && ui.lineDraft.id === (record?.id || "new") ? { ...saved, ...ui.lineDraft } : saved;
  const line = editable ? settleDraft(base, catalog) : saved;
  const subsystem = subsystemOf(line.subsystem);
  const category = categoryOf(line.category);
  const primary = catalog.parts.find(part => part.id === line.primary) || null;
  const result = primary ? lineBenchmark(line, catalog, context) : null;
  const block = primary ? selectionSubmitBlock(line, catalog) : "Choose the primary part first.";
  const recheck = record ? lineRecheck(saved, catalog, context) : [];
  const gate1 = plan.gates[1].payload;
  const moved = Boolean(record && gate1.decision?.at && saved.primaryChangedAt && saved.primaryChangedAt > gate1.decision.at);
  const inCategory = catalog.parts.filter(part => part.category === line.category).sort((a, b) => partName(catalog, a.id).localeCompare(partName(catalog, b.id)));
  const inSubsystem = catalog.parts.filter(part => categoryOf(part.category)?.subsystem === line.subsystem && part.id !== line.primary).sort((a, b) => partName(catalog, a.id).localeCompare(partName(catalog, b.id)));
  const blocks = BUILDING_BLOCKS.filter(row => (row.subsystems || []).includes(line.subsystem));
  const reviewer = saved.reviewerRole;
  const canReview = saved.status === "In review" && role === reviewer;
  const canReopen = (saved.status === "Approved" && ["nstt", reviewer].includes(role)) || (saved.status === "In review" && role === "nstt");
  return `<div class="pane line-editor" data-line-id="${esc(record?.id || "")}" data-version="${record?.version || 0}">
    <div class="section-heading"><h2>${isNew ? "New sourcing line" : `${esc(saved.id)} · ${esc(subsystem?.label || "")}`}</h2>${statusTag(isNew ? "Draft" : saved.status)}</div>
    ${saved.status === "Approved" && saved.decision ? `<p class="ok">Approved by the ${esc(roleName(saved.decision.role))} role on ${esc(dateText(saved.decision.at))} at an indicated posture of ${esc(saved.decision.snapshot?.posture || "its recorded posture")}, confidence ${esc(saved.decision.snapshot?.confidence || "not recorded")}.${saved.decision.note ? ` ${esc(saved.decision.note)}` : ""} The approval keeps the benchmark it was decided on.</p>` : ""}
    ${saved.status === "In review" ? `<p class="guide-banner">This line is with the ${esc(roleName(reviewer))} role for review. It was sent ${esc(dateText(saved.submitted?.at))} at an indicated posture of ${esc(saved.submitted?.posture || "")}.</p>` : ""}
    ${saved.status === "Returned" ? `<p class="block">The ${esc(roleName(reviewer))} role returned this line. ${esc(saved.log.filter(row => row.action === "return").at(-1)?.note || "")}</p>` : ""}
    ${recheck.length ? `<div class="recheck-box" role="status"><h3>Recheck needed</h3><ul>${recheck.map(text => `<li>${esc(text)}</li>`).join("")}</ul><p class="quiet">${saved.status === "Approved" ? "The decision on this line stays as recorded. Reopen the line when the change calls for a new decision." : saved.status === "In review" ? "The reviewer weighs this change before the decision is recorded." : "The owning role clears the recheck in the repository. Read the benchmark again before this line goes to review."}</p></div>` : ""}
    ${moved ? `<p class="block" role="status">The primary part changed after Gate 1 was decided. Reopen Gate 1 so the change is reviewed before purchase. <button type="button" class="text-button" data-open-gate="1">Open Gate 1</button></p>` : ""}
    <form id="selection-form" class="form">
      <fieldset ${editable ? "" : "disabled"}><legend>1. Design fit</legend>
        <div class="grid-2">
          <label class="field">Subsystem<select name="subsystem" data-line-live>${options(SUBSYSTEMS.map(row => [row.id, row.label]), line.subsystem)}</select></label>
          <label class="field">Part type<select name="category" data-line-live>${options(CATEGORIES.filter(row => row.subsystem === line.subsystem).map(row => [row.id, row.label]), line.category)}</select></label>
        </div>
        <p class="quiet">${esc(subsystem?.why || "")} Device tier for this part type: Tier ${esc(category?.tier ?? "")}.${category?.tierNote ? ` ${esc(category.tierNote)}` : ""}</p>
        ${blocks.length ? `<ul class="plain-list">${blocks.map(row => `<li><strong>${esc(row.label)}.</strong> Design: ${esc(row.design)}. Source: ${esc(row.source)}. Prove: ${esc(row.prove)}.</li>`).join("")}</ul>` : ""}
      </fieldset>
      <fieldset ${editable ? "" : "disabled"}><legend>2. Primary vendor and part</legend>
        <label class="field">Primary part<select name="primary" data-line-live>${options(inCategory.map(part => [part.id, partName(catalog, part.id)]), line.primary, inCategory.length ? "Choose from the repository" : "No part of this type is in the repository")}</select><span class="field-example">Add a new vendor or part in the repository first. The owning roles confirm its facts there.</span></label>
        <div class="check-set"><p class="check-title">Proof held for this line</p>${HELD_FLAGS.map(row => `<label class="check"><input type="checkbox" name="held.${row.id}" data-line-live ${line.held[row.id] ? "checked" : ""} /><span><strong>${esc(row.label)}.</strong> ${esc(row.help)}</span></label>`).join("")}</div>
      </fieldset>
      ${primary ? `<div class="line-benchmark"><div class="section-heading"><h3>Benchmark of the primary part</h3><button type="button" class="text-button" data-repo-open="${esc(primary.id)}" data-repo-kind="parts">Open in the repository</button></div>${drawBenchmark(result, { analysis: primary.analysis, context })}</div>` : `<p class="quiet">Choose the primary part to see its posture, the rule behind each result, and its fit against the design basis.</p>`}
      <fieldset ${editable ? "" : "disabled"}><legend>3. Alternate vendor and part</legend>
        ${primary ? `<h3 class="plan-block">Recommended alternates</h3>${alternateRows(primary, catalog, context, { pick: editable, current: line.alternate })}` : ""}
        <div class="grid-2">
          <label class="field">Alternate part<select name="alternate" data-line-live>${options(inSubsystem.map(part => [part.id, `${partName(catalog, part.id)} (${categoryOf(part.category)?.label || ""})`]), line.alternate, "No alternate named")}</select></label>
          <label class="field">Reason when no alternate is available<input name="noAlternateReason" maxlength="400" value="${esc(line.noAlternateReason)}" /></label>
        </div>
      </fieldset>
      <fieldset ${editable ? "" : "disabled"}><legend>4. Confirm before purchase</legend>
        <div class="evidence-rows">${(subsystem?.confirm || []).map((label, index) => `<div class="evidence-row">
          <p><strong>${esc(label)}</strong></p>
          <label class="field">Status<select name="check.${index}.state">${options(CHECK_STATES, line.checklist[index]?.state || "Open")}</select></label>
          <label class="field">Reference or reason<input name="check.${index}.note" maxlength="300" value="${esc(line.checklist[index]?.note || "")}" /></label>
        </div>`).join("")}</div>
        <h3 class="plan-block">Contract terms</h3>
        <div class="term-rows">${CONTRACT_TERMS.map(row => `<label class="field term"><span><strong>${esc(row.label)}.</strong> ${esc(row.text)}</span><select name="term.${row.id}">${options(TERM_STATES, line.terms[row.id])}</select></label>`).join("")}</div>
        <h3 class="plan-block">Stop signs</h3>
        <p class="quiet">Any stop sign pauses the purchase. A line with a stop sign cannot go to review, and Gate 1 cannot pass.</p>
        <div class="check-set">${STOP_SIGNS.map(row => `<label class="check"><input type="checkbox" name="stop.${row.id}" data-line-live ${line.stops[row.id] ? "checked" : ""} />${esc(row.text)}</label>`).join("")}</div>
        <label class="field">What was observed<textarea name="stopNote" rows="2" maxlength="400">${esc(line.stopNote)}</textarea></label>
      </fieldset>
      <fieldset ${editable ? "" : "disabled"}><legend>5. Send to review</legend>
        <label class="field">Note for the reviewer<textarea name="note" rows="2" maxlength="600">${esc(line.note)}</textarea></label>
        ${editable ? `<p class="${block ? "locked-note" : "ok"}">${block ? esc(block) : `This line is ready for review. ${result?.tradeFlag ? "A trade rule applies, so Trade reviews it." : "No trade rule applies, so CPI reviews it."}${result?.posture === "Red" ? " The indicated posture is Red, so the line cannot go to review until the facts or the part change." : ""}`}</p>` : ""}
      </fieldset>
      ${editable ? `<div class="row-actions"><button type="submit" name="action" value="save">Save the line</button><button class="primary" type="submit" name="action" value="submit">Save and send to review</button>${isNew ? `<button type="button" data-line="">Cancel</button>` : ""}</div>`
    : role === "nstt" ? "" : `<p class="locked-note">The NSTT role prepares sourcing lines. You read this line as ${esc(roleName(role))}.</p>`}
    </form>
    ${canReview ? (saved.preparedByYou
    ? `<p class="locked-note">You prepared this line. Another person in the ${esc(roleName(reviewer))} role reviews it.</p>`
    : `<form id="selection-review-form" class="form decision-box">
        <h3>Review this line as ${esc(roleName(reviewer))}</h3>
        <p class="quiet">Approval records the benchmark shown above. An Orange line needs a note that states the mitigation and its conditions. A return needs the reason.</p>
        <label class="field">Decision note<textarea name="note" rows="2" maxlength="600"></textarea></label>
        <div class="row-actions"><button class="primary" type="submit" name="action" value="approve">Approve the line</button><button type="submit" name="action" value="return">Return to NSTT</button></div>
      </form>`) : ""}
    ${canReopen ? `<form id="selection-reopen-form" class="form decision-box">
      <h3>${saved.status === "In review" ? "Withdraw from review" : "Reopen this line"}</h3>
      <label class="field">${saved.status === "In review" ? "The reason for the withdrawal" : "The change that reopens the line"}<textarea name="note" rows="2" required minlength="8" maxlength="600"></textarea><span class="field-example">${saved.status === "In review" ? "One full sentence. The line returns to draft and the reason stays in the history." : "One full sentence. The earlier decision stays in the history."}</span></label>
      <div class="row-actions"><button type="submit">${saved.status === "In review" ? "Withdraw the line" : "Reopen the line"}</button></div>
    </form>` : ""}
    ${history(saved.log, "Line history", row => `<strong>${esc(LINE_ACTION[row.action] || row.action)}.</strong> ${esc(row.note)}`)}
  </div>`;
}

export function drawSourcing(ctx) {
  if (ctx.error || !ctx.plan) return stateMessage(ctx, "plan");
  if (ctx.catalogError || !ctx.catalog) return stateMessage({ error: ctx.catalogError, loading: true }, "catalog");
  const { plan, catalog, role, ui } = ctx;
  const context = designContext(plan.program?.payload);
  const lines = plan.selections.map(row => row.payload);
  const coverage = sourcingCoverage(lines);
  const gate1 = plan.gates[1].payload;
  const started = Boolean(plan.program);
  const dot = (on, label) => `<span class="cov-dot ${on ? "on" : ""}">${esc(label)}<span class="visually-hidden">: ${on ? "yes" : "no"}</span></span>`;
  return `<section class="coverage">
    <div class="metrics cov-metrics">
      <div class="metric"><strong>${coverage.withPrimary} of ${coverage.subsystems}</strong><span>Subsystems with a primary part</span></div>
      <div class="metric"><strong>${coverage.withAlternate} of ${coverage.subsystems}</strong><span>Subsystems with an alternate</span></div>
      <div class="metric"><strong>${coverage.approved} of ${coverage.subsystems}</strong><span>Subsystems with an approved line</span></div>
      <div class="metric"><strong>${coverage.inReview}</strong><span>Lines in review${coverage.stopped ? ` · ${plural(coverage.stopped, "stop sign")}` : ""}</span></div>
    </div>
    <div class="cov-board" aria-label="Coverage by subsystem">${SUBSYSTEMS.map(row => {
    const own = lines.filter(line => line.subsystem === row.id);
    return `<div class="cov-tile"><strong>${esc(row.label)}</strong><span class="quiet">Tier${/and|,/.test(row.tiers) ? "s" : ""} ${esc(row.tiers)}</span><span class="cov-dots">${dot(own.some(line => line.primary), "Primary")}${dot(own.some(line => line.alternate), "Alternate")}${dot(own.some(line => line.status === "Approved"), "Approved")}</span></div>`;
  }).join("")}</div>
    <p class="quiet cov-key">A mark turns green when the subsystem has a primary part named, an alternate named, and an approved line. Gate 1, before purchase, is ${esc(gate1.status.toLowerCase())}. Design basis: ${esc(labelOf(REGIONS, context.region))}, Design ${esc(context.design)}, ${esc(POWER.find(row => row.id === context.power).short.toLowerCase())}.</p>
  </section>
  ${started ? "" : `<p class="guide-banner">Save the design basis in Program plan before adding sourcing lines. The benchmark uses the basis to judge fit. <button type="button" class="text-button" data-open="program">Open Program plan</button></p>`}
  <div class="split line-split">
    <div class="list" id="line-list" aria-label="Sourcing lines by subsystem">${SUBSYSTEMS.map(row => {
    const own = plan.selections.filter(item => item.payload.subsystem === row.id);
    return `<p class="list-group">${esc(row.label)}</p>
        ${own.map(item => `<button type="button" class="item ${ui.line === item.id ? "on" : ""}" data-line="${esc(item.id)}" ${ui.line === item.id ? 'aria-current="true"' : ""}>
          <strong>${esc(item.id)} · ${esc(partName(catalog, item.payload.primary) || "Primary not chosen")}</strong>
          <small>${item.payload.alternate ? `Alternate: ${esc(partName(catalog, item.payload.alternate))}` : "No alternate named"}</small>${lineSummary(item, catalog, context)}
        </button>`).join("")}
        ${role === "nstt" && started ? `<button type="button" class="text-button list-add" data-line-new="${esc(row.id)}" aria-label="Add a line for ${esc(row.label)}">Add a line</button>` : own.length ? "" : `<p class="quiet list-none">No line yet.</p>`}`;
  }).join("")}</div>
    ${lineEditor(ctx, context)}
  </div>`;
}

// ---------- Portfolio ----------

function lanes(rows, day) {
  const dated = rows.filter(row => row.timeline.length);
  if (!dated.length) return `<p class="quiet">No project has a dated milestone yet. Add milestones in Program plan.</p>`;
  const all = dated.flatMap(row => row.timeline.map(item => item.date)).concat(day).sort();
  const start = Date.parse(`${all[0]}T00:00:00Z`) - 10 * 86400000;
  const end = Date.parse(`${all.at(-1)}T00:00:00Z`) + 10 * 86400000;
  const place = (date) => Math.min(100, Math.max(0, ((Date.parse(`${date}T00:00:00Z`) - start) / (end - start)) * 100)).toFixed(2);
  const ticks = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  const step = Math.max(1, Math.ceil((end - start) / (86400000 * 30 * 8)));
  while (cursor.getTime() < end) {
    ticks.push({ at: place(cursor.toISOString().slice(0, 10)), label: cursor.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) });
    cursor.setUTCMonth(cursor.getUTCMonth() + step);
  }
  return `<div class="lanes" role="img" aria-label="Timeline of project milestones and public rule dates. The same dates are listed under each project.">
    <div class="lane-scale ${ticks.length > 4 ? "many" : ""}">${ticks.map(tick => `<span style="left:${tick.at}%">${esc(tick.label)}</span>`).join("")}</div>
    ${dated.map(row => `<div class="lane"><span class="lane-name">${esc(row.name)}</span><div class="lane-track"><span class="lane-today" style="left:${place(day)}%"></span>${row.timeline.map(item => `<span class="lane-mark ${item.kind === "project" ? "project" : "rule"}" style="left:${place(item.date)}%" title="${esc(dayText(item.date))}. ${esc(item.label)}"></span>`).join("")}</div></div>`).join("")}
    <p class="lane-key"><span class="lane-mark project"></span> Project milestone <span class="lane-mark rule"></span> Public rule date <span class="lane-today"></span> Today</p>
  </div>
  ${dated.map(row => `<details class="history"><summary>Dates for ${esc(row.name)} (${row.timeline.length})</summary>${drawTimeline(row.timeline, day)}</details>`).join("")}`;
}

// The first sentence of a longer label, for a card that has room for one line.
const firstSentence = (text) => { const value = String(text || ""); const end = value.search(/\.(\s|$)/); return end < 0 ? value : value.slice(0, end + 1); };

export function drawPortfolio(ctx) {
  if (ctx.error) return stateMessage(ctx, "portfolio");
  if (!ctx.portfolio) return stateMessage({ loading: ctx.loading }, "portfolio");
  const { rows, today: day } = ctx.portfolio;
  const started = rows.filter(row => row.started);
  const sum = (pick) => rows.reduce((total, row) => total + pick(row), 0);
  const bar = (value, total, label) => `<div class="mini-bar"><span class="bar-caption"><span>${esc(label)}</span><strong>${value} of ${total}</strong></span><span class="bar"><span style="width:${total ? Math.round((value / total) * 100) : 0}%"></span></span></div>`;
  return `<section class="metrics">
    <div class="metric"><strong>${rows.length}</strong><span>Projects</span></div>
    <div class="metric"><strong>${started.length}</strong><span>With a saved design basis</span></div>
    <div class="metric"><strong>${sum(row => row.openItems)}</strong><span>Open gate items</span></div>
    <div class="metric"><strong>${sum(row => row.rechecks)}</strong><span>Sourcing lines to recheck</span></div>
  </section>
  <section class="portfolio-cards">${rows.map(row => `<article class="pane portfolio-card ${row.projectId === ctx.currentProject ? "on" : ""}">
    <div class="section-heading"><div><p class="kicker">${esc(row.projectId)}${row.practice ? " · practice copy" : ""}${row.projectId === ctx.currentProject ? " · open now" : ""}</p><h2>${esc(row.name)}</h2></div><button type="button" data-portfolio-open="${esc(row.projectId)}">Open the plan</button></div>
    ${row.started ? `<div class="pills"><span class="pill grey">Design ${esc(row.design)}</span><span class="pill grey">${esc(labelOf(REGIONS, row.region))}</span><span class="pill grey">${esc(POWER.find(item => item.id === row.power)?.short || "")}</span><span class="pill grey">Pathway ${esc(row.pathway)}</span></div>
      <div class="gate-dots" aria-label="${row.gatesPassed} of ${row.gatesTotal} gates passed">${Array.from({ length: row.gatesTotal }, (_, index) => `<span class="${index < row.gatesPassed ? "on" : ""}"></span>`).join("")}<span class="quiet">${row.gatesPassed} of ${row.gatesTotal} gates passed</span></div>
      <dl class="record-facts">
        <div><dt>Current gate</dt><dd>${row.gate.id < 0 ? "All gates passed" : `Gate ${row.gate.id}. ${esc(row.gate.short)}`} ${statusTag(row.gate.status)}</dd></div>
        <div><dt>Next date</dt><dd>${row.nextMilestone ? `${esc(dayText(row.nextMilestone.date))}${row.nextMilestone.approx ? " (calculated)" : ""}<span class="quiet">${esc(row.nextMilestone.kind)}. ${esc(firstSentence(row.nextMilestone.label))}</span>` : "No upcoming date is recorded."}</dd></div>
      </dl>
      <p class="check-title">Subsystems covered</p>
      <div class="mini-bars">${bar(row.coverage.withPrimary, row.coverage.subsystems, "Primary part")}${bar(row.coverage.withAlternate, row.coverage.subsystems, "Alternate")}${bar(row.coverage.approved, row.coverage.subsystems, "Approved line")}</div>
      <p class="quiet">${plural(row.coverage.lines, "sourcing line")}, ${row.coverage.inReview} in review, ${row.coverage.approvedLines} approved. ${plural(row.openItems, "open gate item")}. ${plural(row.rechecks, "line")} to recheck.${row.coverage.stopped ? ` ${plural(row.coverage.stopped, "stop sign")} recorded.` : ""}</p>`
    : `<p class="quiet">No design basis is saved for this project. The NSTT role starts the plan in Program plan.</p>`}
  </article>`).join("")}</section>
  <section class="pane"><h2>Timeline across projects</h2>${lanes(rows, day)}</section>`;
}
