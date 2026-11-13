import { ROLE_LABEL, recordAccess } from "./privileges.js";

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function workPlan(actor, items = []) {
  const available = items.filter((item) => {
    const access = recordAccess(actor, item);
    return access.mode === "prepare" || access.mode === "review";
  }).sort((left, right) => Number(right.status === "Returned") - Number(left.status === "Returned"));
  const next = available[0] || null;
  if (actor.role === "administrator") {
    return { title: "Manage access for this environment", detail: "Grant a working role to each team member before they begin.", action: "Manage roles", task: "access", items: [], next: null };
  }
  if (next) {
    const preparing = recordAccess(actor, next).mode === "prepare";
    return {
      title: preparing ? `Continue ${next.code}` : `Review ${next.code}`,
      detail: `${next.title || "Untitled review"}. ${preparing ? "Complete the analysis, then send it to the assigned reviewer." : "Check the evidence and record your review before a decision."}`,
      action: preparing ? "Continue analysis" : "Open review",
      task: "continue",
      items: available,
      next,
    };
  }
  return actor.role === "nstt"
    ? { title: "Start the next analysis", detail: "Create a record and work through the guided preparation steps.", action: "New analysis", task: "new", items: [], next: null }
    : { title: "No records are waiting on your role", detail: "Use the review queue to browse records or check the project’s progress.", action: "View review queue", task: "queue", items: [], next: null };
}

export function drawStart({ actor, items, projectName, practice, canPractice, signedIn }) {
  if (!signedIn) return `<section class="pane start-next"><p class="kicker">Access required</p><h2>Sign in to open your work</h2><p>Your account needs an administrator-granted role for this environment.</p><a class="primary sign-in-action" href="/">Open sign-in page</a></section>`;
  const plan = workPlan(actor, items);
  const preparing = items.filter((item) => item.status === "Open" || item.status === "Returned").length;
  const reviewing = items.filter((item) => item.status === "In review").length;
  const approved = items.filter((item) => item.status === "Approved").length;
  const role = ROLE_LABEL[actor.role] || "No granted role";
  const rows = plan.items.slice(0, 5);
  return `<div class="start-layout">
    <section class="pane start-next" aria-label="Your next action">
      <p class="kicker">${esc(projectName)}${practice ? " · Practice only" : ""}</p>
      <h2>${esc(plan.title)}</h2>
      <p>${esc(plan.detail)}</p>
      <div class="row-actions"><button type="button" class="primary" data-task="${plan.task}" ${plan.next ? `data-task-code="${esc(plan.next.code)}"` : ""}>${esc(plan.action)}</button><button type="button" data-open="mine">View my work</button></div>
    </section>
    <aside class="pane start-role" aria-label="Current role">
      <p class="kicker">Your role${practice ? " in this practice" : ""}</p><h2>${esc(role)}</h2>
      <p>${actor.role === "administrator" ? "Administer access and projects. Preparation and approval belong to the working roles." : actor.role === "nstt" ? "Prepare the facts and recommended action. A different reviewer approves." : "Review assigned records. The preparation fields stay read-only."}</p>
      <button type="button" class="text-button" data-open="duties">Roles and practice guide</button>
    </aside>
    <section class="pane start-progress" aria-label="Project status">
      <div class="section-heading"><h2>Project progress</h2><button type="button" class="text-button" data-open="workflow">View workflow</button></div>
      <div class="progress-stops">
        <button type="button" data-status-filter="preparing"><span>Prepare</span><strong>${preparing}</strong><small>Open or returned</small></button>
        <button type="button" data-status-filter="In review"><span>Review</span><strong>${reviewing}</strong><small>With a reviewer</small></button>
        <button type="button" data-status-filter="Approved"><span>Decide</span><strong>${approved}</strong><small>Approved records</small></button>
      </div>
      <p class="quiet">The decision line uses approved records. Readiness and open-record summaries cover the wider project.</p>
    </section>
    <section class="pane start-work" aria-label="Work waiting on your role">
      <div class="section-heading"><h2>${actor.role === "administrator" ? "Practice without changing client work" : "Waiting on your role"}</h2></div>
      ${actor.role === "administrator"
        ? `<p>Use sample records to walk through preparation, review, and approval. Your administrator grant stays unchanged.</p>${canPractice ? `<div class="row-actions"><button type="button" data-task="practice">Open practice reviews</button></div>` : `<p class="quiet">Practice roles are available only to designated administrators in development.</p>`}`
        : rows.length ? `<div class="start-work-list">${rows.map((item) => `<button type="button" data-task="continue" data-task-code="${esc(item.code)}"><span><strong>${esc(item.code)}</strong> ${esc(item.title)}</span><span class="pill">${esc(item.status)}</span></button>`).join("")}</div>`
          : `<p>No assigned work is waiting. You can still browse the project’s records and outputs.</p>`}
    </section>
  </div>`;
}

export function drawRecordPath(item, actor) {
  const access = recordAccess(actor, item);
  const current = item.status === "Approved" ? 2 : item.status === "In review" ? 1 : 0;
  return `<section class="record-path" aria-label="Record progress">
    <ol>${["Prepare", "Review", "Approved"].map((label, index) => `<li ${index === current ? 'aria-current="step"' : ""} class="${index <= current ? "reached" : ""}"><span>${index + 1}</span>${label}</li>`).join("")}</ol>
    <button type="button" class="${access.mode === "prepare" || access.mode === "review" ? "primary" : "ghost"}" data-code="${esc(item.code)}" data-open="analysis">${access.mode === "prepare" ? "Continue analysis" : access.mode === "review" ? "Open review" : "View analysis"}</button>
  </section>`;
}
