import test from "node:test";
import assert from "node:assert/strict";
import { NOT_CONNECTED, SYSTEM_ACTOR, WATCH_PARTITION, WATCH_SOURCES, flattenRuns, rssItems, runWatch, shapeItem } from "./watch.js";
import { clearScreeningCache } from "./analysis.js";
import { guideMemory } from "./guide-store.js";
import { syntheticNetwork, syntheticSeed } from "./guide-fixtures.js";
import { WATCH_TOPICS, mergeCatalog } from "../public/catalog-model.js";

// Every notice, advisory, and press lead in this file is made up. No test reaches the network.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-22T15:00:00.000Z");
const ENVIRONMENT = "development";
const TRADE = { email: "qa-trade@blackengtech.com", role: "trade" };
const dayBefore = (count, base = NOW) => new Date(base - count * DAY).toISOString().slice(0, 10);

// The synthetic feeds, dated against the fixed clock of these tests.
function network() {
  clearScreeningCache();
  const net = syntheticNetwork();
  net.state.federalRegister[0].row.publication_date = dayBefore(2);
  net.state.feeds["www.cisa.gov"][0].date = NOW - DAY;
  net.state.feeds["news.google.com"][0].date = NOW - DAY;
  return net;
}
function setup() {
  const net = network();
  const store = guideMemory();
  // The pause before a second try is set to zero so the tests do not wait.
  const run = (options = {}) => runWatch({ store, environment: ENVIRONMENT, trigger: "scheduled", fetchImpl: net.fetchImpl, now: NOW, retryMs: 0, ...options });
  const read = (kind, key) => store.readGuideDocument(ENVIRONMENT, kind, key);
  return { net, store, run, read };
}
const source = (id) => WATCH_SOURCES.find(row => row.id === id);
const sourceRow = (run, id) => run.sources.find(row => row.id === id);
const federalRegisterSince = (net, from = 0) => [...new Set(net.state.calls.slice(from).filter(call => call.host === "www.federalregister.gov").map(call => new URL(call.url).searchParams.get("conditions[publication_date][gte]")))];

// ---------- Sources ----------

test("the watch reads twenty sources, names the four it cannot read, and gives every topic an owning role", () => {
  assert.equal(WATCH_SOURCES.length, 20);
  assert.equal(new Set(WATCH_SOURCES.map(row => row.id)).size, 20);
  // Government sources are tier 1. Press searches are tier 5 and are marked as leads.
  assert.deepEqual(WATCH_SOURCES.filter(row => row.kind !== "news").map(row => [row.tier, Boolean(row.lead)]), Array(14).fill([1, false]));
  assert.deepEqual(WATCH_SOURCES.filter(row => row.kind === "news").map(row => [row.tier, row.lead]), Array(6).fill([5, true]));
  for (const row of WATCH_SOURCES) {
    assert.match(row.page, /^https:\/\//, row.id);
    if (row.kind !== "fr") assert.match(row.url, /^https:\/\//, row.id);
  }
  assert.equal(source("news-fcc").url, "https://news.google.com/rss/search?q=FCC+Covered+List+when:2d&hl=en-US&gl=US&ceid=US:en");
  assert.deepEqual(NOT_CONNECTED.map(row => row.id), ["mofcom", "fcc-page", "ferc", "nerc"]);
  for (const row of NOT_CONNECTED) assert.match(row.note, /cannot be read automatically\./, row.id);

  // Every topic a source can assign is a known topic with an owner.
  const topics = new Map(WATCH_TOPICS.map(row => [row.id, row.role]));
  for (const row of WATCH_SOURCES) for (const id of [row.topic, row.fallbackTopic].filter(Boolean)) assert.ok(topics.has(id), `${row.id} uses the unknown topic ${id}`);
  assert.deepEqual([...topics].filter(([, role]) => role === "cpi").map(([id]) => id), ["ics", "grid"]);
  assert.deepEqual([...new Set(topics.values())].sort(), ["cpi", "trade"]);
  assert.equal(/\u2014/.test(JSON.stringify([WATCH_SOURCES, NOT_CONNECTED, WATCH_TOPICS.map(row => [row.label, row.help])])), false);
});

test("a feed is read as plain text: markup is removed, encoded characters are decoded, and long dashes are replaced", () => {
  const items = rssItems(`<?xml version="1.0"?><rss><channel><title>Feed</title>
<item><title><![CDATA[Rule on "advanced computing" &amp; remote access]]></title><link>https://www.example.gov/a?x=1&amp;y=2</link><description>&lt;p&gt;First &lt;b&gt;bold&lt;/b&gt; text \u2014 with a dash.&lt;/p&gt;</description><pubDate>Fri, 20 Nov 2026 14:00:00 GMT</pubDate><source url="https://wire.example">Test Wire</source></item>
<item><title>Double &amp;amp; encoded &#8217;quote&#x2019;</title><link>/relative/path</link><description></description><pubDate>not a date</pubDate></item>
<item>
  <title>No link item</title>
</item>
</channel></rss>`);
  assert.deepEqual(items, [
    { title: "Rule on \"advanced computing\" & remote access", link: "https://www.example.gov/a?x=1&y=2", description: "First bold text, with a dash.", date: "2026-11-20", publisher: "Test Wire" },
    { title: "Double & encoded \u2019quote\u2019", link: "/relative/path", description: "", date: "", publisher: "" },
    { title: "No link item", link: "", description: "", date: "", publisher: "" },
  ]);
  assert.deepEqual([rssItems(""), rssItems("<rss></rss>"), rssItems(null)], [[], [], []]);
});

test("an item is kept only when it touches a rule topic or names a repository vendor", () => {
  const vendors = mergeCatalog(syntheticSeed(), []).vendors;
  const shape = (id, title, url, summary = "") => shapeItem(source(id), { title, url, summary, date: "2026-11-20", publisher: "Test Wire" }, vendors);
  const brief = (item) => item && [item.topics, item.vendors, item.tier, item.lead];

  // The advisory feed is kept only for a maker in the repository.
  assert.equal(shape("cisa-ics", "Advisory for Unknown Maker controllers", "https://www.cisa.gov/a", "ICSA-26-000-02"), null);
  assert.deepEqual(brief(shape("cisa-ics", "Advisory for Synthetic Controls drives", "https://www.cisa.gov/a", "ICSA-26-000-02")), [["ics"], ["syn-de"], 1, false]);
  // The FERC search is kept only when the notice is about large loads.
  assert.equal(shape("fr-grid", "Notice of a hydropower license", "https://www.federalregister.gov/d/1"), null);
  assert.deepEqual(brief(shape("fr-grid", "Large load interconnection reforms", "https://www.federalregister.gov/d/2")), [["grid"], [], 1, false]);
  // A source with one subject keeps that subject and adds any other rule the text names.
  assert.deepEqual(brief(shape("fr-bulk", "Request for information on electric equipment and the Entity List", "https://www.federalregister.gov/d/3")), [["eo14420", "entity-list"], [], 1, false]);
  assert.deepEqual(brief(shape("fr-bis", "Revision of license exception text", "https://www.federalregister.gov/d/4")), [["policy"], [], 1, false]);
  // A general source drops an item with no rule topic and no vendor.
  assert.equal(shape("fr-eo", "Establishing a national day of recognition", "https://www.federalregister.gov/d/5"), null);
  assert.deepEqual(brief(shape("fr-eo", "Securing the data center supply chain", "https://www.federalregister.gov/d/6")), [["policy"], [], 1, false]);
  assert.deepEqual(brief(shape("whitehouse", "Statement on Synthetic Power Corp", "https://www.whitehouse.gov/a")), [["policy"], ["syn-us"], 1, false]);
  // A bill named after a person can share one word with a vendor name. A general source drops it unless the vendor carries a list entry.
  const oneWord = [
    { id: "synthword", name: "Synthword", names: ["Synthword, Inc."], fields: { screening: { value: "No match" } } },
    { id: "synthlisted", name: "Synthlisted", names: [], fields: { screening: { value: "Match" } } },
  ];
  const row = (id, title, summary = "") => shapeItem(source(id), { title, url: "https://www.example.gov/item", summary, date: "2026-11-20", publisher: "Test Wire" }, oneWord);
  for (const id of ["govinfo-bills", "govinfo-plaw", "congress-president", "whitehouse", "fr-eo"]) {
    assert.equal(row(id, "H.R. 1 - Charlotte Synthword Organ Transplant Act"), null, id);
    assert.deepEqual(brief(row(id, "H.R. 2 - Stop Synthlisted Act")), [["policy"], ["synthlisted"], 1, false], id);
  }
  // The word is still reported on an item that is kept for a rule topic or that comes from a source with its own subject.
  assert.deepEqual(brief(row("govinfo-bills", "H.R. 3 - Charlotte Synthword Data Center Supply Chain Act")), [["policy"], ["synthword"], 1, false]);
  assert.deepEqual(brief(row("cisa-ics", "Synthword controller advisory", "ICSA-26-000-03")), [["ics"], ["synthword"], 1, false]);
  assert.deepEqual(brief(row("news-bis", "Synthword opens a plant")), [["entity-list"], ["synthword"], 5, true]);
  // The Federal Register numbers the bulk-power order 14421. The program label is 14420. Both reach the same topic.
  assert.deepEqual(shape("fr-eo", "Securing the bulk-power system", "https://www.federalregister.gov/d/7", "Executive Order 14421.").topics, ["eo14420"]);
  assert.deepEqual(shape("fr-eo", "Amendment to Executive Order 14420", "https://www.federalregister.gov/d/8").topics, ["eo14420"]);
  // A press item is a lead at tier 5.
  assert.deepEqual(brief(shape("news-china", "Ministry adds items to its control list", "https://news.google.com/rss/articles/1")), [["china-export"], [], 5, true]);
  assert.equal(shape("fr-bis", "A title with no address", ""), null);

  // One page is one item, whatever tracking parts its address carries. One press headline is one lead.
  assert.equal(shape("cisa-ics", "Advisory for Synthetic Controls drives", "https://www.cisa.gov/a?utm_source=x").id, shape("cisa-ics", "Advisory for Synthetic Controls drives (update)", "https://cisa.gov/a/").id);
  assert.equal(shape("news-china", "Ministry adds items to its control list", "https://news.google.com/rss/articles/1").id, shape("news-bis", "Ministry adds items to its control list!", "https://news.google.com/rss/articles/2").id);
});

// ---------- One run ----------

test("the first check reads every source, looks back ten days, and logs the run with what it found", async () => {
  const { net, run, read } = setup();
  const result = await run({ trigger: "manual", actor: TRADE });
  assert.equal(result.status, "ran");
  const log = result.run;
  assert.deepEqual([log.at, log.trigger, log.by, log.role, log.since, log.added], ["2026-11-22T15:00:00.000Z", "manual", TRADE.email, "trade", "2026-11-12", 3]);
  assert.deepEqual(federalRegisterSince(net), ["2026-11-12"]);
  assert.deepEqual([...new Set(net.state.calls.map(call => call.host))].sort(), ["data.trade.gov", "news.google.com", "www.cisa.gov", "www.congress.gov", "www.ecfr.gov", "www.federalregister.gov", "www.govinfo.gov", "www.whitehouse.gov"]);

  // Twenty sources read, then the four that are not connected.
  assert.equal(log.sources.length, 24);
  assert.deepEqual(log.sources.slice(0, 20).map(row => row.status), Array(20).fill("read"));
  assert.deepEqual(log.sources.slice(20).map(row => [row.id, row.status]), [["mofcom", "not connected"], ["fcc-page", "not connected"], ["ferc", "not connected"], ["nerc", "not connected"]]);
  assert.deepEqual(log.sources.filter(row => row.added).map(row => [row.id, row.found, row.added]), [["fr-bis", 1, 1], ["cisa-ics", 1, 1], ["news-fcc", 1, 1]]);
  // The first reading of a regulation records its amendment date and adds no item.
  assert.deepEqual([sourceRow(log, "ecfr-744").note, sourceRow(log, "ecfr-744").added], ["Latest amendment dated October 1, 2026.", 0]);
  assert.deepEqual([sourceRow(log, "ecfr-126").note, sourceRow(log, "ecfr-126").added], ["Latest amendment dated September 1, 2026.", 0]);

  // Government items come first, newest first. The press lead comes last.
  assert.deepEqual(log.items.map(item => [item.sourceId, item.tier, item.lead, item.date, item.topics, item.vendors, item.foundAt]), [
    ["cisa-ics", 1, false, "2026-11-21", ["ics"], ["siemens"], "2026-11-22T15:00:00.000Z"],
    ["fr-bis", 1, false, "2026-11-20", ["chips"], [], "2026-11-22T15:00:00.000Z"],
    ["news-fcc", 5, true, "2026-11-21", ["fcc"], [], "2026-11-22T15:00:00.000Z"],
  ]);
  assert.deepEqual([log.items[1].title, log.items[1].publisher, log.items[1].url], ["Synthetic test rule on advanced computing items and remote access", "Industry and Security Bureau", "https://www.federalregister.gov/documents/2026/11/19/2026-00001/synthetic-test-rule"]);
  // The publisher is taken off a press headline and kept as its own field.
  assert.deepEqual([log.items[2].title, log.items[2].publisher], ["Synthetic press lead about the FCC Covered List", "Test Wire"]);

  // Every vendor name is screened again. The synthetic list differs from the baseline, so each difference is dated.
  assert.deepEqual([log.screening.status, log.screening.checked, log.screening.note], ["read", 90, "3 list records were checked."]);
  assert.deepEqual(log.screening.changed.map(row => [row.id, row.from, row.to]), [
    ["caterpillar", "Similar name", "No match"], ["solar-turbines", "Similar name", "No match"], ["delta", "Similar name", "No match"],
    ["huawei", "Match", "No match"], ["hikvision", "Match", "No match"], ["dahua", "Match", "No match"], ["inspur", "Match", "No match"],
  ]);
  assert.match(log.screening.changed[0].fromDetail, /^No exact name match\. Similar name on Entity List \(EL\)/);

  const state = (await read("watch-state", "state")).payload;
  assert.deepEqual(state, { lock: null, lastRunAt: "2026-11-22T15:00:00.000Z", lastRunKey: "run-20261122T150000000Z", lastTrigger: "manual", ecfr: { "ecfr-744": "2026-10-01", "ecfr-126": "2026-09-01" }, runs: 1 });
  assert.deepEqual((await read("watch-run", "run-20261122T150000000Z")).payload.added, 3);
  assert.deepEqual(Object.values((await read("watch-seen", "seen")).payload.ids), ["2026-11-22", "2026-11-22", "2026-11-22"]);
  const screening = (await read("watch-screening", "screening")).payload;
  assert.deepEqual([Object.keys(screening.values).length, screening.practice, screening.at], [90, {}, "2026-11-22T15:00:00.000Z"]);
  assert.equal(/\u2014/.test(JSON.stringify(log)), false);
});

test("an item is added once, and a later check looks back to three days before the last one", async () => {
  const { net, run } = setup();
  assert.equal((await run()).run.added, 3);
  const mark = net.state.calls.length;
  const second = (await run({ now: NOW + DAY })).run;
  assert.deepEqual([second.by, second.role, second.trigger], [SYSTEM_ACTOR.email, "system", "scheduled"]);
  assert.deepEqual([second.since, second.added, second.items], ["2026-11-19", 0, []]);
  assert.deepEqual(federalRegisterSince(net, mark), ["2026-11-19"]);
  // The items are still in the feeds. They are counted as found and are not added a second time.
  assert.deepEqual(second.sources.filter(row => row.found && !row.id.startsWith("ecfr")).map(row => [row.id, row.found, row.added]), [["fr-bis", 1, 0], ["cisa-ics", 1, 0], ["news-fcc", 1, 0]]);
  // The screening list is downloaded again, and an unchanged result is not reported a second time.
  assert.equal(net.state.calls.slice(mark).filter(call => call.host === "data.trade.gov").length, 1);
  assert.deepEqual([second.screening.status, second.screening.changed], ["read", []]);

  // After a long gap the look-back stops at 21 days.
  assert.equal((await run({ now: NOW + 60 * DAY })).run.since, dayBefore(21, NOW + 60 * DAY));
});

test("a check that follows another too closely does not run, and a running check holds a lock", async () => {
  const { store, run, read } = setup();
  await run({ trigger: "manual", actor: TRADE });
  assert.deepEqual(await run({ trigger: "manual", actor: TRADE, now: NOW + 30 * 1000 }), { status: "recent", message: "The watch ran less than a minute ago. Wait a moment before checking again." });
  assert.equal((await run({ trigger: "manual", actor: TRADE, now: NOW + 61 * 1000 })).status, "ran");
  // The catch-up check runs only when the last check is at least 20 hours old.
  assert.deepEqual(await run({ trigger: "catch-up", now: NOW + 19 * 60 * 60 * 1000 }), { status: "recent", message: "" });
  assert.equal((await run({ trigger: "catch-up", now: NOW + 21 * 60 * 60 * 1000 })).status, "ran");
  assert.equal((await read("watch-state", "state")).payload.runs, 3);

  // A lock from a check in progress turns the next check away until the lock expires.
  const later = NOW + 5 * DAY;
  const state = await read("watch-state", "state");
  await store.saveGuideDocument({ environment: ENVIRONMENT, projectId: WATCH_PARTITION, kind: "watch-state", key: "state", expectedVersion: state.version, savedBy: SYSTEM_ACTOR.email, payload: { ...state.payload, lock: { until: new Date(later + 60 * 1000).toISOString() } } });
  assert.deepEqual(await run({ now: later }), { status: "busy", message: "A check is already running. Reload in a minute to see its result." });
  assert.equal((await run({ now: later + 2 * 60 * 1000 })).status, "ran");
  assert.equal((await read("watch-state", "state")).payload.lock, null);
});

test("two checks that start together run once", async () => {
  const { run, read } = setup();
  const results = await Promise.all([run(), run()]);
  assert.deepEqual(results.map(result => result.status).sort(), ["busy", "ran"]);
  assert.equal((await read("watch-state", "state")).payload.runs, 1);
});

test("an amended regulation becomes an item only when its amendment date changes", async () => {
  const { net, run, read } = setup();
  await run();
  net.state.ecfr["title-15"] = "2026-11-20";
  const amended = (await run({ now: NOW + DAY })).run;
  assert.equal(amended.added, 1);
  const [item] = amended.items;
  assert.deepEqual([item.sourceId, item.tier, item.lead, item.date, item.topics, item.url, item.publisher], ["ecfr-744", 1, false, "2026-11-20", ["entity-list"], "https://www.ecfr.gov/current/title-15/part-744", "Electronic Code of Federal Regulations"]);
  assert.equal(item.title, "15 CFR Part 744 was amended on November 20, 2026");
  assert.equal(item.summary, "Part 744 holds the Entity List and the end-user controls. This run re-screened every vendor name against the screening list. Read the amendment and record whether it touches a program vendor.");
  assert.deepEqual([sourceRow(amended, "ecfr-744").added, sourceRow(amended, "ecfr-126").added], [1, 0]);
  assert.deepEqual((await read("watch-state", "state")).payload.ecfr, { "ecfr-744": "2026-11-20", "ecfr-126": "2026-09-01" });
  // The same amendment date on the next check adds nothing.
  assert.equal((await run({ now: NOW + 2 * DAY })).run.added, 0);
});

test("a source that is down is logged as unavailable, the other sources are still read, and the next check recovers", async () => {
  const { net, run, read } = setup();
  for (const host of ["www.cisa.gov", "www.ecfr.gov", "data.trade.gov"]) net.state.down.add(host);
  const partial = (await run()).run;
  assert.deepEqual(partial.sources.filter(row => row.status === "unavailable").map(row => [row.id, row.note]), [
    ["ecfr-744", "The source returned status 503."], ["ecfr-126", "The source returned status 503."], ["cisa-ics", "The source returned status 503."],
  ]);
  assert.deepEqual(partial.items.map(item => item.sourceId), ["fr-bis", "news-fcc"]);
  assert.deepEqual(partial.screening, { status: "unavailable", checked: 0, changed: [], note: "The source returned status 503." });
  // Each feed that refused was asked twice before it was logged as unavailable.
  assert.deepEqual(["www.cisa.gov", "www.ecfr.gov"].map(host => net.state.calls.filter(call => call.host === host).length), [2, 4]);
  // No screening record is written from a failed download, and no amendment date is recorded.
  assert.equal(await read("watch-screening", "screening"), null);
  assert.deepEqual((await read("watch-state", "state")).payload.ecfr, {});

  net.state.down.clear();
  const recovered = (await run({ now: NOW + DAY })).run;
  assert.deepEqual(recovered.items.map(item => item.sourceId), ["cisa-ics"]);
  assert.equal(recovered.sources.filter(row => row.status === "unavailable").length, 0);
  assert.deepEqual([recovered.screening.status, recovered.screening.changed.length], ["read", 7]);
});

test("a source that answers that it is busy is asked once more, and any other answer is final", async () => {
  const { net, run } = setup();
  const asked = new Map();
  const bis = "Entity List Bureau of Industry and Security when:2d";
  const fcc = "FCC Covered List when:2d";
  const china = "MOFCOM export control announcement when:2d";
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input));
    const query = url.hostname === "news.google.com" ? url.searchParams.get("q") : "";
    const count = (asked.get(query) || 0) + 1;
    if (query) asked.set(query, count);
    // Two feeds are busy on the first try only. One feed answers that the page does not exist.
    if (query === bis && count === 1) return new Response("busy", { status: 429 });
    if (query === fcc && count === 1) return new Response("busy", { status: 502 });
    if (query === china) return new Response("missing", { status: 404 });
    return net.fetchImpl(input, init);
  };
  const started = Date.now();
  const result = (await run({ fetchImpl, retryMs: 40 })).run;
  // Both busy feeds were read on the second try. The second try waited for the pause.
  assert.deepEqual([bis, fcc].map(query => asked.get(query)), [2, 2]);
  assert.deepEqual(["news-bis", "news-fcc"].map(id => sourceRow(result, id).status), ["read", "read"]);
  assert.ok(result.items.some(item => item.sourceId === "news-fcc"));
  assert.ok(Date.now() - started >= 40);
  // A missing page is not asked again. It is the only source logged as unavailable.
  assert.equal(asked.get(china), 1);
  assert.deepEqual(result.sources.filter(row => row.status === "unavailable").map(row => [row.id, row.note]), [["news-china", "The source returned status 404."]]);
  // The three feeds that answered were asked once.
  assert.deepEqual([...asked.values()].sort(), [1, 1, 1, 1, 2, 2]);
});

test("a vendor that joins the screening list is reported with its earlier result", async () => {
  const { net, run } = setup();
  await run();
  net.state.screening.push({ name: "Caterpillar Inc.", alt_names: [], source: "Entity List (EL) - Bureau of Industry and Security", source_list_url: "https://www.bis.gov/entity-list", type: "Entity" });
  const next = (await run({ now: NOW + DAY })).run;
  assert.equal(next.screening.note, "4 list records were checked.");
  // The parent's name is screened with each subsidiary, so both entries move.
  assert.deepEqual(next.screening.changed.map(row => [row.id, row.from, row.to]), [["caterpillar", "No match", "Match"], ["solar-turbines", "No match", "Match"]]);
  assert.match(next.screening.changed[0].fromDetail, /^No name match\. A clear result is not an approval\. Names checked: Caterpillar;/);
  assert.equal((await run({ now: NOW + 2 * DAY })).run.screening.changed.length, 0);
});

test("a feed item older than the look-back window is left out", async () => {
  const { net, run } = setup();
  net.state.federalRegister[0].row.publication_date = dayBefore(11);
  net.state.feeds["www.cisa.gov"][0].date = NOW - 11 * DAY;
  const result = (await run()).run;
  assert.deepEqual(result.items.map(item => item.sourceId), ["news-fcc"]);
  assert.deepEqual([sourceRow(result, "fr-bis").found, sourceRow(result, "cisa-ics").found], [0, 0]);
});

// ---------- The log as it is shown ----------

test("the run log lists the newest run first, shows each item once, and leaves the item lists out of the run rows", () => {
  assert.deepEqual(flattenRuns([]), { items: [], runs: [] });
  const press = { id: "a", tier: 5, date: "2026-11-20", foundAt: "T1" };
  const older = { id: "b", tier: 1, date: "2026-11-19", foundAt: "T1" };
  const newer = { id: "c", tier: 1, date: "2026-11-21", foundAt: "T2" };
  const docs = [
    { key: "run-1", payload: { at: "T1", added: 2, items: [press, older] } },
    { key: "run-2", payload: { at: "T2", added: 1, items: [newer, { ...press, foundAt: "T2" }] } },
  ];
  const all = flattenRuns(docs);
  assert.deepEqual(all.runs, [{ key: "run-2", at: "T2", added: 1 }, { key: "run-1", at: "T1", added: 2 }]);
  assert.deepEqual(all.items.map(item => [item.id, item.foundAt]), [["c", "T2"], ["a", "T2"], ["b", "T1"]]);
  assert.deepEqual(flattenRuns(docs, 2).items.map(item => item.id), ["c", "a"]);
});
