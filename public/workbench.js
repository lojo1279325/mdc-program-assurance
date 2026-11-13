import {
  ACTIONS,
  CONFIDENCE,
  DUTIES,
  LAYERS,
  RISK,
  STAGES,
  STATUSES,
  VIEWS,
  approvalBlock,
  clientView,
  actionList,
  methodChecklist,
  metrics,
  nextCode,
  normalizeReview,
  scorecard,
} from "./rules.js";
import { BUILT_IN_PROJECT, filterProject } from "./boards.js";
import { drawCompletion, drawLibrary, drawOwner, drawProjects, drawSources, drawUser, drawWorkflow } from "./views.js";
import { decisionBrief, vendorMap, vendorMapCsv } from "./brief.js";
import { drawBrief, drawVendorMap } from "./briefview.js";
import { drawPresentation, presentationSlides } from "./present.js";
import { briefToPptx } from "./pptx.js";
import { recordAccess, ROLE_LABEL } from "./privileges.js";
import { analysisRecord, analysisSteps, drawWizard } from "./wizard.js";
import { fieldBox, guideBanner, knownValues } from "./guidance.js";
import { drawPracticeGuide } from "./practiceguide.js";
import { drawStart, drawRecordPath, drawQuickGuide } from "./experience.js";
import { rowsToCsv } from "./csv.js";

const state = {
  items: [],
  selected: "",
  view: "home",
  query: "",
  client: false,
  session: null,
  project: "MDC",
  projects: [BUILT_IN_PROJECT],
  library: { vendors: [], parts: [] },
  sourceStatus: { federalRegister: true, screeningList: false, sayari: false },
  sourceResults: [],
  slide: 0,
  presentationReadable: false,
  wizardStep: 0,
  practiceRole: "",
  grants: [],
  statusFilter: "all",
  dirty: false,
  saving: false,
  pendingNavigation: null,
  notice: "This is the development workspace. Production is unchanged. A granted role is required before a record is stored.",
};

const titles = {
  home: "Start here",
  analysis: "Guided analysis",
  queue: "Review queue",
  cards: "Review cards",
  metrics: "Metrics",
  outputs: "Outputs",
  brief: "Decision brief",
  present: "Presentation",
  vendors: "Vendor map",
  duties: "Roles and practice",
  updates: "Import and versions",
  workflow: "Progress",
  completion: "Completion",
  mine: "My work",
  owner: "Owner",
  library: "Library",
  sources: "Sources",
  projects: "Projects",
};

const main = document.querySelector("#main");
const notice = document.querySelector("#notice");
const title = document.querySelector("#view-title");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function posture(action) {
  return {
    Proceed: "green",
    "Proceed with protections": "yellow",
    "Proceed with active mitigation": "orange",
    "Do not proceed absent resolution": "red",
  }[action] || "grey";
}

function projectItems() {
  return filterProject(state.items, state.project);
}

function currentBrief() {
  const project = state.projects.find((item) => item.code === state.project);
  return decisionBrief(projectItems(), {
    projectName: project?.name || "MDC Program Assurance",
    projectCode: state.project,
    generatedOn: new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(new Date()),
    client: state.client,
  });
}

function downloadFile(bytes, name, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([bytes], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function visibleItems() {
  const query = state.query.trim().toLowerCase();
  return projectItems().filter((item) => {
    if (state.statusFilter === "preparing" && item.status !== "Open" && item.status !== "Returned") return false;
    if (state.statusFilter !== "all" && state.statusFilter !== "preparing" && item.status !== state.statusFilter) return false;
    if (!query) return true;
    return `${item.code} ${item.title} ${item.layer} ${item.action} ${item.supplier || ""}`.toLowerCase().includes(query);
  });
}

function selected() {
  const visible = visibleItems();
  return visible.find((item) => item.code === state.selected) || visible[0] || null;
}

function setNotice(text) {
  state.notice = text;
  notice.textContent = text;
}

function leaveForm(next) {
  if (state.saving) {
    setNotice("The save is still running. Wait for confirmation before leaving.");
    return;
  }
  if (!state.dirty) {
    next();
    return;
  }
  state.pendingNavigation = next;
  const dialog = document.querySelector("#unsaved-dialog");
  dialog.returnValue = "";
  document.querySelector("#more-actions").open = false;
  dialog.showModal();
}

function scrollWorkToTop() {
  main.scrollTop = 0;
  document.querySelector(".workspace").scrollTop = 0;
}

function goTo(view, { code, step } = {}) {
  leaveForm(() => {
    if (view === "analysis") {
      state.query = "";
      state.statusFilter = "all";
      document.querySelector("#search").value = "";
      state.selected = code || analysisRecord(actingRole(), projectItems(), state.selected)?.code || "";
      state.wizardStep = step ?? 0;
      if (actingRole() === "administrator") loadGrants().then(() => { if (state.view === "analysis") render(); });
    } else if (code) {
      state.selected = code;
    }
    state.view = view;
    document.querySelector("#nav-toggle").checked = false;
    render();
    scrollWorkToTop();
    title.focus({ preventScroll: true });
  });
}

function render() {
  document.querySelector("#more-actions").open = false;
  title.textContent = titles[state.view];
  notice.textContent = state.notice;
  document.querySelectorAll(".nav").forEach((button) => {
    button.classList.toggle("on", button.dataset.view === state.view);
    if (button.dataset.view === state.view) {
      button.setAttribute("aria-current", "page");
      const group = button.closest("details");
      if (group) group.open = true;
    } else button.removeAttribute("aria-current");
  });
  document.querySelector("#client-toggle").textContent = state.client ? "Internal view" : "Client view";
  const draw = {
    home: () => drawStart({
      actor: actor(),
      items: projectItems(),
      projectName: state.projects.find((project) => project.code === state.project)?.name || state.project,
      practice: Boolean(state.practiceRole),
      canPractice: practiceAllowed(),
      signedIn: state.session?.state === "granted",
    }),
    queue: drawQueue,
    cards: drawCards,
    metrics: () => drawMetrics(projectItems()),
    outputs: () => drawOutputs(projectItems()),
    duties: drawDuties,
    updates: drawUpdates,
    workflow: () => drawWorkflow(projectItems()),
    completion: () => drawCompletion(projectItems()),
    mine: () => drawUser(projectItems(), { ...state.session, email: actingEmail(), role: actingRole() }, state.client),
    owner: () => drawOwner(projectItems(), state.client),
    library: () => drawLibrary(state.items, state.library, state.project, state.query, state.client, state.session?.role || ""),
    vendors: () => drawVendorMap(vendorMap(projectItems()), state.query),
    brief: () => drawBrief(currentBrief(), state.slide),
    present: () => drawPresentation(currentBrief(), state.slide, { readable: state.presentationReadable }),
    sources: () => drawSources(state.sourceStatus, state.sourceResults, state.client),
    projects: () => drawProjects(state.projects, state.project, state.session?.role || ""),
    analysis: () => {
      const next = projectItems().some((item) => item.code === state.selected) ? null : analysisRecord(actingRole(), projectItems(), state.selected);
      if (next?.code) {
        state.selected = next.code;
        state.wizardStep = 0;
      }
      return drawWizard({
        role: actingRole(),
        step: state.wizardStep,
        record: selected(),
        waiting: waitingForRole(),
        environment: state.session?.environment || "development",
        canGrant: Boolean(state.session?.administrator),
        grants: state.grants,
        actorEmail: actingEmail(),
        items: projectItems(),
        library: state.library,
      });
    },
  };
  syncProjectSelect();
  syncPracticeBar();
  syncNavigationButton();
  const roleName = ROLE_LABEL[actingRole()] || "No granted role";
  document.querySelector("#context-role").textContent = state.practiceRole
    ? `Practice ${roleName}. Sample project only.`
    : state.session?.state === "granted" ? `${roleName} · Signed in` : "Sign-in required";
  const profile = document.querySelector(".profile");
  profile.querySelector(".profile-name").textContent = state.session?.state === "granted"
    ? `${ROLE_LABEL[state.session.role] || state.session.role} · Signed in`
    : "Sign in";
  profile.setAttribute("aria-label", state.session?.state === "granted" ? "Open account and sign-in page" : "Sign-in page");
  main.dataset.view = state.view;
  main.innerHTML = draw[state.view]();
  syncRoleControls();
  bind();
  const currentPreview = main.querySelector('.preview[aria-current="true"]');
  if (currentPreview) {
    const strip = currentPreview.parentElement;
    strip.scrollLeft = Math.max(0, currentPreview.offsetLeft - strip.offsetLeft - (strip.clientWidth - currentPreview.clientWidth) / 2);
  }
  const activeStep = main.querySelector('[data-wizard-step][aria-current="step"]');
  if (activeStep) {
    const steps = activeStep.parentElement;
    steps.scrollLeft = Math.max(0, activeStep.offsetLeft - steps.offsetLeft - (steps.clientWidth - activeStep.clientWidth) / 2);
  }
}

function pills(item) {
  const action = item.action || "Action not set";
  return `<div class="pills">
    <span class="pill ${posture(item.action)}">${esc(action)}</span>
    <span class="pill grey">Confidence ${esc(item.confidence)}</span>
    <span class="pill">${esc(item.status)}</span>
  </div>`;
}

function drawQueue() {
  const items = visibleItems();
  const current = selected();
  if (!items.length) {
    if (state.query || state.statusFilter !== "all") {
      return `<section class="pane"><h2>No matching records</h2><p>Clear the search and status filter to see the project’s records.</p><div class="row-actions"><button type="button" class="primary" data-task="clear-filters">Clear filters</button></div></section>`;
    }
    const role = actingRole();
    const hint = state.project === "PRACTICE"
      ? "Load the practice records, then choose NSTT, CPI, or Trade. The MDC register stays unchanged."
      : role === "nstt"
      ? "Start the method checklist, or open Analysis and start one review."
      : "Your role can read the register. It cannot start or import an analysis record.";
    return `<div class="pane"><p>No review records yet.</p><p class="quiet">${esc(hint)}</p></div>`;
  }
  const guide = state.project === "PRACTICE" ? drawPracticeGuide() : "";
  const filters = [["all", "All records"], ["preparing", "Preparing"], ["In review", "In review"], ["Approved", "Approved"]];
  return `${guide}<div class="queue-toolbar"><p class="quiet">${items.length} ${items.length === 1 ? "record" : "records"} shown</p><div class="status-filters" aria-label="Record status">${filters.map(([value, label]) => `<button type="button" data-status-filter="${value}" aria-pressed="${state.statusFilter === value}">${label}</button>`).join("")}</div></div><div class="split">
    <div class="list">${items.map((item) => `<button type="button" class="item posture-${posture(item.action)} ${current && current.code === item.code ? "on" : ""}" data-code="${esc(item.code)}">
      <strong>${esc(item.code)} ${esc(item.title)}</strong>
      <small>${esc(item.layer)} · v${esc(item.version || 0)} · ${esc(item.ownerRole)} prepares · ${esc(item.reviewerRole)} reviews</small>
      ${pills(item)}
    </button>`).join("")}</div>
    <div class="pane">${current ? drawRecordPath(current, actor()) + form(current) : ""}</div>
  </div>`;
}

function drawCards() {
  const items = visibleItems();
  if (!items.length) return `<div class="pane"><p>No cards yet. Import the register or add a review.</p></div>`;
  const shown = items.slice(0, 12);
  return `<p class="quiet">Showing ${shown.length} of ${items.length} cards. Search to narrow the list.</p><div class="cards">${shown.map((item) => `<article class="card tone-${posture(item.action)}">
    <p class="label">${esc(item.code)} · ${esc(item.stage)}</p>
    <h2 style="font-size:16px;margin:4px 0 8px;">${esc(item.title || "Untitled review")}</h2>
    ${pills(item)}
    <p>${esc(state.client ? item.condition || "No condition recorded." : item.evidence || "No evidence recorded. Confidence stays pending.")}</p>
    <p class="quiet">Lifecycle: ${esc(item.lifecycle || "Not recorded.")}</p>
    <p class="quiet">${esc(item.ownerRole)} prepares. ${esc(item.reviewerRole)} reviews.</p>
  </article>`).join("")}</div>`;
}

function drawMetrics(items = projectItems()) {
  const count = metrics(items);
  const card = scorecard(items);
  const max = Math.max(1, ...Object.values(count.byAction));
  return `<div class="metrics">
    ${metric(count.records, "Records")}
    ${metric(count.inReview, "In review")}
    ${metric(count.approved, "Approved")}
    ${metric(count.pendingConfidence, "Confidence pending")}
  </div>
  <div class="pane" style="margin-top:12px;">
    <p class="label">Action mix</p>
    ${Object.entries(count.byAction).map(([name, value]) => `<p>${esc(name)} <strong class="num" style="display:inline;font-size:14px;">${value}</strong></p><div class="bar ${posture(name === "Not set" ? "" : name)}"><span style="width:${Math.round((value / max) * 100)}%"></span></div>`).join("")}
  </div>
  <div class="pane" style="margin-top:12px;">
    ${card.sentences.map((sentence) => `<p>${esc(sentence)}</p>`).join("")}
  </div>`;
}

function metric(value, label) {
  return `<article class="metric"><strong>${value}</strong><span>${esc(label)}</span></article>`;
}

function drawOutputs(items = projectItems()) {
  const card = scorecard(items);
  const rows = state.client ? clientView(items) : items.map(normalizeReview);
  const headers = state.client
    ? ["Code", "Title", "Action", "Condition", "Lifecycle", "Confidence"]
    : ["Code", "Title", "Risk", "Confidence", "Action", "Status", "Lifecycle"];
  const show = (value) => value || "Not recorded";
  const cells = state.client
    ? (item) => [item.code, item.title, show(item.action), show(item.condition), show(item.lifecycle), item.confidence]
    : (item) => [item.code, item.title, item.risk, item.confidence, show(item.action), item.status, show(item.lifecycle)];
  const allActions = actionList(items).filter((action) => !state.client || action.text.includes("should not proceed"));
  const actions = allActions.slice(0, 12);
  return `<div class="pane sentences">
    <p class="label">${state.client ? "Client output" : "Internal scorecard"}</p>
    ${card.sentences.map((sentence) => `<p>${esc(sentence)}</p>`).join("")}
    <p class="label">Action list</p>
    ${actions.length ? actions.map((action) => `<p>${esc(action.text)}</p>`).join("") : "<p>No open actions. Add a review to generate the list.</p>"}
    ${allActions.length > actions.length ? `<p class="quiet">${allActions.length - actions.length} more actions are in the exported register.</p>` : ""}
    <p class="quiet">This download follows the selected project. The workbook export on Updates covers the full register.</p>
    <div class="row-actions"><button type="button" id="download" class="primary">Download selected project</button></div>
  </div>
  <div style="overflow:auto;margin-top:12px;">
    <table>
      <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((item) => `<tr>${cells(item).map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  </div>`;
}

function drawDuties() {
  const label = { nstt: "NSTT", cpi: "CPI", trade: "Trade", administrator: "Administrator", china: "China input", client: "Client output" };
  return `<div class="duties">${drawPracticeGuide({ open: true })}${DUTIES.map((duty) => `<article class="duty"><h2 style="font-size:16px;margin:0 0 6px;">${esc(label[duty.role] || duty.role)}</h2><p>${esc(duty.duty)}</p></article>`).join("")}
    ${VIEWS.map((duty) => `<article class="duty"><h2 style="font-size:16px;margin:0 0 6px;">${esc(label[duty.role] || duty.role)}</h2><p>${esc(duty.duty)}</p></article>`).join("")}
    <article class="duty"><h2 style="font-size:16px;margin:0 0 6px;">Sequence</h2><p>${esc(STAGES.join(", "))}.</p><p>Each review keeps a future policy and lifecycle note. China and client do not sign in.</p></article>
  </div>`;
}

function options(values, current) {
  return values.map((value) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(value)}</option>`).join("");
}

function drawUpdates() {
  const current = selected();
  const waiting = state.items.filter((item) => !item.action).length;
  const inReview = state.items.filter((item) => item.status === "In review").length;
  return `<div class="pane sentences">
    <p class="label">Large update</p>
    <p>Export the register, edit the Register sheet, and import it back. A blank cell keeps the current value. Type CLEAR to remove a text value.</p>
    <p>Each imported change becomes the next version. A stale version is rejected, so export again before you retry that row.</p>
    <p>Import cannot approve a record. Only the NSTT role can import register updates, and only for records it prepares. A different person in the assigned reviewer role uses Approve.</p>
    ${state.session?.role === "nstt" ? "" : `<p>Your role cannot import the register. Ask NSTT to make the update, or use Analysis for the work your role is allowed to do.</p>`}
    <p>Hold or Restructure is a source category from the October workbook. It is not one of the four actions. Set the action before approval. A missing fact keeps confidence pending and does not change the risk band.</p>
    <p>${state.items.length} records are loaded. ${waiting} still need an action. ${inReview} are in review.</p>
    <div class="row-actions">
      <button type="button" id="export-workbook" class="primary">Export workbook</button>
      ${state.session?.role === "nstt" ? `<label class="field tone-note">Choose workbook <input id="import-file" type="file" accept=".xlsx" title="Choose the workbook you exported. Edit the Register sheet, then import it." /><span class="field-example">Example: the workbook you exported, with edits on the Register sheet.</span></label><button type="button" id="import-workbook">Import workbook</button>` : ""}
    </div>
    <p class="quiet" id="import-result">${current ? `${current.code} is selected at version ${current.version || 0}.` : "Select a record to see its versions."}</p>
  </div>
  <div class="pane" style="margin-top:12px;" id="version-list"><p class="quiet">Version history loads for the selected record.</p></div>`;
}

function practiceAllowed() {
  return state.session?.environment === "development" && state.session?.role === "administrator" && Boolean(state.session?.administrator);
}

function actingRole() {
  return practiceAllowed() && state.practiceRole ? state.practiceRole : (state.session?.role || "");
}

function actingEmail() {
  return practiceAllowed() && state.practiceRole ? `practice-${state.practiceRole}@development.local` : (state.session?.email || "");
}

function actor() {
  return { email: actingEmail(), role: actingRole() };
}

function waitingForRole() {
  const role = actingRole();
  return projectItems().filter((item) => item.status === "In review" && (item.reviewerRole === role || (role === "trade" && item.tradeSensitive)));
}

function form(item) {
  const access = recordAccess(actor(), item);
  const block = approvalBlock(actor(), item);
  const updates = item.updates.map((update) => `<p class="quiet">${esc(update.role || "team")}: ${esc(update.text)}</p>`).join("");
  const facts = `<p><strong>Vendor.</strong> ${esc(item.supplier || "Not recorded")}</p><p><strong>Part.</strong> ${esc(item.sourceItem || "Not recorded")}</p><p><strong>Action.</strong> ${esc(item.action || "Not set")}</p><p><strong>Evidence.</strong> ${esc(item.evidence || "Not recorded")}</p><p><strong>Lifecycle.</strong> ${esc(item.lifecycle || "Not recorded")}</p>`;
  const buttons = `${access.canSave ? `<button class="primary" type="submit">Save change</button>` : ""}
      ${access.canSend ? `<button type="button" data-status="In review">Send to review</button>` : ""}
      ${access.canReturn ? `<button type="button" data-status="Returned">Return</button>` : ""}
      ${access.canApprove ? `<button type="button" data-status="Approved">Approve</button>` : ""}`;
  const known = knownValues(state.items, state.library);
  const projectChoices = state.projects.map((project) => ({ value: project.code, label: `${project.code}. ${project.name}` }));
  if (!projectChoices.some((choice) => choice.value === (item.projectId || "MDC"))) {
    projectChoices.push({ value: item.projectId || "MDC", label: item.projectId || "MDC" });
  }
  return `<form class="form" id="review-form" data-mode="${esc(access.mode)}">
    ${guideBanner()}
    <p class="label">${esc(item.code)} · version ${esc(item.version || 0)} · ${esc(item.stage)} · ${esc(item.layer)}${item.sourceCategory ? ` · source category ${esc(item.sourceCategory)}` : ""}</p>
    <p class="locked-note">${esc(access.message)}</p>
    <div class="row-actions">${buttons || `<button type="button" data-open="analysis">Open analysis</button>`}</div>
    ${access.canApprove && block ? `<p class="block">${esc(block)}</p>` : ""}
    ${access.mode === "prepare" ? `${fieldBox({ key: "title", value: item.title, idPrefix: "review" })}
    <div class="grid-2">
      ${fieldBox({ key: "layer", value: item.layer, idPrefix: "review" })}
      ${fieldBox({ key: "stage", value: item.stage, idPrefix: "review" })}
      ${fieldBox({ key: "risk", value: item.risk, idPrefix: "review" })}
      ${fieldBox({ key: "confidence", value: item.confidence, idPrefix: "review" })}
      ${fieldBox({ key: "action", value: item.action || "", idPrefix: "review" })}
      ${fieldBox({ key: "projectId", value: item.projectId || "MDC", choices: projectChoices, idPrefix: "review" })}
      ${fieldBox({ key: "supplier", value: item.supplier || "", suggestions: known.vendors, idPrefix: "review" })}
      ${fieldBox({ key: "sourceItem", value: item.sourceItem || "", suggestions: known.parts, idPrefix: "review" })}
      ${fieldBox({ key: "drawing", value: item.drawing || "", suggestions: known.drawings, idPrefix: "review" })}
    </div>
    <p class="quiet">Owner role stays ${esc(item.ownerRole)}. Reviewer role stays ${esc(item.reviewerRole)}. Those assignments are not changed from this form. Hover Guide on a field if you need the kind of information it takes.</p>
    ${fieldBox({ key: "condition", value: item.condition, idPrefix: "review" })}
    ${fieldBox({ key: "lifecycle", value: item.lifecycle, idPrefix: "review" })}
    ${fieldBox({ key: "evidence", value: item.evidence, idPrefix: "review" })}
    ${fieldBox({ key: "openFact", value: item.openFact, idPrefix: "review" })}
    ${fieldBox({ key: "tradeSensitive", value: item.tradeSensitive ? "yes" : "no", idPrefix: "review" })}` : `<p><strong>Title.</strong> ${esc(item.title || "Not recorded")}</p>${facts}`}
    ${access.canNote ? fieldBox({ key: "update", idPrefix: "review" }) : ""}
    ${updates}
  </form>`;
}

function readForm(formElement, item) {
  const data = new FormData(formElement);
  const update = String(data.get("update") || "").trim();
  const mode = formElement.dataset.mode;
  const next = mode === "prepare" ? normalizeReview({
    ...item,
    title: data.get("title"),
    layer: data.get("layer"),
    stage: data.get("stage"),
    ownerRole: item.ownerRole,
    reviewerRole: item.reviewerRole,
    risk: data.get("risk"),
    confidence: data.get("confidence"),
    action: data.get("action"),
    status: item.status,
    condition: data.get("condition"),
    lifecycle: data.get("lifecycle"),
    evidence: data.get("evidence"),
    openFact: data.get("openFact"),
    projectId: practiceAllowed() && state.practiceRole ? "PRACTICE" : data.get("projectId"),
    supplier: data.get("supplier"),
    sourceItem: data.get("sourceItem"),
    drawing: data.get("drawing"),
    tradeSensitive: data.get("tradeSensitive") === "yes" || data.get("tradeSensitive") === "on",
    preparedBy: item.preparedBy || actingEmail(),
  }) : normalizeReview(item);
  if (update) {
    next.updates = [...item.updates, {
      at: new Date().toISOString(),
      by: actingEmail() || "development",
      role: actingRole() || next.ownerRole,
      text: update,
    }];
  }
  return next;
}

async function persist(item, quiet = false) {
  if (state.session?.state !== "granted") {
    if (!quiet) setNotice("The change is visible here. It is not stored. A granted role is required, and this host does not keep records after a restart.");
    return null;
  }
  if (state.saving) return null;
  state.saving = true;
  try {
    const response = await fetch("/api/workbench/items", {
      method: "POST",
      credentials: "include",
      headers: practiceHeaders(),
      body: JSON.stringify(item),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.message || "The record was not stored. Your entries remain on this screen.");
      return null;
    }
    const saved = normalizeReview(body);
    state.dirty = false;
    state.saving = false;
    replace(saved);
    setNotice(state.session?.database === "postgres"
      ? `${saved.code} saved as version ${saved.version}. ${saved.status}.`
      : `${saved.code} saved for this session. This host uses temporary memory.`);
    return saved;
  } catch {
    setNotice("The save did not finish. Your entries remain on this screen. Check the connection and try again.");
    return null;
  } finally {
    state.saving = false;
  }
}

function replace(item) {
  state.items = state.items.map((current) => (current.code === item.code ? item : current));
  state.selected = item.code;
  render();
}

function bind() {
  main.querySelectorAll("[data-code]:not([data-open])").forEach((button) => {
    button.addEventListener("click", () => {
      leaveForm(() => {
        state.selected = button.dataset.code;
        render();
      });
    });
  });
  main.querySelectorAll("#review-form, #wizard-form").forEach((formElement) => {
    const markDirty = () => { state.dirty = true; };
    formElement.addEventListener("input", markDirty);
    formElement.addEventListener("change", markDirty);
  });
  main.querySelectorAll("[data-status-filter]").forEach((button) => {
    button.addEventListener("click", () => leaveForm(() => {
      state.statusFilter = button.dataset.statusFilter;
      state.view = "queue";
      state.selected = visibleItems()[0]?.code || "";
      render();
    }));
  });
  main.querySelectorAll("[data-task]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.task === "access") goTo("analysis", { step: 1 });
      if (button.dataset.task === "continue") goTo("analysis", { code: button.dataset.taskCode });
      if (button.dataset.task === "queue") goTo("queue");
      if (button.dataset.task === "new") leaveForm(startAnalysis);
      if (button.dataset.task === "practice") leaveForm(() => {
        state.project = "PRACTICE";
        state.query = "";
        state.statusFilter = "all";
        document.querySelector("#search").value = "";
        if (!state.projects.some((project) => project.code === "PRACTICE")) {
          state.projects.push({ code: "PRACTICE", name: "Practice reviews", status: "Active" });
        }
        state.practiceRole = "nstt";
        state.view = "home";
        state.selected = analysisRecord("nstt", projectItems(), "")?.code || "";
        setNotice("Practice is on. Only sample records in this project can change.");
        render();
      });
      if (button.dataset.task === "clear-filters") leaveForm(() => {
        state.query = "";
        state.statusFilter = "all";
        document.querySelector("#search").value = "";
        render();
      });
    });
  });
  main.querySelectorAll("[data-fill]").forEach((select) => {
    select.addEventListener("change", () => {
      const target = select.form?.elements.namedItem(select.dataset.fill);
      if (!target || !select.value || String(target.value || "").trim()) {
        select.value = "";
        return;
      }
      target.value = select.value;
      select.value = "";
    });
  });
  const formElement = document.querySelector("#review-form");
  if (formElement) {
    formElement.addEventListener("submit", async (event) => {
      event.preventDefault();
      const item = readForm(formElement, selected());
      await persist(item);
    });
    formElement.querySelectorAll("[data-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const item = readForm(formElement, selected());
        item.status = button.dataset.status;
        if (item.status === "Approved") {
          const block = approvalBlock(actor(), item);
          if (block) {
            setNotice(block);
            return;
          }
          item.reviewedBy = actingEmail();
        }
        await persist(normalizeReview(item));
      });
    });
  }
  const download = document.querySelector("#download");
  if (download) download.addEventListener("click", exportRegister);
  const exportWorkbook = document.querySelector("#export-workbook");
  if (exportWorkbook) exportWorkbook.addEventListener("click", downloadWorkbook);
  const importWorkbook = document.querySelector("#import-workbook");
  if (importWorkbook) importWorkbook.addEventListener("click", importWorkbookFile);
  main.querySelectorAll("[data-restore]").forEach((button) => {
    button.addEventListener("click", () => restoreVersion(button.dataset.restore));
  });
  if (state.view === "updates") loadVersions();
  const vendorForm = document.querySelector("#vendor-form");
  if (vendorForm) vendorForm.addEventListener("submit", (event) => saveCatalog(event, vendorForm, "/api/library/vendors", "Vendor saved."));
  const partForm = document.querySelector("#part-form");
  if (partForm) partForm.addEventListener("submit", (event) => saveCatalog(event, partForm, "/api/library/parts", "Part saved."));
  const projectForm = document.querySelector("#project-form");
  if (projectForm) projectForm.addEventListener("submit", createProject);
  const sourceForm = document.querySelector("#source-form");
  if (sourceForm) sourceForm.addEventListener("submit", checkSources);
  main.querySelectorAll("[data-brief]").forEach((button) => {
    button.addEventListener("click", () => {
      const brief = currentBrief();
      const last = Math.max(0, (state.view === "present" ? presentationSlides(brief) : brief.slides).length - 1);
      if (button.dataset.brief === "prev") state.slide = Math.max(0, state.slide - 1);
      if (button.dataset.brief === "next") state.slide = Math.min(last, state.slide + 1);
      if (button.dataset.brief === "export") {
        downloadFile(briefToPptx(brief), `${state.project}-decision-brief.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        setNotice("The brief is downloading. Its decision line uses approved records; readiness and open items cover the whole selected project.");
        return;
      }
      if (button.dataset.brief === "vendors") {
        const map = vendorMap(projectItems());
        downloadFile(vendorMapCsv(map), `${state.project}-vendor-map.csv`, "text/csv");
        setNotice("The vendor map is downloading. Accuracy confidence is separate from the risk band.");
        return;
      }
      state.slide = Math.min(last, state.slide);
      render();
    });
  });
  main.querySelectorAll("[data-slide-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.slide = Number(button.dataset.slideIndex) || 0;
      render();
      main.querySelector(`[data-slide-index="${state.slide}"]`)?.focus({ preventScroll: true });
    });
  });
  main.querySelector("[data-presentation-zoom]")?.addEventListener("click", () => {
    state.presentationReadable = !state.presentationReadable;
    render();
    main.querySelector("[data-presentation-zoom]")?.focus({ preventScroll: true });
  });
  main.querySelectorAll("[data-project]").forEach((button) => {
    button.addEventListener("click", () => leaveForm(() => {
      if (button.dataset.project !== "PRACTICE") state.practiceRole = "";
      state.project = button.dataset.project;
      state.query = "";
      state.statusFilter = "all";
      document.querySelector("#search").value = "";
      state.slide = 0;
      state.view = "queue";
      const visible = visibleItems();
      state.selected = visible[0]?.code || "";
      setNotice(`Showing ${state.project}. A blank project id still belongs to MDC until a record is saved into another project.`);
      render();
    }));
  });
  main.querySelectorAll("[data-wizard-step]").forEach((button) => {
    button.addEventListener("click", () => leaveForm(() => {
      state.wizardStep = Number(button.dataset.wizardStep) || 0;
      render();
      scrollWorkToTop();
    }));
  });
  main.querySelectorAll("[data-wizard]").forEach((button) => {
    button.addEventListener("click", () => wizardAction(button.dataset.wizard));
  });
  const wizardForm = document.querySelector("#wizard-form");
  if (wizardForm) wizardForm.addEventListener("submit", (event) => saveWizardStep(event, wizardForm));
  const grantForm = document.querySelector("#grant-form");
  if (grantForm) grantForm.addEventListener("submit", grantRole);
  main.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      goTo(button.dataset.open || "queue", { code: button.dataset.code });
    });
  });
}

async function downloadWorkbook() {
  const response = await fetch("/api/workbench/export", { credentials: "include" });
  if (!response.ok) {
    setNotice("The workbook was not exported. Sign in with a granted role and try again.");
    return;
  }
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "MDC_Program_Assurance_Register.xlsx";
  link.click();
  URL.revokeObjectURL(link.href);
  setNotice("The register workbook is downloading. Edit the Register sheet, then import it.");
}

async function importWorkbookFile() {
  const input = document.querySelector("#import-file");
  const file = input?.files?.[0];
  if (!file) {
    setNotice("Choose the register workbook before importing.");
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  const parsed = await fetch("/api/workbench/parse", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: btoa(binary) }),
  });
  const parsedBody = await parsed.json();
  if (!parsed.ok) {
    setNotice(parsedBody.message || "The workbook could not be read.");
    return;
  }
  let applied = 0;
  let unchanged = 0;
  let rejected = 0;
  const rows = parsedBody.rows || [];
  for (let index = 0; index < rows.length; index += 25) {
    const response = await fetch("/api/workbench/import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: file.name, rows: rows.slice(index, index + 25) }),
    });
    const body = await response.json();
    if (!response.ok) {
      setNotice(body.message || "The import stopped.");
      return;
    }
    applied += body.applied || 0;
    unchanged += body.unchanged || 0;
    rejected += body.rejected || 0;
  }
  const stored = await fetch("/api/workbench", { credentials: "include", cache: "no-store" });
  if (stored.ok) {
    const body = await stored.json();
    state.items = Array.isArray(body.items) ? body.items.map(normalizeReview) : state.items;
  }
  setNotice(`Import finished. ${applied} changed, ${unchanged} unchanged, and ${rejected} rejected.`);
  render();
}

async function loadVersions() {
  const current = selected();
  const target = document.querySelector("#version-list");
  if (!target || !current) return;
  const response = await fetch(`/api/workbench/versions?code=${encodeURIComponent(current.code)}`, { credentials: "include" });
  if (!response.ok) return;
  const body = await response.json();
  const versions = body.versions || [];
  target.innerHTML = versions.length
    ? `<p class="label">Versions for ${esc(current.code)}</p>${versions.map((version) => `<p>Version ${esc(version.version)}. ${esc(version.changeNote || "Saved")}</p>${state.session?.role === current.ownerRole && current.status !== "Approved" ? `<button type="button" data-restore="${esc(version.version)}">Restore as a new version</button>` : ""}`).join("")}`
    : `<p>No saved versions yet for ${esc(current.code)}.</p>`;
  target.querySelectorAll("[data-restore]").forEach((button) => {
    button.addEventListener("click", () => restoreVersion(button.dataset.restore));
  });
}

async function restoreVersion(version) {
  const current = selected();
  if (!current) return;
  const response = await fetch("/api/workbench/versions/restore", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: current.code, version: Number(version) }),
  });
  const body = await response.json();
  if (!response.ok) {
    setNotice(body.message || "The version was not restored.");
    return;
  }
  replace(normalizeReview(body));
  setNotice(body.changeNote || "The earlier version was restored as a new version.");
}

function exportRegister() {
  const rows = state.client ? clientView(projectItems()) : projectItems().map(normalizeReview);
  if (!rows.length) return;
  const csv = rowsToCsv(rows);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = state.client ? `${state.project}-client-register.csv` : `${state.project}-decision-register.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => goTo(button.dataset.view));
});

const mobileNavigation = window.matchMedia("(max-width: 900px)");
function syncNavigationButton() {
  const toggled = document.querySelector("#nav-toggle").checked;
  document.querySelector("#nav-menu-button").setAttribute("aria-expanded", String(mobileNavigation.matches ? toggled : !toggled));
}

document.querySelector("#nav-menu-button").addEventListener("click", () => {
  const toggle = document.querySelector("#nav-toggle");
  toggle.checked = !toggle.checked;
  syncNavigationButton();
});

mobileNavigation.addEventListener("change", () => {
  document.querySelector("#nav-toggle").checked = false;
  syncNavigationButton();
});

document.querySelector("#unsaved-dialog").addEventListener("close", (event) => {
  const next = state.pendingNavigation;
  state.pendingNavigation = null;
  if (event.target.returnValue === "discard" && next) {
    state.dirty = false;
    next();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

function practiceHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (practiceAllowed() && state.practiceRole) headers["X-Practice-Role"] = state.practiceRole;
  return headers;
}

function nextPracticeCode(items) {
  const numbers = items.map((item) => {
    const match = String(item.code || "").match(/^S-(\d{2,4})$/);
    return match ? Number(match[1]) : 0;
  });
  return `S-${String(Math.max(0, ...numbers) + 1).padStart(2, "0")}`;
}

function syncPracticeBar() {
  const allowed = practiceAllowed();
  const wrap = document.querySelector("#practice-wrap");
  const load = document.querySelector("#load-practice");
  if (wrap) wrap.hidden = !allowed;
  if (load) load.hidden = !allowed;
  const select = document.querySelector("#practice-role");
  if (select && select.value !== state.practiceRole) select.value = state.practiceRole;
}

function syncRoleControls() {
  const prepare = actingRole() === "nstt";
  const methodPrepare = state.session?.role === "nstt";
  const add = document.querySelector("#add-record");
  const method = document.querySelector("#load-method");
  if (add) {
    add.disabled = !prepare;
    add.hidden = !prepare || state.view === "home" || state.view === "analysis";
    add.title = prepare ? "Start a new analysis record." : "Only the NSTT role can start an analysis record.";
  }
  if (method) {
    method.disabled = !methodPrepare;
    method.hidden = !methodPrepare;
    method.title = methodPrepare ? "Start the method checklist." : "Only the NSTT role can start the method checklist.";
  }
  document.querySelector("#more-actions").hidden = !methodPrepare && !practiceAllowed();
  document.querySelector("#client-toggle").hidden = !["outputs", "brief", "present", "vendors", "cards"].includes(state.view);
}

function wizardLimit() {
  return Math.max(0, analysisSteps(actingRole(), selected()).length - 1);
}

async function wizardAction(action) {
  if (action === "prev" || action === "next") {
    const formElement = document.querySelector("#wizard-form");
    if (action === "next" && formElement) {
      formElement.requestSubmit();
      return;
    }
    leaveForm(() => {
      state.wizardStep = action === "prev" ? Math.max(0, state.wizardStep - 1) : Math.min(wizardLimit(), state.wizardStep + 1);
      render();
      scrollWorkToTop();
    });
    return;
  }
  if (action === "start") {
    leaveForm(startAnalysis);
    return;
  }
  const current = selected();
  if (!current) {
    setNotice("Select a record before this step.");
    return;
  }
  const next = normalizeReview(current);
  if (action === "send") {
    if (!next.action || !next.evidence || !next.lifecycle) {
      setNotice("Send to review after the action, the evidence, and the lifecycle are recorded.");
      return;
    }
    next.status = "In review";
  }
  if (action === "return") next.status = "Returned";
  if (action === "approve") next.status = "Approved";
  const block = action === "approve" ? approvalBlock(actor(), next) : "";
  if (block) {
    setNotice(block);
    return;
  }
  await persist(next);
}

async function saveWizardStep(event, formElement) {
  event.preventDefault();
  const current = selected();
  if (!current) return;
  const data = new FormData(formElement);
  const update = String(data.get("update") || "").trim();
  const next = normalizeReview(current);
  const currentStage = analysisSteps(actingRole(), current)[state.wizardStep]?.stage;
  if (currentStage && STAGES.includes(currentStage)) next.stage = currentStage;
  for (const [key, value] of data.entries()) {
    if (key === "update") continue;
    next[key] = value;
  }
  if (update) {
    next.updates = [...current.updates, {
      at: new Date().toISOString(),
      by: actingEmail(),
      role: actingRole(),
      text: update,
    }];
  }
  if (practiceAllowed() && state.practiceRole) next.projectId = "PRACTICE";
  const saved = normalizeReview(next);
  saved.updates = next.updates;
  const submit = formElement.querySelector("button[type='submit']");
  const priorLabel = submit?.textContent;
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Saving...";
  }
  const result = await persist(saved);
  if (result) {
    state.wizardStep = Math.min(wizardLimit(), state.wizardStep + 1);
    render();
    scrollWorkToTop();
  } else if (submit?.isConnected) {
    submit.disabled = false;
    submit.textContent = priorLabel;
  }
}

async function startAnalysis() {
  if (actingRole() !== "nstt") {
    setNotice("Only the NSTT role can start an analysis record.");
    return;
  }
  const practicing = practiceAllowed() && state.practiceRole === "nstt";
  state.query = "";
  state.statusFilter = "all";
  document.querySelector("#search").value = "";
  const item = normalizeReview({
    code: practicing ? nextPracticeCode(state.items) : nextCode(state.items),
    title: practicing ? "Sample review" : "New review",
    ownerRole: "nstt",
    reviewerRole: "cpi",
    projectId: practicing ? "PRACTICE" : state.project,
    stage: "Why",
    layer: "Identification",
    supplier: practicing ? "Example Supplier LLC" : "",
  });
  state.items = [...state.items, item];
  state.selected = item.code;
  state.view = "analysis";
  state.wizardStep = 0;
  render();
  const saved = await persist(item);
  if (!saved) {
    state.items = state.items.filter((row) => row.code !== item.code);
    state.selected = "";
    render();
  }
}

async function grantRole(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  const result = await postJson("/api/access/grants", body);
  if (!result.ok) {
    setNotice(result.payload.message || "The grant was not saved.");
    return;
  }
  await loadGrants();
  setNotice("The role is granted for this environment only. Production is unchanged.");
  render();
}

async function loadGrants() {
  const response = await fetch("/api/access/grants", { credentials: "include", cache: "no-store" });
  if (!response.ok) return;
  const body = await response.json();
  state.grants = Array.isArray(body.grants) ? body.grants.filter((grant) => !grant.revokedAt) : [];
}

function syncProjectSelect() {
  const select = document.querySelector("#project");
  if (!select) return;
  const codes = state.projects.map((project) => project.code);
  if (!codes.includes(state.project)) state.project = "MDC";
  select.innerHTML = state.projects.map((project) => `<option value="${esc(project.code)}" ${project.code === state.project ? "selected" : ""}>${esc(project.name)}</option>`).join("");
}

document.querySelector("#project").addEventListener("change", (event) => {
  const nextProject = event.target.value;
  event.target.value = state.project;
  leaveForm(() => {
  const leftPractice = Boolean(state.practiceRole && nextProject !== "PRACTICE");
  if (leftPractice) state.practiceRole = "";
  state.project = nextProject;
  state.query = "";
  state.statusFilter = "all";
  state.wizardStep = 0;
  document.querySelector("#search").value = "";
  state.slide = 0;
  const visible = visibleItems();
  state.selected = visible[0]?.code || "";
  setNotice(leftPractice
    ? "Practice role is off because this is not the practice project. Your administrator grant is unchanged."
    : `Showing ${state.project}. Metrics, cards, and dashboards follow this project. The workbook export still covers the full register.`);
  render();
  });
});

document.querySelector("#search").addEventListener("input", (event) => {
  const query = event.target.value;
  if (state.dirty) event.target.value = state.query;
  leaveForm(() => {
  state.query = query;
  document.querySelector("#search").value = query;
  if (!["queue", "cards", "library", "vendors"].includes(state.view)) state.view = "queue";
  render();
  });
});

document.querySelector("#client-toggle").addEventListener("click", () => {
  leaveForm(() => {
  state.client = !state.client;
  setNotice(state.client
    ? "Client view shows the action, conditions, and lifecycle. Method notes stay off this view."
    : "Internal view is open. China and client do not sign in.");
  render();
  });
});

document.querySelector("#practice-role")?.addEventListener("change", (event) => {
  const nextRole = event.target.value;
  event.target.value = state.practiceRole;
  leaveForm(() => {
  state.practiceRole = nextRole;
  state.query = "";
  state.statusFilter = "all";
  document.querySelector("#search").value = "";
  state.wizardStep = 0;
  state.slide = 0;
  if (state.practiceRole) {
    if (!state.projects.some((project) => project.code === "PRACTICE")) {
      state.projects = [...state.projects, { code: "PRACTICE", name: "Practice reviews", status: "Active" }];
    }
    state.project = "PRACTICE";
    const visible = projectItems();
    state.selected = analysisRecord(state.practiceRole, visible, "")?.code || "";
    setNotice(`Practice ${state.practiceRole.toUpperCase()} applies only to the practice project. Your administrator grant is unchanged.`);
  } else {
    state.project = "MDC";
    const visible = projectItems();
    state.selected = visible[0]?.code || "";
    setNotice("Practice role is off. You are the administrator again. The MDC register is unchanged.");
  }
  render();
  });
});

document.querySelector("#load-practice")?.addEventListener("click", () => leaveForm(async () => {
  const response = await fetch("/api/workbench/practice", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    setNotice(body.message || "The practice records were not loaded.");
    return;
  }
  const stored = await fetch("/api/workbench", { credentials: "include", cache: "no-store" });
  if (stored.ok) {
    const payload = await stored.json();
    state.items = Array.isArray(payload.items) ? payload.items.map(normalizeReview) : state.items;
  }
  await loadCatalog();
  state.dirty = false;
  state.query = "";
  state.statusFilter = "all";
  document.querySelector("#search").value = "";
  state.project = "PRACTICE";
  state.practiceRole = state.practiceRole || "nstt";
  state.selected = "S-01";
  state.view = "queue";
  const created = body.created?.length ? `Added ${body.created.join(", ")}.` : "The practice records were already loaded.";
  setNotice(`${created} Choose NSTT to finish S-01, CPI to review S-02, or Trade to review S-03. The MDC register is unchanged.`);
  render();
}));

document.querySelector("#add-record").addEventListener("click", () => leaveForm(startAnalysis));

document.querySelector("#load-method").addEventListener("click", () => leaveForm(async () => {
  if (state.session?.role !== "nstt") {
    setNotice("Only the NSTT role can start the method checklist.");
    return;
  }
  const existing = new Set(state.items.map((item) => item.code));
  const additions = methodChecklist().filter((item) => !existing.has(item.code));
  state.items = [...state.items, ...additions];
  state.selected = additions[0]?.code || state.selected;
  state.view = "queue";
  setNotice("The method checklist is ready. It does not contain the client register. Save still requires a granted role.");
  render();
  for (const item of additions) await persist(item, true);
}));

document.addEventListener("click", (event) => {
  const mark = event.target.closest(".field-mark");
  document.querySelectorAll(".field-mark[aria-expanded='true']").forEach((node) => {
    if (node !== mark) node.setAttribute("aria-expanded", "false");
  });
  if (!mark) return;
  event.preventDefault();
  event.stopPropagation();
  mark.setAttribute("aria-expanded", mark.getAttribute("aria-expanded") === "true" ? "false" : "true");
});

document.querySelector("#quick-guide").addEventListener("click", () => {
  const dialog = document.querySelector("#guide-dialog");
  dialog.querySelector("#guide-content").innerHTML = drawQuickGuide({
    view: state.view,
    role: actingRole(),
    projectName: state.projects.find((project) => project.code === state.project)?.name || state.project,
    practice: Boolean(state.practiceRole),
  });
  dialog.querySelector("[data-guide-close]").addEventListener("click", () => dialog.close());
  dialog.querySelectorAll("[data-guide-to]").forEach((button) => button.addEventListener("click", () => {
    dialog.close();
    goTo(button.dataset.guideTo);
  }));
  dialog.showModal();
});

document.addEventListener("keydown", (event) => {
  if (document.querySelector("dialog[open]")) return;
  if (event.key === "Escape" && !document.querySelector("#unsaved-dialog").open) {
    document.querySelectorAll(".more-actions[open], .nav-more[open]").forEach((menu) => { menu.open = false; });
    if (mobileNavigation.matches && document.querySelector("#nav-toggle").checked) {
      document.querySelector("#nav-toggle").checked = false;
      syncNavigationButton();
      document.querySelector("#nav-menu-button").focus();
    }
  }
  if (event.target.matches("input, textarea, select")) return;
  if (document.querySelector("#unsaved-dialog").open) return;
  const views = ["queue", "cards", "metrics", "outputs", "duties", "updates"];
  if (event.key >= "1" && event.key <= "6") {
    goTo(views[Number(event.key) - 1]);
    return;
  }
  if (state.view === "analysis" && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
    wizardAction(event.key === "ArrowRight" ? "next" : "prev");
    return;
  }
  if ((state.view === "present" || state.view === "brief") && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
    event.preventDefault();
    const brief = currentBrief();
    const last = Math.max(0, (state.view === "present" ? presentationSlides(brief) : brief.slides).length - 1);
    state.slide = event.key === "ArrowRight" ? Math.min(last, state.slide + 1) : Math.max(0, state.slide - 1);
    render();
    main.querySelector(".presentation-viewport")?.focus({ preventScroll: true });
  }
  if (state.view === "present" && (event.key === "Home" || event.key === "End")) {
    event.preventDefault();
    state.slide = event.key === "Home" ? 0 : presentationSlides(currentBrief()).length - 1;
    render();
    main.querySelector(".presentation-viewport")?.focus({ preventScroll: true });
  }
});

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, payload };
}

async function saveCatalog(event, formElement, url, success) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(formElement).entries());
  const result = await postJson(url, body);
  if (!result.ok) {
    setNotice(result.payload.message || "The library entry was not saved.");
    return;
  }
  await loadCatalog();
  setNotice(success);
  render();
}

async function createProject(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const body = Object.fromEntries(new FormData(formElement).entries());
  const result = await postJson("/api/projects", body);
  if (!result.ok) {
    setNotice(result.payload.message || "The project was not created.");
    return;
  }
  await loadCatalog();
  state.project = result.payload.code;
  setNotice(`${result.payload.code} is ready. It starts empty. Move a record only by saving it into this project.`);
  render();
}

async function checkSources(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  body.projectId = state.project;
  setNotice("Checking public sources. A match is a source note. It does not set the action or the risk band.");
  const result = await postJson("/api/sources/lookup", body);
  if (!result.ok) {
    setNotice(result.payload.message || "The source check did not finish.");
    return;
  }
  state.sourceResults = result.payload.results || [];
  setNotice("The source check is saved as a note. It does not change the review.");
  render();
}

async function loadCatalog() {
  const [projects, library, sources] = await Promise.all([
    fetch("/api/projects", { credentials: "include", cache: "no-store" }),
    fetch("/api/library", { credentials: "include", cache: "no-store" }),
    fetch("/api/sources/status", { credentials: "include", cache: "no-store" }),
  ]);
  if (projects.ok) {
    const body = await projects.json();
    state.projects = body.projects?.length ? body.projects : [BUILT_IN_PROJECT];
  }
  if (library.ok) state.library = await library.json();
  if (sources.ok) state.sourceStatus = await sources.json();
}

const sessionResponse = await fetch("/api/session", { credentials: "include", cache: "no-store" }).catch(() => null);
if (sessionResponse?.ok) {
  state.session = await sessionResponse.json();
  document.querySelector("#env-label").textContent = state.session.environment || "development";
  if (state.session.state === "granted") {
    const stored = await fetch("/api/workbench", { credentials: "include", cache: "no-store" });
    if (stored.ok) {
      const body = await stored.json();
      state.items = Array.isArray(body.items) ? body.items.map(normalizeReview) : [];
      await loadCatalog();
      setNotice(state.session.database === "postgres"
        ? `Signed in as ${state.session.role}. Records are stored in the development database.`
        : `Signed in as ${state.session.role}. Records on this host do not survive a restart until a database is connected.`);
    }
  }
}
render();
