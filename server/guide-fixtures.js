// Synthetic network for tests and local review. Every company, notice, and advisory below is made up.
// The shapes follow the public sources the server reads: the Consolidated Screening List download, the GLEIF
// registry, the SEC ticker file, the Federal Register and eCFR services, RSS feeds, and the Perplexity Agent API.

const DAY = 24 * 60 * 60 * 1000;
const day = (offset = 0) => new Date(Date.now() - offset * DAY).toISOString().slice(0, 10);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const xml = (items) => new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>Synthetic feed</title>${items.map(item => `<item><title>${item.title}</title><link>${item.link}</link><description>${item.description || ""}</description><pubDate>${new Date(item.date || Date.now()).toUTCString()}</pubDate>${item.source ? `<source url="https://example.com">${item.source}</source>` : ""}</item>`).join("")}</channel></rss>`, { status: 200, headers: { "content-type": "application/rss+xml" } });

export const SYNTHETIC_LEI = "SYNTHETIC0000000CT01";
export const SYNTHETIC_PARENT_LEI = "SYNTHETIC0000000PA02";
const GLEIF = "https://api.gleif.org/api/v1";

const gleifRecord = (lei, name, country, city, links) => ({
  id: lei, type: "lei-records",
  attributes: {
    entity: {
      legalName: { name }, otherNames: [], transliteratedOtherNames: [],
      legalAddress: { country }, headquartersAddress: { country, city }, jurisdiction: country, status: "ACTIVE",
    },
    registration: { status: "ISSUED", lastUpdateDate: "2026-06-01T00:00:00Z" },
  },
  relationships: { "ultimate-parent": { links } },
});

// Builds an Agent API response in the published shape: retrieved pages first, then the structured answer.
export function agentReply({ fields = [], criteria = [], summary = "", pages = [], model = "synthetic-model", status = "completed" } = {}) {
  return {
    id: "resp_synthetic", object: "response", status, model,
    output: [
      { type: "search_results", results: pages.filter(page => !page.fetched).map(({ url, title, snippet }) => ({ url, title, snippet })) },
      { type: "fetch_url_results", contents: pages.filter(page => page.fetched).map(({ url, title, snippet }) => ({ url, title, snippet })) },
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ fields, criteria, summary }), annotations: [] }] },
    ],
  };
}

export function syntheticNetwork() {
  const state = {
    calls: [],
    down: new Set(),
    // total always equals the record count, as in the real download.
    screening: [
      { name: "Synthetic Listed Works Co., Ltd.", alt_names: ["Synthetic Listed Works"], source: "Entity List (EL) - Bureau of Industry and Security", source_list_url: "https://www.bis.gov/entity-list", type: "Entity" },
      { name: "Synthetic Blocked Trading LLC", alt_names: [], source: "Specially Designated Nationals (SDN) - Treasury Department", source_list_url: "https://sanctionssearch.ofac.treas.gov/", type: "Entity" },
      { name: "Synthetic Person, Example", alt_names: [], source: "Specially Designated Nationals (SDN) - Treasury Department", source_list_url: "https://sanctionssearch.ofac.treas.gov/", type: "Individual" },
    ],
    ecfr: { "title-15": "2026-10-01", "title-22": "2026-09-01" },
    federalRegister: [
      { match: "industry-and-security-bureau", row: { title: "Synthetic test rule on advanced computing items and remote access", abstract: "Synthetic test data. This rule revises controls on advanced computing items.", html_url: "https://www.federalregister.gov/documents/2026/11/19/2026-00001/synthetic-test-rule", publication_date: day(2), type: "Rule", document_number: "2026-00001", agencies: [{ name: "Industry and Security Bureau" }] } },
    ],
    feeds: {
      "www.cisa.gov": [{ title: "Synthetic test advisory for Siemens controllers", link: "https://www.cisa.gov/news-events/ics-advisories/icsa-26-000-01", description: "Synthetic test data. ICSA-26-000-01 describes a test finding.", date: Date.now() - DAY }],
      "news.google.com": [{ title: "Synthetic press lead about the FCC Covered List - Test Wire", link: "https://news.google.com/rss/articles/synthetic-test-lead", date: Date.now() - DAY, source: "Test Wire" }],
    },
    gleif: {
      names: { "Synthetic Controls GmbH": [SYNTHETIC_LEI] },
      records: {
        [SYNTHETIC_LEI]: gleifRecord(SYNTHETIC_LEI, "Synthetic Controls GmbH", "DE", "Munich", { "lei-record": `${GLEIF}/lei-records/${SYNTHETIC_PARENT_LEI}` }),
        [SYNTHETIC_PARENT_LEI]: gleifRecord(SYNTHETIC_PARENT_LEI, "Synthetic Holding SE", "DE", "Berlin", { "reporting-exception": `${GLEIF}/lei-records/${SYNTHETIC_PARENT_LEI}/ultimate-parent-reporting-exception` }),
      },
    },
    tickers: { 0: { cik_str: 1999999, ticker: "SYNT", title: "Synthetic Power Corp" } },
    // Set to a function (request body) => response body to connect the analysis service.
    agent: null,
  };

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    state.calls.push({ url: url.toString(), host: url.hostname, method: init.method || "GET", headers: init.headers || {}, body: init.body || "" });
    if (state.down.has(url.hostname)) return new Response("unavailable", { status: 503 });
    if (url.hostname === "data.trade.gov") return json({ total: state.screening.length, search_performed_at: new Date().toISOString(), results: state.screening });
    if (url.hostname === "api.gleif.org") {
      const name = url.searchParams.get("filter[entity.legalName]");
      if (name !== null) return json({ data: (state.gleif.names[name] || []).map(lei => state.gleif.records[lei]) });
      if (url.pathname.endsWith("/ultimate-parent-reporting-exception")) return json({ data: { attributes: { reason: "NO_KNOWN_PERSON" } } });
      const record = state.gleif.records[url.pathname.split("/").pop()];
      return record ? json({ data: record }) : json({ errors: [{ status: "404" }] }, 404);
    }
    if (url.hostname === "www.sec.gov") return json(state.tickers);
    if (url.hostname === "www.federalregister.gov") return json({ count: 0, results: state.federalRegister.filter(entry => url.search.includes(entry.match)).map(entry => entry.row) });
    if (url.hostname === "www.ecfr.gov") return json({ meta: { latest_amendment_date: state.ecfr[url.pathname.includes("title-15") ? "title-15" : "title-22"] } });
    if (url.hostname === "api.perplexity.ai") {
      if (!state.agent) return json({ error: { message: "Synthetic refusal: the key is not valid." } }, 401);
      return json(state.agent(JSON.parse(init.body || "{}")));
    }
    // One press feed carries the lead. The other press searches return nothing.
    if (url.hostname === "news.google.com") return xml(url.search.includes("FCC") ? state.feeds["news.google.com"] : []);
    return xml(state.feeds[url.hostname] || []);
  };
  return { fetchImpl, state };
}

// A small made-up repository for model tests. No vendor or part below is real.
// Vendors: one in the United States, two in Germany under the same parent, one in China with list entries,
// one with a blocked-party match, and one with no ownership facts.
export function syntheticSeed() {
  const registry = (value) => [value, "Synthetic registry record", "https://registry.example/record", 2, ""];
  const maker = (value) => [value, "Synthetic maker datasheet", "https://maker.example/datasheet", 4, ""];
  const list = (value, label, url, detail = "") => [value, label, url, 1, detail];
  const vendor = (id, name, hq, parent, parentCountry, extra = {}) => ({
    id, name, names: [name], domain: `${id}.example`,
    fields: {
      legalName: registry(name),
      ...(hq ? { hqCountry: registry(hq), jurisdiction: registry(hq) } : {}),
      ...(parent ? { ultimateParent: registry(parent) } : {}),
      ...(parentCountry ? { parentCountry: registry(parentCountry) } : {}),
      screening: list("No match", "US Consolidated Screening List", "https://www.trade.gov/consolidated-screening-list", "No name match. A clear result is not an approval."),
      fccCovered: list("Not named", "FCC Covered List", "https://www.fcc.gov/supplychain/coveredlist"),
      section1260h: list("Not listed", "Section 1260H list, 91 FR 35189", "https://www.federalregister.gov/d/2026-11571"),
      ...extra,
    },
  });
  const part = (id, vendorId, category, fields = {}) => ({
    id, vendor: vendorId, category, name: id.toUpperCase(),
    fields: Object.fromEntries([["model", id.toUpperCase()], ...Object.entries(fields)].map(([key, value]) => [key, maker(value)])),
  });
  return {
    asOf: "2026-11-20",
    vendors: [
      vendor("syn-us", "Synthetic Power Corp", "US", "No parent reported", "US"),
      vendor("syn-de", "Synthetic Controls GmbH", "DE", "Synthetic Holding SE", "DE"),
      vendor("syn-de2", "Synthetic Drives AG", "DE", "Synthetic Holding SE", "DE"),
      vendor("syn-cn", "Synthetic Listed Works Co., Ltd.", "CN", "Synthetic Listed Group", "CN", {
        screening: list("Match", "US Consolidated Screening List", "https://www.trade.gov/consolidated-screening-list", "Name match on Entity List (EL) (Synthetic Listed Works Co., Ltd.). A list match is a finding to resolve. It is not a legal conclusion."),
        fccCovered: list("Named producer", "FCC Covered List", "https://www.fcc.gov/supplychain/coveredlist"),
        section1260h: list("Listed", "Section 1260H list, 91 FR 35189", "https://www.federalregister.gov/d/2026-11571"),
      }),
      vendor("syn-sdn", "Synthetic Blocked Trading LLC", "AE", "No parent reported", "AE", {
        screening: list("Match", "US Consolidated Screening List", "https://www.trade.gov/consolidated-screening-list", "Name match on Specially Designated Nationals (SDN) (Synthetic Blocked Trading LLC). A list match is a finding to resolve. It is not a legal conclusion."),
      }),
      { id: "syn-open", name: "Synthetic Unknown Works", names: ["Synthetic Unknown Works"], domain: "syn-open.example", fields: { legalName: registry("Synthetic Unknown Works") } },
    ],
    parts: [
      part("syn-us-gen", "syn-us", "gas-engine-set", { rating: "2.5 MW continuous", frequency: "60 Hz", standards: "UL 2200; ISO 8528-5 G3", assemblyCountry: "US" }),
      part("syn-us-50", "syn-us", "gas-engine-set", { rating: "2.0 MW continuous", frequency: "50 Hz", assemblyCountry: "US" }),
      part("syn-de-gen", "syn-de", "gas-engine-set", { rating: "2.0 MW prime", frequency: "50 Hz and 60 Hz", assemblyCountry: "DE" }),
      part("syn-de2-gen", "syn-de2", "gas-engine-set", { rating: "1.5 MW prime", frequency: "60 Hz", assemblyCountry: "DE" }),
      part("syn-cn-gen", "syn-cn", "gas-engine-set", { rating: "2.0 MW prime", frequency: "60 Hz", assemblyCountry: "CN" }),
      part("syn-sdn-gen", "syn-sdn", "gas-engine-set", { rating: "1.0 MW prime", frequency: "60 Hz" }),
      part("syn-open-gen", "syn-open", "gas-engine-set"),
      part("syn-us-gpu", "syn-us", "gpu-server", { rating: "8 GPUs" }),
      part("syn-cn-switch", "syn-cn", "switch"),
      part("syn-us-cable", "syn-us", "cable"),
      part("syn-us-bess", "syn-us", "battery-storage", { rating: "4 MWh", frequency: "60 Hz", standards: "UL 9540; UL 9540A", assemblyCountry: "US" }),
    ],
  };
}
