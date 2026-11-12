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

const state = {
  items: [],
  selected: "",
  view: "queue",
  query: "",
  client: false,
  session: null,
  notice: "This is the development workspace. Production is unchanged. A granted role is required before a record is stored.",
};

const titles = {
  queue: "Queue",
  cards: "Review cards",
  metrics: "Metrics",
  outputs: "Outputs",
  duties: "Separation of duties",
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

function visibleItems() {
  const query = state.query.trim().toLowerCase();
  return state.items.filter((item) => {
    if (!query) return true;
    return `${item.code} ${item.title} ${item.layer} ${item.action}`.toLowerCase().includes(query);
  });
}

function selected() {
  return state.items.find((item) => item.code === state.selected) || visibleItems()[0] || null;
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
  const draw = { queue: drawQueue, cards: drawCards, metrics: drawMetrics, outputs: drawOutputs, duties: drawDuties };
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
    return `<div class="pane"><p>No review records yet.</p><p class="quiet">Start the method checklist, or add one review. The client register is not loaded in this workspace.</p></div>`;
  }
  return `<div class="split">
    <div class="list">${items.map((item) => `<button type="button" class="item ${current && current.code === item.code ? "on" : ""}" data-code="${esc(item.code)}">
      <strong>${esc(item.code)} ${esc(item.title)}</strong>
      <small>${esc(item.layer)} · ${esc(item.ownerRole)} prepares · ${esc(item.reviewerRole)} reviews</small>
      ${pills(item)}
    </button>`).join("")}</div>
    <div class="pane">${current ? form(current) : ""}</div>
  </div>`;
}

function drawCards() {
  const items = visibleItems();
  if (!items.length) return `<div class="pane"><p>No cards yet. Add a review to see the card update.</p></div>`;
  return `<div class="cards">${items.map((item) => `<article class="card">
    <p class="label">${esc(item.code)} · ${esc(item.stage)}</p>
    <h2 style="font-size:16px;margin:4px 0 8px;">${esc(item.title || "Untitled review")}</h2>
    ${pills(item)}
    <p>${esc(state.client ? item.condition || "No condition recorded." : item.evidence || "No evidence recorded. Confidence stays pending.")}</p>
    <p class="quiet">Lifecycle: ${esc(item.lifecycle || "Not recorded.")}</p>
    <p class="quiet">${esc(item.ownerRole)} prepares. ${esc(item.reviewerRole)} reviews.</p>
  </article>`).join("")}</div>`;
}

function drawMetrics() {
  const count = metrics(state.items);
  const card = scorecard(state.items);
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

function drawOutputs() {
  const card = scorecard(state.items);
  const rows = state.client ? clientView(state.items) : state.items.map(normalizeReview);
  const headers = state.client
    ? ["Code", "Title", "Action", "Condition", "Lifecycle", "Confidence"]
    : ["Code", "Title", "Risk", "Confidence", "Action", "Status", "Lifecycle"];
  const show = (value) => value || "Not recorded";
  const cells = state.client
    ? (item) => [item.code, item.title, show(item.action), show(item.condition), show(item.lifecycle), item.confidence]
    : (item) => [item.code, item.title, item.risk, item.confidence, show(item.action), item.status, show(item.lifecycle)];
  const actions = actionList(state.items).filter((action) => !state.client || action.text.includes("should not proceed"));
  return `<div class="pane sentences">
    <p class="label">${state.client ? "Client output" : "Internal scorecard"}</p>
    ${card.sentences.map((sentence) => `<p>${esc(sentence)}</p>`).join("")}
    <p class="label">Action list</p>
    ${actions.length ? actions.map((action) => `<p>${esc(action.text)}</p>`).join("") : "<p>No open actions. Add a review to generate the list.</p>"}
    <div class="row-actions"><button type="button" id="download" class="primary">Download register</button></div>
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

function form(item) {
  const actor = { email: state.session?.email || "", role: state.session?.role || item.reviewerRole };
  const block = item.status === "Approved" ? "" : approvalBlock(actor, item);
  const updates = item.updates.map((update) => `<p class="quiet">${esc(update.role || "team")}: ${esc(update.text)}</p>`).join("");
  return `<form class="form" id="review-form">
    <p class="label">${esc(item.code)} · ${esc(item.stage)} · ${esc(item.layer)}</p>
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
    return;
  }
  setNotice(state.session?.database === "postgres"
    ? "Stored in the development database. A restart does not clear this record."
    : "Stored for this environment. This host still uses memory, so a restart clears it.");
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
}

function exportRegister() {
  const rows = state.client ? clientView(state.items) : state.items.map(normalizeReview);
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = state.client ? "client-register.csv" : "decision-register.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    render();
  });
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
  const item = normalizeReview({ code: nextCode(state.items), title: "New review", ownerRole: "nstt", reviewerRole: "cpi" });
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
  const views = ["queue", "cards", "metrics", "outputs", "duties"];
  if (event.key >= "1" && event.key <= "5") {
    state.view = views[Number(event.key) - 1];
    render();
  }
});

const sessionResponse = await fetch("/api/session", { credentials: "include", cache: "no-store" }).catch(() => null);
if (sessionResponse?.ok) {
  state.session = await sessionResponse.json();
  document.querySelector("#env-label").textContent = state.session.environment || "development";
  if (state.session.state === "granted") {
    const stored = await fetch("/api/workbench", { credentials: "include", cache: "no-store" });
    if (stored.ok) {
      const body = await stored.json();
      state.items = Array.isArray(body.items) ? body.items.map(normalizeReview) : [];
      setNotice(state.session.database === "postgres"
        ? `Signed in as ${state.session.role}. Records are stored in the development database.`
        : `Signed in as ${state.session.role}. Records on this host do not survive a restart until a database is connected.`);
    }
  }
}
render();
