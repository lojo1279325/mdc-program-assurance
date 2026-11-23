import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createApp } from "./app.js";
import { createMemory } from "./store.js";
import { clearScreeningCache } from "./analysis.js";
import { syntheticNetwork, syntheticSeed } from "./guide-fixtures.js";
import { CATALOG_SEED } from "../public/catalog-seed.js";
import { WATCH_TOPICS, benchmark, mergeCatalog, programDay } from "../public/catalog-model.js";
import { designContext, lineRecheck } from "../public/guide-model.js";
import { dailyDigest, dateText, digestText, drawRepository, drawWatch, fieldQueue, scheduleText, watchQueue } from "../public/catalogview.js";
import { drawPortfolio, drawProgram, drawSourcing } from "../public/guideview.js";
import { GUIDE_TITLES, GUIDE_VIEWS } from "../public/guidecontrol.js";
import { drawQuickGuide } from "../public/experience.js";

process.env.APP_ENV = "development";
process.env.ADMIN_EMAILS = "qa-admin@blackengtech.com";

// ---------- Daily update, on the made-up repository with a fixed clock ----------

const NOW = Date.parse("2026-11-22T15:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const at = (hours) => new Date(NOW - hours * HOUR).toISOString();
const CONTEXT = designContext({ basis: { tenancy: "private", power: "island", platform: "nvl72", region: "US", customer: "open" }, pathway: 1 });
const CSL = { label: "US Consolidated Screening List", url: "https://www.trade.gov/consolidated-screening-list" };
const POWER_VENDOR = "Synthetic Power Corp";
const POWER_PARTS = ["syn-us-gen", "syn-us-50", "syn-us-gpu", "syn-us-cable", "syn-us-bess"];
// The daily check found the vendor name on the screening list this many hours ago.
const listed = (hours) => ({ "vendor:syn-us": { screening: { value: "Match", source: CSL, tier: 1, asOf: "2026-11-22", detail: "Name match on Entity List (EL) (Synthetic Power Corp).", checkedAt: at(hours), signature: "sig", changedAt: at(hours), changedFrom: "No match" } } });
const change = (from, to) => ({ id: "syn-us", name: POWER_VENDOR, from, to });
const source = (id, label, status = "read") => ({ id, label, page: "https://www.example.gov/", tier: 1, status });
const check = (hours, changed = [], extra = {}) => ({
  id: `run-${hours}`, at: at(hours), trigger: "scheduled", role: "system", added: 0,
  sources: [source("fr-bis", "Federal Register: Bureau of Industry and Security rules"), source("cisa-ics", "CISA industrial control system advisories")],
  screening: { status: "read", checked: 6, changed, note: "" }, ...extra,
});
const found = (id, topics, hours, lead = false) => ({ id, title: `Synthetic item ${id}`, topics, vendors: [], lead, tier: lead ? 5 : 1, foundAt: at(hours) });
const kinds = (digest) => digest.bullets.map(row => row.kind);
const bullet = (digest, kind) => digest.bullets.find(row => row.kind === kind)?.text;
const digestOf = (input) => dailyDigest({ context: CONTEXT, now: NOW, ...input });

test("the daily update says so when no check has run and nothing changed", () => {
  const digest = dailyDigest({ now: NOW });
  assert.deepEqual([digest.day, digest.headline, digest.action], ["2026-11-22", "No change needs action today.", false]);
  assert.deepEqual(digest.bullets, [
    { kind: "check", text: "No check has run yet. Choose Check now to read the sources." },
    { kind: "items", text: "No new item arrived in the last 24 hours." },
    { kind: "screening", text: "No vendor screening result changed." },
  ]);
  assert.deepEqual(digest.counts, { runs: 0, newItems: 0, leads: 0, screeningChanges: 0, recordChanges: 0, postureChanges: 0, material: 0, awaiting: { trade: 0, cpi: 0 }, rechecks: { vendors: 0, parts: 0 }, lines: 0 });
  assert.equal(digestText(digest), "Daily regulatory and sourcing update, Nov 22, 2026\n\nNo change needs action today.\n\n- No check has run yet. Choose Check now to read the sources.\n- No new item arrived in the last 24 hours.\n- No vendor screening result changed.\n");
});

test("a changed screening result is reported with the sources read, the postures it moves, and the roles that decide", () => {
  const before = mergeCatalog(syntheticSeed(), []);
  const after = mergeCatalog(syntheticSeed(), [], { auto: listed(2) });
  const posture = (catalog, id) => benchmark(catalog.parts.find(part => part.id === id), catalog, CONTEXT).posture;
  assert.deepEqual(POWER_PARTS.map(id => posture(before, id)), ["Yellow", "Yellow", "Yellow", "Green", "Yellow"]);
  assert.deepEqual(POWER_PARTS.map(id => posture(after, id)), ["Orange", "Orange", "Orange", "Orange", "Orange"]);

  const run = check(2, [change("No match", "Match")], {
    sources: [
      source("fr-bis", "Federal Register: Bureau of Industry and Security rules"), source("cisa-ics", "CISA industrial control system advisories"),
      source("news-fcc", "Press: FCC Covered List", "unavailable"), source("mofcom", "China Ministry of Commerce announcements", "not connected"),
    ],
  });
  const items = [found("rule", ["chips"], 2), found("advisory", ["ics"], 2), found("press", ["fcc"], 2, true), found("older", ["chips"], 60)];
  const digest = digestOf({ watch: { runs: [run], items, reviews: [] }, catalog: after, projectName: "MDC" });
  assert.deepEqual([digest.headline, digest.action], ["Action is needed on the items below.", true]);
  assert.deepEqual(kinds(digest), ["check", "items", "screening", "posture", "review"]);
  assert.equal(bullet(digest, "check"), `The last check ran ${dateText(run.at)} and read 2 of 3 connected sources. Unavailable: Press: FCC Covered List. It screened 6 vendor names.`);
  assert.equal(bullet(digest, "items"), "3 new items arrived in the last 24 hours: 2 from government sources and 1 press lead. A press lead changes nothing until a government source confirms it.");
  assert.equal(bullet(digest, "screening"), "The screening result changed for Synthetic Power Corp (from No match to Match). Trade confirms each one before it is relied on.");
  assert.equal(bullet(digest, "posture"), "The changed screening results move the indicated posture of 5 parts for MDC: Synthetic Power Corp SYN-US-GEN (from Yellow to Orange); Synthetic Power Corp SYN-US-50 (from Yellow to Orange); Synthetic Power Corp SYN-US-GPU (from Yellow to Orange); Synthetic Power Corp SYN-US-CABLE (from Green to Orange); Synthetic Power Corp SYN-US-BESS (from Yellow to Orange). The benchmark and the ranked alternates already use the new results.");
  assert.equal(bullet(digest, "review"), "Items waiting for a materiality decision: Trade 3, CPI 1.");
  assert.deepEqual(digest.postures.map(row => [row.id, row.from, row.to]), POWER_PARTS.map(id => [id, posture(before, id), "Orange"]));
  assert.deepEqual(digest.counts, { runs: 1, newItems: 3, leads: 1, screeningChanges: 1, recordChanges: 0, postureChanges: 5, material: 0, awaiting: { trade: 3, cpi: 1 }, rechecks: { vendors: 0, parts: 0 }, lines: 0 });
  // The same update with no project name leaves the name out.
  assert.match(bullet(digestOf({ watch: { runs: [run], items, reviews: [] }, catalog: after }), "posture"), /^The changed screening results move the indicated posture of 5 parts: Synthetic Power Corp SYN-US-GEN /);
});

test("a screening value recorded by Trade stands until Trade rechecks it", () => {
  const recorded = { kind: "catalog-vendor", key: "syn-us", version: 1, payload: { fields: { screening: { state: "changed", value: "No match", baseline: "No match", reason: "Trade compared the listed party and found a different company.", role: "trade", at: at(30), source: CSL } } } };
  const catalog = mergeCatalog(syntheticSeed(), [recorded], { auto: listed(2) });
  const field = catalog.vendors.find(row => row.id === "syn-us").fields.screening;
  assert.deepEqual([field.value, field.state, field.stale, field.baselineValue], ["No match", "changed", true, "Match"]);
  const digest = digestOf({ watch: { runs: [check(2, [change("No match", "Match")])], items: [], reviews: [] }, catalog, projectName: "MDC" });
  assert.deepEqual(kinds(digest), ["check", "items", "screening", "recheck"]);
  assert.equal(bullet(digest, "screening"), "The screening result changed for Synthetic Power Corp (from No match to Match). Trade confirms each one before it is relied on.");
  assert.equal(bullet(digest, "recheck"), "1 vendor carries an open recheck in the repository.");
  assert.deepEqual([digest.postures, digest.counts.postureChanges, digest.action], [[], 0, true]);
});

test("the daily update benchmarks an earlier result on the lists that the earlier result named", () => {
  // Trade confirmed a match. A later check finds the vendor on no list, so the parts are benchmarked again.
  const confirmedMatch = { kind: "catalog-vendor", key: "syn-us", version: 1, payload: { fields: { screening: { state: "confirmed", baseline: "Match", role: "trade", at: at(30) } } } };
  const cleared = { "vendor:syn-us": { screening: { value: "No match", source: CSL, tier: 1, asOf: "2026-11-22", detail: "No name match.", lists: [], checkedAt: at(2), signature: "sig-2", changedAt: at(2), changedFrom: "Match" } } };
  const catalog = mergeCatalog(syntheticSeed(), [confirmedMatch], { auto: cleared });
  const field = catalog.vendors.find(row => row.id === "syn-us").fields.screening;
  assert.deepEqual([field.value, field.state, field.stale, field.lists], ["No match", "confirmed", true, []]);
  const now = POWER_PARTS.map(id => benchmark(catalog.parts.find(part => part.id === id), catalog, CONTEXT).posture);
  assert.deepEqual(now, ["Yellow", "Yellow", "Yellow", "Green", "Yellow"]);
  const moves = (runs, used = catalog) => digestOf({ watch: { runs, items: [], reviews: [] }, catalog: used }).postures.map(row => [row.id, row.from, row.to]);
  const from = (posture) => POWER_PARTS.map((id, index) => [id, posture, now[index]]);
  const blocking = ["Specially Designated Nationals (SDN)", "Entity List (EL)"];
  const short = "Name match on Capta List (CAP) (Synthetic Power Corp); Denied Persons List (DPL) (Synthetic Power Corp)";

  // The earlier result named the list that blocks dealings. The detail kept in the check log is cut short and does not name it.
  assert.deepEqual(moves([check(2, [{ ...change("Match", "No match"), fromDetail: short, fromLists: blocking }])]), from("Red"));
  // The list names of the earlier result decide, and the lists of the current result do not.
  assert.deepEqual(moves([check(2, [{ ...change("Match", "No match"), fromDetail: short, fromLists: ["Entity List (EL)"] }])]), from("Orange"));
  // A check logged before list names were kept is read from its detail.
  assert.deepEqual(moves([check(2, [{ ...change("Match", "No match"), fromDetail: "Name match on Specially Designated Nationals (SDN) (Synthetic Power Corp)." }])]), from("Red"));
  assert.deepEqual(moves([check(2, [{ ...change("Match", "No match"), fromDetail: short }])]), from("Orange"));
  // Two steps inside the day are benchmarked from the first result.
  const steps = [check(1, [{ ...change("Similar name", "No match"), fromDetail: "A similar name is listed.", fromLists: [] }]), check(5, [{ ...change("Match", "Similar name"), fromDetail: short, fromLists: blocking }])];
  assert.deepEqual(moves(steps), from("Red"));
  // A match that Trade had not confirmed was a finding for Trade, whatever list it named.
  const open = mergeCatalog(syntheticSeed(), [], { auto: cleared });
  assert.deepEqual(moves([check(2, [{ ...change("Match", "No match"), fromDetail: short, fromLists: blocking }])], open), from("Orange"));
});

test("a change in the list records behind an unchanged result is stated in the update and in the check log", () => {
  const moved = { "vendor:syn-us": { screening: { value: "Match", source: CSL, tier: 1, asOf: "2026-11-22", detail: "Name match on Entity List (EL) (Synthetic Power Corp); Military End User (MEU) List (Synthetic Power Corp).", lists: ["Entity List (EL)", "Military End User (MEU) List"], checkedAt: at(2), signature: "sig-2", changedAt: at(2), changedFrom: "Match" } } };
  const catalog = mergeCatalog(syntheticSeed(), [], { auto: moved });
  const records = { ...change("Match", "Match"), fromDetail: "Name match on Entity List (EL) (Synthetic Power Corp).", fromLists: ["Entity List (EL)"] };
  const watch = { state: { lastRunAt: at(2) }, runs: [check(2, [records, { id: "syn-de", name: "Synthetic Controls GmbH", from: "No match", to: "Similar name" }])], items: [], reviews: [], sources: [], notConnected: [] };
  const digest = digestOf({ watch, catalog });
  assert.deepEqual(kinds(digest), ["check", "items", "screening", "recheck"]);
  assert.equal(bullet(digest, "screening"), "The screening result changed for Synthetic Controls GmbH (from No match to Similar name). The list records behind the result changed for Synthetic Power Corp (still Match). Trade confirms each one before it is relied on.");
  assert.equal(bullet(digest, "recheck"), "1 vendor carries an open recheck in the repository.");
  assert.deepEqual([digest.counts.screeningChanges, digest.counts.recordChanges, digest.postures, digest.action], [1, 1, [], true]);
  // The records changed and nothing else did.
  const only = digestOf({ watch: { ...watch, runs: [check(2, [records])] }, catalog });
  assert.equal(bullet(only, "screening"), "The list records behind the result changed for Synthetic Power Corp (still Match). Trade confirms each one before it is relied on.");
  assert.deepEqual([only.counts.screeningChanges, only.counts.recordChanges, only.action], [0, 1, true]);
  // A change in the records can move a posture. Trade had confirmed a match on the list that blocks dealings, and the vendor has since left that list.
  const confirmedMatch = { kind: "catalog-vendor", key: "syn-us", version: 1, payload: { fields: { screening: { state: "confirmed", baseline: "Match", role: "trade", at: at(30) } } } };
  const narrowed = { "vendor:syn-us": { screening: { ...moved["vendor:syn-us"].screening, detail: "Name match on Entity List (EL) (Synthetic Power Corp).", lists: ["Entity List (EL)"] } } };
  const left = digestOf({ watch: { ...watch, runs: [check(2, [{ ...records, fromLists: ["Specially Designated Nationals (SDN)", "Entity List (EL)"] }])] }, catalog: mergeCatalog(syntheticSeed(), [confirmedMatch], { auto: narrowed }) });
  assert.deepEqual(left.postures.map(row => [row.id, row.from, row.to]), POWER_PARTS.map(id => [id, "Red", "Orange"]));
  assert.deepEqual([left.counts.screeningChanges, left.counts.recordChanges, left.counts.postureChanges], [0, 1, 5]);
  // A result that changed and changed back inside the day is not a change in the records.
  const reversed = digestOf({ watch: { ...watch, runs: [check(1, [change("No match", "Match")]), check(5, [change("Match", "No match")])] }, catalog: mergeCatalog(syntheticSeed(), []) });
  assert.deepEqual([bullet(reversed, "screening"), reversed.counts.recordChanges], ["No vendor screening result changed.", 0]);

  const log = drawWatch({ watch, catalog, loading: false, error: "", role: "trade", ui: { ...UI, watchTab: "runs" }, digest, running: false });
  assert.equal(has(log, "<li>Synthetic Power Corp: the list records behind the result changed. The value is still Match.</li>"), true);
  assert.equal(has(log, "<li>Synthetic Controls GmbH: from No match to Similar name.</li>"), true);
  assert.equal(has(log, "from Match to Match"), false);
  const rechecks = plain(drawWatch({ watch, catalog, loading: false, error: "", role: "trade", ui: { ...UI, watchTab: "rechecks" }, digest, running: false }));
  assert.equal(rechecks.includes("Screening list result is still Match, and the list records behind it changed. Trade has not confirmed it since. (Trade)"), true);
});

test("a long watch list is shown a page at a time, and every item can be reached", () => {
  const id = (index) => `item-${String(index).padStart(3, "0")}`;
  // 150 items, newest first. Every third item is an advisory for CPI. Trade has decided each of the other 100.
  const items = Array.from({ length: 150 }, (_, index) => found(id(index), [index % 3 === 0 ? "ics" : "chips"], 2 + index));
  const decision = { role: "trade", materiality: "Not material", topics: ["chips"], vendors: [], note: "The rule covers items outside the program scope.", at: at(1), affected: { vendors: [], parts: [] } };
  const reviews = items.filter(item => item.topics.includes("chips")).map(item => ({ itemId: item.id, version: 1, payload: { itemId: item.id, title: item.title, dispositions: { trade: decision } } }));
  const watch = { state: { lastRunAt: at(2) }, runs: [check(2)], items, reviews, sources: [], notConnected: [] };
  const catalog = mergeCatalog(syntheticSeed(), []);
  const digest = digestOf({ watch, catalog });
  const draw = (role, ui = {}) => drawWatch({ watch, catalog, loading: false, error: "", role, ui: { ...UI, ...ui }, digest, running: false });
  const shown = (markup) => [...markup.matchAll(/>Synthetic item (item-\d+)</g)].map(match => match[1]);
  const more = (markup) => [...markup.matchAll(/<button type="button" class="ghost" data-watch-more="next">([^<]+)<\/button>/g)].map(match => match[1]);

  // The first page holds the 60 newest items and says how many there are.
  const first = draw("nstt", { watchTab: "all" });
  assert.deepEqual([shown(first).length, shown(first)[0], shown(first).at(-1)], [60, id(0), id(59)]);
  assert.equal(has(first, "Showing 60 of 150 items, newest first."), true);
  assert.deepEqual(more(first), ["Show 60 more"]);
  const second = draw("nstt", { watchTab: "all", watchShown: 120 });
  assert.deepEqual([shown(second).length, shown(second).at(-1)], [120, id(119)]);
  assert.equal(has(second, "Showing 120 of 150 items, newest first."), true);
  assert.deepEqual(more(second), ["Show 30 more"]);
  const whole = draw("nstt", { watchTab: "all", watchShown: 180 });
  assert.deepEqual([shown(whole).length, shown(whole).at(-1), more(whole)], [150, id(149), []]);
  assert.equal(has(whole, "All 150 items are shown."), true);

  // Every recorded decision can be read, and the role that recorded it can open it to change it.
  const decided = draw("trade", { watchTab: "decided" });
  assert.equal(has(decided, "Decisions recorded (100)"), true);
  assert.deepEqual([shown(decided).length, more(decided)], [60, ["Show 40 more"]]);
  assert.equal(has(decided, "Showing 60 of 100 items, newest first."), true);
  const oldest = draw("trade", { watchTab: "decided", watchShown: 120, watchItem: id(149) });
  assert.deepEqual([shown(oldest).length, shown(oldest).at(-1), more(oldest)], [100, id(149), []]);
  assert.equal(count(oldest, /class="watch-review-form/g), 1);
  assert.equal(has(oldest, `<form class="watch-review-form form" data-item="${id(149)}" data-version="1">`), true);

  // The count follows the topic filter. A list that fits on one page carries no paging line.
  const advisories = draw("cpi", { watchTab: "mine", watchTopic: "ics" });
  assert.deepEqual([shown(advisories).length, more(advisories)], [50, []]);
  assert.equal(/Showing \d+ of|items are shown/.test(advisories), false);
  const chips = draw("nstt", { watchTab: "all", watchTopic: "chips" });
  assert.equal(has(chips, "Showing 60 of 100 items, newest first."), true);
  // A page size that is not a usable number falls back to the first page.
  for (const value of [0, -60, "abc", null]) assert.equal(shown(draw("nstt", { watchTab: "all", watchShown: value })).length, 60, String(value));
});

test("the daily update covers the last 24 hours and reports the net change", () => {
  const base = mergeCatalog(syntheticSeed(), []);
  const moved = mergeCatalog(syntheticSeed(), [], { auto: listed(1) });
  // A result that changed and changed back inside the day is not reported.
  const reversed = digestOf({ watch: { runs: [check(1, [change("Match", "No match")]), check(5, [change("No match", "Match")])], items: [], reviews: [] }, catalog: base });
  assert.deepEqual([reversed.headline, reversed.counts.runs, reversed.counts.screeningChanges], ["No change needs action today.", 2, 0]);
  assert.equal(bullet(reversed, "screening"), "No vendor screening result changed.");
  // Two steps inside the day are reported from the first value to the last.
  const stepped = digestOf({ watch: { runs: [check(1, [change("Similar name", "Match")]), check(5, [change("No match", "Similar name")])], items: [], reviews: [] }, catalog: moved });
  assert.equal(bullet(stepped, "screening"), "The screening result changed for Synthetic Power Corp (from No match to Match). Trade confirms each one before it is relied on.");
  assert.equal(stepped.counts.postureChanges, 5);
  // A check older than 24 hours is named as the last check, and its changes are left out.
  const old = check(30, [change("No match", "Match")]);
  const stale = digestOf({ watch: { runs: [old], items: [found("older", ["chips"], 30)], reviews: [] }, catalog: moved });
  assert.equal(bullet(stale, "check"), `No check ran in the last 24 hours. The last check ran ${dateText(old.at)} and read 2 of 2 connected sources. It screened 6 vendor names.`);
  assert.deepEqual([bullet(stale, "items"), bullet(stale, "screening"), bullet(stale, "posture")], ["No new item arrived in the last 24 hours.", "No vendor screening result changed.", undefined]);
  // An item found earlier still waits for its decision.
  assert.deepEqual([bullet(stale, "review"), stale.action], ["Items waiting for a materiality decision: Trade 1.", true]);
  // A screening list that could not be read is stated, and earlier results stand.
  const unread = check(2, [], { screening: { status: "unavailable", checked: 0, changed: [], note: "The source returned status 503." } });
  const noList = digestOf({ watch: { runs: [unread], items: [], reviews: [] }, catalog: base });
  assert.equal(bullet(noList, "check"), `The last check ran ${dateText(unread.at)} and read 2 of 2 connected sources. The screening list could not be read, so earlier results stand.`);
  assert.equal(noList.action, false);
});

test("material decisions, open rechecks, and flagged sourcing lines call for action", () => {
  const decision = (role, materiality, hours, affected) => ({ role, materiality, at: at(hours), note: "The rule changes the license position for the chip platform.", topics: ["chips"], affected });
  const affected = { vendors: ["syn-us"], parts: ["syn-us-gpu", "syn-us-gen"] };
  const reviews = [
    { itemId: "rule", version: 1, payload: { itemId: "rule", title: "Synthetic rule on advanced computing items", dispositions: { trade: decision("trade", "Material", 3, affected) } } },
    { itemId: "advisory", version: 1, payload: { itemId: "advisory", title: "Synthetic advisory for a controller", dispositions: { cpi: decision("cpi", "Not material", 3, { vendors: [], parts: [] }) } } },
    { itemId: "older", version: 1, payload: { itemId: "older", title: "Synthetic older rule", dispositions: { trade: decision("trade", "Material", 40, { vendors: ["syn-de"], parts: [] }) } } },
  ];
  const open = { id: "rule:trade", title: "Synthetic rule on advanced computing items", url: "https://www.federalregister.gov/d/2026-00002", topics: ["chips"], ownerRole: "trade", at: at(3), note: "The rule changes the license position for the chip platform.", affected };
  const catalog = mergeCatalog(syntheticSeed(), [], { reviews: [open] });
  assert.deepEqual([catalog.vendors.filter(row => row.recheck.length).map(row => row.id), catalog.parts.filter(row => row.recheck.length).map(row => row.id)], [["syn-us"], ["syn-us-gen", "syn-us-gpu"]]);
  // The advisory also carries a chip topic, so it still waits for Trade after CPI decided.
  const items = [found("rule", ["chips"], 4), found("advisory", ["ics", "chips"], 4), found("press", ["fcc"], 4, true), found("older", ["chips"], 50)];
  const lines = [
    { id: "L-01", reasons: ["A watch item flags the primary part for recheck.", "A second reason that the update leaves out."] },
    { id: "L-02", reasons: [] },
    { id: "L-03", reasons: ["The benchmark moved from Yellow to Orange since the line was approved"] },
  ];
  const digest = digestOf({ watch: { runs: [check(4)], items, reviews }, catalog, lines, projectName: "MDC" });
  assert.deepEqual(kinds(digest), ["check", "items", "screening", "material", "review", "recheck", "lines"]);
  assert.equal(bullet(digest, "material"), "The Trade role recorded “Synthetic rule on advanced computing items” as material. It flags 1 vendor and 2 parts for recheck.");
  assert.equal(bullet(digest, "review"), "Items waiting for a materiality decision: Trade 2.");
  assert.equal(bullet(digest, "recheck"), "1 vendor and 2 parts carry an open recheck in the repository.");
  assert.equal(bullet(digest, "lines"), "2 sourcing lines in MDC need a second look: L-01 (A watch item flags the primary part for recheck); L-03 (The benchmark moved from Yellow to Orange since the line was approved). Approved decisions stay as recorded until a role reopens them.");
  assert.deepEqual(digest.counts, { runs: 1, newItems: 3, leads: 1, screeningChanges: 0, recordChanges: 0, postureChanges: 0, material: 1, awaiting: { trade: 2, cpi: 0 }, rechecks: { vendors: 1, parts: 2 }, lines: 2 });
  const file = digestText(digest);
  assert.equal(file.startsWith("Daily regulatory and sourcing update, Nov 22, 2026\n\nAction is needed on the items below.\n\n- The last check ran "), true);
  assert.equal(file.split("\n").filter(row => row.startsWith("- ")).length, 7);
  assert.equal(file.includes("\u2014"), false);
  // One flagged line, and no project name.
  const single = digestOf({ watch: { runs: [check(4)], items: [], reviews: [] }, catalog: mergeCatalog(syntheticSeed(), []), lines: lines.slice(0, 1) });
  assert.equal(bullet(single, "lines"), "1 sourcing line needs a second look: L-01 (A watch item flags the primary part for recheck). Approved decisions stay as recorded until a role reopens them.");
  assert.equal(single.action, true);
});

test("the update is dated by the program day in New York", () => {
  assert.equal(dailyDigest({ now: Date.parse("2026-11-23T01:30:00Z") }).day, "2026-11-22");
  assert.equal(dailyDigest({ now: Date.parse("2026-11-23T05:30:00Z") }).day, "2026-11-23");
  assert.equal(programDay(Date.parse("2026-11-22T04:59:59Z")), "2026-11-21");
  assert.equal(programDay(Date.parse("2026-11-22T05:00:00Z")), "2026-11-22");
  // Daylight time moves the boundary by one hour.
  assert.equal(programDay(Date.parse("2026-07-04T03:59:59Z")), "2026-07-03");
  assert.equal(programDay(Date.parse("2026-07-04T04:00:00Z")), "2026-07-04");
});

test("each role's queue holds only the items and the fields that the role owns", () => {
  assert.deepEqual(WATCH_TOPICS.filter(topic => topic.role === "cpi").map(topic => topic.id), ["ics", "grid"]);
  assert.equal(WATCH_TOPICS.every(topic => ["trade", "cpi"].includes(topic.role)), true);
  const items = [found("rule", ["chips"], 2), found("advisory", ["ics"], 2), found("mixed", ["grid", "eo14420"], 2), found("plain", [], 2)];
  const decided = { itemId: "mixed", version: 1, payload: { itemId: "mixed", dispositions: { trade: { role: "trade", materiality: "Not material", at: at(1) } } } };
  const ids = (watch, role) => watchQueue(watch, role).map(item => item.id);
  assert.deepEqual(ids({ items, reviews: [] }, "trade"), ["rule", "mixed"]);
  assert.deepEqual(ids({ items, reviews: [] }, "cpi"), ["advisory", "mixed"]);
  // A decision by one role leaves the item in the queue of the other role that owns a topic on it.
  assert.deepEqual(ids({ items, reviews: [decided] }, "trade"), ["rule"]);
  assert.deepEqual(ids({ items, reviews: [decided] }, "cpi"), ["advisory", "mixed"]);
  assert.deepEqual([ids({ items, reviews: [] }, "nstt"), ids({ items, reviews: [] }, "administrator")], [[], []]);

  const catalog = mergeCatalog(syntheticSeed(), []);
  assert.deepEqual(["cpi", "trade", "nstt", "administrator"].map(role => fieldQueue(catalog, role)), [{ vendors: 6, parts: 11 }, { vendors: 6, parts: 11 }, { vendors: 0, parts: 11 }, { vendors: 0, parts: 0 }]);
  assert.deepEqual(fieldQueue(null, "cpi"), { vendors: 0, parts: 0 });
});

// ---------- Quick guides and navigation ----------

test("each design and sourcing screen has a navigation entry and a quick guide with three steps and a next screen", async () => {
  const page = await readFile(new URL("../public/workbench.html", import.meta.url), "utf8");
  const guides = {
    program: ["Plan the program from the design basis", "sourcing", "Open sourcing workflow", "Missing evidence holds a gate. A passed gate changes only when it is reopened with a reason."],
    sourcing: ["Choose a primary and an alternate for each part", "repository", "Open the repository", "Posture, confidence, and fit are separate. A missing fact lowers confidence and adds an information request. It does not raise the posture."],
    repository: ["Confirm the cited facts for each vendor and part", "sourcing", "Open sourcing workflow", "A value of n.a. means no trusted public source was found. A confirmation records who checked the value and when."],
    watch: ["Read the daily update and record what is material", "repository", "Open the repository", "A press item is a lead until a government source confirms it. Every check is logged with the sources it read."],
    portfolio: ["Compare every project in one view", "program", "Open program plan", "Counts come from saved records. A project with no saved design basis shows as not started."],
  };
  assert.deepEqual(GUIDE_VIEWS, Object.keys(guides));
  for (const view of GUIDE_VIEWS) {
    const [title, target, action, rule] = guides[view];
    assert.equal(page.includes(`<button type="button" data-view="${view}" class="nav" id="nav-${view}">${GUIDE_TITLES[view]}</button>`), true, `${view} has no navigation entry.`);
    const guide = drawQuickGuide({ view, role: "trade", projectName: "<MDC>", practice: view === "watch" });
    assert.equal(guide.includes(`<h2 id="quick-guide-title">${title}</h2>`), true, view);
    assert.equal((guide.match(/<li><span>\d<\/span>/g) || []).length, 3, view);
    assert.equal(guide.includes(`<p class="quiet">${rule}</p>`), true, view);
    assert.equal(guide.includes(`<button type="button" class="primary" data-guide-to="${target}">${action}</button>`), true, view);
    assert.equal(guide.includes(`<p class="guide-context">&lt;MDC&gt; · Trade${view === "watch" ? " · Practice only" : ""}</p>`), true, view);
    assert.equal(/<MDC>|\u2014/.test(guide), false, view);
  }
});

// ---------- Screens drawn from what the server returns ----------

const users = {
  administrator: "qa-admin@blackengtech.com", nstt: "qa-preparer@blackengtech.com",
  cpi: "qa-reviewer@alvarezandmarsal.com", trade: "qa-trade@blackengtech.com",
};
const ROLES = ["nstt", "cpi", "trade", "administrator"];
const P = "MDC";
const GENSET = "caterpillar-g3520k";
const GENSET_ALTERNATE = "innio-jenbacher-j620";
// Text a user could type into any saved field. No screen may show it as markup.
const MARK = `<img src=x onerror="alert(1)">`;
const SAFE_MARK = "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;";
const NAME = `MDC ${MARK}`;
const UI = {
  programTab: "basis", gate: null, basisDraft: null, line: "", lineDraft: null, newSubsystem: "",
  repoKind: "vendors", repoQuery: "", repoSubsystem: "", repoFilter: "", repoEntry: "", repoField: "", repoAdd: "",
  watchTab: "", watchTopic: "", watchItem: "",
};
const PROGRAM_TABS = ["basis", "gates", "decisions", "considerations", "risks", "milestones", "roles"];
const WATCH_TABS = ["mine", "all", "decided", "rechecks", "runs", "sources"];
const held = (count) => Array.from({ length: count }, () => ({ state: "Held", note: "" }));
const openItems = [{ text: "Confirm the tenancy model with the owner", owner: "Owner", due: "2026-12-01" }];
const count = (markup, pattern) => (markup.match(pattern) || []).length;
const has = (markup, text) => markup.includes(text);
const submits = (markup) => [...markup.matchAll(/<button[^>]*type="submit"[^>]*>([^<]+)<\/button>/g)].map(match => match[1]);
const forms = (markup) => [...markup.matchAll(/<form[^>]*?(?:id="([^"]+)"|class="([^" ]+)[^"]*")[^>]*>/g)].map(match => match[1] || match[2]);
const lockedNotes = (markup) => [...markup.matchAll(/<p class="locked-note">([^<]+)</g)].map(match => match[1]);
const openFieldsets = (markup) => [count(markup, /<fieldset >/g), count(markup, /<fieldset disabled>/g)];
const plain = (markup) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function workbench(t) {
  const store = createMemory();
  const sessions = {};
  for (const [role, email] of Object.entries(users)) {
    await store.grant({ email, role, environment: "development", grantedBy: users.administrator });
    sessions[role] = (await store.createSession(email, "synthetic-test")).id;
  }
  const net = syntheticNetwork();
  clearScreeningCache();
  const server = createServer(createApp({ store, fetchImpl: net.fetchImpl }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (role, route, body, extra = {}) => {
    const response = await fetch(`${base}${route}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Cookie: `sid=${sessions[role]}`, ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
  const send = async (role, route, body, status = 200, extra = {}) => ok(await request(role, route, { projectId: P, ...body }, extra), status);

  // Reads the four saved data sets the way the browser does, then draws each screen from them.
  async function open(role, projectId = P, extra = {}) {
    const read = async (route) => ok(await request(role, route, null, extra));
    const plan = await read(`/api/guide?project=${projectId}`);
    const raw = await read(`/api/catalog?project=${projectId}`);
    const watch = await read(`/api/watch?project=${projectId}`);
    const portfolio = await read("/api/portfolio");
    const acting = extra["x-practice-role"] || role;
    const catalog = mergeCatalog(CATALOG_SEED, raw.documents, { practice: raw.practice, auto: raw.auto, reviews: raw.reviews });
    const context = designContext(plan.program?.payload);
    const lines = plan.selections.map(row => ({ id: row.id, reasons: lineRecheck(row.payload, catalog, context) }));
    const digest = dailyDigest({ watch, catalog, lines, projectName: NAME, context });
    const parts = [...new Set(plan.selections.flatMap(row => [row.payload.primary, row.payload.alternate]).filter(Boolean))];
    const used = { parts, vendors: [...new Set(parts.map(id => catalog.parts.find(part => part.id === id)?.vendor).filter(Boolean))] };
    return {
      plan, raw, catalog, watch, portfolio, context, digest,
      program: (ui = {}) => drawProgram({ plan, loading: false, error: "", role: acting, ui: { ...UI, ...ui }, projectName: NAME }),
      sourcing: (ui = {}) => drawSourcing({ plan, catalog, loading: false, error: "", catalogError: "", role: acting, ui: { ...UI, ...ui } }),
      repository: (ui = {}) => drawRepository({ catalog, raw, loading: false, error: "", role: acting, ui: { ...UI, ...ui }, context, projectName: NAME, basisSaved: Boolean(plan.program), analyzing: "", used }),
      watchLog: (ui = {}) => drawWatch({ watch, catalog, loading: false, error: "", role: acting, ui: { ...UI, ...ui }, digest, running: false }),
      portfolioView: () => drawPortfolio({ portfolio, loading: false, error: "", currentProject: projectId }),
    };
  }
  return { store, net, request, ok, send, open };
}

const saveBasis = (bench, changes = {}) => bench.send("nstt", "/api/guide/save", {
  version: 0, section: "basis",
  data: { basis: { tenancy: "private", power: "island", platform: "nvl72", region: "US", customer: "us", voltage: "480 V", ...changes }, pathway: 1 },
});
const saveLine = (bench, changes = {}) => bench.send("nstt", "/api/guide/selection", {
  action: "save", line: { subsystem: "generator", category: "gas-engine-set", primary: GENSET, alternate: GENSET_ALTERNATE, ...changes },
}, 201);

test("every screen escapes the text that a user saved, and no screen shows an email address", async (t) => {
  const bench = await workbench(t);
  await saveBasis(bench, { voltage: `480 V ${MARK}`, note: `Basis note ${MARK}` });
  await bench.send("nstt", "/api/guide/save", { version: 1, section: "milestones", data: { milestones: [{ id: "service", date: "2999-06-30" }, { id: "", label: `Site walk ${MARK}`, date: "2999-01-15" }] } });
  await bench.send("nstt", "/api/guide/gate", { gate: 0, action: "save", version: 0, evidence: [{ state: "Held", note: `Memo ${MARK}` }], openItems: [{ text: `Confirm ${MARK}`, owner: "Owner", due: "2026-12-01" }] });
  await saveLine(bench, { note: `Reviewer note ${MARK}`, stopNote: `Stop ${MARK}`, noAlternateReason: `Reason ${MARK}` });
  const added = await bench.send("nstt", "/api/catalog/entry", { kind: "vendor", legalName: `Synthetic ${MARK} Works Ltd`, website: "markup-works.example" }, 201);
  await bench.send("cpi", "/api/watch/run", { trigger: "manual" });
  const rule = (await bench.open("trade")).watch.items.find(row => row.sourceId === "fr-bis");
  await bench.send("trade", "/api/watch/review", { itemId: rule.id, topics: ["chips"], materiality: "Material", note: `The rule matters ${MARK} for the chip platform.`, vendors: ["caterpillar"], version: 0 });
  await bench.send("cpi", "/api/catalog/field", {
    kind: "vendor", id: "caterpillar", action: "change", field: "hqCountry", value: "US", reason: `Checked the filing ${MARK} today.`,
    sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany", sourceLabel: `Filing ${MARK}`, detail: `Detail ${MARK}`, version: 0,
  });

  // Where the saved text must appear, escaped. Every other screen is still checked for raw markup.
  const expected = {
    "program basis": 3, "program gates": 3, "program milestones": 2, "sourcing line": 3, "repository vendor": 4, "repository added vendor": 2,
    "repository part": 2, "watch all": 3, "watch decided": 3, "portfolio": 1,
  };
  for (const role of ROLES) {
    const screen = await bench.open(role);
    const pages = {
      ...Object.fromEntries(PROGRAM_TABS.map(tab => [`program ${tab}`, screen.program({ programTab: tab, gate: 0 })])),
      "sourcing list": screen.sourcing(),
      "sourcing line": screen.sourcing({ line: "L-01" }),
      "sourcing new line": screen.sourcing({ line: "new", newSubsystem: "ups" }),
      "repository list": screen.repository(),
      "repository vendor": screen.repository({ repoEntry: "caterpillar", repoField: "hqCountry" }),
      "repository added vendor": screen.repository({ repoEntry: added.id }),
      "repository part": screen.repository({ repoKind: "parts", repoEntry: GENSET, repoField: "rating" }),
      "repository add vendor": screen.repository({ repoAdd: "vendor" }),
      "repository add part": screen.repository({ repoAdd: "part" }),
      ...Object.fromEntries(WATCH_TABS.map(tab => [`watch ${tab}`, screen.watchLog({ watchTab: tab, watchItem: rule.id })])),
      portfolio: screen.portfolioView(),
    };
    for (const [name, markup] of Object.entries(pages)) {
      const where = `${name} as ${role}`;
      assert.equal(markup.length > 500, true, `${where} is empty.`);
      assert.equal(has(markup, "<img"), false, `${where} shows saved text as markup.`);
      assert.equal(count(markup, /&lt;img src=x/g) >= (expected[name] || 0), true, `${where} leaves out saved text: ${count(markup, /&lt;img src=x/g)} of ${expected[name]}.`);
      assert.equal(/[\w.+-]+@[\w-]+\.[\w.]+/.test(markup), false, `${where} shows an email address.`);
      assert.equal(/\u2014/.test(markup), false, `${where} uses an em dash.`);
      assert.equal(/undefined|NaN|\[object |null</.test(markup), false, `${where} shows an unset value.`);
    }
    // The saved text reaches the places a reader relies on.
    assert.equal(has(pages["program basis"], `<p class="kicker">MDC ${SAFE_MARK}</p>`), true);
    assert.equal(has(pages["program basis"], `value="480 V ${SAFE_MARK}"`), true);
    assert.equal(has(pages["program milestones"], `Site walk ${SAFE_MARK}`), true);
    assert.equal(has(pages["program gates"], `Memo ${SAFE_MARK}`) && has(pages["program gates"], `Confirm ${SAFE_MARK}`), true);
    assert.equal(has(pages["sourcing line"], `Reviewer note ${SAFE_MARK}`), true);
    assert.equal(has(pages["repository vendor"], `Reason: Checked the filing ${SAFE_MARK} today.`), true);
    assert.equal(has(pages["repository added vendor"], `<h2>Synthetic ${SAFE_MARK} Works Ltd</h2>`), true);
    assert.equal(has(pages["repository part"], `<h3>Benchmark for MDC ${SAFE_MARK}</h3>`), true);
    assert.equal(has(pages["watch decided"], `The rule matters ${SAFE_MARK} for the chip platform.`), true);
    assert.equal(has(pages["watch all"], `need a second look`) || has(pages["watch all"], `needs a second look`), true);
    assert.equal(has(pages.portfolio, `Site walk ${SAFE_MARK}`), true);
  }
});

test("the program plan and a sourcing line open for editing only to the role that owns each step", async (t) => {
  const bench = await workbench(t);
  await saveBasis(bench);
  await bench.send("nstt", "/api/guide/gate", { gate: 0, action: "save", version: 0, evidence: held(2), openItems });
  await saveLine(bench);
  const views = async (role) => {
    const screen = await bench.open(role);
    return { basis: screen.program(), gate0: screen.program({ programTab: "gates", gate: 0 }), gate1: screen.program({ programTab: "gates", gate: 1 }), line: screen.sourcing({ line: "L-01" }), list: screen.sourcing() };
  };
  const label = { cpi: "CPI", trade: "Trade", administrator: "Administrator" };

  // In preparation: NSTT edits. Every other role reads.
  let nstt = await views("nstt");
  assert.deepEqual([forms(nstt.basis), submits(nstt.basis), openFieldsets(nstt.basis), lockedNotes(nstt.basis)], [["basis-form"], ["Save the design basis"], [1, 0], []]);
  assert.deepEqual([forms(nstt.gate0), submits(nstt.gate0), openFieldsets(nstt.gate0)], [["gate-form"], ["Save evidence", "Record a hold", "Ready for decision"], [2, 0]]);
  assert.deepEqual([forms(nstt.line), submits(nstt.line), openFieldsets(nstt.line)], [["selection-form"], ["Save the line", "Save and send to review"], [5, 0]]);
  assert.equal(count(nstt.list, /data-line-new="/g), 8);
  for (const role of ["cpi", "trade", "administrator"]) {
    const read = await views(role);
    assert.deepEqual([submits(read.basis), openFieldsets(read.basis), lockedNotes(read.basis)], [[], [0, 1], [`You read the plan as ${label[role]}. The NSTT role prepares it.`]], role);
    assert.deepEqual([submits(read.gate0), openFieldsets(read.gate0), lockedNotes(read.gate0)], [[], [0, 2], [`The NSTT role prepares the evidence. You read it as ${label[role]}.`]], role);
    assert.deepEqual([submits(read.line), openFieldsets(read.line), lockedNotes(read.line)], [[], [0, 5], [`The NSTT role prepares sourcing lines. You read this line as ${label[role]}.`]], role);
    assert.equal(count(read.list, /data-line-new="/g), 0, role);
  }

  // Ready for decision and in review: only the reviewing role decides, and NSTT may withdraw the line.
  await bench.send("nstt", "/api/guide/gate", { gate: 0, action: "ready", version: 1, evidence: held(3), openItems });
  await bench.send("nstt", "/api/guide/selection", { action: "submit", id: "L-01", version: 1 });
  nstt = await views("nstt");
  assert.deepEqual(lockedNotes(nstt.gate0), ["This gate waits for the CPI role to record the decision."]);
  assert.deepEqual([forms(nstt.line), submits(nstt.line), openFieldsets(nstt.line)], [["selection-form", "selection-reopen-form"], ["Withdraw the line"], [0, 5]]);
  let cpi = await views("cpi");
  assert.deepEqual([forms(cpi.gate0), submits(cpi.gate0), openFieldsets(cpi.gate0)], [["gate-form", "gate-decision-form"], ["Record the decision", "Return to preparation"], [0, 2]]);
  assert.deepEqual([forms(cpi.gate1), submits(cpi.gate1)], [["gate-form"], []]);
  assert.deepEqual([forms(cpi.line), submits(cpi.line)], [["selection-form", "selection-review-form"], ["Approve the line", "Return to NSTT"]]);
  for (const role of ["trade", "administrator"]) {
    const read = await views(role);
    assert.deepEqual([forms(read.gate0), submits(read.gate0)], [["gate-form"], []], role);
    assert.equal(lockedNotes(read.gate0).includes("This gate waits for the CPI role to record the decision."), true, role);
    assert.deepEqual([forms(read.line), submits(read.line)], [["selection-form"], []], role);
  }

  // Passed and approved: the basis is frozen for every role, and a change starts with a reopening.
  await bench.send("cpi", "/api/guide/gate", { gate: 0, action: "decide", version: 2, result: "Passed with conditions", signoffRef: "Owner memo 2026-014", condition: "The owner confirms the tenancy model by December 1." });
  await bench.send("cpi", "/api/guide/selection", { action: "approve", id: "L-01", version: 2, note: "The alternate is from a different parent." });
  for (const role of ROLES) {
    const read = await views(role);
    assert.deepEqual([submits(read.basis), openFieldsets(read.basis), lockedNotes(read.basis)], [[], [0, 1], ["The design basis is frozen at Gate 0. Reopen Gate 0 with a reason before changing it."]], role);
    const reopens = ["nstt", "cpi"].includes(role);
    assert.deepEqual([forms(read.gate0), submits(read.gate0)], reopens ? [["gate-form", "gate-reopen-form"], ["Reopen the gate"]] : [["gate-form"], []], role);
    assert.deepEqual([forms(read.line), submits(read.line), openFieldsets(read.line)], reopens ? [["selection-form", "selection-reopen-form"], ["Reopen the line"], [0, 5]] : [["selection-form"], [], [0, 5]], role);
    // Gate 1 is the next gate. NSTT prepares it.
    assert.deepEqual(submits(read.gate1), role === "nstt" ? ["Save evidence", "Record a hold", "Ready for decision"] : [], role);
    assert.equal(has(read.basis, "Gate 1. "), true, role);
  }
});

test("the repository shows each role the fields it owns, with the source and the state of each value", async (t) => {
  const bench = await workbench(t);
  await saveBasis(bench);
  await saveLine(bench);
  await bench.send("cpi", "/api/catalog/field", { kind: "vendor", id: "caterpillar", action: "confirm", field: "legalName", version: 0 });
  const banner = {
    nstt: "You act as NSTT. Other roles own the vendor fields. On a part you confirm or change 4 fields: Model, Device tier, Rating, Frequency.",
    cpi: "You act as CPI. On a vendor you confirm or change 7 fields: Legal name, Headquarters country, Legal jurisdiction, Legal Entity Identifier, SEC registrant number, Ultimate parent, Ultimate parent country. On a part you confirm or change 2 fields: Standards stated by the maker, Final assembly country.",
    trade: "You act as Trade. On a vendor you confirm or change 4 fields: Screening list result, FCC Covered List, Section 1260H list, 22 CFR 126.1 country link. On a part you confirm or change 4 fields: Executive Order 14420 listed type, FCC inverter entry, US chip export rule, Chinese export control exposure.",
    administrator: "You read the repository. The NSTT, CPI, and Trade roles confirm or change their own fields.",
  };
  const owned = { nstt: [0, 4], cpi: [7, 2], trade: [4, 4], administrator: [0, 0] };
  // The line above the fields names the roles that confirm them. NSTT owns no vendor field, so it is told who does.
  const everyRole = "The NSTT, CPI, and Trade roles confirm or change their own fields.";
  const confirms = {
    nstt: ["The CPI and Trade roles confirm or change the fields on a vendor record.", "The NSTT role confirms or changes the fields marked NSTT."],
    cpi: ["The CPI role confirms or changes the fields marked CPI.", "The CPI role confirms or changes the fields marked CPI."],
    trade: ["The Trade role confirms or changes the fields marked Trade.", "The Trade role confirms or changes the fields marked Trade."],
    administrator: [everyRole, everyRole],
  };
  const intro = (html) => /<p class="quiet">Each value starts from the most trusted public source found\. (.*?) A change needs a reason and is kept in the history\.<\/p>/.exec(html)?.[1];
  for (const role of ROLES) {
    const screen = await bench.open(role);
    const list = screen.repository();
    const vendor = screen.repository({ repoEntry: "caterpillar", repoField: "hqCountry" });
    const part = screen.repository({ repoKind: "parts", repoEntry: GENSET, repoField: "rating" });
    assert.equal(has(list, `<p class="guide-banner">${banner[role]}</p>`), true, role);
    assert.equal(has(list, `<strong>${screen.catalog.vendors.length}</strong><span>Vendors</span>`) && has(list, `<strong>${screen.catalog.parts.length}</strong><span>Parts</span>`), true, role);
    assert.equal(has(list, "The daily check has not screened the vendor names yet. A value of n.a. means no trusted public source was found."), true, role);
    assert.equal(count(list, /data-repo-entry="/g), screen.catalog.vendors.length, role);
    // Only NSTT adds a vendor or a part.
    assert.deepEqual([count(list, /data-repo-add="vendor"/g), count(list, /data-repo-add="part"/g)], role === "nstt" ? [1, 1] : [0, 0], role);
    assert.equal(has(screen.repository({ repoAdd: "vendor" }), `id="repo-add-form"`), role === "nstt", role);
    // Every field is shown to every role. Only the owner's rows carry actions.
    assert.deepEqual([count(vendor, /data-field-row="/g), count(part, /data-field-row="/g)], [11, 10], role);
    assert.deepEqual([count(vendor, /class="frow mine"/g), count(part, /class="frow mine"/g)], owned[role], role);
    assert.deepEqual([intro(vendor), intro(part)], confirms[role], role);
    assert.deepEqual([count(vendor, /data-field-edit="\w+"/g), count(part, /data-field-edit="\w+"/g)], owned[role], role);
    assert.deepEqual([count(vendor, /class="field-change-form form"/g), count(part, /class="field-change-form form"/g)], [role === "cpi" ? 1 : 0, role === "nstt" ? 1 : 0], role);
    // The three working roles run the analysis. An administrator reads.
    assert.equal(count(vendor, /data-analyze="caterpillar"/g), role === "administrator" ? 0 : 1, role);
    // The confirmation by CPI shows to every role, with the role and not the person.
    assert.equal(/<span class="state-tag confirmed">Confirmed<\/span>\s*<span class="quiet">CPI role, /.test(vendor), true, role);
    assert.equal(has(vendor, `<summary>History (1)</summary>`), true, role);
    assert.equal(has(part, "<h3>Alternates from a different ultimate parent</h3>") && has(part, `<ol class="alt-list">`), true, role);
    // The filter for the project's own lines keeps the two vendors and the two parts in use.
    assert.equal(count(screen.repository({ repoFilter: "used" }), /data-repo-entry="/g), 2, role);
    assert.equal(count(screen.repository({ repoKind: "parts", repoFilter: "used" }), /data-repo-entry="/g), 2, role);
  }
  const cpi = await bench.open("cpi");
  const vendor = cpi.repository({ repoEntry: "caterpillar" });
  // Legal name is confirmed, so six sourced CPI values remain, and one action confirms them together.
  assert.equal(count(vendor, /data-field-action="confirm"/g), 6);
  assert.equal(has(vendor, `data-confirm-all="hqCountry,jurisdiction,lei,cik,ultimateParent,parentCountry">Confirm my 6 sourced values</button>`), true);
  assert.equal(count(vendor, /data-field-action="reset" data-field="legalName"/g), 1);
  assert.equal(has(cpi.repository({ repoQuery: "no such maker" }), `<p class="quiet repo-empty">No vendor matches. Clear the search or the filters.</p>`), true);
  assert.equal(has(cpi.repository({ repoEntry: "" }), "Choose a vendor from the list to see its cited fields, its analysis, and its history."), true);
});

test("the regulatory watch gives each role its own decisions and shows the check log and the sources", async (t) => {
  const bench = await workbench(t);
  await saveBasis(bench);
  await saveLine(bench);
  const before = await bench.open("trade");
  assert.equal(has(before.watchLog(), "No check has run yet. Choose Check now to read the sources."), true);
  assert.equal(has(before.watchLog({ watchTab: "runs" }), `<p class="quiet">No check has run yet.</p>`), true);
  assert.equal(has(before.watchLog({ watchTab: "all" }), "No item has been found yet. Choose Check now to read the sources."), true);

  await bench.send("cpi", "/api/watch/run", { trigger: "manual" });
  const trade = await bench.open("trade");
  const rule = trade.watch.items.find(row => row.sourceId === "fr-bis");
  const advisory = trade.watch.items.find(row => row.sourceId === "cisa-ics");
  const lead = trade.watch.items.find(row => row.lead);
  assert.equal(trade.watch.items.length, 3);
  const tabs = (markup) => [...markup.matchAll(/data-watch-tab="\w+" aria-pressed="(true|false)">([^<]+)</g)].map(match => `${match[2]}${match[1] === "true" ? " *" : ""}`);
  // Trade and CPI open on their own queue. The other roles open on the full log.
  assert.deepEqual(tabs(trade.watchLog()), ["For my decision (2) *", "All items (3)", "Decisions recorded (0)", "Open rechecks (0)", "Check log (1)", "Sources"]);
  const cpi = await bench.open("cpi");
  assert.deepEqual(tabs(cpi.watchLog()).slice(0, 2), ["For my decision (1) *", "All items (3)"]);
  for (const role of ["nstt", "administrator"]) {
    const screen = await bench.open(role);
    assert.deepEqual(tabs(screen.watchLog()).slice(0, 2), ["For my decision (0)", "All items (3) *"], role);
    assert.equal(has(screen.watchLog({ watchTab: "mine" }), "Your role records no materiality decision. Open All items to read the log."), true, role);
    assert.equal(count(screen.watchLog({ watchTab: "all" }), /data-watch-item="/g), 0, role);
  }
  // Each item offers its decision only to the role that owns its topic.
  const offered = (markup) => [...markup.matchAll(/data-watch-item="(\w+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(offered(trade.watchLog({ watchTab: "all" })), [rule.id, lead.id].sort());
  assert.deepEqual(offered(cpi.watchLog({ watchTab: "all" })), [advisory.id]);
  assert.equal(has(trade.watchLog({ watchTab: "all" }), "The CPI role records materiality for this item."), true);
  assert.equal(has(cpi.watchLog({ watchTab: "all" }), "The Trade role records materiality for this item."), true);
  assert.equal(has(trade.watchLog({ watchTab: "all" }), "Press lead. Confirm on a government page."), true);
  // The form opens for the owner only, even when another role is pointed at the same item.
  assert.equal(count(trade.watchLog({ watchTab: "all", watchItem: rule.id }), /class="watch-review-form/g), 1);
  assert.equal(count(cpi.watchLog({ watchTab: "all", watchItem: rule.id }), /class="watch-review-form/g), 0);
  // The topic filter narrows the list.
  assert.equal(count(trade.watchLog({ watchTab: "all", watchTopic: "ics" }), /<article class="watch-item/g), 1);
  assert.equal(has(trade.watchLog({ watchTab: "mine", watchTopic: "grid" }), "No item carries this topic."), true);

  // The check log names what was read, and the sources tab names what cannot be read.
  const runs = trade.watchLog({ watchTab: "runs" });
  assert.equal(has(runs, `${dateText(trade.watch.runs[0].at)}`), true);
  assert.equal(count(runs, /<tr>/g) > trade.watch.sources.length, true);
  const sources = plain(trade.watchLog({ watchTab: "sources" }));
  assert.equal(trade.watch.sources.length, 20);
  for (const row of [...trade.watch.sources, ...trade.watch.notConnected]) assert.equal(sources.includes(plain(row.label.replaceAll("&", "&amp;"))), true, row.label);
  assert.deepEqual(trade.watch.notConnected.map(row => row.id), ["mofcom", "fcc-page", "ferc", "nerc"]);
  assert.equal(sources.includes("Press lead. It prompts a check of the government page and changes nothing by itself."), true);
  assert.equal(sources.includes("Executive Order 14420") && sources.includes("14421"), true);

  // A material decision by Trade opens rechecks, flags the sourcing line, and is shown to every role with the role only.
  await bench.send("trade", "/api/watch/review", { itemId: rule.id, topics: ["chips"], materiality: "Material", note: "The rule changes the license position for the chip platform.", vendors: ["caterpillar"], version: 0 });
  for (const role of ROLES) {
    const screen = await bench.open(role);
    const decided = screen.watchLog({ watchTab: "decided" });
    assert.equal(count(decided, /<article class="watch-item/g), 1, role);
    assert.equal(/The Trade role recorded Material on [^<]+\. The rule changes the license position for the chip platform\. Flagged for recheck: 1 vendor and \d+ parts\./.test(plain(decided)), true, role);
    assert.equal(has(screen.watchLog(), "1 sourcing line in MDC &lt;img src=x onerror=&quot;alert(1)&quot;&gt; needs a second look: L-01 ("), true, role);
    const flagged = screen.catalog.vendors.filter(row => row.recheck.length).length + screen.catalog.parts.filter(row => row.recheck.length).length;
    assert.equal(count(screen.watchLog({ watchTab: "rechecks" }), /data-repo-open="/g), flagged, role);
    assert.equal(flagged > 1, true, role);
    // Only Trade clears the recheck that Trade opened.
    const vendor = screen.repository({ repoEntry: "caterpillar" });
    assert.equal(count(vendor, /class="recheck-clear-form form"/g), role === "trade" ? 1 : 0, role);
    assert.equal(has(vendor, "Only the Trade role clears this recheck."), role !== "trade", role);
    assert.equal(has(screen.portfolioView(), "1 line to recheck."), true, role);
  }
  const after = await bench.open("trade");
  assert.deepEqual(tabs(after.watchLog()).slice(0, 3), ["For my decision (1) *", "All items (3)", "Decisions recorded (1)"]);
  assert.equal(after.digest.action, true);
  assert.equal(after.digest.bullets.some(row => row.kind === "material" && row.text.startsWith("The Trade role recorded “Synthetic test rule on advanced computing items and remote access” as material. It flags 1 vendor and ")), true);
});

test("the watch says whether a scheduled check is arriving, is ready and silent, or is absent", async (t) => {
  const fallback = "The workbench runs a catch-up check when it is opened after 20 hours, and any role can choose Check now.";
  const silent = `The scheduled check is ready in this environment. No scheduled check has arrived in the last 36 hours. Ask an administrator to confirm that the scheduler is running. ${fallback}`;
  const stamp = "2026-11-22T11:00:04.000Z";
  assert.equal(scheduleText({ scheduled: false, scheduleReady: false, lastScheduledAt: "" }), `This environment has no scheduled check. ${fallback}`);
  assert.equal(scheduleText({ scheduled: false, scheduleReady: true, lastScheduledAt: stamp }), silent);
  assert.equal(scheduleText({ scheduled: true, scheduleReady: true, lastScheduledAt: "" }), "A scheduled check runs every day.");
  assert.equal(scheduleText({ scheduled: true, scheduleReady: true, lastScheduledAt: stamp }), `A scheduled check runs every day. The last scheduled check ran on ${dateText(stamp)}.`);
  assert.equal(scheduleText(undefined), `This environment has no scheduled check. ${fallback}`);

  // The development screen follows the record: no schedule, then a ready schedule, then one that has arrived.
  const bench = await workbench(t);
  delete process.env.CRON_SECRET;
  t.after(() => { delete process.env.CRON_SECRET; });
  assert.equal(has((await bench.open("trade")).watchLog(), `No check has run yet. This environment has no scheduled check. ${fallback}`), true);
  process.env.CRON_SECRET = "synthetic-cron-secret";
  assert.equal(has((await bench.open("trade")).watchLog(), `No check has run yet. ${silent}`), true);
  bench.ok(await bench.request("", "/api/watch/cron", null, { Authorization: "Bearer synthetic-cron-secret" }));
  const after = await bench.open("trade");
  assert.equal(after.watch.state.lastScheduledAt, after.watch.runs[0].at);
  assert.equal(has(after.watchLog(), `A scheduled check runs every day. The last scheduled check ran on ${dateText(after.watch.runs[0].at)}.`), true);
  assert.equal(has(after.watchLog(), "This environment has no scheduled check."), false);
  assert.equal(has(after.watchLog({ watchTab: "runs" }), "Scheduled daily check · Scheduled check"), true);
});

test("the portfolio compares the projects a role can open and marks the one that is open", async (t) => {
  const bench = await workbench(t);
  const empty = (await bench.open("nstt")).portfolioView();
  assert.equal(has(empty, "<strong>1</strong><span>Projects</span>") && has(empty, "<strong>0</strong><span>With a saved design basis</span>"), true);
  assert.equal(has(empty, "No design basis is saved for this project. The NSTT role starts the plan in Program plan."), true);

  await saveBasis(bench);
  await bench.send("nstt", "/api/guide/save", { version: 1, section: "milestones", data: { milestones: [{ id: "service", date: "2999-06-30" }] } });
  await bench.send("nstt", "/api/guide/gate", { gate: 0, action: "save", version: 0, evidence: held(2), openItems });
  await saveLine(bench);
  const screen = await bench.open("trade");
  const view = screen.portfolioView();
  const row = screen.portfolio.rows[0];
  assert.deepEqual([row.projectId, row.design, row.gatesPassed, row.gatesTotal, row.openItems, row.rechecks], [P, "A", 0, 5, 1, 0]);
  assert.equal(has(view, `<p class="kicker">MDC · open now</p>`), true);
  assert.equal(has(view, `<button type="button" data-portfolio-open="MDC">Open the plan</button>`), true);
  for (const pill of ["Design A", "United States", "Islanded", "Pathway 1"]) assert.equal(has(view, `<span class="pill grey">${pill}</span>`), true, pill);
  assert.equal(has(view, `aria-label="0 of 5 gates passed"`), true);
  assert.equal(has(plain(view), "Current gate Gate 0. Design basis frozen In preparation"), true);
  for (const bar of ["Primary part", "Alternate"]) assert.equal(has(view, `<span>${bar}</span><strong>1 of 8</strong>`), true, bar);
  assert.equal(has(view, `<span>Approved line</span><strong>0 of 8</strong>`), true);
  assert.equal(has(view, "1 sourcing line, 0 in review, 0 approved. 1 open gate item. 0 lines to recheck."), true);
  assert.equal(has(view, "<h2>Timeline across projects</h2>"), true);
  assert.equal(has(plain(view), "Project milestone. First building in service (Gate 4)"), true);
  assert.equal(has(view, "Executive Order 14420") && !has(view, "Executive Order 14421"), true);
  // The same row is not marked when another project is open.
  assert.equal(has(drawPortfolio({ portfolio: screen.portfolio, loading: false, error: "", currentProject: "OTHER" }), "open now"), false);

  // The designated administrator also sees the practice project once practice work is saved. Other roles do not.
  const before = await bench.open("administrator");
  assert.deepEqual(before.portfolio.rows.map(item => item.projectId), [P]);
  bench.ok(await bench.request("administrator", "/api/guide/save", { projectId: "PRACTICE", version: 0, section: "basis", data: { basis: { tenancy: "multi", power: "grid", platform: "nvl72", region: "EU", customer: "open", voltage: "400 V" }, pathway: 3 } }, { "x-practice-role": "nstt" }));
  const admin = await bench.open("administrator");
  assert.deepEqual(admin.portfolio.rows.map(item => [item.projectId, item.practice, item.started, item.design, item.region, item.pathway]), [[P, false, true, "A", "US", 1], ["PRACTICE", true, true, "B", "EU", 3]]);
  const both = admin.portfolioView();
  assert.equal(has(both, "<strong>2</strong><span>Projects</span>") && has(both, "<strong>2</strong><span>With a saved design basis</span>"), true);
  assert.equal(has(both, `<p class="kicker">MDC · open now</p>`) && has(both, `<p class="kicker">PRACTICE · practice copy</p>`), true);
  for (const pill of ["Design B", "European Union", "Grid-fed with backup", "Pathway 3"]) assert.equal(has(both, `<span class="pill grey">${pill}</span>`), true, pill);
  assert.equal(count(both, /data-portfolio-open="/g), 2);
  assert.deepEqual((await bench.open("nstt")).portfolio.rows.map(item => item.projectId), [P]);
});

test("a practice role works on a practice copy, and the screens say so", async (t) => {
  const bench = await workbench(t);
  const asNstt = { "x-practice-role": "nstt" };
  bench.ok(await bench.request("administrator", "/api/guide/save", { projectId: "PRACTICE", version: 0, section: "basis", data: { basis: { tenancy: "multi", power: "grid", platform: "nvl72", region: "EU", customer: "open", voltage: "400 V" }, pathway: 3 } }, asNstt));
  const practice = await bench.open("administrator", "PRACTICE", asNstt);
  assert.equal(practice.plan.practice && practice.raw.practice && practice.watch.practice, true);
  assert.equal(has(practice.program(), `<p class="kicker">MDC ${SAFE_MARK} · practice copy</p>`), true);
  assert.deepEqual(submits(practice.program()), ["Save the design basis"]);
  assert.equal(has(practice.repository(), "Practice edits go to a practice copy and leave the shared repository unchanged."), true);
  assert.equal(has(practice.portfolioView(), `<p class="kicker">PRACTICE · practice copy · open now</p>`), true);
  // The MDC records are untouched, and the administrator reads them without a practice role.
  const real = await bench.open("administrator");
  assert.equal(real.plan.program, null);
  assert.equal(has(real.program(), "No design basis saved") && has(real.program(), "Start with the design basis."), true);
  assert.equal(has(real.repository(), "Practice edits go to a practice copy"), false);
});

test("each screen states that it is loading, and a failure offers a way to retry", () => {
  const ui = { ...UI };
  const failure = "The saved data could not be loaded. Check the connection, then choose Try again.";
  const screens = {
    plan: [
      (state) => drawProgram({ plan: null, role: "nstt", ui, projectName: "MDC", ...state }),
      (state) => drawSourcing({ plan: null, catalog: null, catalogError: "", role: "nstt", ui, ...state }),
    ],
    catalog: [(state) => drawRepository({ catalog: null, raw: null, role: "nstt", ui, context: CONTEXT, projectName: "MDC", ...state })],
    watch: [(state) => drawWatch({ watch: null, catalog: null, role: "trade", ui, digest: dailyDigest({ now: NOW }), running: false, ...state })],
    portfolio: [(state) => drawPortfolio({ portfolio: null, currentProject: "MDC", ...state })],
  };
  const waiting = { plan: "Loading saved work for this project.", catalog: "Loading the repository.", watch: "Loading the watch log.", portfolio: "Loading saved work for this project." };
  const idle = { plan: "Saved work for this project is not loaded yet.", catalog: "The repository is not loaded yet.", watch: "The watch log is not loaded yet.", portfolio: "Saved work for this project is not loaded yet." };
  for (const [key, draws] of Object.entries(screens)) {
    for (const draw of draws) {
      assert.equal(draw({ loading: true, error: "" }), `<section class="pane"><p class="quiet">${waiting[key]}</p></section>`, key);
      assert.equal(draw({ loading: false, error: "" }), `<section class="pane"><p class="quiet">${idle[key]}</p></section>`, key);
      const failed = draw({ loading: false, error: `${failure} ${MARK}` });
      assert.equal(failed, `<section class="pane"><p class="block">${failure} ${SAFE_MARK}</p><div class="row-actions"><button type="button" data-guide-reload="${key}">Try again</button></div></section>`, key);
    }
  }
  // The sourcing workflow also needs the repository, and says which of the two failed.
  const plan = { practice: false, program: null, gates: [], selections: [] };
  assert.equal(drawSourcing({ plan, catalog: null, loading: false, error: "", catalogError: "", role: "nstt", ui }), `<section class="pane"><p class="quiet">Loading saved work for this project.</p></section>`);
  assert.equal(has(drawSourcing({ plan, catalog: null, loading: false, error: "", catalogError: "The repository could not be loaded.", role: "nstt", ui }), `<p class="block">The repository could not be loaded.</p><div class="row-actions"><button type="button" data-guide-reload="catalog">Try again</button>`), true);
});
