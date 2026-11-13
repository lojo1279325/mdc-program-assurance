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

export function drawQuickGuide({ view, role, projectName, practice }) {
  const guides = {
    home: ["Start with the next action", "Read your project and role, then use the main button on Start here. My work shows the records waiting on your role.", "mine", "Open my work"],
    mine: ["Find work assigned to you", "Open an assigned record to continue its analysis or review. Approved records are read-only.", "analysis", "Open guided analysis"],
    analysis: role === "administrator"
      ? ["Manage access without changing analyses", "Administrators manage grants and projects. Use Roles and practice to learn the workflow with sample records in development.", "duties", "Open roles and practice"]
      : role === "nstt"
        ? ["Save each step, then send for review", "Complete the facts, evidence, recommended action, conditions, and Future Policy/Lifecycle. Save and continue stores the step before moving on.", "queue", "Open review queue"]
        : ["Check the record before deciding", "Review the evidence and conditions for a record assigned to your role. Save your review note, then approve or return it. You cannot approve your own preparation.", "queue", "Open review queue"],
    queue: ["Find the right record", "Search by record code, component, or supplier. Use the status buttons to narrow the list, then open the analysis from its record.", "mine", "Open my work"],
    workflow: ["See what needs to move next", "Read the preparation, review, and approval stages for this project. Open records remain outside the approved decision line.", "queue", "Open review queue"],
    brief: ["Read the approved decision line", "The headline and action counts use approved records. Readiness and open-item summaries also show work that still needs review.", "present", "Open presentation"],
    present: ["Present the current project", "Choose a thumbnail or use the arrow keys. Use Readable size to inspect a slide, and open Slide details for complete conditions and lifecycle notes. Download PowerPoint keeps the same layouts and editable graphics.", "brief", "Open decision brief"],
    vendors: ["Check each supplier and component", "Inspect the component links, action, and confidence. A supplier name or map entry does not establish qualification or purchasing approval.", "brief", "Open decision brief"],
    cards: ["Compare the visible review records", "Each card summarizes its record, action, evidence, and lifecycle note. Search to narrow the cards, then use the review queue to open the complete record.", "queue", "Open review queue"],
    completion: ["Find the missing information", "Read completion by record and field. A complete record still needs its assigned review before it enters the approved decision line.", "queue", "Open review queue"],
    owner: ["See where work is assigned", "Review the preparation and review assignments for this project. Your account can act only within its granted role.", "mine", "Open my work"],
    metrics: ["Read the project totals", "Use the counts to track preparation and approval. Risk, confidence, and action measure different things and remain separate.", "workflow", "Open progress"],
    library: ["Check the supplier and part references", "Use the library to find recorded supplier and part information. A library entry is a reference, not a qualification decision.", "vendors", "Open vendor map"],
    projects: ["Confirm the review set", "Choose the project whose records you need. Creating a project starts an empty review set and does not move the existing register.", "home", "Open Start here"],
    outputs: ["Export the selected project", "Check the project name before downloading. This CSV follows the selected project. The workbook under Import and versions covers the full register.", "brief", "Open decision brief"],
    duties: ["Rehearse the work in the right role", "Read the instructions for NSTT, CPI, and Trade. Designated development administrators can use practice roles on sample records without changing their actual grant.", "home", "Open Start here"],
    updates: ["Keep a versioned record", "The workbook covers the full register. Review its scope before importing. A record save creates a version; opening this screen does not import or restore anything.", "queue", "Open review queue"],
    sources: ["Use source checks as evidence", "Connection status identifies available providers. A search result is supporting evidence, not a screening clearance or an approval.", "analysis", "Open guided analysis"],
  };
  const [title, detail, target, action] = guides[view] || ["Choose the next step", "Use the navigation to return to your assigned work or read the role-by-role practice instructions.", "home", "Open Start here"];
  return `<div class="guide-heading"><div><p class="kicker">Quick guide</p><h2 id="quick-guide-title">${esc(title)}</h2></div><button type="button" class="ghost" data-guide-close autofocus>Close</button></div>
    <p class="guide-context">${esc(projectName)} · ${esc(ROLE_LABEL[role] || "No granted role")}${practice ? " · Practice only" : ""}</p>
    <p>${esc(detail)}</p>
    <ol class="guide-flow">
      <li><span>1</span><div><strong>Prepare</strong><p>NSTT records the analysis and sends it to review.</p></div></li>
      <li><span>2</span><div><strong>Review</strong><p>The assigned CPI or Trade reviewer records a decision.</p></div></li>
      <li><span>3</span><div><strong>Decide</strong><p>Approved records feed the decision line and executive outputs.</p></div></li>
    </ol>
    <p class="quiet">Risk, confidence, and action are separate. Missing facts lower confidence, not risk. Every component needs Future Policy/Lifecycle.</p>
    <div class="row-actions"><button type="button" class="primary" data-guide-to="${target}">${action}</button><button type="button" class="ghost" data-guide-to="duties">Role-by-role instructions</button></div>`;
}
