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

const state = {
  items: [],
  selected: "",
  view: "queue",
  query: "",
  client: false,
  session: null,
  project: "MDC",
  projects: [BUILT_IN_PROJECT],
  library: { vendors: [], parts: [] },
  sourceStatus: { federalRegister: true, screeningList: false, sayari: false },
  sourceResults: [],
  slide: 0,
  notice: "This is the development workspace. Production is unchanged. A granted role is required before a record is stored.",
};

const titles = {
  queue: "Queue",
  cards: "Review cards",
  metrics: "Metrics",
  outputs: "Outputs",
  brief: "Decision brief",
  present: "Presentation",
  vendors: "Vendor map",
  duties: "Separation of duties",
  updates: "Import and versions",
  workflow: "Workflow",
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

function render() {
  title.textContent = titles[state.view];
  notice.textContent = state.notice;
  document.querySelectorAll(".nav").forEach((button) => {
    button.classList.toggle("on", button.dataset.view === state.view);
  });
  document.querySelector("#client-toggle").textContent = state.client ? "Internal view" : "Client view";
  const draw = {
    queue: drawQueue,
    cards: drawCards,
    metrics: () => drawMetrics(projectItems()),
    outputs: () => drawOutputs(projectItems()),
    duties: drawDuties,
    updates: drawUpdates,
    workflow: () => drawWorkflow(projectItems()),
    completion: () => drawCompletion(projectItems()),
    mine: () => drawUser(projectItems(), state.session, state.client),
    owner: () => drawOwner(projectItems(), state.client),
    library: () => drawLibrary(state.items, state.library, state.project, state.query, state.client),
    vendors: () => drawVendorMap(vendorMap(projectItems()), state.query),
    brief: () => drawBrief(currentBrief(), state.slide),
    present: () => drawPresentation(currentBrief(), state.slide),
    sources: () => drawSources(state.sourceStatus, state.sourceResults, state.client),
    projects: () => drawProjects(state.projects, state.project),
  };
  syncProjectSelect();
  main.innerHTML = draw[state.view]();
  bind();
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
    return `<div class="pane"><p>No review records yet.</p><p class="quiet">Import the register workbook, or start the method checklist.</p></div>`;
  }
  return `<div class="split">
    <div class="list">${items.map((item) => `<button type="button" class="item ${current && current.code === item.code ? "on" : ""}" data-code="${esc(item.code)}">
      <strong>${esc(item.code)} ${esc(item.title)}</strong>
      <small>${esc(item.layer)} · v${esc(item.version || 0)} · ${esc(item.ownerRole)} prepares · ${esc(item.reviewerRole)} reviews</small>
      ${pills(item)}
    </button>`).join("")}</div>
    <div class="pane">${current ? form(current) : ""}</div>
  </div>`;
}

function drawCards() {
  const items = visibleItems();
  if (!items.length) return `<div class="pane"><p>No cards yet. Import the register or add a review.</p></div>`;
  const shown = items.slice(0, 12);
  return `<p class="quiet">Showing ${shown.length} of ${items.length} cards. Search to narrow the list.</p><div class="cards">${shown.map((item) => `<article class="card">
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
    ${Object.entries(count.byAction).map(([name, value]) => `<p>${esc(name)} <strong class="num" style="display:inline;font-size:14px;">${value}</strong></p><div class="bar"><span style="width:${Math.round((value / max) * 100)}%"></span></div>`).join("")}
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
  return `<div class="duties">${DUTIES.map((duty) => `<article class="duty"><h2 style="font-size:16px;margin:0 0 6px;">${esc(label[duty.role] || duty.role)}</h2><p>${esc(duty.duty)}</p></article>`).join("")}
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
    <p>Import cannot approve a record. Send the record to review, then a different person and a different role use Approve. The person who prepared the record cannot approve it.</p>
    <p>Hold or Restructure is a source category from the October workbook. It is not one of the four actions. Set the action before approval. A missing fact keeps confidence pending and does not change the risk band.</p>
    <p>${state.items.length} records are loaded. ${waiting} still need an action. ${inReview} are in review.</p>
    <div class="row-actions">
      <button type="button" id="export-workbook" class="primary">Export workbook</button>
      <label class="ghost">Choose workbook <input id="import-file" type="file" accept=".xlsx" /></label>
      <button type="button" id="import-workbook">Import workbook</button>
    </div>
    <p class="quiet" id="import-result">${current ? `${current.code} is selected at version ${current.version || 0}.` : "Select a record to see its versions."}</p>
  </div>
  <div class="pane" style="margin-top:12px;" id="version-list"><p class="quiet">Version history loads for the selected record.</p></div>`;
}

function form(item) {
  const actor = { email: state.session?.email || "", role: state.session?.role || item.reviewerRole };
  const block = item.status === "Approved" ? "" : approvalBlock(actor, item);
  const updates = item.updates.map((update) => `<p class="quiet">${esc(update.role || "team")}: ${esc(update.text)}</p>`).join("");
  return `<form class="form" id="review-form">
    <p class="label">${esc(item.code)} · version ${esc(item.version || 0)} · ${esc(item.stage)} · ${esc(item.layer)}${item.sourceCategory ? ` · source category ${esc(item.sourceCategory)}` : ""}</p>
    <div class="row-actions">
      <button class="primary" type="submit">Save change</button>
      <button type="button" data-status="In review">Send to review</button>
      <button type="button" data-status="Returned">Return</button>
      <button type="button" data-status="Approved">Approve</button>
    </div>
    ${state.session?.email && block ? `<p class="block">${esc(block)}</p>` : `<p class="ok">A different role approves. A missing fact keeps confidence pending and does not change risk.</p>`}
    <label class="field">Title <input name="title" value="${esc(item.title)}" /></label>
    <div class="grid-2">
      <label class="field">Layer <select name="layer">${options(LAYERS, item.layer)}</select></label>
      <label class="field">Stage <select name="stage">${options(STAGES, item.stage)}</select></label>
      <label class="field">Owner role <select name="ownerRole">${options(["nstt", "cpi", "trade"], item.ownerRole)}</select></label>
      <label class="field">Reviewer role <select name="reviewerRole">${options(["nstt", "cpi", "trade"], item.reviewerRole)}</select></label>
      <label class="field">Risk <select name="risk">${options(RISK, item.risk)}</select></label>
      <label class="field">Confidence <select name="confidence">${options(CONFIDENCE, item.confidence)}</select></label>
      <label class="field">Action <select name="action"><option value="">Not set</option>${options(ACTIONS, item.action)}</select></label>
      <label class="field">Status <select name="status">${options(STATUSES, item.status)}</select></label>
      <label class="field">Project <select name="projectId">${options(state.projects.map((project) => project.code), item.projectId || "MDC")}</select></label>
      <label class="field">Vendor <input name="supplier" value="${esc(item.supplier || "")}" /></label>
      <label class="field">Part code <input name="sourceItem" value="${esc(item.sourceItem || "")}" /></label>
      <label class="field">Drawing <input name="drawing" value="${esc(item.drawing || "")}" /></label>
    </div>
    <label class="field">Condition <textarea name="condition">${esc(item.condition)}</textarea></label>
    <label class="field">Future policy and lifecycle <textarea name="lifecycle">${esc(item.lifecycle)}</textarea></label>
    <label class="field">Evidence <textarea name="evidence">${esc(item.evidence)}</textarea></label>
    <label class="field">Open fact <textarea name="openFact">${esc(item.openFact)}</textarea></label>
    <label class="field"><span>Trade sensitive</span> <input name="tradeSensitive" type="checkbox" ${item.tradeSensitive ? "checked" : ""} /></label>
    <label class="field">Team update <textarea name="update" placeholder="What changed?"></textarea></label>
    ${updates}
  </form>`;
}

function readForm(formElement, item) {
  const data = new FormData(formElement);
  const update = String(data.get("update") || "").trim();
  const next = normalizeReview({
    ...item,
    title: data.get("title"),
    layer: data.get("layer"),
    stage: data.get("stage"),
    ownerRole: data.get("ownerRole"),
    reviewerRole: data.get("reviewerRole"),
    risk: data.get("risk"),
    confidence: data.get("confidence"),
    action: data.get("action"),
    status: data.get("status"),
    condition: data.get("condition"),
    lifecycle: data.get("lifecycle"),
    evidence: data.get("evidence"),
    openFact: data.get("openFact"),
    projectId: data.get("projectId"),
    supplier: data.get("supplier"),
    sourceItem: data.get("sourceItem"),
    drawing: data.get("drawing"),
    tradeSensitive: data.get("tradeSensitive") === "on",
    preparedBy: item.preparedBy || state.session?.email || "",
  });
  if (update) {
    next.updates = [...item.updates, {
      at: new Date().toISOString(),
      by: state.session?.email || "development",
      role: state.session?.role || next.ownerRole,
      text: update,
    }];
  }
  return next;
}

async function persist(item, quiet = false) {
  if (state.session?.state !== "granted") {
    if (!quiet) setNotice("The change is visible here. It is not stored. A granted role is required, and this host does not keep records after a restart.");
    return;
  }
  const response = await fetch("/api/workbench/items", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  const body = await response.json();
  if (!response.ok) {
    setNotice(body.message || "The record was not stored.");
    return null;
  }
  const saved = normalizeReview(body);
  replace(saved);
  setNotice(state.session?.database === "postgres"
    ? `Stored as version ${saved.version} in the development database.`
    : "Stored for this environment. This host still uses memory, so a restart clears it.");
  return saved;
}

function replace(item) {
  state.items = state.items.map((current) => (current.code === item.code ? item : current));
  state.selected = item.code;
  render();
}

function bind() {
  main.querySelectorAll("[data-code]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selected = button.dataset.code;
      render();
    });
  });
  const formElement = document.querySelector("#review-form");
  if (formElement) {
    formElement.addEventListener("submit", async (event) => {
      event.preventDefault();
      const item = readForm(formElement, selected());
      replace(item);
      await persist(item);
    });
    formElement.querySelectorAll("[data-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const item = readForm(formElement, selected());
        item.status = button.dataset.status;
        if (item.status === "Approved") {
          const block = approvalBlock({ email: state.session?.email || "", role: state.session?.role || "" }, item);
          if (block) {
            item.status = selected().status;
            replace(item);
            setNotice(block);
            return;
          }
          item.reviewedBy = state.session?.email || "";
        }
        replace(normalizeReview(item));
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
        setNotice("The decision brief is downloading. It uses the current approved records for this project.");
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
    });
  });
  main.querySelectorAll("[data-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.project = button.dataset.project;
      state.slide = 0;
      state.view = "queue";
      const visible = visibleItems();
      state.selected = visible[0]?.code || "";
      setNotice(`Showing ${state.project}. A blank project id still belongs to MDC until a record is saved into another project.`);
      render();
    });
  });
  main.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selected = button.dataset.code;
      state.view = button.dataset.open || "queue";
      render();
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
    ? `<p class="label">Versions for ${esc(current.code)}</p>${versions.map((version) => `<p>${esc(version.version)}. ${esc(version.savedBy)} · ${esc(version.changeNote || "Saved")}</p><button type="button" data-restore="${esc(version.version)}">Restore as a new version</button>`).join("")}`
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
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = state.client ? `${state.project}-client-register.csv` : `${state.project}-decision-register.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    render();
  });
});

function syncProjectSelect() {
  const select = document.querySelector("#project");
  if (!select) return;
  const codes = state.projects.map((project) => project.code);
  if (!codes.includes(state.project)) state.project = "MDC";
  select.innerHTML = state.projects.map((project) => `<option value="${esc(project.code)}" ${project.code === state.project ? "selected" : ""}>${esc(project.name)}</option>`).join("");
}

document.querySelector("#project").addEventListener("change", (event) => {
  state.project = event.target.value;
  state.slide = 0;
  const visible = visibleItems();
  state.selected = visible[0]?.code || "";
  setNotice(`Showing ${state.project}. Metrics, cards, and dashboards follow this project. The workbook export still covers the full register.`);
  render();
});

document.querySelector("#search").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

document.querySelector("#client-toggle").addEventListener("click", () => {
  state.client = !state.client;
  setNotice(state.client
    ? "Client view shows the action, conditions, and lifecycle. Method notes stay off this view."
    : "Internal view is open. China and client do not sign in.");
  render();
});

document.querySelector("#add-record").addEventListener("click", async () => {
  const item = normalizeReview({ code: nextCode(state.items), title: "New review", ownerRole: "nstt", reviewerRole: "cpi", projectId: state.project });
  state.items = [...state.items, item];
  state.selected = item.code;
  state.view = "queue";
  render();
  await persist(item);
});

document.querySelector("#load-method").addEventListener("click", async () => {
  const existing = new Set(state.items.map((item) => item.code));
  const additions = methodChecklist().filter((item) => !existing.has(item.code));
  state.items = [...state.items, ...additions];
  state.selected = additions[0]?.code || state.selected;
  state.view = "queue";
  setNotice("The method checklist is ready. It does not contain the client register. Save still requires a granted role.");
  render();
  for (const item of additions) await persist(item, true);
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) return;
  const views = ["queue", "cards", "metrics", "outputs", "duties", "updates"];
  if (event.key >= "1" && event.key <= "6") {
    state.view = views[Number(event.key) - 1];
    render();
    return;
  }
  if ((state.view === "present" || state.view === "brief") && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
    const brief = currentBrief();
    const last = Math.max(0, (state.view === "present" ? presentationSlides(brief) : brief.slides).length - 1);
    state.slide = event.key === "ArrowRight" ? Math.min(last, state.slide + 1) : Math.max(0, state.slide - 1);
    render();
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
