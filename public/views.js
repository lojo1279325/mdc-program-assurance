import { ACTIONS, STAGES, STATUSES } from "./rules.js";
import {
  BUILT_IN_PROJECT,
  buildLibrary,
  completionBoard,
  ownerBoard,
  userBoard,
  workflowBoard,
  workflowMarkup,
} from "./boards.js";

const ROLE_LABEL = { nstt: "NSTT", cpi: "CPI", trade: "Trade", administrator: "Administrator" };

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

function pills(item) {
  return `<div class="pills"><span class="pill ${posture(item.action)}">${esc(item.action || "Action not set")}</span><span class="pill grey">Confidence ${esc(item.confidence)}</span><span class="pill">${esc(item.status)}</span></div>`;
}

function codes(items) {
  if (!items.length) return "<p>None in this project.</p>";
  return `<div class="pills">${items.slice(0, 12).map((item) => `<button type="button" class="item code-link" data-code="${esc(item.code)}" data-open="queue">${esc(item.code)}</button>`).join("")}</div>${items.length > 12 ? `<p class="quiet">${items.length - 12} more records are in this project.</p>` : ""}`;
}

export function drawWorkflow(items) {
  const board = workflowBoard(items);
  const graphic = workflowMarkup(board);
  return `<div class="pane sentences">
    <p class="label">Status track</p>
    <p>${board.records} records are in this project. ${board.building} are still being built. ${board.inReview} are in review. ${board.approved} are approved.</p>
    <div class="graphic">${graphic.status}</div>
    <ol class="track">${STATUSES.map((status) => `<li><strong class="num">${board.byStatus[status] || 0}</strong><span>${esc(status)}</span></li>`).join("")}</ol>
    <p class="label">Stage track</p>
    <p>The review sequence is ${esc(STAGES.join(", "))}.</p>
    <div class="graphic">${graphic.stages}</div>
    <ol class="track stages">${STAGES.map((stage) => `<li><strong class="num">${board.byStage[stage] || 0}</strong><span>${esc(stage)}</span></li>`).join("")}</ol>
    <p>Open and Returned mean the record is still being built. In review means a different role has the record. Approved means a different person and a different role accepted it.</p>
  </div>`;
}

export function drawCompletion(items) {
  const board = completionBoard(items);
  return `<div class="metrics">
    ${board.gates.slice(0, 4).map((gate) => `<article class="metric"><strong>${gate.done}</strong><span>${esc(gate.label)}</span></article>`).join("")}
  </div>
  <div class="pane sentences" style="margin-top:12px;">
    <p class="label">Completion</p>
    <p>A record is ready for a different role when the action, the evidence, and the lifecycle are recorded. ${board.ready} records are ready and not yet approved. ${board.pendingConfidence} records have pending confidence.</p>
    <p>A missing fact keeps confidence pending. It does not change the risk band.</p>
    ${board.gates.map((gate) => `<p>${esc(gate.label)} <strong class="num" style="display:inline;font-size:14px;">${gate.done} of ${gate.total}</strong></p><div class="bar" role="img" aria-label="${esc(gate.label)} ${gate.done} of ${gate.total}"><span style="width:${gate.total ? Math.round((gate.done / gate.total) * 100) : 0}%"></span></div>`).join("")}
  </div>`;
}

export function drawUser(items, session, client) {
  const board = userBoard(items, session || {});
  if (!session?.email) {
    return `<div class="pane"><p>Sign in with a granted role to see the records you prepared and the records waiting on your role.</p></div>`;
  }
  return `<div class="sentences pane">
    <p class="label">My work</p>
    <p>You are signed in as ${esc(ROLE_LABEL[session.role] || session.role)}. This view shows your drafts and the records waiting on your role. It does not approve anything.</p>
  </div>
  <div class="cards" style="margin-top:12px;">
    <article class="card"><p class="label">Prepared by you</p><strong class="num">${board.prepared.length}</strong>${client ? "" : codes(board.prepared)}</article>
    <article class="card"><p class="label">Waiting on your role</p><strong class="num">${board.waiting.length}</strong><p class="quiet">A different person from the preparer must review these records.</p>${client ? "" : codes(board.waiting)}</article>
    <article class="card"><p class="label">Returned to you</p><strong class="num">${board.returned.length}</strong>${client ? "" : codes(board.returned)}</article>
  </div>`;
}

export function drawOwner(items, client) {
  const rows = ownerBoard(items);
  return `<div class="pane sentences">
    <p class="label">Owner view</p>
    <p>Each owner role can see how many records are still open, in review, returned, or approved. Confidence pending is not a risk color.</p>
  </div>
  <div style="overflow:auto;margin-top:12px;">
    <table>
      <thead><tr><th>Owner role</th><th>Records</th><th>Open</th><th>In review</th><th>Returned</th><th>Approved</th><th>Action not set</th><th>Confidence pending</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${esc(ROLE_LABEL[row.role])}</td><td>${row.records}</td><td>${row.open}</td><td>${row.inReview}</td><td>${row.returned}</td><td>${row.approved}</td><td>${row.actionNotSet}</td><td>${row.pendingConfidence}</td></tr>`).join("")}</tbody>
    </table>
  </div>
  <div class="cards" style="margin-top:12px;">
    ${rows.map((row) => `<article class="card"><p class="label">${esc(ROLE_LABEL[row.role])} preparers</p>${row.preparers.length ? row.preparers.slice(0, 6).map((person) => `<p>${client ? "Preparer" : esc(person.email)} <span class="quiet">${person.open} still open of ${person.records}</span></p>`).join("") : "<p>No records for this owner role.</p>"}</article>`).join("")}
  </div>`;
}

export function drawLibrary(items, saved, projectId, query, client) {
  const library = buildLibrary(items, saved.vendors || [], saved.parts || [], projectId);
  const text = query.trim().toLowerCase();
  const vendors = library.vendors.filter((row) => !text || `${row.name} ${row.country} ${row.identifier}`.toLowerCase().includes(text));
  const parts = library.parts.filter((row) => !text || `${row.code} ${row.name} ${row.vendorName} ${row.drawing}`.toLowerCase().includes(text));
  const vendorCards = vendors.slice(0, 24).map((row) => libraryCard(row, "vendor", client)).join("");
  const partCards = parts.slice(0, 24).map((row) => libraryCard(row, "part", client)).join("");
  return `<div class="pane sentences">
    <p class="label">Libraries</p>
    <p>${library.vendors.length} vendor names and ${library.parts.length} parts are in this environment. Current evaluations below are for the selected project. A saved name stays in the library before a review exists.</p>
    <form class="form" id="vendor-form">
      <div class="grid-2">
        <label class="field">Vendor name <input name="name" required /></label>
        <label class="field">Country <input name="country" /></label>
        <label class="field">Identifier <input name="identifier" /></label>
        <label class="field">Note <input name="note" /></label>
      </div>
      <div class="row-actions"><button class="primary" type="submit">Add vendor</button></div>
    </form>
    <form class="form" id="part-form">
      <div class="grid-2">
        <label class="field">Part code <input name="code" required /></label>
        <label class="field">Part name <input name="name" required /></label>
        <label class="field">Drawing <input name="drawing" /></label>
        <label class="field">Vendor name <input name="vendorName" /></label>
      </div>
      <div class="row-actions"><button type="submit">Add part</button></div>
    </form>
  </div>
  <h2 class="section-title">Vendor names</h2>
  <p class="quiet">Showing ${Math.min(24, vendors.length)} of ${vendors.length}.</p>
  <div class="cards">${vendorCards || `<article class="card"><p>No vendor names in this view.</p></article>`}</div>
  <h2 class="section-title">Parts</h2>
  <p class="quiet">Showing ${Math.min(24, parts.length)} of ${parts.length}.</p>
  <div class="cards">${partCards || `<article class="card"><p>No parts in this view.</p></article>`}</div>`;
}

function libraryCard(row, kind, client) {
  const title = kind === "vendor" ? row.name : `${row.code} ${row.name}`;
  const current = row.current;
  return `<article class="card">
    <p class="label">${kind === "vendor" ? "Vendor" : "Part"}${row.saved ? " · saved" : ""}</p>
    <h2 style="font-size:16px;margin:4px 0 8px;">${esc(title)}</h2>
    <p class="quiet">${row.evaluations} current evaluation${row.evaluations === 1 ? "" : "s"}. ${row.otherProjects} in other projects.</p>
    ${current ? pills(current) : `<p>No current evaluation in this project.</p>`}
    ${current && !client ? `<p class="quiet">${esc(current.code)} · ${esc(current.title || "Untitled")}</p>` : ""}
    ${row.codes?.length && !client ? `<div class="pills">${row.codes.map((code) => `<button type="button" class="item code-link" data-code="${esc(code)}" data-open="queue">${esc(code)}</button>`).join("")}</div>` : ""}
    ${row.more && !client ? `<p class="quiet">${row.more} more records are linked.</p>` : ""}
    ${!client && row.note ? `<p>${esc(row.note)}</p>` : ""}
  </article>`;
}

export function drawSources(status, results, client) {
  const connected = status || { federalRegister: true, screeningList: false, sayari: false };
  return `<div class="pane sentences">
    <p class="label">Public sources and Sayari</p>
    <p>Federal Register is a public notice search. It is not a screening determination. The US Consolidated Screening List and Sayari run only when this environment has their credentials.</p>
    <p>A match is a source note. It does not set the action, and it does not change the risk band. A missing fact still lowers confidence, not the risk band.</p>
    <p>Federal Register is available. Screening list is ${connected.screeningList ? "connected" : "not connected"}. Sayari is ${connected.sayari ? "connected" : "not connected"}.</p>
    ${client ? `<p>Source notes stay off the client view.</p>` : `<form class="form" id="source-form">
      <div class="grid-2">
        <label class="field">Name <input id="source-name" name="name" required /></label>
        <label class="field">Country <input name="country" /></label>
        <label class="field">Kind <select name="kind"><option value="vendor">Vendor</option><option value="part">Part</option></select></label>
      </div>
      <div class="row-actions"><button class="primary" type="submit">Check sources</button></div>
    </form>`}
  </div>
  ${client ? "" : `<div class="cards" style="margin-top:12px;">${(results || []).map((item) => `<article class="card"><p class="label">${esc(item.source)}</p><span class="pill grey">${esc(item.status)}</span><p>${esc(item.summary)}</p><p class="quiet">Observed ${esc(item.observedAt || "")}</p></article>`).join("") || `<article class="card"><p>No check yet. Enter a vendor or part name.</p></article>`}</div>`}`;
}

export function drawProjects(projects, current) {
  const rows = projects?.length ? projects : [BUILT_IN_PROJECT];
  return `<div class="pane sentences">
    <p class="label">Projects</p>
    <p>The current register stays on ${esc(BUILT_IN_PROJECT.name)}. A new project starts empty. Move a record only by saving it into the new project. That save creates a new version.</p>
    <p>Selected project: ${esc(rows.find((item) => item.code === current)?.name || current)}.</p>
    <form class="form" id="project-form">
      <div class="grid-2">
        <label class="field">Project code <input name="code" placeholder="POWER" required /></label>
        <label class="field">Project name <input name="name" required /></label>
      </div>
      <label class="field">Note <input name="note" /></label>
      <div class="row-actions"><button class="primary" type="submit">Create project</button></div>
    </form>
  </div>
  <div class="cards" style="margin-top:12px;">
    ${rows.map((project) => `<article class="card"><p class="label">${esc(project.code)}</p><h2 style="font-size:16px;margin:4px 0 8px;">${esc(project.name)}</h2><p>${esc(project.status || "Active")}${project.builtIn ? ". Built in." : ""}</p><button type="button" data-project="${esc(project.code)}">Open project</button></article>`).join("")}
  </div>`;
}

export { ACTIONS };
