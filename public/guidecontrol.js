// Loads, saves, and binds the design and sourcing screens:
// program plan, sourcing workflow, vendor and part repository, regulatory watch, and portfolio.
// The screens themselves are drawn by guideview.js and catalogview.js.
import { CATALOG_SEED } from "./catalog-seed.js";
import { mergeCatalog, vendorOf } from "./catalog-model.js";
import { GATES, designContext, lineRecheck } from "./guide-model.js";
import { dailyDigest, digestText, drawRepository, drawRepositoryList, drawWatch, esc, plural, roleName } from "./catalogview.js";
import {
  drawBasisPreview, drawPortfolio, drawProgram, drawSourcing, readBasisForm, readGateForm, readProgramSection, readSelectionForm,
} from "./guideview.js";

export const GUIDE_VIEWS = ["program", "sourcing", "repository", "watch", "portfolio"];
export const GUIDE_TITLES = {
  program: "Program plan",
  sourcing: "Sourcing workflow",
  repository: "Vendor and part repository",
  watch: "Regulatory watch",
  portfolio: "Portfolio",
};
// Forms whose unsaved entries are protected by the leave warning.
export const GUIDE_FORMS = "#basis-form, #gate-form, #gate-decision-form, #gate-reopen-form, #decisions-form, #actions-form, #considerations-form, #risks-form, #milestones-form, #selection-form, #selection-review-form, #selection-reopen-form, .field-change-form, .recheck-clear-form, .watch-review-form, #repo-add-form";

// The saved data each screen reads. The first entry is the one the screen cannot work without.
const NEEDS = {
  program: ["plan"],
  sourcing: ["plan", "catalog"],
  repository: ["catalog", "plan"],
  watch: ["watch", "catalog", "plan"],
  portfolio: ["portfolio"],
};
const SECTION_FORMS = {
  "decisions-form": ["decisions", "The decisions are saved."],
  "actions-form": ["actions", "The 90-day actions are saved."],
  "considerations-form": ["considerations", "The design considerations are saved."],
  "risks-form": ["risks", "The risk register is saved."],
  "milestones-form": ["milestones", "The milestones are saved. The timeline and the portfolio now show them."],
};
const FOCUS_KEYS = ["id", "name", "data-repo-entry", "data-line", "data-gate", "data-program-tab", "data-watch-tab", "data-repo-kind-switch", "data-field-edit", "data-watch-item", "data-portfolio-open"];
const HOUR = 60 * 60 * 1000;

const freshUi = () => ({
  programTab: "basis", gate: null, basisDraft: null, line: "", lineDraft: null, newSubsystem: "",
  repoKind: "vendors", repoQuery: "", repoSubsystem: "", repoFilter: "", repoEntry: "", repoField: "", repoAdd: "",
  watchTab: "", watchTopic: "", watchItem: "",
});

export function createGuide({ state, main, render, setNotice, leaveForm, goTo, practiceHeaders, actingRole, downloadFile, openProject }) {
  const g = {
    scope: "", plan: null, raw: null, catalog: null, watch: null, portfolio: null,
    loading: {}, error: {}, loadedAt: {}, analyzing: "", running: false, caughtUpAt: 0, ui: freshUi(),
  };
  state.guide = g;
  const tickets = {};
  const ui = g.ui;

  const scopeKey = () => `${state.project}|${state.practiceRole || ""}`;
  const projectName = () => state.projects.find(project => project.code === state.project)?.name || state.project;
  const signedIn = () => state.session?.state === "granted";
  const onGuide = () => GUIDE_VIEWS.includes(state.view);
  const loaded = (key) => Boolean({ plan: g.plan, catalog: g.catalog, watch: g.watch, portfolio: g.portfolio }[key]);
  const context = () => designContext(g.plan?.program?.payload);
  const currentLine = () => g.plan?.selections.find(row => row.id === ui.line) || null;

  // A change of project or practice role starts from the saved data of the new scope.
  function syncScope() {
    const scope = scopeKey();
    if (g.scope === scope) return;
    g.scope = scope;
    Object.assign(g, { plan: null, raw: null, catalog: null, watch: null, portfolio: null, loading: {}, error: {}, loadedAt: {}, analyzing: "", running: false });
    Object.assign(ui, { gate: null, basisDraft: null, line: "", lineDraft: null, newSubsystem: "", repoField: "", repoAdd: "", watchItem: "" });
  }

  // ---------- Loading ----------

  const SOURCES = {
    plan: {
      url: () => `/api/guide?project=${encodeURIComponent(state.project)}`,
      fail: "The program plan could not be loaded.",
      set: (body) => { g.plan = body; },
    },
    catalog: {
      url: () => `/api/catalog?project=${encodeURIComponent(state.project)}`,
      fail: "The repository could not be loaded.",
      set: (body) => {
        g.raw = body;
        g.catalog = mergeCatalog(CATALOG_SEED, Array.isArray(body.documents) ? body.documents : [], { practice: body.practice, auto: body.auto, reviews: body.reviews });
      },
    },
    watch: {
      url: () => `/api/watch?project=${encodeURIComponent(state.project)}`,
      fail: "The watch log could not be loaded.",
      set: (body) => { g.watch = body; },
    },
    portfolio: {
      url: () => "/api/portfolio",
      fail: "The portfolio could not be loaded.",
      set: (body) => { g.portfolio = body; },
    },
  };

  // Reads one set of saved data. A reply for an earlier scope or an earlier request is dropped.
  async function load(key) {
    const scope = g.scope;
    const ticket = (tickets[key] = (tickets[key] || 0) + 1);
    const current = () => g.scope === scope && tickets[key] === ticket;
    g.loading[key] = true;
    g.error[key] = "";
    try {
      const response = await fetch(SOURCES[key].url(), { credentials: "include", cache: "no-store", headers: practiceHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || SOURCES[key].fail);
      if (!current()) return false;
      SOURCES[key].set(body);
      g.loadedAt[key] = Date.now();
      return true;
    } catch (error) {
      if (current()) g.error[key] = error instanceof TypeError ? `${SOURCES[key].fail} Check the connection, then choose Try again.` : error.message;
      return false;
    } finally {
      if (current()) g.loading[key] = false;
    }
  }

  // The content scrolls inside the main pane on a wide screen, inside the workspace on a phone, and with the
  // whole page in a short window. Moving only that box keeps the page header in place on a phone, which
  // scrollIntoView does not promise.
  const STACKED = "(max-width: 900px), (max-height: 620px)";
  function scrollBox() {
    const page = document.scrollingElement;
    return [main, main.closest(".workspace")].find(node => node && node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY))
      || (page && page.scrollHeight > page.clientHeight + 1 ? page : main);
  }
  function bringToTop(selector) {
    const target = main.querySelector(selector);
    if (!target) return;
    const box = scrollBox();
    const edge = box === document.scrollingElement ? 0 : box.getBoundingClientRect().top;
    box.scrollTop += target.getBoundingClientRect().top - edge - 8;
  }

  // Draws the screen again and keeps the reader's place: focus, caret, and scroll positions.
  function redraw() {
    const active = document.activeElement;
    let selector = "";
    let formId = "";
    let caret = null;
    if (active && main.contains(active)) {
      for (const key of FOCUS_KEYS) {
        const value = active.getAttribute(key);
        if (value) { selector = `${active.tagName.toLowerCase()}[${key}="${CSS.escape(value)}"]`; break; }
      }
      formId = active.form?.id || "";
      try { caret = typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null; } catch { caret = null; }
    }
    const box = scrollBox();
    const scroll = box.scrollTop;
    const lists = ["#repo-list", "#line-list"].map(id => [id, main.querySelector(id)?.scrollTop || 0]);
    render();
    box.scrollTop = scroll;
    for (const [id, top] of lists) { const list = main.querySelector(id); if (list && top) list.scrollTop = top; }
    if (!selector) return;
    const next = (formId ? main.querySelector(`#${CSS.escape(formId)} ${selector}`) : null) || main.querySelector(selector);
    if (!next) return;
    next.focus({ preventScroll: true });
    if (caret) { try { next.setSelectionRange(caret[0], caret[1]); } catch { /* This control has no caret. */ } }
  }

  // Background results redraw the screen only when no unsaved entry is on it.
  const refresh = () => { if (onGuide() && !state.dirty) redraw(); };

  // Starts whatever the open screen still needs. Called after each draw of a guide screen.
  function ensure() {
    if (!onGuide() || !signedIn()) return;
    const missing = NEEDS[state.view].filter(key => !loaded(key) && !g.loading[key] && !g.error[key]);
    if (missing.length) Promise.all(missing.map(load)).then(refresh);
    if (Date.now() - g.caughtUpAt > HOUR) { g.caughtUpAt = Date.now(); catchUp(); }
  }

  // The server runs the daily check when none ran in the last 20 hours. Nothing happens otherwise.
  async function catchUp() {
    try {
      const response = await fetch("/api/watch/run", { method: "POST", credentials: "include", headers: practiceHeaders(), body: JSON.stringify({ projectId: state.project, trigger: "catch-up" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.status !== "ran") return;
      await Promise.all([load("watch"), load("catalog")]);
      g.portfolio = null;
      if (onGuide() && (body.added || body.screeningChanged)) {
        setNotice(`The daily check ran when this screen opened. It found ${plural(body.added, "new item")}${body.screeningChanged ? ` and ${plural(body.screeningChanged, "changed screening result")}` : ""}. ${state.view === "watch" ? "The daily update on this screen shows them." : "Open Regulatory watch to read the update."}`);
      }
      refresh();
    } catch { /* The next visit tries again. */ }
  }

  // ---------- Saving ----------

  // Sends one change. Entries stay on screen when the save is refused.
  async function send(url, body, formElement = null) {
    if (state.saving) return { ok: false, payload: {}, message: "A save is still running. Wait for it to finish." };
    state.saving = true;
    const buttons = formElement ? [...formElement.querySelectorAll("button[type=submit]")] : [];
    buttons.forEach(button => { button.disabled = true; });
    try {
      const response = await fetch(url, { method: "POST", credentials: "include", headers: practiceHeaders(), body: JSON.stringify({ projectId: state.project, ...body }) });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return { ok: true, payload, message: "" };
      const message = response.status === 409
        ? "This entry changed in another session. Choose Reload saved data at the foot of this screen, then enter the change again."
        : payload.message || "The change was not saved. Your entries remain on screen.";
      return { ok: false, payload, message };
    } catch {
      return { ok: false, payload: {}, message: "The connection failed. Your entries remain on screen. Retry when connected." };
    } finally {
      state.saving = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  const done = (text) => { state.dirty = false; setNotice(text); redraw(); };

  function putSelection(selection) {
    g.plan.selections = [...g.plan.selections.filter(row => row.id !== selection.id), selection]
      .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
    g.portfolio = null;
  }

  const openEntry = () => {
    const kind = ui.repoKind === "parts" ? "part" : "vendor";
    const entry = g.catalog?.[kind === "part" ? "parts" : "vendors"].find(row => row.id === ui.repoEntry);
    return entry ? { kind, entry } : null;
  };

  // One field action on the open repository entry, followed by a fresh read of the repository.
  async function fieldAction(body, formElement, text) {
    const open = openEntry();
    if (!open) return;
    const result = await send("/api/catalog/field", { kind: open.kind, id: open.entry.id, version: open.entry.version, ...body }, formElement);
    if (!result.ok) { setNotice(result.message); return; }
    await load("catalog");
    g.portfolio = null;
    ui.repoField = "";
    done(text);
  }

  async function confirmAll(ids) {
    const open = openEntry();
    if (!open || !ids.length) return;
    let version = open.entry.version;
    let count = 0;
    for (const field of ids) {
      const result = await send("/api/catalog/field", { kind: open.kind, id: open.entry.id, version, action: "confirm", field });
      if (!result.ok) {
        await load("catalog");
        done(`${count} of ${ids.length} values were confirmed. ${result.message}`);
        return;
      }
      version = result.payload.document?.version ?? version + 1;
      count += 1;
    }
    await load("catalog");
    g.portfolio = null;
    done(`${plural(count, "sourced value")} ${count === 1 ? "is" : "are"} confirmed by the ${roleName(actingRole())} role.`);
  }

  // The fact-based analysis: public lists first, then the cited AI reading.
  // `added` carries the count of fields the first checks filled when the entry was just created.
  async function analyze(kind, id, added = null) {
    if (g.analyzing) { setNotice("An analysis is already running. Wait for it to finish."); return; }
    const lead = added ? `The ${kind} is added.` : "";
    const scope = g.scope;
    g.analyzing = `${kind}:${id}`;
    setNotice("The analysis is running. It checks the public lists first and then reads the cited sources. This can take up to a minute.");
    refresh();
    try {
      const response = await fetch("/api/catalog/analyze", { method: "POST", credentials: "include", headers: practiceHeaders(), body: JSON.stringify({ projectId: state.project, kind, id }) });
      const body = await response.json().catch(() => ({}));
      if (g.scope !== scope) return;
      const stopped = added ? "The AI step did not finish. Run the analysis again from the entry." : "The analysis did not finish. Nothing was changed.";
      if (!response.ok) { setNotice(`${lead} ${body.message || stopped}`.trim()); return; }
      await load("catalog");
      g.portfolio = null;
      const analysis = body.document?.payload?.analysis || {};
      const filled = (analysis.fields || []).filter(row => row.applied && !row.carried).length + (added?.filled || 0);
      const count = filled === 0 ? (added ? "No field was filled." : "No field changed.") : filled === 1 ? "1 field was filled with a sourced value." : `${filled} fields were filled with sourced values.`;
      setNotice(analysis.status === "failed"
        ? `${lead} ${analysis.message || stopped}`.trim()
        : `${added ? `${lead} The analysis finished.` : "The analysis finished."} ${count} Each value stays unconfirmed until the owning role confirms it.${analysis.message ? ` ${analysis.message}` : ""}`);
    } catch {
      if (g.scope === scope) setNotice(`${lead} The connection failed before the analysis finished. Run it again when connected.`.trim());
    } finally {
      if (g.scope === scope) { g.analyzing = ""; refresh(); }
    }
  }

  async function runWatch() {
    if (g.running) return;
    const scope = g.scope;
    g.running = true;
    setNotice("The check is running. It reads each source and screens the vendor names. This can take up to a minute.");
    refresh();
    try {
      const response = await fetch("/api/watch/run", { method: "POST", credentials: "include", headers: practiceHeaders(), body: JSON.stringify({ projectId: state.project, trigger: "manual" }) });
      const body = await response.json().catch(() => ({}));
      if (g.scope !== scope) return;
      if (!response.ok) { setNotice(body.message || "The check did not finish."); return; }
      await Promise.all([load("watch"), load("catalog")]);
      g.portfolio = null;
      setNotice(body.status === "ran"
        ? `The check finished. It found ${plural(body.added, "new item")}${body.screeningChanged ? ` and ${plural(body.screeningChanged, "changed screening result")}` : ""}.${body.unavailable ? ` ${plural(body.unavailable, "source")} could not be read. The check log lists ${body.unavailable === 1 ? "it" : "them"}.` : ""}`
        : body.message || "The check did not run.");
    } catch {
      if (g.scope === scope) setNotice("The connection failed before the check finished. Choose Check now to retry.");
    } finally {
      if (g.scope === scope) { g.running = false; refresh(); }
    }
  }

  // ---------- Drawing ----------

  function usedEntries() {
    const parts = new Set();
    for (const row of g.plan?.selections || []) for (const id of [row.payload.primary, row.payload.alternate]) if (id) parts.add(id);
    const vendors = new Set();
    for (const id of parts) {
      const part = g.catalog?.parts.find(row => row.id === id);
      const vendor = part && vendorOf(g.catalog, part);
      if (vendor) vendors.add(vendor.id);
    }
    return { vendors: [...vendors], parts: [...parts] };
  }

  const repositoryContext = () => ({
    catalog: g.catalog, raw: g.raw, loading: Boolean(g.loading.catalog), error: g.error.catalog || "", role: actingRole(), ui,
    context: context(), projectName: projectName(), basisSaved: Boolean(g.plan?.program), analyzing: g.analyzing, used: usedEntries(),
  });

  function watchDigest() {
    const design = context();
    const lines = g.catalog && g.plan
      ? g.plan.selections.map(row => ({ id: row.id, reasons: lineRecheck(row.payload, g.catalog, design) }))
      : [];
    return dailyDigest({ watch: g.watch, catalog: g.catalog, lines, projectName: projectName(), context: design, now: Date.now() });
  }

  function foot(view) {
    const times = NEEDS[view].map(key => g.loadedAt[key]).filter(Boolean);
    if (!times.length) return "";
    const at = new Date(Math.min(...times)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `<div class="guide-foot"><span class="quiet">Saved data was read at ${esc(at)}.</span><button type="button" class="text-button" data-guide-reload="all">Reload saved data</button></div>`;
  }

  const SCREENS = {
    program: () => drawProgram({ plan: g.plan, loading: Boolean(g.loading.plan), error: g.error.plan || "", role: actingRole(), ui, projectName: projectName() }),
    sourcing: () => drawSourcing({
      plan: g.plan, catalog: g.catalog, loading: Boolean(g.loading.plan), error: g.error.plan || "", catalogError: g.error.catalog || "", role: actingRole(), ui,
    }),
    repository: () => drawRepository(repositoryContext()),
    watch: () => drawWatch({
      watch: g.watch, catalog: g.catalog, loading: Boolean(g.loading.watch), error: g.error.watch || "", role: actingRole(), ui,
      digest: g.watch ? watchDigest() : null, running: g.running,
    }),
    portfolio: () => drawPortfolio({ portfolio: g.portfolio, loading: Boolean(g.loading.portfolio), error: g.error.portfolio || "", currentProject: state.project }),
  };

  function draw(view) {
    syncScope();
    if (!signedIn()) {
      return `<section class="pane start-next"><p class="kicker">Access required</p><h2>Sign in to open this screen</h2><p>The program plan, the repository, and the watch log are stored for accounts with an administrator-granted role.</p><a class="primary sign-in-action" href="/">Open sign-in page</a></section>`;
    }
    // A draft exists only while its form holds unsaved entries.
    if (!state.dirty) { ui.basisDraft = null; ui.lineDraft = null; }
    return `${SCREENS[view]()}${foot(view)}`;
  }

  // ---------- Binding ----------

  function bindRepositoryList() {
    main.querySelectorAll("#repo-list [data-repo-entry]").forEach(button => button.addEventListener("click", () => leaveForm(() => {
      ui.repoEntry = button.dataset.repoEntry;
      ui.repoField = "";
      ui.repoAdd = "";
      redraw();
      if (window.matchMedia(STACKED).matches) bringToTop(".repo-detail");
    })));
  }

  // Keeps the chosen row of a long list in view after the screen is drawn again.
  function showChosenRow(listId) {
    const list = main.querySelector(listId);
    const chosen = list?.querySelector(".item.on");
    if (!chosen || list.scrollHeight <= list.clientHeight) return;
    const top = chosen.offsetTop;
    if (top < list.scrollTop || top + chosen.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = Math.max(0, top - list.clientHeight / 3);
  }

  function openRepository(kind, id) {
    leaveForm(() => {
      Object.assign(ui, { repoKind: kind === "parts" ? "parts" : "vendors", repoEntry: id, repoField: "", repoAdd: "", repoQuery: "", repoSubsystem: "", repoFilter: "" });
      if (state.view === "repository") { redraw(); scrollBox().scrollTop = 0; showChosenRow("#repo-list"); } else goTo("repository");
    });
  }

  function bind() {
    if (!onGuide() || !signedIn()) return;
    const on = (selector, type, handler) => main.querySelectorAll(selector).forEach(element => element.addEventListener(type, event => handler(event, element)));
    const text = (data, name) => String(data.get(name) ?? "").trim();

    on("[data-guide-reload]", "click", (_, button) => leaveForm(() => {
      const keys = button.dataset.guideReload === "all" ? NEEDS[state.view] : [button.dataset.guideReload];
      Promise.all(keys.map(load)).then(results => {
        setNotice(results.every(Boolean) ? "The saved data is read again." : "Some saved data could not be read. Choose Try again.");
        refresh();
      });
      redraw();
    }));
    on("[data-repo-open]", "click", (_, button) => openRepository(button.dataset.repoKind, button.dataset.repoOpen));

    // ----- Program plan -----
    on("[data-program-tab]", "click", (_, button) => leaveForm(() => { ui.programTab = button.dataset.programTab; redraw(); }));
    on(".gate-track button[data-gate]", "click", (_, button) => leaveForm(() => { ui.gate = Number(button.dataset.gate); redraw(); }));

    on("#basis-form [data-basis-live]", "change", (_, element) => {
      ui.basisDraft = readBasisForm(new FormData(element.form));
      state.dirty = true;
      // The pathways offered follow the power arrangement, so the form is drawn again.
      if (element.name === "power") { redraw(); return; }
      const preview = main.querySelector("#basis-preview");
      if (preview) preview.innerHTML = drawBasisPreview(ui.basisDraft);
    });
    on("#basis-form", "submit", async (event, formElement) => {
      event.preventDefault();
      const result = await send("/api/guide/save", { version: g.plan.program?.version || 0, section: "basis", data: readBasisForm(new FormData(formElement)) }, formElement);
      if (!result.ok) { setNotice(result.message); return; }
      g.plan.program = result.payload.program;
      g.portfolio = null;
      ui.basisDraft = null;
      done("The design basis is saved. Benchmarks, sourcing lines, and the timeline now follow it.");
    });

    on("#decisions-form, #actions-form", "input", (_, formElement) => { formElement.dataset.touched = "1"; });
    for (const [id, [section, saved]] of Object.entries(SECTION_FORMS)) {
      on(`#${id}`, "submit", async (event, formElement) => {
        event.preventDefault();
        const first = await send("/api/guide/save", { version: g.plan.program?.version || 0, section, data: readProgramSection(section, new FormData(formElement)) }, formElement);
        if (!first.ok) { setNotice(first.message); return; }
        g.plan.program = first.payload.program;
        g.portfolio = null;
        delete formElement.dataset.touched;
        // Decisions and actions share a screen. Entries in the other form are saved with this one.
        const other = ["decisions-form", "actions-form"].includes(id) ? main.querySelector(id === "decisions-form" ? "#actions-form" : "#decisions-form") : null;
        if (other?.dataset.touched) {
          const otherSection = SECTION_FORMS[other.id][0];
          const second = await send("/api/guide/save", { version: g.plan.program.version, section: otherSection, data: readProgramSection(otherSection, new FormData(other)) }, other);
          if (!second.ok) { setNotice(`${saved} The ${otherSection === "actions" ? "90-day actions" : "decisions"} were not saved. ${second.message}`); return; }
          g.plan.program = second.payload.program;
          done("The decisions and the 90-day actions are saved.");
          return;
        }
        done(saved);
      });
    }

    on("#gate-form", "submit", async (event, formElement) => {
      event.preventDefault();
      const gate = Number(formElement.dataset.gate);
      const action = ["save", "hold", "ready"].includes(event.submitter?.value) ? event.submitter.value : "save";
      const result = await send("/api/guide/gate", { gate, version: g.plan.gates[gate].version, action, ...readGateForm(new FormData(formElement), gate) }, formElement);
      if (!result.ok) { setNotice(result.message); return; }
      g.plan.gates[gate] = result.payload.gate;
      g.portfolio = null;
      done({
        save: `The evidence for Gate ${gate} is saved.`,
        hold: `Gate ${gate} is on hold. Each open item has an owner and a due date.`,
        ready: `Gate ${gate} is ready for decision. The ${roleName(GATES[gate].reviewer)} role records the decision.`,
      }[action]);
    });
    on("#gate-decision-form", "submit", async (event, formElement) => {
      event.preventDefault();
      const gate = Number(formElement.dataset.gate);
      const action = event.submitter?.value === "return" ? "return" : "decide";
      const data = new FormData(formElement);
      const result = await send("/api/guide/gate", {
        gate, version: g.plan.gates[gate].version, action,
        result: text(data, "result"), condition: text(data, "condition"), signoffRef: text(data, "signoffRef"), note: text(data, "note"),
      }, formElement);
      if (!result.ok) { setNotice(result.message); return; }
      g.plan.gates[gate] = result.payload.gate;
      g.portfolio = null;
      done(action === "return" ? `Gate ${gate} is returned to preparation with your reason.` : `Gate ${gate} is recorded as ${result.payload.gate.payload.status.toLowerCase()}.`);
    });
    on("#gate-reopen-form", "submit", async (event, formElement) => {
      event.preventDefault();
      const gate = Number(formElement.dataset.gate);
      const result = await send("/api/guide/gate", { gate, version: g.plan.gates[gate].version, action: "reopen", note: text(new FormData(formElement), "note") }, formElement);
      if (!result.ok) { setNotice(result.message); return; }
      g.plan.gates[gate] = result.payload.gate;
      g.portfolio = null;
      done(`Gate ${gate} is reopened. The earlier decision stays in the gate history.`);
    });

    // ----- Sourcing workflow -----
    on("#line-list [data-line], .line-editor button[data-line]", "click", (_, button) => leaveForm(() => {
      ui.line = button.dataset.line;
      ui.lineDraft = null;
      redraw();
      if (ui.line && window.matchMedia(STACKED).matches) bringToTop(".line-editor");
    }));
    on("[data-line-new]", "click", (_, button) => leaveForm(() => {
      ui.line = "new";
      ui.newSubsystem = button.dataset.lineNew;
      ui.lineDraft = null;
      redraw();
      bringToTop(".line-editor");
    }));
    on("[data-open-gate]", "click", (_, button) => leaveForm(() => {
      ui.programTab = "gates";
      ui.gate = Number(button.dataset.openGate);
      goTo("program");
    }));
    const draftFrom = (formElement, changes = {}) => {
      ui.lineDraft = { id: ui.line, ...readSelectionForm(new FormData(formElement)), ...changes };
      state.dirty = true;
      redraw();
    };
    on("#selection-form [data-line-live]", "change", (_, element) => {
      // A new subsystem brings its own part types and checklist. A new part type clears the primary part.
      const changes = element.name === "subsystem" ? { category: "", primary: "", alternate: "", checklist: [] } : element.name === "category" ? { primary: "" } : {};
      draftFrom(element.form, changes);
    });
    on("#selection-form [data-pick-alternate]", "click", (_, button) => draftFrom(main.querySelector("#selection-form"), { alternate: button.dataset.pickAlternate }));
    on("#selection-form", "submit", async (event, formElement) => {
      event.preventDefault();
      const record = currentLine();
      const action = event.submitter?.value === "submit" ? "submit" : "save";
      const saved = await send("/api/guide/selection", { id: record?.id || "", version: record?.version || 0, action: "save", line: readSelectionForm(new FormData(formElement)) }, formElement);
      if (!saved.ok) { setNotice(saved.message); return; }
      const line = saved.payload.selection;
      putSelection(line);
      ui.line = line.id;
      ui.lineDraft = null;
      if (action === "save") { done(`${line.id} is saved as a ${line.payload.status === "Returned" ? "returned line" : "draft"}. Send it to review when the checks are complete.`); return; }
      const sent = await send("/api/guide/selection", { id: line.id, version: line.version, action: "submit" }, formElement);
      if (!sent.ok) { done(`${line.id} is saved. It was not sent to review. ${sent.message}`); return; }
      putSelection(sent.payload.selection);
      done(`${line.id} is saved and sent to the ${roleName(sent.payload.selection.payload.reviewerRole)} role for review.`);
    });
    on("#selection-review-form", "submit", async (event, formElement) => {
      event.preventDefault();
      const record = currentLine();
      if (!record) return;
      const action = event.submitter?.value === "return" ? "return" : "approve";
      const result = await send("/api/guide/selection", { id: record.id, version: record.version, action, note: text(new FormData(formElement), "note") }, formElement);
      if (!result.ok) { setNotice(result.message); return; }
      putSelection(result.payload.selection);
      done(action === "approve" ? `${record.id} is approved. The approval keeps the benchmark it was decided on.` : `${record.id} is returned to NSTT with your reason.`);
    });
    on("#selection-reopen-form", "submit", async (event, formElement) => {
      event.preventDefault();
      const record = currentLine();
      if (!record) return;
      const result = await send("/api/guide/selection", { id: record.id, version: record.version, action: "reopen", note: text(new FormData(formElement), "note") }, formElement);
      if (!result.ok) { setNotice(result.message); return; }
      putSelection(result.payload.selection);
      done(record.payload?.status === "In review"
        ? `${record.id} is withdrawn from review and is a draft again.`
        : `${record.id} is a draft again. The earlier decision stays in the line history.`);
    });

    // ----- Repository -----
    const drawList = () => {
      const list = main.querySelector("#repo-list");
      if (!list || !g.catalog) return;
      list.innerHTML = drawRepositoryList(repositoryContext());
      bindRepositoryList();
    };
    bindRepositoryList();
    on("[data-repo-kind-switch]", "click", (_, button) => leaveForm(() => {
      Object.assign(ui, { repoKind: button.dataset.repoKindSwitch, repoEntry: "", repoField: "", repoAdd: "" });
      redraw();
    }));
    on("#repo-search", "input", (_, input) => { ui.repoQuery = input.value; drawList(); });
    on("#repo-subsystem", "change", (_, select) => { ui.repoSubsystem = select.value; drawList(); });
    on("#repo-filter", "change", (_, select) => { ui.repoFilter = select.value; drawList(); });
    on("[data-repo-add]", "click", (_, button) => leaveForm(() => {
      ui.repoAdd = button.dataset.repoAdd;
      redraw();
      main.querySelector("#repo-add-form input, #repo-add-form select")?.focus();
    }));
    on("#repo-add-form", "submit", async (event, formElement) => {
      event.preventDefault();
      const kind = formElement.dataset.kind === "part" ? "part" : "vendor";
      const data = new FormData(formElement);
      const body = kind === "vendor"
        ? { kind, legalName: text(data, "legalName"), website: text(data, "website") }
        : { kind, vendor: text(data, "vendor"), category: text(data, "category"), model: text(data, "model"), sourceUrl: text(data, "sourceUrl") };
      const result = await send("/api/catalog/entry", body, formElement);
      if (!result.ok) { setNotice(result.message); return; }
      await load("catalog");
      Object.assign(ui, { repoKind: kind === "part" ? "parts" : "vendors", repoEntry: result.payload.id, repoAdd: "", repoField: "", repoQuery: "", repoSubsystem: "", repoFilter: "" });
      done(`The ${kind} is added to the repository. The analysis starts now.`);
      showChosenRow("#repo-list");
      analyze(kind, result.payload.id, { filled: Number(result.payload.filled) || 0 });
    });
    on("[data-field-edit]", "click", (_, button) => leaveForm(() => { ui.repoField = button.dataset.fieldEdit; redraw(); }));
    on("[data-field-action]", "click", (_, button) => leaveForm(() => {
      const action = button.dataset.fieldAction === "reset" ? "reset" : "confirm";
      fieldAction({ action, field: button.dataset.field }, null, action === "reset"
        ? "The field is back to its sourced value. The change stays in the history."
        : `The value is confirmed by the ${roleName(actingRole())} role.`);
    }));
    on("form.field-change-form", "submit", (event, formElement) => {
      event.preventDefault();
      const data = new FormData(formElement);
      fieldAction({
        action: "change", field: formElement.dataset.field, value: text(data, "value"), reason: text(data, "reason"),
        sourceUrl: text(data, "sourceUrl"), sourceLabel: text(data, "sourceLabel"), detail: text(data, "detail"),
      }, formElement, "The change is saved with its reason and its source. Benchmarks now use the new value.");
    });
    on("[data-confirm-all]", "click", (_, button) => leaveForm(() => confirmAll(button.dataset.confirmAll.split(",").filter(Boolean))));
    on("form.recheck-clear-form", "submit", (event, formElement) => {
      event.preventDefault();
      fieldAction({ action: "clear-recheck", reviewId: formElement.dataset.review, note: text(new FormData(formElement), "note") }, formElement, "The recheck is cleared. Your note stays in the history.");
    });
    on("[data-analyze]", "click", (_, button) => {
      const open = openEntry();
      if (open && open.entry.id === button.dataset.analyze) analyze(open.kind, open.entry.id);
    });
    if (state.view === "repository") showChosenRow("#repo-list");
    if (state.view === "sourcing") showChosenRow("#line-list");

    // ----- Regulatory watch -----
    on("[data-watch-run]", "click", () => runWatch());
    on("[data-watch-download]", "click", () => {
      const digest = watchDigest();
      downloadFile(digestText(digest), `mdc-daily-update-${digest.day}.txt`, "text/plain;charset=utf-8");
      setNotice("The daily update is downloaded as a text file.");
    });
    on("[data-watch-tab]", "click", (_, button) => leaveForm(() => { ui.watchTab = button.dataset.watchTab; ui.watchItem = ""; redraw(); }));
    on("#watch-topic", "change", (_, select) => {
      const next = select.value;
      select.value = ui.watchTopic;
      leaveForm(() => { ui.watchTopic = next; redraw(); });
    });
    on("[data-watch-item]", "click", (_, button) => leaveForm(() => { ui.watchItem = button.dataset.watchItem; redraw(); }));
    on("form.watch-review-form", "submit", async (event, formElement) => {
      event.preventDefault();
      const data = new FormData(formElement);
      const materiality = text(data, "materiality");
      const vendors = [...new Set(data.getAll("vendors").map(value => String(value || "")).filter(Boolean))];
      const result = await send("/api/watch/review", {
        itemId: formElement.dataset.item, version: Number(formElement.dataset.version) || 0, materiality,
        topics: data.getAll("topics").map(String), vendors, broad: data.has("broad"), note: text(data, "note"), confirmUrl: text(data, "confirmUrl"),
      }, formElement);
      if (!result.ok) { setNotice(result.message); return; }
      await Promise.all([load("watch"), load("catalog")]);
      g.portfolio = null;
      ui.watchItem = "";
      const affected = result.payload.affected || {};
      done(materiality === "Material"
        ? `Recorded as material. ${plural((affected.vendors || []).length, "vendor")} and ${plural((affected.parts || []).length, "part")} are flagged for recheck. Approved decisions stay as recorded.`
        : "Recorded as not material. Nothing is flagged.");
    });

    // ----- Portfolio -----
    on("[data-portfolio-open]", "click", (_, button) => {
      const row = g.portfolio?.rows.find(item => item.projectId === button.dataset.portfolioOpen);
      if (row) openProject(row.projectId, row.name, "program");
    });
  }

  return { draw, bind, ensure };
}
