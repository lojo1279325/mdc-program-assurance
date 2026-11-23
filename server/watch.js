// Daily regulatory watch: reads government feeds and press leads, re-screens vendor names, and logs every run.
// The watch never changes a decision. It adds items for a role to review and dates any screening result that moved.

import { createHash } from "node:crypto";
import { CATALOG_SEED } from "../public/catalog-seed.js";
import { mergeCatalog, classifyTopics, vendorsNamed, vendorsNamedClearly, entityNames, clean, safeUrl } from "../public/catalog-model.js";
import { USER_AGENT, longDate, plain, urlKey, loadScreeningIndex, screenVendor, screeningRecord } from "./analysis.js";

export const WATCH_PARTITION = "*watch";
export const PRACTICE_WATCH_PARTITION = "*watch-practice";
export const CATALOG_PARTITION = "*catalog";
export const PRACTICE_CATALOG_PARTITION = "*catalog-practice";
export const SYSTEM_ACTOR = { email: "system@watch", role: "system" };

const DAY = 24 * 60 * 60 * 1000;
const enc = encodeURIComponent;
const FR_API = "https://www.federalregister.gov/api/v1/documents.json";
const FR_FIELDS = ["title", "abstract", "html_url", "publication_date", "type", "document_number", "agencies"].map(name => `&fields[]=${name}`).join("");
const frSearch = (term) => `https://www.federalregister.gov/documents/search?conditions%5Bterm%5D=${enc(term)}`;
const news = (query) => `https://news.google.com/rss/search?q=${enc(query).replace(/%20/g, "+")}+when:2d&hl=en-US&gl=US&ceid=US:en`;

// Every source the watch reads. Tier 1 is a US government source. Press items are leads and say so.
export const WATCH_SOURCES = [
  { id: "fr-bulk", kind: "fr", tier: 1, label: "Federal Register: bulk-power system electric equipment", page: frSearch("\"bulk-power system electric equipment\""), topic: "eo14420",
    query: `&conditions[term]=${enc("\"bulk-power system electric equipment\"")}` },
  { id: "fr-bis", kind: "fr", tier: 1, label: "Federal Register: Bureau of Industry and Security rules", page: "https://www.federalregister.gov/agencies/industry-and-security-bureau", fallbackTopic: "policy",
    query: "&conditions[agencies][]=industry-and-security-bureau&conditions[type][]=RULE&conditions[type][]=PRORULE" },
  { id: "fr-fcc", kind: "fr", tier: 1, label: "Federal Register: FCC Covered List", page: frSearch("\"Covered List\""), topic: "fcc",
    query: `&conditions[agencies][]=federal-communications-commission&conditions[term]=${enc("\"Covered List\"")}` },
  { id: "fr-1260h", kind: "fr", tier: 1, label: "Federal Register: Section 1260H list", page: frSearch("\"1260H\""), topic: "1260h",
    query: `&conditions[term]=${enc("\"1260H\"")}` },
  { id: "fr-itar", kind: "fr", tier: 1, label: "Federal Register: State Department arms regulations", page: frSearch("\"International Traffic in Arms Regulations\""), fallbackTopic: "policy",
    query: `&conditions[agencies][]=state-department&conditions[term]=${enc("\"International Traffic in Arms Regulations\"")}&conditions[type][]=RULE&conditions[type][]=PRORULE` },
  { id: "fr-eo", kind: "fr", tier: 1, label: "Federal Register: executive orders", page: "https://www.federalregister.gov/presidential-documents/executive-orders",
    query: "&conditions[type][]=PRESDOCU&conditions[presidential_document_type][]=executive_order&fields[]=executive_order_number" },
  { id: "fr-grid", kind: "fr", tier: 1, label: "Federal Register: FERC large load notices", page: frSearch("\"large load\""), topic: "grid", requireMatch: true,
    query: `&conditions[agencies][]=federal-energy-regulatory-commission&conditions[term]=${enc("\"large load\"")}` },
  { id: "ecfr-744", kind: "ecfr", tier: 1, label: "eCFR: 15 CFR Part 744, Entity List and end-user controls", page: "https://www.ecfr.gov/current/title-15/part-744", topic: "entity-list",
    url: "https://www.ecfr.gov/api/versioner/v1/versions/title-15.json?part=744", cite: "15 CFR Part 744",
    advice: "Part 744 holds the Entity List and the end-user controls. This run re-screened every vendor name against the screening list. Read the amendment and record whether it touches a program vendor." },
  { id: "ecfr-126", kind: "ecfr", tier: 1, label: "eCFR: 22 CFR 126.1 country list", page: "https://www.ecfr.gov/current/title-22/section-126.1", topic: "itar126",
    url: "https://www.ecfr.gov/api/versioner/v1/versions/title-22.json?section=126.1", cite: "22 CFR 126.1",
    advice: "The country list in the workbench is a dated copy of this section. Read the amendment and record whether a country was added or removed." },
  { id: "whitehouse", kind: "rss", tier: 1, label: "White House presidential actions", page: "https://www.whitehouse.gov/presidential-actions/", url: "https://www.whitehouse.gov/presidential-actions/feed/", publisher: "The White House" },
  { id: "congress-president", kind: "rss", tier: 1, label: "Congress.gov: bills presented to the President", page: "https://www.congress.gov/rss", url: "https://www.congress.gov/rss/presented-to-president.xml", publisher: "Congress.gov", joinTitle: true },
  { id: "govinfo-plaw", kind: "rss", tier: 1, label: "GovInfo: public laws", page: "https://www.govinfo.gov/app/collection/plaw", url: "https://www.govinfo.gov/rss/plaw.xml", publisher: "GovInfo", noSummary: true },
  { id: "govinfo-bills", kind: "rss", tier: 1, label: "GovInfo: congressional bills", page: "https://www.govinfo.gov/app/collection/bills", url: "https://www.govinfo.gov/rss/bills.xml", publisher: "GovInfo", noSummary: true },
  { id: "cisa-ics", kind: "rss", tier: 1, label: "CISA industrial control system advisories", page: "https://www.cisa.gov/news-events/cybersecurity-advisories", url: "https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml", publisher: "CISA", topic: "ics", vendorOnly: true },
  { id: "news-china", kind: "news", tier: 5, lead: true, fallbackTopic: "china-export", label: "Press leads: Chinese export controls", query: "MOFCOM export control announcement" },
  { id: "news-bis", kind: "news", tier: 5, lead: true, fallbackTopic: "entity-list", label: "Press leads: Entity List and BIS action", query: "Entity List Bureau of Industry and Security" },
  { id: "news-eo", kind: "news", tier: 5, lead: true, fallbackTopic: "eo14420", label: "Press leads: bulk-power order and DOE action", query: "bulk-power system executive order Department of Energy" },
  { id: "news-fcc", kind: "news", tier: 5, lead: true, fallbackTopic: "fcc", label: "Press leads: FCC Covered List", query: "FCC Covered List" },
  { id: "news-grid", kind: "news", tier: 5, lead: true, fallbackTopic: "grid", label: "Press leads: large load and grid rules", query: "FERC large load data center interconnection" },
  { id: "news-chips", kind: "news", tier: 5, lead: true, fallbackTopic: "chips", label: "Press leads: chip export rules", query: "AI chip export controls data center" },
].map(source => source.kind === "news" ? { ...source, url: news(source.query), page: `https://news.google.com/search?q=${enc(source.query)}` } : source);

// Sites that do not allow automated reading. Their changes arrive through the sources above or the dated lists.
export const NOT_CONNECTED = [
  { id: "mofcom", label: "MOFCOM announcements and control lists", page: "https://exportcontrol.mofcom.gov.cn/", note: "The ministry site cannot be read automatically. Changes arrive as press leads. Confirm each one on the ministry page." },
  { id: "fcc-page", label: "FCC Covered List page", page: "https://www.fcc.gov/supplychain/coveredlist", note: "The page cannot be read automatically. Changes arrive through the Federal Register and press leads. The workbench holds a dated copy of the list." },
  { id: "ferc", label: "FERC orders and dockets", page: "https://www.ferc.gov/", note: "The site cannot be read automatically. FERC notices arrive through the Federal Register." },
  { id: "nerc", label: "NERC standards and alerts", page: "https://www.nerc.com/", note: "The site cannot be read automatically. Changes arrive as press leads." },
];

// ---------- Feed reading ----------

const decodeOnce = (text) => String(text || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#x([0-9a-f]+);/gi, (match, hex) => { try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return " "; } })
  .replace(/&#(\d+);/g, (match, code) => { try { return String.fromCodePoint(Number(code)); } catch { return " "; } })
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const feedText = (value, limit = 400) => plain(decodeOnce(decodeOnce(value)).replace(/<[^>]*>/g, " "), limit);
const tagOf = (block, name) => { const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return match ? match[1] : ""; };
const isoDay = (value) => { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ""; };

export function rssItems(xml) {
  return [...String(xml || "").matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(match => {
    const block = match[0];
    return { title: feedText(tagOf(block, "title"), 300), link: clean(decodeOnce(tagOf(block, "link")), 900), description: feedText(tagOf(block, "description"), 500), date: isoDay(decodeOnce(tagOf(block, "pubDate")).trim()), publisher: feedText(tagOf(block, "source"), 120) };
  });
}

// A source that answers that it is busy gets one more try after a short pause. A second refusal is logged as unavailable.
async function request(fetchImpl, url, accept, timeoutMs, retryMs) {
  const once = () => fetchImpl(url, { headers: { "user-agent": USER_AGENT, accept }, signal: AbortSignal.timeout(timeoutMs) });
  let response = await once();
  if (response.status === 429 || response.status >= 500) {
    await new Promise(resolve => setTimeout(resolve, retryMs));
    response = await once();
  }
  if (!response.ok) throw new Error(`The source returned status ${response.status}.`);
  return response;
}

async function readSource(source, { fetchImpl, since, retryMs }) {
  if (source.kind === "fr") {
    const body = await (await request(fetchImpl, `${FR_API}?per_page=20&order=newest&conditions[publication_date][gte]=${since}${source.query}${FR_FIELDS}`, "application/json", 8000, retryMs)).json();
    return (Array.isArray(body?.results) ? body.results : []).map(row => ({
      title: plain(row.title, 300), url: safeUrl(row.html_url), date: clean(row.publication_date, 10),
      summary: plain(`${row.executive_order_number ? `Executive Order ${row.executive_order_number}. ` : ""}${row.abstract || ""}`, 500),
      publisher: plain((Array.isArray(row.agencies) ? row.agencies : []).map(agency => agency?.name).filter(Boolean).slice(0, 2).join(", "), 120) || "Federal Register",
    }));
  }
  if (source.kind === "ecfr") {
    const body = await (await request(fetchImpl, source.url, "application/json", 8000, retryMs)).json();
    const date = clean(body?.meta?.latest_amendment_date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("The source returned no amendment date.");
    return [{ amended: date }];
  }
  const xml = await (await request(fetchImpl, source.url, "application/rss+xml, application/xml, text/xml, */*", 10000, retryMs)).text();
  return rssItems(xml).slice(0, source.kind === "news" ? 8 : 80).map(row => {
    let url = "";
    try { url = safeUrl(new URL(row.link, source.url).toString()); } catch { url = ""; }
    if (source.kind === "news") return { title: row.title.replace(/\s+-\s+[^-]+$/, ""), url, date: row.date, summary: "", publisher: row.publisher || "Press" };
    return { title: source.joinTitle && row.description ? plain(`${row.title}: ${row.description}`, 300) : row.title, url, date: row.date, summary: source.noSummary || source.joinTitle ? "" : row.description, publisher: source.publisher };
  });
}

const hash = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 20);
const squash = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Turns one feed row into a watch item, or drops it when it touches no rule topic and names no repository vendor.
// On a general source a vendor name alone keeps the item only when the name is clear, so a bill named after a person is not kept.
export function shapeItem(source, raw, vendors) {
  if (!raw.title || !raw.url) return null;
  const text = `${raw.title} ${raw.summary}`;
  const named = vendorsNamed(text, vendors);
  const matched = classifyTopics(text);
  const specific = matched.filter(id => id !== "policy");
  if (source.vendorOnly && !named.length) return null;
  if (source.requireMatch && !specific.includes(source.topic)) return null;
  // A source with one subject keeps that subject. A general source needs a rule topic or a named vendor.
  const topics = source.topic ? [...new Set([source.topic, ...specific])]
    : specific.length ? specific
      : source.fallbackTopic ? [source.fallbackTopic]
        : matched.length || vendorsNamedClearly(text, vendors).length ? ["policy"] : [];
  if (!topics.length) return null;
  return {
    id: hash(source.kind === "news" ? `news:${squash(raw.title)}` : urlKey(raw.url)),
    sourceId: source.id, sourceLabel: source.label, tier: source.tier, lead: Boolean(source.lead),
    title: raw.title, url: raw.url, date: raw.date || "", summary: raw.summary || "", topics, vendors: named, publisher: raw.publisher || "",
  };
}

// ---------- One run ----------

const runKey = (iso) => `run-${iso.replace(/[-:.]/g, "")}`;

// Re-screens every vendor name. A result that moved is dated, so an earlier confirmation shows for recheck.
async function rescreen({ vendors, practiceVendors, previous, overlays, fetchImpl, now }) {
  const nowIso = new Date(now).toISOString();
  // A check reads the list again unless it was downloaded in the last ten minutes.
  const loaded = await loadScreeningIndex({ fetchImpl, now, maxAgeMs: 10 * 60 * 1000 });
  const changed = [];
  const check = (vendor, prior) => {
    const fresh = screenVendor(loaded.index, entityNames(vendor), now);
    const record = screeningRecord(prior, fresh, vendor.fields?.screening?.baselineValue, nowIso);
    // The earlier detail and the earlier list names are kept, so the log can state what the earlier result rested on.
    // The list names come from the same record as the earlier value. A record kept without them adds none.
    if (record.changedAt === nowIso) {
      const lists = prior ? prior.lists : vendor.fields?.screening?.lists;
      changed.push({
        id: vendor.id, name: vendor.name, from: record.changedFrom, to: record.value, fromDetail: clean(prior?.detail ?? vendor.fields?.screening?.detail, 300),
        ...(Array.isArray(lists) ? { fromLists: lists.map(name => clean(name, 160)).filter(Boolean).slice(0, 40) } : {}),
      });
    }
    return record;
  };
  const newest = (a, b) => !a ? b : !b ? a : String(a.checkedAt || "") >= String(b.checkedAt || "") ? a : b;
  const values = {};
  for (const vendor of vendors) values[vendor.id] = check(vendor, newest(previous.values?.[vendor.id], overlays.get(vendor.id)));
  const practice = {};
  for (const vendor of practiceVendors) practice[vendor.id] = check(vendor, previous.practice?.[vendor.id]);
  return { at: nowIso, listDate: loaded.listDate, records: loaded.records, values, practice, changed };
}

// Runs the watch once. Returns { status: "ran", run } or a reason it did not run.
export async function runWatch({ store, environment, trigger = "manual", actor = SYSTEM_ACTOR, fetchImpl = fetch, now = Date.now(), retryMs = 1500 }) {
  const started = Date.now();
  const nowIso = new Date(now).toISOString();
  const stateDoc = await store.readGuideDocument(environment, "watch-state", "state");
  const state = stateDoc?.payload || {};
  const last = state.lastRunAt ? Date.parse(state.lastRunAt) : 0;
  if (state.lock?.until && Date.parse(state.lock.until) > now) return { status: "busy", message: "A check is already running. Reload in a minute to see its result." };
  if (trigger === "manual" && last && now - last < 60 * 1000) return { status: "recent", message: "The watch ran less than a minute ago. Wait a moment before checking again." };
  if (trigger === "catch-up" && last && now - last < 20 * 60 * 60 * 1000) return { status: "recent", message: "" };
  const saveState = (payload, version) => store.saveGuideDocument({ environment, projectId: WATCH_PARTITION, kind: "watch-state", key: "state", expectedVersion: version, savedBy: actor.email, payload });
  const locked = await saveState({ ...state, lock: { until: new Date(now + 3 * 60 * 1000).toISOString() } }, stateDoc?.version || 0);
  if (!locked) return { status: "busy", message: "A check is already running. Reload in a minute to see its result." };
  try {
    const [catalogDocs, practiceDocs, seenDoc, screeningDoc] = await Promise.all([
      store.listGuideDocuments(environment, CATALOG_PARTITION, { kinds: ["catalog-vendor"] }),
      store.listGuideDocuments(environment, PRACTICE_CATALOG_PARTITION, { kinds: ["catalog-vendor"] }),
      store.readGuideDocument(environment, "watch-seen", "seen"),
      store.readGuideDocument(environment, "watch-screening", "screening"),
    ]);
    const vendorSeed = { asOf: CATALOG_SEED.asOf, vendors: CATALOG_SEED.vendors, parts: [] };
    const vendors = mergeCatalog(vendorSeed, catalogDocs).vendors;
    const practiceVendors = mergeCatalog(vendorSeed, practiceDocs, { practice: true }).vendors.filter(vendor => vendor.custom && !vendors.some(row => row.id === vendor.id));
    const overlays = new Map(catalogDocs.filter(doc => doc.payload?.auto?.screening?.signature).map(doc => [doc.key, doc.payload.auto.screening]));
    // After the first run, look back to three days before the last run, and never more than 21 days.
    const since = new Date(last ? Math.max(now - 21 * DAY, last - 3 * DAY) : now - 10 * DAY).toISOString().slice(0, 10);
    const seen = { ...(seenDoc?.payload?.ids || {}) };
    const ecfr = { ...(state.ecfr || {}) };

    const [reads, screened] = await Promise.all([
      Promise.all(WATCH_SOURCES.map(source => readSource(source, { fetchImpl, since, retryMs }).then(rows => ({ source, rows }), error => ({ source, error })))),
      rescreen({ vendors, practiceVendors, previous: screeningDoc?.payload || {}, overlays, fetchImpl, now }).then(value => ({ value }), error => ({ error })),
    ]);

    const sources = [];
    const candidates = [];
    for (const { source, rows, error } of reads) {
      const row = { id: source.id, label: source.label, page: source.page, tier: source.tier, lead: Boolean(source.lead), status: error ? "unavailable" : "read", found: 0, added: 0, note: "" };
      sources.push(row);
      if (error) { row.note = clean(error?.name === "TimeoutError" ? "The source took too long to answer." : error?.message, 200) || "The source could not be read."; continue; }
      if (source.kind === "ecfr") {
        const amended = rows[0].amended;
        row.found = 1;
        row.note = `Latest amendment dated ${longDate(amended)}.`;
        if (ecfr[source.id] && ecfr[source.id] !== amended) candidates.push({
          id: hash(`${source.id}:${amended}`), sourceId: source.id, sourceLabel: source.label, tier: 1, lead: false,
          title: `${source.cite} was amended on ${longDate(amended)}`, url: source.page, date: amended, summary: source.advice, topics: [source.topic], vendors: [], publisher: "Electronic Code of Federal Regulations",
        });
        ecfr[source.id] = amended;
        continue;
      }
      for (const raw of rows) {
        if (raw.date && raw.date < since) continue;
        const item = shapeItem(source, raw, vendors);
        if (!item) continue;
        row.found += 1;
        candidates.push(item);
      }
    }
    // Government sources first, then the newest. At most 60 items join one run. The rest wait for the next run.
    const fresh = [];
    for (const item of candidates.sort((a, b) => a.tier - b.tier || String(b.date).localeCompare(String(a.date)))) {
      if (seen[item.id] || fresh.some(row => row.id === item.id)) continue;
      if (fresh.length >= 60) break;
      fresh.push({ ...item, foundAt: nowIso });
    }
    for (const item of fresh) {
      seen[item.id] = nowIso.slice(0, 10);
      const row = sources.find(source => source.id === item.sourceId);
      if (row) row.added += 1;
    }
    for (const row of NOT_CONNECTED) sources.push({ id: row.id, label: row.label, page: row.page, tier: 2, lead: false, status: "not connected", found: 0, added: 0, note: row.note });
    const cutoff = new Date(now - 60 * DAY).toISOString().slice(0, 10);
    const kept = Object.entries(seen).filter(([, day]) => String(day) >= cutoff).sort((a, b) => String(b[1]).localeCompare(String(a[1]))).slice(0, 1500);

    const screening = screened.value
      ? { status: "read", checked: Object.keys(screened.value.values).length + Object.keys(screened.value.practice).length, changed: screened.value.changed, note: `${screened.value.records.toLocaleString("en-US")} list records were checked.` }
      : { status: "unavailable", checked: 0, changed: [], note: clean(screened.error?.name === "TimeoutError" ? "The screening list took too long to download." : screened.error?.message, 200) || "The screening list could not be read." };
    const run = {
      at: nowIso, trigger, by: actor.email, role: actor.role, since,
      sources, screening, added: fresh.length, items: fresh, durationMs: Date.now() - started,
    };
    const save = (kind, key, payload, version) => store.saveGuideDocument({ environment, projectId: WATCH_PARTITION, kind, key, expectedVersion: version, savedBy: actor.email, payload });
    await save("watch-run", runKey(nowIso), run, 0);
    await save("watch-seen", "seen", { ids: Object.fromEntries(kept) }, seenDoc?.version || 0);
    if (screened.value) await save("watch-screening", "screening", { at: screened.value.at, listDate: screened.value.listDate, values: screened.value.values, practice: screened.value.practice }, screeningDoc?.version || 0);
    await saveState({
      ...state, lock: null, lastRunAt: nowIso, lastRunKey: runKey(nowIso), lastTrigger: trigger, ecfr, runs: (Number(state.runs) || 0) + 1,
      ...(trigger === "scheduled" ? { lastScheduledAt: nowIso } : {}),
    }, locked.version);
    return { status: "ran", run };
  } catch (error) {
    await saveState({ ...state, lock: null }, locked.version).catch(() => null);
    throw error;
  }
}

// Whether a daily schedule is working in this environment. The host calls the scheduled route on production only.
// Any other environment needs an outside scheduler that calls the same route with the shared secret. The schedule is
// reported as active while scheduled checks keep arriving, and on production before the first one is due.
export const SCHEDULE_WINDOW_HOURS = 36;
export function scheduleState({ environment, configured, lastScheduledAt = "", now = Date.now() }) {
  const last = Date.parse(lastScheduledAt);
  const known = !Number.isNaN(last);
  const arriving = known && now - last < SCHEDULE_WINDOW_HOURS * 60 * 60 * 1000;
  return {
    scheduled: Boolean(configured) && (arriving || (environment === "production" && !known)),
    scheduleReady: Boolean(configured),
    lastScheduledAt: known ? String(lastScheduledAt) : "",
  };
}

// The newest find first, then government sources before press leads, then the newest date.
const newestFirst = (a, b) => String(b.foundAt || "").localeCompare(String(a.foundAt || "")) || a.tier - b.tier || String(b.date || "").localeCompare(String(a.date || ""));

// Newest runs first. Items are flattened across runs, with one row per item.
export function flattenRuns(runDocs, limit = 200) {
  const runs = [...runDocs].sort((a, b) => String(b.payload?.at || "").localeCompare(String(a.payload?.at || "")));
  const items = [];
  const ids = new Set();
  for (const doc of runs) {
    for (const item of Array.isArray(doc.payload?.items) ? doc.payload.items : []) {
      if (!item?.id || ids.has(item.id)) continue;
      ids.add(item.id);
      items.push(item);
    }
  }
  items.sort(newestFirst);
  return {
    items: items.slice(0, limit),
    runs: runs.map(doc => { const { items: omitted, ...rest } = doc.payload || {}; return { key: doc.key, ...rest }; }),
  };
}

// The item a decision was recorded on, rebuilt from the decision record. A record saved before the item was kept
// with it still names the item, its source, and the topics that were decided.
export function itemFromReview(payload = {}) {
  const decided = [...new Set(Object.values(payload.dispositions || {}).flatMap(row => Array.isArray(row?.topics) ? row.topics : []))];
  return {
    id: payload.itemId, sourceId: payload.sourceId || "", sourceLabel: payload.sourceLabel || "", tier: payload.tier, lead: Boolean(payload.lead),
    title: payload.title || "", url: payload.url || "", date: payload.date || "", summary: payload.summary || "",
    topics: Array.isArray(payload.itemTopics) && payload.itemTopics.length ? payload.itemTopics : decided,
    vendors: Array.isArray(payload.itemVendors) ? payload.itemVendors : [],
    publisher: payload.publisher || "", foundAt: payload.foundAt || "",
  };
}

// The log as it is shown: the newest items, then every older item that carries a decision.
// A recorded decision can always be read and corrected, however many items arrived after it.
export function logItems(runDocs, reviewDocs = [], limit = 200) {
  const flat = flattenRuns(runDocs, Infinity);
  const newest = flat.items.slice(0, limit);
  const listed = new Set(newest.map(item => item.id));
  const older = new Map(flat.items.slice(limit).map(item => [item.id, item]));
  const decided = [];
  for (const doc of reviewDocs) {
    const payload = doc?.payload || {};
    if (!payload.itemId || listed.has(payload.itemId) || !Object.keys(payload.dispositions || {}).length) continue;
    listed.add(payload.itemId);
    decided.push(older.get(payload.itemId) || itemFromReview(payload));
  }
  return { items: [...newest, ...decided.sort(newestFirst)], runs: flat.runs };
}
