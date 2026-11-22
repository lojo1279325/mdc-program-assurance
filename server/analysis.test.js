import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_URL, agentRequest, agentSettings, analyzeEntry, clearScreeningCache, dayOf, listChecks, longDate, plain,
  readAgentResponse, screeningAuto, screeningRecord, tierForUrl, urlKey,
} from "./analysis.js";
import { inverterApprovalsFor, match1260h, matchFccNamed } from "./lists.js";
import { SYNTHETIC_LEI, SYNTHETIC_PARENT_LEI, agentReply, syntheticNetwork, syntheticSeed } from "./guide-fixtures.js";
import { mergeCatalog } from "../public/catalog-model.js";

// Every company, page, and identifier in this file is made up. No test reaches the network.

const NOW = Date.parse("2026-11-22T15:00:00.000Z");
const KEY = { PERPLEXITY_API_KEY: "synthetic-test-key" };
const document = (kind, key, payload, version = 1) => ({ kind: `catalog-${kind}`, key, payload, version });
const typed = (value) => [value, "Entered by NSTT", "", "R", "Typed when the entry was added."];
const idOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// A vendor as it stands right after NSTT adds it: a typed legal name and nothing else.
function addedVendor(name, domain, saved = {}) {
  const seed = syntheticSeed();
  const dropped = new Set(seed.vendors.filter(row => row.name === name).map(row => row.id));
  seed.vendors = seed.vendors.filter(row => !dropped.has(row.id));
  seed.parts = seed.parts.filter(row => !dropped.has(row.vendor));
  const custom = { name, names: [name], domain, asOf: "2026-11-22", fields: { legalName: typed(name) } };
  return mergeCatalog(seed, [document("vendor", idOf(name), { custom, ...saved }, saved.auto ? 1 : 0)]).vendors.find(row => row.id === idOf(name));
}
function network() {
  clearScreeningCache();
  return syntheticNetwork();
}
const steps = (result) => result.analysis.steps.map(row => [row.id, row.status]);
const stepNote = (result, id) => result.analysis.steps.find(row => row.id === id).note;
const fieldRow = (result, id) => result.analysis.fields.find(row => row.id === id);
const agentCalls = (net) => net.state.calls.filter(call => call.host === "api.perplexity.ai");
const noLongDash = (value) => assert.equal(/\u2014/.test(JSON.stringify(value)), false, "The result carries a long dash.");

// ---------- Settings and the request ----------

test("the analysis is connected only when a key is set, and the request follows the published Agent API shape", () => {
  assert.deepEqual(agentSettings({}), { connected: false, key: "", model: "", effort: "low", label: "effort low" });
  assert.deepEqual(agentSettings({ PERPLEXITY_API_KEY: "k", PERPLEXITY_AGENT_EFFORT: "medium" }), { connected: true, key: "k", model: "", effort: "medium", label: "effort medium" });
  assert.deepEqual(agentSettings({ PERPLEXITY_API_KEY: "k", PERPLEXITY_AGENT_MODEL: "vendor/model-x" }), { connected: true, key: "k", model: "vendor/model-x", effort: "", label: "vendor/model-x" });
  assert.equal(AGENT_URL, "https://api.perplexity.ai/v1/agent");

  const byEffort = agentRequest(agentSettings({ PERPLEXITY_API_KEY: "k" }), "task");
  assert.deepEqual(Object.keys(byEffort), ["input", "instructions", "max_output_tokens", "tools", "response_format", "effort"]);
  assert.deepEqual([byEffort.input, byEffort.effort], ["task", "low"]);
  assert.deepEqual(byEffort.tools.map(tool => tool.type), ["web_search", "fetch_url"]);
  assert.deepEqual([byEffort.response_format.type, byEffort.response_format.json_schema.strict], ["json_schema", true]);
  // The answer must name the page behind every value.
  assert.deepEqual(byEffort.response_format.json_schema.schema.properties.fields.items.required, ["id", "value", "sourceUrl", "sourceTitle", "quote"]);
  assert.match(byEffort.instructions, /Report only facts that a public page states\./);

  const byModel = agentRequest(agentSettings({ PERPLEXITY_API_KEY: "k", PERPLEXITY_AGENT_MODEL: "vendor/model-x" }), "task");
  assert.deepEqual([byModel.model, byModel.max_steps, "effort" in byModel], ["vendor/model-x", 8, false]);
  // The key travels in the header only.
  assert.equal(JSON.stringify([byEffort, byModel]).includes("\"k\""), false);
});

test("a source tier follows the address: government first, then registries, standards bodies, the maker, and everything else", () => {
  const tier = (url) => tierForUrl(url, "maker.example");
  assert.deepEqual(["https://www.bis.gov/x", "https://www.army.mil/x"].map(tier), [1, 1]);
  assert.deepEqual(["https://www.gov.uk/x", "https://www.meti.go.jp/x", "https://search.gleif.org/#/record/X", "https://eur-lex.europa.eu/x"].map(tier), [2, 2, 2, 2]);
  assert.equal(tier("https://www.ul.com/x"), 3);
  assert.deepEqual(["https://www.maker.example/p", "https://docs.maker.example/p"].map(tier), [4, 4]);
  // A look-alike address earns no government tier.
  assert.deepEqual(["https://news.example.org/x", "https://fakegov.com/x", "https://example.gov.evil.com/x", "not an address", "javascript:alert(1)"].map(tier), [5, 5, 5, 5, 5]);
});

test("dates use New York time, addresses compare without tracking parts, and outside text loses its long dashes", () => {
  assert.deepEqual([dayOf(Date.parse("2026-11-22T03:00:00Z")), dayOf(Date.parse("2026-11-22T06:00:00Z"))], ["2026-11-21", "2026-11-22"]);
  assert.deepEqual([longDate("2026-11-22"), longDate("2026-11-22T03:00:00Z"), longDate("not a date")], ["November 22, 2026", "November 21, 2026", "not a date"]);
  assert.equal(urlKey("https://www.Example.com/a/b/?utm_source=x&b=2&a=1#frag"), urlKey("https://example.com/a/b?a=1&b=2"));
  assert.deepEqual([urlKey("ftp://files.example/x"), urlKey("")], ["", ""]);
  assert.equal(plain("A value \u2014 with a dash and a range 5\u201310"), "A value, with a dash and a range 5, 10");
});

test("the agent answer is read from the message, and every retrieved or cited page is kept for the citation check", () => {
  const read = readAgentResponse(agentReply({
    fields: [{ id: "cik", value: "1" }], summary: "Done",
    pages: [{ url: "https://www.sec.gov/a", title: "Searched", snippet: "found" }, { url: "https://www.sec.gov/b", title: "Fetched", snippet: "read", fetched: true }],
  }));
  assert.deepEqual([read.status, read.model, read.data.summary, read.pages.size], ["completed", "synthetic-model", "Done", 2]);
  assert.equal(read.pages.get(urlKey("https://sec.gov/b/")).title, "Fetched");
  // A fenced answer is read. Text that is not JSON gives no data.
  const fenced = readAgentResponse({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "```json\n{\"fields\":[],\"criteria\":[],\"summary\":\"Nothing\"}\n```", annotations: [{ url: "https://www.sec.gov/c", title: "Cited" }] }] }] });
  assert.deepEqual([fenced.data.summary, fenced.pages.size], ["Nothing", 1]);
  assert.equal(readAgentResponse({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] }).data, null);
  assert.deepEqual([readAgentResponse(null).data, readAgentResponse(null).pages.size], [null, 0]);
});

// ---------- Dated lists and the screening record ----------

test("the dated lists name a producer or an entity only on a name match, and a weak match says that it needs confirmation", () => {
  const clear = listChecks(["Synthetic Controls GmbH"]);
  assert.deepEqual([clear.fccCovered.value, clear.fccCovered.tier, clear.fccCovered.source.url], ["Not named", 1, "https://www.fcc.gov/supplychain/coveredlist"]);
  assert.deepEqual([clear.section1260h.value, clear.section1260h.tier, clear.section1260h.source.url], ["Not listed", 1, "https://www.federalregister.gov/d/2026-11571"]);
  assert.match(clear.fccCovered.asOf, /^\d{4}-\d{2}-\d{2}$/);

  const named = listChecks(["Huawei Technologies Co., Ltd."]);
  assert.deepEqual([named.fccCovered.value, named.section1260h.value], ["Named producer", "Listed"]);
  assert.match(named.section1260h.detail, /^The notice names \u201cHuawei Investment & Holding Co\., Ltd\./);
  // A related name is reported for confirmation and is not treated as the listed producer.
  assert.equal(matchFccNamed(["Huawei Digital Power Technologies Co., Ltd."]).affiliate, true);
  assert.equal(matchFccNamed(["Huawei Technologies Company"]).affiliate, false);
  assert.match(listChecks(["Huawei Digital Power Technologies Co., Ltd."]).fccCovered.detail, /This match needs confirmation\. Trade confirms whether the entry covers this entity\.$/);
  assert.equal(match1260h(["Synthetic Power Corp"]), null);
  assert.deepEqual(inverterApprovalsFor(["Synthetic Power Corp"]), []);
  noLongDash([clear, named]);
});

test("a screening result is dated when it changes, and an unchanged result keeps the date of its last change", () => {
  const fresh = { value: "No match", detail: "detail", signature: "s1" };
  assert.deepEqual(screeningRecord(null, fresh, "No match", "T1"), { value: "No match", detail: "detail", signature: "s1", checkedAt: "T1" });
  // The first check compares with the baseline value. A missing baseline is not a change.
  assert.deepEqual(screeningRecord(null, { ...fresh, value: "Match" }, "No match", "T1"), { value: "Match", detail: "detail", signature: "s1", checkedAt: "T1", changedAt: "T1", changedFrom: "No match" });
  assert.equal("changedAt" in screeningRecord(null, fresh, "n.a.", "T1"), false);
  // Later checks compare the list hits, so a new hit under the same value is still a change.
  assert.equal("changedAt" in screeningRecord({ value: "No match", signature: "s1", checkedAt: "T0" }, fresh, "No match", "T1"), false);
  assert.deepEqual(screeningRecord({ value: "No match", signature: "s0", checkedAt: "T0" }, fresh, "No match", "T1").changedAt, "T1");
  const kept = screeningRecord({ value: "No match", signature: "s1", checkedAt: "T0", changedAt: "T-1", changedFrom: "Match" }, fresh, "No match", "T1");
  assert.deepEqual([kept.checkedAt, kept.changedAt, kept.changedFrom], ["T1", "T-1", "Match"]);

  const auto = screeningAuto({ value: "Match", detail: "detail", signature: "s", checkedAt: "2026-11-22T15:00:00.000Z", changedAt: "2026-11-22T15:00:00.000Z", changedFrom: "No match" });
  assert.deepEqual([auto.value, auto.tier, auto.asOf, auto.source.url, auto.changedFrom], ["Match", 1, "2026-11-22", "https://www.trade.gov/consolidated-screening-list", "No match"]);
});

// ---------- First checks on a new vendor ----------

test("the first checks on a new vendor fill the registry facts, the dated lists, and the screening result, each with its source", async () => {
  const net = network();
  const result = await analyzeEntry({ kind: "vendor", entry: addedVendor("Synthetic Controls GmbH", "synthetic-controls.example"), useAi: false, fetchImpl: net.fetchImpl, env: {}, now: NOW });
  assert.deepEqual([result.analysis.status, result.analysis.day, result.analysis.at, result.analysis.message], ["complete", "2026-11-22", "2026-11-22T15:00:00.000Z", ""]);
  assert.deepEqual(steps(result), [["registry", "read"], ["sec", "read"], ["lists", "read"], ["screening", "read"], ["ai", "not run"]]);
  assert.equal(stepNote(result, "registry"), `The registry record ${SYNTHETIC_LEI} matches the name. 6 fields were filled from it.`);
  assert.equal(stepNote(result, "sec"), "The list of registrants with a ticker does not name exactly one company with this name.");
  assert.equal(stepNote(result, "screening"), "3 list records were checked against 2 names.");
  assert.equal(stepNote(result, "ai"), "The AI analysis runs after the entry is saved.");

  assert.deepEqual(result.analysis.fields.map(row => [row.id, row.value, row.tier, row.origin, row.applied]), [
    ["legalName", "Synthetic Controls GmbH", 2, "registry", true],
    ["hqCountry", "DE", 2, "registry", true],
    ["jurisdiction", "Germany", 2, "registry", true],
    ["lei", SYNTHETIC_LEI, 2, "registry", true],
    ["ultimateParent", "Synthetic Holding SE", 2, "registry", true],
    ["parentCountry", "DE", 2, "registry", true],
    ["fccCovered", "Not named", 1, "list", true],
    ["section1260h", "Not listed", 1, "list", true],
    ["screening", "No match", 1, "list", true],
  ]);
  // The typed legal name now rests on the registry record.
  assert.deepEqual([fieldRow(result, "legalName").recited, fieldRow(result, "legalName").note], [true, "The source states the same value, so it is now the cited source."]);
  assert.deepEqual(result.auto.hqCountry, {
    value: "DE", source: { label: "GLEIF legal entity record", url: `https://search.gleif.org/#/record/${SYNTHETIC_LEI}` }, tier: 2, asOf: "2026-11-22",
    detail: "The registry lists the headquarters address in Munich, Germany.",
  });
  assert.deepEqual([result.auto.ultimateParent.source.url, result.auto.lei.detail], [`https://search.gleif.org/#/record/${SYNTHETIC_PARENT_LEI}`, "Registry name: Synthetic Controls GmbH. Registration status: issued. Last updated June 1, 2026."]);
  // The parent the registry reports is screened with the vendor's own name.
  assert.equal(result.screening.detail, "No name match. A clear result is not an approval. Names checked: Synthetic Controls GmbH; Synthetic Holding SE. List data retrieved November 22, 2026.");
  assert.deepEqual([result.screening.value, result.screening.checkedAt, "changedAt" in result.screening], ["No match", "2026-11-22T15:00:00.000Z", false]);
  assert.equal(result.analysis.summary, "9 fields were filled or refreshed from cited public sources. Fields with no trusted public source stay n.a. until the owning role enters them.");
  assert.deepEqual(net.state.calls.map(call => call.host), ["api.gleif.org", "api.gleif.org", "www.sec.gov", "data.trade.gov"]);
  noLongDash(result);
});

test("a second run on the same day carries the first run's rows, and a run on a later day starts a new list", async () => {
  const net = network();
  const first = await analyzeEntry({ kind: "vendor", entry: addedVendor("Synthetic Controls GmbH", "synthetic-controls.example"), useAi: false, fetchImpl: net.fetchImpl, env: {}, now: NOW });
  const saved = addedVendor("Synthetic Controls GmbH", "synthetic-controls.example", { auto: first.auto, analysis: first.analysis });
  // The AI step follows the first checks as a second request. Here it is not connected, so only the carried rows show.
  const rerun = (extra) => analyzeEntry({ kind: "vendor", entry: saved, previousScreening: first.screening, useAi: true, fetchImpl: net.fetchImpl, env: {}, now: NOW + 60000, ...extra });

  const sameDay = await rerun({ earlier: first.analysis });
  assert.equal(sameDay.analysis.status, "not connected");
  assert.equal(sameDay.analysis.fields.length, 9);
  assert.equal(sameDay.analysis.fields.every(row => row.applied && row.carried), true);
  assert.equal(stepNote(sameDay, "registry"), `The registry record ${SYNTHETIC_LEI} matches the name. 6 fields were filled from it.`);
  // Nothing new is written, so the stored values stay as the first run left them.
  assert.deepEqual(Object.keys(sameDay.auto), ["screening"]);

  const nextDay = await rerun({ earlier: { ...first.analysis, day: "2026-11-21" } });
  assert.deepEqual(steps(nextDay).slice(0, 2), [["registry", "not needed"], ["sec", "read"]]);
  assert.equal(stepNote(nextDay, "registry"), "The registry fields already hold a value from an earlier check.");
  assert.deepEqual(nextDay.analysis.fields.map(row => [row.id, row.applied, row.note]), [
    ["fccCovered", false, "The list check agrees with the recorded value."],
    ["section1260h", false, "The list check agrees with the recorded value."],
    ["screening", false, "The result is unchanged. The check date is refreshed."],
  ]);
  assert.equal(nextDay.analysis.fields.some(row => row.carried), false);
});

test("a source that is down is reported as unavailable, and the checks that can run still run", async () => {
  const net = network();
  for (const host of ["api.gleif.org", "www.sec.gov", "data.trade.gov"]) net.state.down.add(host);
  const result = await analyzeEntry({ kind: "vendor", entry: addedVendor("Synthetic Controls GmbH", "synthetic-controls.example"), useAi: false, fetchImpl: net.fetchImpl, env: {}, now: NOW });
  assert.deepEqual(steps(result), [["registry", "unavailable"], ["sec", "unavailable"], ["lists", "read"], ["screening", "unavailable"], ["ai", "not run"]]);
  assert.deepEqual(["registry", "sec", "screening"].map(id => stepNote(result, id)), Array(3).fill("The source returned status 503."));
  // The dated lists are held with the code, so they are still checked. No screening result is recorded.
  assert.deepEqual(Object.keys(result.auto), ["fccCovered", "section1260h"]);
  assert.equal(result.screening, null);
});

test("a screening match on a new vendor is recorded as a finding, and its later removal is dated as a change", async () => {
  const net = network();
  const name = "Synthetic Listed Works Co., Ltd.";
  const first = await analyzeEntry({ kind: "vendor", entry: addedVendor(name, "listed.example"), useAi: false, fetchImpl: net.fetchImpl, env: {}, now: NOW });
  assert.equal(first.screening.value, "Match");
  assert.match(first.screening.detail, /^Name match on Entity List \(EL\) \(Synthetic Listed Works Co\., Ltd\.\)\. A list match is a finding to resolve\. It is not a legal conclusion\./);
  assert.equal("changedAt" in first.auto.screening, false);

  // The record leaves the list. The next day's check reads a fresh download.
  net.state.screening = net.state.screening.slice(1);
  clearScreeningCache();
  const later = await analyzeEntry({
    kind: "vendor", entry: addedVendor(name, "listed.example", { auto: first.auto, analysis: first.analysis }), previousScreening: first.screening, earlier: first.analysis,
    useAi: false, fetchImpl: net.fetchImpl, env: {}, now: NOW + 24 * 60 * 60 * 1000,
  });
  assert.deepEqual([later.screening.value, later.screening.changedFrom, later.screening.changedAt], ["No match", "Match", "2026-11-23T15:00:00.000Z"]);
  assert.deepEqual([fieldRow(later, "screening").applied, fieldRow(later, "screening").note], [true, "The result changed from Match."]);
  assert.equal(later.auto.screening.asOf, "2026-11-23");
});

// ---------- The AI step ----------

test("a missing key and a refused key are both reported in plain words, and the other checks still stand", async () => {
  const net = network();
  const entry = addedVendor("Synthetic Controls GmbH", "synthetic-controls.example");
  const unconnected = await analyzeEntry({ kind: "vendor", entry, useAi: true, fetchImpl: net.fetchImpl, env: {}, now: NOW });
  assert.equal(unconnected.analysis.status, "not connected");
  assert.equal(unconnected.analysis.message, "The AI analysis is not connected. An administrator adds a Perplexity API key to the server settings to turn it on. The list and registry checks ran.");
  assert.deepEqual(steps(unconnected).at(-1), ["ai", "not connected"]);
  assert.equal(stepNote(unconnected, "ai"), "No Perplexity API key is configured on the server.");
  assert.equal(agentCalls(net).length, 0);
  assert.equal(unconnected.analysis.fields.filter(row => row.applied).length, 9);

  const refused = await analyzeEntry({ kind: "vendor", entry, useAi: true, fetchImpl: net.fetchImpl, env: KEY, now: NOW });
  assert.equal(refused.analysis.status, "failed");
  assert.equal(refused.analysis.message, "The AI analysis did not complete. The analysis service returned status 401: Synthetic refusal: the key is not valid. The list and registry checks ran. Run the analysis again later.");
  assert.deepEqual(steps(refused).at(-1), ["ai", "unavailable"]);
  const call = agentCalls(net)[0];
  assert.deepEqual([call.url, call.method, call.headers.authorization], [AGENT_URL, "POST", "Bearer synthetic-test-key"]);
  // The key is sent in the header and appears nowhere in the stored result.
  assert.equal(call.body.includes("synthetic-test-key"), false);
  assert.equal(JSON.stringify(refused).includes("synthetic-test-key"), false);
});

test("an answer that ends early, cannot be read, or takes too long is reported as a failed run", async () => {
  const net = network();
  const catalog = mergeCatalog(syntheticSeed(), []);
  const entry = catalog.parts.find(row => row.id === "syn-open-gen");
  const vendor = catalog.vendors.find(row => row.id === "syn-open");
  const run = (fetchImpl = net.fetchImpl) => analyzeEntry({ kind: "part", entry, vendor, useAi: true, fetchImpl, env: KEY, now: NOW });
  const failed = (detail) => `The AI analysis did not complete. ${detail} The program rules were applied. Run the analysis again later.`;

  net.state.agent = () => agentReply({ status: "incomplete" });
  let result = await run();
  assert.deepEqual([result.analysis.status, result.analysis.message], ["failed", failed("The analysis service ended with status incomplete.")]);
  net.state.agent = () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] });
  result = await run();
  assert.deepEqual([result.analysis.status, result.analysis.message], ["failed", failed("The analysis service returned an answer that could not be read.")]);
  const slow = async (input, init) => {
    if (String(input).includes("api.perplexity.ai")) throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    return net.fetchImpl(input, init);
  };
  result = await run(slow);
  assert.deepEqual([result.analysis.status, result.analysis.message], ["failed", failed("The analysis service took too long to answer.")]);
  assert.deepEqual(result.auto, {});
});

test("the AI step keeps a value only when it cites a retrieved page in the form the field needs", async () => {
  const net = network();
  const edgar = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001999999";
  let task = "";
  net.state.agent = (body) => {
    task = body.input;
    return agentReply({
      summary: "Public filings show a US registrant \u2014 no parent is stated",
      pages: [
        { url: edgar, title: "Synthetic Power Corp filing index", snippet: "Synthetic Power Corp. State of incorporation: DE. Business address: 1 Test Way, Houston, Texas, United States." },
        { url: "https://www.synthetic-power.example/about?utm_source=x", title: "About Synthetic Power", snippet: "Synthetic Power Corp is headquartered in Houston, Texas.", fetched: true },
        { url: "https://news.example.org/story", title: "Trade press story", snippet: "The company is owned by Synthetic Capital Partners." },
      ],
      fields: [
        { id: "hqCountry", value: "us", sourceUrl: edgar, sourceTitle: "", quote: "Business address: 1 Test Way, Houston, Texas, United States." },
        { id: "jurisdiction", value: "United States, Delaware", sourceUrl: "https://synthetic-power.example/about/", sourceTitle: "", quote: "incorporated in Delaware" },
        { id: "ultimateParent", value: "Synthetic Capital Partners", sourceUrl: "https://unknown.example/page", sourceTitle: "", quote: "owned by" },
        { id: "parentCountry", value: "United States of America", sourceUrl: "https://news.example.org/story", sourceTitle: "", quote: "" },
        { id: "lei", value: "SYNTHETIC0000000ZZ99", sourceUrl: "https://news.example.org/story", sourceTitle: "", quote: "" },
        { id: "screening", value: "No match", sourceUrl: "https://news.example.org/story", sourceTitle: "", quote: "" },
        { id: "legalName", value: "Synthetic Power Corporation", sourceUrl: "https://news.example.org/story", sourceTitle: "", quote: "Synthetic Power Corporation" },
      ],
    });
  };
  const result = await analyzeEntry({ kind: "vendor", entry: addedVendor("Synthetic Power Corp", "synthetic-power.example"), useAi: true, fetchImpl: net.fetchImpl, env: KEY, now: NOW });
  assert.deepEqual([result.analysis.status, result.analysis.model], ["complete", "synthetic-model"]);
  assert.equal(stepNote(result, "registry"), "The registry holds no record with this exact name.");
  assert.equal(stepNote(result, "sec"), "The list names one registrant with this name, number 0001999999.");
  assert.equal(stepNote(result, "ai"), "2 values were filled with a cited source. 3 values were dropped for lack of a usable source. 3 pages were retrieved.");

  // The task asks for the open fields only. The legal name, the registrant number already found, and the screening result are never asked for.
  assert.deepEqual(task.split("\n").filter(line => line.startsWith("- ")).map(line => line.slice(2).split(":")[0]), ["hqCountry", "jurisdiction", "lei", "ultimateParent", "parentCountry"]);
  assert.match(task, /^Company under review: Synthetic Power Corp\.\nIts website is synthetic-power\.example\.\n/);

  const ai = result.analysis.fields.filter(row => row.origin === "ai");
  assert.deepEqual(ai.map(row => [row.id, row.value, row.tier, row.applied, row.note]), [
    ["lei", "SYNTHETIC0000000ZZ99", 5, false, "The registry holds no record with this identifier and this name, so the value was dropped."],
    ["hqCountry", "US", 1, true, ""],
    ["jurisdiction", "United States, Delaware", 4, true, ""],
    ["ultimateParent", "Synthetic Capital Partners", 5, false, "The value did not cite a page that the analysis retrieved, so it was dropped."],
    ["parentCountry", "United States of America", 5, false, "The value was not in the form this field needs, so it was dropped."],
  ]);
  // A government page outranks the maker's own page, and each kept value carries its page and quote.
  assert.deepEqual(result.auto.hqCountry, {
    value: "US", source: { label: "Synthetic Power Corp filing index", url: edgar }, tier: 1, asOf: "2026-11-22",
    detail: "Found by the AI analysis on November 22, 2026. The cited page is quoted as: \u201cBusiness address: 1 Test Way, Houston, Texas, United States.\u201d",
  });
  // A quote that is not in the retrieved text is kept with a caution for the owning role.
  assert.deepEqual([result.auto.jurisdiction.tier, result.auto.jurisdiction.source.url], [4, "https://www.synthetic-power.example/about?utm_source=x"]);
  assert.equal(result.auto.jurisdiction.detail, "Found by the AI analysis on November 22, 2026. The cited page is quoted as: \u201cincorporated in Delaware\u201d. The quote was not found in the text the analysis retrieved. Open the source and confirm it.");
  assert.deepEqual(Object.keys(result.auto).sort(), ["cik", "fccCovered", "hqCountry", "jurisdiction", "screening", "section1260h"]);
  assert.equal(result.auto.cik.source.label, "SEC EDGAR company record");
  assert.equal(result.analysis.summary, "Public filings show a US registrant, no parent is stated.");
  noLongDash(result);
});

test("an identifier from the AI step is accepted only after the registry returns a record with the same name", async () => {
  const net = network();
  net.state.gleif.names = {};
  const record = `https://search.gleif.org/#/record/${SYNTHETIC_LEI}`;
  net.state.agent = () => agentReply({
    pages: [{ url: record, title: "GLEIF record", snippet: "Synthetic Controls GmbH" }],
    fields: [{ id: "lei", value: SYNTHETIC_LEI.toLowerCase(), sourceUrl: record, sourceTitle: "GLEIF", quote: "Synthetic Controls GmbH" }],
  });
  const seed = syntheticSeed();
  const custom = { name: "Synthetic Controls", names: ["Synthetic Controls", "Synthetic Controls GmbH"], domain: "synthetic-controls.example", asOf: "2026-11-22", fields: { legalName: typed("Synthetic Controls") } };
  const entry = mergeCatalog(seed, [document("vendor", "synthetic-controls", { custom }, 0)]).vendors.find(row => row.id === "synthetic-controls");
  const result = await analyzeEntry({ kind: "vendor", entry, useAi: true, fetchImpl: net.fetchImpl, env: KEY, now: NOW });
  assert.equal(stepNote(result, "registry"), "The registry holds no record with this exact name.");
  assert.equal(stepNote(result, "ai"), "5 values were filled with a cited source. 0 values were dropped for lack of a usable source. 1 page was retrieved.");
  // The facts come from the registry record, not from the page the AI cited.
  assert.deepEqual(result.analysis.fields.filter(row => row.origin === "registry").map(row => [row.id, row.value, row.tier]), [
    ["hqCountry", "DE", 2], ["jurisdiction", "Germany", 2], ["lei", SYNTHETIC_LEI, 2], ["ultimateParent", "Synthetic Holding SE", 2], ["parentCountry", "DE", 2],
  ]);
  assert.equal(result.auto.lei.source.label, "GLEIF legal entity record");
});

test("a part is read against the design criteria, and a reading without a retrieved page is shown as not published", async () => {
  const net = network();
  const catalog = mergeCatalog(syntheticSeed(), []);
  const entry = catalog.parts.find(row => row.id === "syn-open-gen");
  const vendor = catalog.vendors.find(row => row.id === "syn-open");
  const sheet = { url: "https://www.syn-open.example/products/gen/datasheet.pdf", title: "", snippet: "Rated output 2,000 kW continuous at 60 Hz. Designed to UL 2200. Meets ISO 8528-5 class G3.", fetched: true };
  const listing = { url: "https://www.ul.com/listing/123", title: "UL listing record", snippet: "Listed to UL 2200." };
  let task = "";
  net.state.agent = (body) => {
    task = body.input;
    return agentReply({
      pages: [sheet, listing], model: "vendor/model-x", summary: "The maker datasheet states the rating and frequency. No page states the assembly site.",
      fields: [
        { id: "rating", value: "2,000 kW continuous", sourceUrl: sheet.url, sourceTitle: "Datasheet", quote: "Rated output 2,000 kW continuous at 60 Hz." },
        { id: "frequency", value: "sixty hertz", sourceUrl: sheet.url, sourceTitle: "Datasheet", quote: "60 Hz" },
        { id: "standards", value: "UL 2200; ISO 8528-5 G3", sourceUrl: listing.url, sourceTitle: "UL", quote: "This quote is not on the page." },
        { id: "assemblyCountry", value: "DE", sourceUrl: "https://not-retrieved.example/x", sourceTitle: "", quote: "" },
        { id: "model", value: "X", sourceUrl: sheet.url, sourceTitle: "", quote: "" },
      ],
      criteria: [
        { id: "frequency", reading: "Likely fit", basis: "The datasheet states 60 Hz", sourceUrl: sheet.url, sourceTitle: "Datasheet" },
        { id: "rating", reading: "Likely fit", basis: "The datasheet states the rating.", sourceUrl: "https://not-retrieved.example/x", sourceTitle: "" },
        { id: "duty", reading: "Maybe", basis: "Unclear", sourceUrl: sheet.url, sourceTitle: "" },
        { id: "transient", reading: "Not published", basis: "No page states the transient class", sourceUrl: "", sourceTitle: "" },
      ],
    });
  };
  const result = await analyzeEntry({ kind: "part", entry, vendor, context: { region: "US", power: "island" }, useAi: true, fetchImpl: net.fetchImpl, env: KEY, now: NOW });
  assert.deepEqual([result.analysis.status, result.analysis.model, result.analysis.context], ["complete", "vendor/model-x", { region: "US", power: "island" }]);
  // A part reads no registry or list. The only call is the analysis itself.
  assert.deepEqual(net.state.calls.map(call => call.host), ["api.perplexity.ai"]);
  assert.match(task, /^Part under review: Synthetic Unknown Works SYN-OPEN-GEN \(Gas engine generator set\)\./);
  assert.match(task, /\nThe site is in the United States and uses island power with no grid connection\.\n/);

  assert.deepEqual(result.analysis.fields.map(row => [row.id, row.tier, row.applied, row.note]), [
    ["rating", 4, true, ""],
    ["frequency", 5, false, "The value was not in the form this field needs, so it was dropped."],
    ["standards", 3, true, ""],
    ["assemblyCountry", 5, false, "The value did not cite a page that the analysis retrieved, so it was dropped."],
  ]);
  assert.deepEqual(result.auto.rating, {
    value: "2,000 kW continuous", source: { label: "syn-open.example", url: sheet.url }, tier: 4, asOf: "2026-11-22",
    detail: "Found by the AI analysis on November 22, 2026. The cited page is quoted as: \u201cRated output 2,000 kW continuous at 60 Hz.\u201d",
  });
  assert.match(result.auto.standards.detail, /The quote was not found in the text the analysis retrieved\. Open the source and confirm it\.$/);

  assert.deepEqual(result.analysis.criteria.map(row => [row.id, row.reading, row.basis, row.tier]), [
    ["frequency", "Likely fit", "The datasheet states 60 Hz.", 4],
    ["rating", "Not published", "The analysis did not cite a retrieved page for this point, so no reading is shown. Ask the supplier.", ""],
    ["duty", "Not published", "The analysis returned no reading for this point.", ""],
    ["transient", "Not published", "No page states the transient class.", ""],
    ["ul2200", "Not published", "The analysis returned no reading for this point.", ""],
  ]);
  assert.equal(result.analysis.criteria[0].source.url, sheet.url);
  assert.equal(result.analysis.summary, "The maker datasheet states the rating and frequency. No page states the assembly site.");

  // An unknown region or power mode falls back to the United States on island power.
  const fallback = await analyzeEntry({ kind: "part", entry, vendor, context: { region: "ZZ", power: "nope" }, useAi: false, fetchImpl: net.fetchImpl, env: {}, now: NOW });
  assert.deepEqual([fallback.analysis.context, steps(fallback)], [{ region: "US", power: "island" }, [["ai", "not run"]]]);
  const offline = await analyzeEntry({ kind: "part", entry, vendor, context: { region: "MY", power: "grid" }, useAi: true, fetchImpl: net.fetchImpl, env: {}, now: NOW });
  assert.equal(offline.analysis.message, "The AI analysis is not connected. An administrator adds a Perplexity API key to the server settings to turn it on. The program rules were applied.");
});

test("a field that a role recorded is not asked for and is not replaced", async () => {
  const net = network();
  const recorded = { state: "changed", value: "1.8 MW prime", role: "nstt", at: "2026-11-21T10:00:00.000Z", reason: "Supplier letter.", source: { label: "Supplier letter", url: "" } };
  const catalog = mergeCatalog(syntheticSeed(), [document("part", "syn-open-gen", { fields: { rating: recorded } })]);
  const entry = catalog.parts.find(row => row.id === "syn-open-gen");
  const vendor = catalog.vendors.find(row => row.id === "syn-open");
  const sheet = "https://www.syn-open.example/products/gen/datasheet.pdf";
  let asked = [];
  net.state.agent = (body) => {
    asked = body.input.split("\nThen read each requirement")[0].split("\n").filter(line => line.startsWith("- ")).map(line => line.slice(2).split(":")[0]);
    return agentReply({ pages: [{ url: sheet, title: "Datasheet", snippet: "Rated output 2,000 kW continuous.", fetched: true }], fields: [{ id: "rating", value: "2,000 kW continuous", sourceUrl: sheet, sourceTitle: "", quote: "" }] });
  };
  const result = await analyzeEntry({ kind: "part", entry, vendor, useAi: true, fetchImpl: net.fetchImpl, env: KEY, now: NOW });
  assert.deepEqual(asked, ["frequency", "standards", "assemblyCountry"]);
  assert.deepEqual([result.analysis.fields, result.auto], [[], {}]);
  assert.equal(stepNote(result, "ai"), "0 values were filled with a cited source. 0 values were dropped for lack of a usable source. 1 page was retrieved.");
});
