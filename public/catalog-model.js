// Vendor and part repository model: cited fields, role ownership, screening, benchmark, fit, and alternates.
// Every baseline value carries a source. A responsible role confirms it or changes it with a reason.

export const SOURCE_TIERS = {
  1: "US government",
  2: "Regulator or registry",
  3: "Standards body or certifier",
  4: "Manufacturer data",
  5: "Press or third-party lead",
  P: "Program rule",
  R: "Entered by role",
};

export const CITES = {
  eo: { label: "Executive Order 14420, 91 FR 55995", url: "https://www.federalregister.gov/d/2026-17843" },
  doeFaq: { label: "DOE bulk-power system questions and answers", url: "https://www.energy.gov/sites/default/files/2026-10/Bulk%20Power%20System%20EO%20and%20DOE%20RFI%20FAQs.pdf" },
  doeStatus: { label: "DOE executive order status page", url: "https://www.energy.gov/ceser/declaring-national-emergency-secure-united-states-bulk-power-system-executive-order" },
  doeRfi: { label: "DOE request for information, 91 FR 57322", url: "https://www.federalregister.gov/d/2026-18370" },
  itar126: { label: "22 CFR 126.1", url: "https://www.ecfr.gov/current/title-22/section-126.1" },
  csl: { label: "US Consolidated Screening List", url: "https://www.trade.gov/consolidated-screening-list" },
  fcc: { label: "FCC Covered List", url: "https://www.fcc.gov/supplychain/coveredlist" },
  fccInverter: { label: "FCC Covered List questions on robots and inverters", url: "https://www.fcc.gov/covered-list-faqs-robots-inverters" },
  fccRouter: { label: "FCC Covered List questions on routers", url: "https://www.fcc.gov/faqs-recent-updates-fcc-covered-list-regarding-routers-produced-foreign-countries" },
  s1260h: { label: "Section 1260H list, 91 FR 35189", url: "https://www.federalregister.gov/d/2026-11571" },
  s1260hRemoval: { label: "Section 1260H removal notice, 91 FR 72536", url: "https://www.federalregister.gov/d/2026-22840" },
  s805: { label: "Department of War release on Section 805", url: "https://www.war.gov/News/Releases/Release/Article/4529413/department-of-war-launches-new-website-to-help-industry-partners-navigate-secti/" },
  bisRemote: { label: "BIS remote access rule, 91 FR 74970", url: "https://www.govinfo.gov/content/pkg/FR-2026-11-19/pdf/2026-23529.pdf" },
  countryGroups: { label: "15 CFR Part 740, Supplement No. 1 (Country Groups)", url: "https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-740/appendix-Supplement%20No.%201%20to%20Part%20740" },
  affiliates: { label: "BIS Affiliates Rule suspension, 91 FR 70789", url: "https://www.federalregister.gov/d/2026-22793" },
  mitiChips: { label: "Malaysia MITI statement on AI chips of US origin", url: "https://www.miti.gov.my/miti/resources/Media%20Release/%5BFINAL%5D_MITI_Press_Stmt_Malaysia_Regulates_Trade_of_US_AI_Chips_2025-07-14.pdf" },
  mofcom18: { label: "MOFCOM Announcement No. 18 of 2025", url: "https://english.mofcom.gov.cn/Policies/AnnouncementsOrders/art/2025/art_0dd87cbee7b045bf93fabe6ab2faceee.html" },
  mofcom58: { label: "MOFCOM Announcement No. 58 of 2026", url: "https://exportcontrol.mofcom.gov.cn/article/zcfg/gnzcfg/zcfggzqd/202611/1338.html" },
  nist80082: { label: "NIST Special Publication 800-82, Revision 3", url: "https://csrc.nist.gov/pubs/sp/800/82/r3/final" },
  ul2755: { label: "UL Solutions, prefabricated modular data center certification", url: "https://www.ul.com/services/prefabricated-modular-data-center-testing-and-certification" },
  ulEss: { label: "UL Solutions, energy storage installation code questions", url: "https://www.ul.com/resources/installation-codes-and-requirements-energy-storage-systems-ess-faqs" },
  euMachinery: { label: "European Commission, machinery page", url: "https://single-market-economy.ec.europa.eu/sectors/mechanical-engineering/machinery_en" },
  euBattery: { label: "Regulation (EU) 2023/1542 on batteries", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:02023R1542-20260813" },
  euFgas: { label: "Regulation (EU) 2024/573, Annex IV", url: "https://webgate.ec.europa.eu/reqs2/public/v2/requirement/auxi/eu/32024R0573_spfgg_annex_4.pdf" },
  euFrequency: { label: "Commission Regulation (EU) 2017/1485, Article 127", url: "https://eur-lex.europa.eu/eli/reg/2017/1485/oj" },
  myFrequency: { label: "Energy Commission of Malaysia, national differences", url: "https://www.st.gov.my/sites/default/files/2026-11/Regulatory-Requirements-Related-to-National-Differences.pdf" },
  myBattery: { label: "Energy Commission of Malaysia, battery storage safety guidelines", url: "https://www.st.gov.my/sites/default/files/2026-05/Guidelines-on-Battery-Energy-Storage-System-(BESS)-Safety_0.pdf" },
  epaEngines: { label: "EPA, Clean Air Act resources for data centers", url: "https://www.epa.gov/stationary-sources-air-pollution/clean-air-act-resources-data-centers" },
  cfr63: { label: "40 CFR 63.6640", url: "https://www.ecfr.gov/current/title-40/section-63.6640" },
  epaTurbines: { label: "EPA, combustion turbine standard fact sheet", url: "https://www.epa.gov/system/files/documents/2026-01/final-rule_fact-sheet-nsps-stationary-combustion-turbines_0.pdf" },
  epaGwp: { label: "EPA, Technology Transitions fact sheet", url: "https://www.epa.gov/system/files/documents/2026-05/technology-transitions-final-rule-fact-sheet-updated-may-2026.pdf" },
  ashrae: { label: "ASHRAE, thermal guidelines reference card for liquid cooling", url: "https://www.ashrae.org/file%20library/technical%20resources/bookstore/supplemental%20files/therm-gdlns-5th-r-e-refcard.pdf" },
  iso8528: { label: "Kohler, ISO 8528-5 and generator transient performance", url: "https://techcomm.kohler.com/techcomm/pdf/ISO%208528-5%20and%20Generator%20Transient%20Performance_WP.pdf" },
  nvl72: { label: "NVIDIA, DGX Vera Rubin user guide", url: "https://docs.nvidia.com/dgx/dgxvr-user-guide/hardware.html" },
  gleif: { label: "GLEIF legal entity record", url: "https://search.gleif.org/" },
  edgar: { label: "SEC EDGAR", url: "https://www.sec.gov/edgar/search/" },
  guide: { label: "Program design, sourcing, and power guide", url: "" },
};

export const COUNTRY = {
  US: "United States", CN: "China", HK: "Hong Kong", MO: "Macau", TW: "Taiwan", JP: "Japan", KR: "South Korea",
  DE: "Germany", FR: "France", GB: "United Kingdom", IE: "Ireland", IT: "Italy", ES: "Spain", NL: "Netherlands",
  BE: "Belgium", LU: "Luxembourg", CH: "Switzerland", AT: "Austria", SE: "Sweden", FI: "Finland", DK: "Denmark",
  NO: "Norway", CZ: "Czechia", PL: "Poland", IL: "Israel", IN: "India", SG: "Singapore", MY: "Malaysia",
  CA: "Canada", MX: "Mexico", BR: "Brazil", AU: "Australia", AE: "United Arab Emirates", SA: "Saudi Arabia",
  RU: "Russia", BY: "Belarus", MM: "Burma", CU: "Cuba", IR: "Iran", KP: "North Korea", VE: "Venezuela",
  AF: "Afghanistan", CF: "Central African Republic", CY: "Cyprus", CD: "Democratic Republic of the Congo",
  ER: "Eritrea", HT: "Haiti", IQ: "Iraq", LB: "Lebanon", LY: "Libya", NI: "Nicaragua", SO: "Somalia",
  SS: "South Sudan", SD: "Sudan", ZW: "Zimbabwe", TH: "Thailand", ID: "Indonesia", VN: "Vietnam", TR: "Turkey",
  KY: "Cayman Islands", BM: "Bermuda", JE: "Jersey", VG: "British Virgin Islands",
};
export const countryName = (code) => COUNTRY[String(code || "").toUpperCase()] || String(code || "");

// 22 CFR 126.1, paragraphs (d)(1) and (d)(2), as read on November 20, 2026.
export const ITAR_D1 = ["BY", "MM", "CN", "CU", "IR", "KP", "VE"];
export const ITAR_D2 = ["AF", "CF", "CY", "CD", "ER", "HT", "IQ", "LB", "LY", "NI", "RU", "SO", "SS", "SD", "ZW"];
export function itarLink(code) {
  const value = String(code || "").toUpperCase();
  if (ITAR_D1.includes(value)) return "(d)(1)";
  if (ITAR_D2.includes(value)) return "(d)(2)";
  return "";
}

export const POSTURES = ["Green", "Yellow", "Orange", "Red"];
export const POSTURE_ACTION = {
  Green: "Proceed",
  Yellow: "Proceed with protections",
  Orange: "Proceed with active mitigation",
  Red: "Do not proceed absent resolution",
};
const rank = (posture) => POSTURES.indexOf(posture);
const worst = (values) => values.reduce((result, value) => rank(value) > rank(result) ? value : result, "Green");

export const REGIONS = [
  { id: "US", label: "United States", frequency: 60 },
  { id: "MY", label: "Malaysia", frequency: 50 },
  { id: "EU", label: "European Union", frequency: 50 },
];

export const SUBSYSTEMS = [
  { id: "generator", label: "Generator sets", tiers: "2 and 3",
    why: "Engines carry the energy. The maker, factory, and ownership chain of each engine and alternator must be known before purchase.",
    confirm: ["Factory for each engine and alternator", "Ownership chain to the ultimate parent company", "Engine variant named in the purchase order", "UL 2200 status: designed to the standard or listed to it"] },
  { id: "controls", label: "Controllers", tiers: "3",
    why: "The party that controls the controllers controls the power.",
    confirm: ["Controller model and firmware source", "Administrator credentials held by the owner", "Remote access off by default"] },
  { id: "battery", label: "Battery storage", tiers: "3",
    why: "Batteries carry the fast load swings, so their inverters and management software are critical to stability.",
    confirm: ["Cell, inverter, and software makers", "UL 9540A test report for the exact model", "No supplier cloud link"] },
  { id: "switchgear", label: "Switchgear and UPS", tiers: "2 and 3",
    why: "Protective relaying, high voltage circuit breakers, and UPS systems are on the Executive Order 14420 list.",
    confirm: ["Maker and firmware version of each relay and UPS", "Settings files held by the owner"] },
  { id: "modules", label: "Modules and cooling", tiers: "2 and 3",
    why: "A factory-built module arrives configured and loaded with software, so its devices need a baseline before shipment.",
    confirm: ["Device baselines taken at factory test", "Serialized seals and custody records", "Firmware reloaded from owner-held images after shipment"] },
  { id: "network", label: "Network and security", tiers: "3",
    why: "Switches, firewalls, and cameras can all communicate off site.",
    confirm: ["Each maker checked against the FCC Covered List", "No default passwords", "Configuration held by the owner"] },
  { id: "gpu", label: "GPU servers", tiers: "3",
    why: "Export rules attach to the chips and to who uses them.",
    confirm: ["Serial-number records and chain of custody", "The tenant ledger for the site"] },
  { id: "passive", label: "Passive items", tiers: "1",
    why: "Cables, busbars, racks, pipes, and enclosures cannot communicate.",
    confirm: ["Maker and country of origin", "Quality certificates"] },
];

const EO_GENERATOR = "Generators are a listed type.";
// eo: Listed, Possible, or Not named. tier: default device tier. ac: frequency matters. inverter and chips: rule relevance.
export const CATEGORIES = [
  { id: "gas-engine-set", subsystem: "generator", label: "Gas engine generator set", tier: 3, ac: true, eo: "Listed", eoNote: EO_GENERATOR },
  { id: "standby-set", subsystem: "generator", label: "Standby generator set", tier: 3, ac: true, eo: "Listed", eoNote: EO_GENERATOR },
  { id: "gas-turbine", subsystem: "generator", label: "Gas turbine", tier: 3, ac: true, eo: "Listed", eoNote: EO_GENERATOR },
  { id: "fuel-cell", subsystem: "generator", label: "Fuel cell", tier: 3, ac: true, eo: "Not named", eoNote: "Fuel cells are not named in the list. Counsel confirms the treatment.", inverter: true },
  { id: "alternator", subsystem: "generator", label: "Alternator", tier: 2, ac: true, eo: "Listed", eoNote: "The alternator is the generating machine in a generator set. Generators are a listed type." },
  { id: "generator-controller", subsystem: "controls", label: "Generator controller", tier: 3, eo: "Listed", eoNote: "Industrial control systems are a listed type." },
  { id: "plant-control", subsystem: "controls", label: "Plant control system", tier: 3, eo: "Listed", eoNote: "Industrial control systems are a listed type." },
  { id: "ot-monitoring", subsystem: "controls", label: "Control network security monitoring", tier: 3, eo: "Not named", eoNote: "Monitoring software is not named in the list." },
  { id: "battery-storage", subsystem: "battery", label: "Battery energy storage system", tier: 3, ac: true, eo: "Listed", eoNote: "Battery energy storage systems are a listed type.", inverter: true },
  { id: "switchgear", subsystem: "switchgear", label: "Switchgear and circuit breakers", tier: 2, ac: true, eo: "Possible", eoNote: "High voltage circuit breakers are a listed type. Low voltage switchgear is not named. Confirm the voltage class." },
  { id: "relay", subsystem: "switchgear", label: "Protective relay", tier: 3, eo: "Listed", eoNote: "Protective relaying is a listed type." },
  { id: "ups", subsystem: "switchgear", label: "Uninterruptible power supply", tier: 3, ac: true, eo: "Listed", eoNote: "Uninterruptible power supply systems supporting critical infrastructure are a listed type." },
  { id: "transformer", subsystem: "switchgear", label: "Transformer", tier: 1, ac: true, eo: "Possible", eoNote: "Substation transformers are a listed type. Confirm whether the unit serves a substation.", tierNote: "Tier 2 or Tier 3 when a monitor or tap changer controller is fitted." },
  { id: "module", subsystem: "modules", label: "Prefabricated module", tier: 3, ac: true, eo: "Not named", eoNote: "Prefabricated modules are not named in the list. Listed devices inside the module are assessed as their own parts." },
  { id: "cdu", subsystem: "modules", label: "Coolant distribution unit", tier: 3, ac: true, eo: "Not named", eoNote: "Cooling equipment is not named in the list." },
  { id: "heat-rejection", subsystem: "modules", label: "Chiller or heat rejection plant", tier: 3, ac: true, eo: "Not named", eoNote: "Cooling equipment is not named in the list." },
  { id: "switch", subsystem: "network", label: "Network switch", tier: 3, eo: "Not named", eoNote: "Network equipment is not named in the list.", telecom: true },
  { id: "firewall", subsystem: "network", label: "Firewall", tier: 3, eo: "Not named", eoNote: "Network equipment is not named in the list.", telecom: true },
  { id: "camera", subsystem: "network", label: "Security camera", tier: 3, eo: "Not named", eoNote: "Cameras are not named in the list.", telecom: true },
  { id: "rack-platform", subsystem: "gpu", label: "GPU rack platform", tier: 3, eo: "Not named", eoNote: "Computing equipment is not named in the list.", chips: true },
  { id: "gpu-server", subsystem: "gpu", label: "GPU server", tier: 3, eo: "Not named", eoNote: "Computing equipment is not named in the list.", chips: true },
  { id: "busway", subsystem: "passive", label: "Busway", tier: 1, eo: "Not named", eoNote: "Passive items are not named in the list.", tierNote: "Tier 2 or Tier 3 when metering or monitoring is fitted." },
  { id: "rack", subsystem: "passive", label: "Rack or cabinet", tier: 1, eo: "Not named", eoNote: "Passive items are not named in the list." },
  { id: "cable", subsystem: "passive", label: "Power cable", tier: 1, eo: "Not named", eoNote: "Passive items are not named in the list." },
  { id: "fiber", subsystem: "passive", label: "Fiber and structured cabling", tier: 1, eo: "Not named", eoNote: "Passive items are not named in the list." },
];
export const categoryOf = (id) => CATEGORIES.find(row => row.id === id) || null;
export const subsystemOf = (id) => SUBSYSTEMS.find(row => row.id === id) || null;

export const FIELD_ROLE_LABEL = { nstt: "NSTT", cpi: "CPI", trade: "Trade" };
export const VENDOR_FIELDS = [
  { id: "legalName", label: "Legal name", owner: "cpi", help: "The registered name of the legal entity that makes or sells the part." },
  { id: "hqCountry", label: "Headquarters country", owner: "cpi", rule: true, country: true, help: "Two-letter country code of the headquarters address." },
  { id: "jurisdiction", label: "Legal jurisdiction", owner: "cpi", help: "Where the entity is registered." },
  { id: "lei", label: "Legal Entity Identifier", owner: "cpi", help: "The 20-character identifier in the global registry." },
  { id: "cik", label: "SEC registrant number", owner: "cpi", help: "The Central Index Key, when the entity files with the SEC." },
  { id: "ultimateParent", label: "Ultimate parent", owner: "cpi", rule: true, help: "The top company in the ownership chain." },
  { id: "parentCountry", label: "Ultimate parent country", owner: "cpi", rule: true, country: true, help: "Two-letter country code of the ultimate parent." },
  { id: "screening", label: "Screening list result", owner: "trade", rule: true, options: ["No match", "Similar name", "Match"], help: "Result of the name check against the US Consolidated Screening List." },
  { id: "fccCovered", label: "FCC Covered List", owner: "trade", rule: true, options: ["Not named", "Named producer"], help: "Whether the list names this producer." },
  { id: "section1260h", label: "Section 1260H list", owner: "trade", rule: true, options: ["Not listed", "Listed"], help: "Whether the Department of War list of Chinese military companies names this entity or its parent." },
  { id: "nexus126", label: "22 CFR 126.1 country link", owner: "trade", rule: true, options: ["No link", "Link"], help: "Whether the headquarters or the ultimate parent sits in a country named in 22 CFR 126.1." },
];
export const PART_FIELDS = [
  { id: "model", label: "Model", owner: "nstt", help: "The model or product family as the maker writes it." },
  { id: "deviceTier", label: "Device tier", owner: "nstt", rule: true, options: ["Tier 1", "Tier 2", "Tier 3"], help: "Tier 1 is passive. Tier 2 has firmware and no network link. Tier 3 can communicate." },
  { id: "rating", label: "Rating", owner: "nstt", help: "The main rated output, capacity, or size." },
  { id: "frequency", label: "Frequency", owner: "nstt", help: "50 Hz, 60 Hz, or both." },
  { id: "standards", label: "Standards stated by the maker", owner: "cpi", help: "Standards, listings, and certifications the maker names for this model." },
  { id: "assemblyCountry", label: "Final assembly country", owner: "cpi", rule: true, country: true, help: "Two-letter country code of the factory that assembles the unit. Use n.a. until the supplier discloses it." },
  { id: "eoType", label: "Executive Order 14420 listed type", owner: "trade", rule: true, options: ["Not named", "Possible", "Listed", "Determination recorded"], help: "Whether the equipment type is on the list in the order. Choose Determination recorded only when the Department of Energy has issued a determination against this equipment, and cite it." },
  { id: "fccInverter", label: "FCC inverter entry", owner: "trade", rule: true, options: ["Not applicable", "Confirm", "Authorized or conditionally approved", "Covered"], help: "Whether a foreign-produced power inverter in this part holds an FCC authorization or a conditional approval." },
  { id: "chipControl", label: "US chip export rule", owner: "trade", rule: true, options: ["Not applicable", "Relevant"], help: "Whether the part carries advanced computing chips that the export rules cover." },
  { id: "chinaExport", label: "Chinese export control exposure", owner: "trade", rule: true, options: ["Not assessed", "Not exposed", "Exposed"], help: "Whether the part or its materials need a Chinese export license to reach the site." },
];
export const fieldsFor = (kind) => kind === "vendor" ? VENDOR_FIELDS : PART_FIELDS;
export const fieldDef = (kind, id) => fieldsFor(kind).find(row => row.id === id) || null;

export const clean = (value, limit = 600) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
export const safeUrl = (value) => {
  const raw = clean(value, 600);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : "";
  } catch { return ""; }
};
export const entryId = (value) => clean(value, 80).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const missing = (value) => !clean(value) || /^n\.a\.?$/i.test(clean(value)) || clean(value) === "Not assessed";
export const isMissing = missing;

// The program keeps one calendar: the day in New York. The server stamps records with it and every screen shows it.
const PROGRAM_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export function programDay(now = Date.now()) {
  const parts = Object.fromEntries(PROGRAM_DAY.formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// ---------- Screening ----------

const LEGAL_FORMS = new Set(["CO", "COMPANY", "LTD", "LIMITED", "INC", "INCORPORATED", "CORP", "CORPORATION", "AG", "SE", "SA", "PLC", "GMBH", "LLC", "AB", "OYJ", "ABP", "AS", "SPA", "KG", "NV", "BV", "LP", "LLP", "SAS", "SRL", "OG", "KGAA", "PTE", "PTY", "BHD", "SDN", "THE", "AND"]);

export function coreName(value) {
  const tokens = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\([^)]*\)/g, " ")
    .toUpperCase().replace(/\bPUBLIC LIMITED COMPANY\b/g, "PLC").replace(/\b([A-Z])[./]\s?(?=[A-Z]\b)/g, "$1")
    .replace(/&/g, " AND ").replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_FORMS.has(tokens[tokens.length - 1])) tokens.pop();
  while (tokens.length > 1 && tokens[0] === "THE") tokens.shift();
  return tokens.join(" ");
}

const shortList = (source) => String(source || "").split(" - ")[0].trim();

export function buildScreeningIndex(records) {
  return (Array.isArray(records) ? records : []).map(record => {
    const names = [record.name, ...(Array.isArray(record.alt_names) ? record.alt_names : [])];
    // Entity List rows can read "Parent. Affiliated Entity: Child". The child is the listed party.
    const cores = [...new Set(names.flatMap(name => String(name || "").split(/Affiliated Entit(?:y|ies):/i)).map(coreName).filter(Boolean))];
    return { cores, list: shortList(record.source), name: clean(record.name, 200), url: clean(record.source_list_url, 300), person: /individual|vessel|aircraft/i.test(String(record.type || "")) };
  });
}

function contains(haystack, needle) {
  return ` ${haystack} `.includes(` ${needle} `);
}

export function screenNames(index, names) {
  const queries = [...new Set((Array.isArray(names) ? names : [names]).map(coreName).filter(core => core.length >= 3))];
  const exact = [];
  const similar = [];
  for (const row of index) {
    let kind = "";
    for (const query of queries) {
      if (row.cores.includes(query)) { kind = "exact"; break; }
      const strong = query.includes(" ") || query.length >= 8;
      // A person, vessel, or aircraft that shares a word with a company name is not a similar company.
      if (row.person) continue;
      if (strong && row.cores.some(core => contains(core, query))) kind = "similar";
      // A vendor name can also carry a listed name inside it, such as a city placed in front of the listed name.
      else if (row.cores.some(core => core.includes(" ") && core.length >= 10 && contains(query, core))) kind = "similar";
    }
    if (kind === "exact") exact.push({ list: row.list, name: row.name, url: row.url, kind });
    else if (kind === "similar") similar.push({ list: row.list, name: row.name, url: row.url, kind });
  }
  const order = (a, b) => `${a.list} ${a.name}`.localeCompare(`${b.list} ${b.name}`);
  exact.sort(order);
  similar.sort(order);
  return { exact, similar, value: exact.length ? "Match" : similar.length ? "Similar name" : "No match" };
}

// Groups the hits by list, with the count and one example, so the detail stays short and readable.
function listGroups(rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.list, [...(groups.get(row.list) || []), row.name]);
  const shortest = (names) => [...names].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  const parts = [...groups.entries()].slice(0, 4).map(([list, names]) => names.length === 1 ? `${list} (${names[0]})` : `${list} (${names.length} entries, for example ${shortest(names)})`);
  return `${parts.join("; ")}${groups.size > 4 ? `; and ${groups.size - 4} more lists` : ""}`;
}

export function screeningDetail(result) {
  if (result.exact.length) return `Name match on ${listGroups(result.exact)}. A list match is a finding to resolve. It is not a legal conclusion.`;
  if (result.similar.length) return `No exact name match. Similar name on ${listGroups(result.similar)}. Trade decides whether it is the same party.`;
  return "No name match. A clear result is not an approval.";
}

export function screeningSignature(result) {
  return [...result.exact, ...result.similar].map(row => `${row.kind}|${row.list}|${row.name}`).sort().join("\n");
}

// ---------- Seed expansion and overlays ----------

const baselineField = (value, source, tier, asOf, extra = {}) => ({ value: clean(value, 400) || "n.a.", source: { label: clean(source?.label, 160), url: safeUrl(source?.url) }, tier, asOf, ...extra });

// Seed fields are stored compactly as [value, label, url, tier, detail].
export function expandField(raw, asOf) {
  if (!Array.isArray(raw)) return baselineField("n.a.", { label: "No trusted public source found", url: "" }, "P", asOf);
  const [value, label, url, tier, detail] = raw;
  return baselineField(value, { label, url }, tier ?? "P", asOf, detail ? { detail: clean(detail, 700) } : {});
}

export function expandEntry(kind, seed, asOf) {
  const fields = {};
  for (const def of fieldsFor(kind)) if (seed.fields?.[def.id]) fields[def.id] = expandField(seed.fields[def.id], seed.asOf || asOf);
  return kind === "vendor"
    ? { kind, id: seed.id, name: clean(seed.name, 120), names: (seed.names || []).map(name => clean(name, 200)).filter(Boolean), domain: clean(seed.domain, 120), custom: Boolean(seed.custom), asOf: seed.asOf || asOf, baseline: fields }
    : { kind, id: seed.id, vendor: seed.vendor, category: seed.category, name: clean(seed.name, 160), custom: Boolean(seed.custom), asOf: seed.asOf || asOf, baseline: fields };
}

// The fields the AI step of the analysis looks for, and the list or registry step that looks for each vendor field.
export const AI_FIELDS = {
  vendor: ["legalName", "hqCountry", "jurisdiction", "lei", "cik", "ultimateParent", "parentCountry"],
  part: ["rating", "frequency", "standards", "assemblyCountry"],
};
const STEP_OF = { legalName: "registry", hqCountry: "registry", jurisdiction: "registry", lei: "registry", ultimateParent: "registry", parentCountry: "registry", cik: "sec" };

function derivedVendor(entry, value, asOf) {
  const out = {};
  const hq = value("hqCountry");
  const parent = value("parentCountry");
  const links = [[hq, "headquarters"], [parent, "ultimate parent"]].filter(([code]) => itarLink(code));
  const special = [hq, parent].filter(code => ["HK", "MO"].includes(String(code).toUpperCase()));
  out.nexus126 = baselineField(links.length ? "Link" : "No link", CITES.itar126, "P", asOf, {
    detail: links.length
      ? `${[...new Set(links.map(([code, what]) => `The ${what} is in ${countryName(code)}, which paragraph ${itarLink(code)} names`))].join(". ")}.`
      : missing(hq) && missing(parent) ? "No country is recorded yet, so no link can be shown."
        : special.length ? "Hong Kong and Macau are not named in the section text. Trade confirms the treatment."
          : "Neither the headquarters country nor the ultimate parent country is named in the section.",
  });
  return out;
}

function derivedPart(entry, value, asOf) {
  const category = categoryOf(entry.category) || {};
  const out = {};
  out.deviceTier = baselineField(`Tier ${category.tier || 3}`, { label: "Program guide, device tiers", url: "" }, "P", asOf, {
    detail: category.tierNote || "A device moves to Tier 3 the moment anyone adds a network link.",
  });
  out.eoType = baselineField(category.eo || "Not named", CITES.eo, "P", asOf, { detail: category.eoNote || "" });
  out.fccInverter = baselineField(category.inverter ? "Confirm" : "Not applicable", CITES.fccInverter, "P", asOf, {
    detail: category.inverter
      ? "A foreign-produced power inverter is on the Covered List unless it holds a conditional approval. Models the FCC authorized earlier may still be sold and used. Confirm the inverter maker, where it is produced, and its authorization."
      : "This category has no grid-interactive power inverter.",
  });
  out.chipControl = baselineField(category.chips ? "Relevant" : "Not applicable", CITES.bisRemote, "P", asOf, {
    detail: category.chips
      ? "The export rules attach to the chips and to who uses them. The position depends on the destination and the tenants."
      : "This category carries no advanced computing chips.",
  });
  out.chinaExport = baselineField("Not assessed", CITES.mofcom58, "P", asOf, {
    detail: "The material content and shipping route are not public. Ask the supplier which parts or materials ship from China and whether a Chinese export license applies.",
  });
  return out;
}

const DERIVED = { vendor: ["nexus126"], part: ["deviceTier", "eoType", "fccInverter", "chipControl", "chinaExport"] };

// Applies one overlay document to a baseline entry and returns the entry with final fields.
// extras.auto holds values the regulatory watch refreshed, such as a new screening result.
// extras.reviews holds the material watch reviews that name this entry.
export function applyOverlay(entry, overlay, asOf, extras = {}) {
  const payload = overlay?.payload || {};
  const kind = entry.kind;
  const base = { ...entry.baseline };
  const autoField = (auto) => baselineField(auto.value, auto.source, auto.tier ?? 1, auto.asOf || asOf, {
    ...(auto.detail ? { detail: clean(auto.detail, 700) } : {}),
    ...(auto.changedAt ? { changedAt: clean(auto.changedAt, 40), changedFrom: clean(auto.changedFrom, 80) } : {}),
  });
  for (const source of [payload.auto, extras.auto]) {
    for (const [id, auto] of Object.entries(source || {})) {
      if (fieldDef(kind, id) && auto && typeof auto === "object") base[id] = autoField(auto);
    }
  }
  const confirmed = payload.fields || {};
  const finalValue = (id) => {
    const record = confirmed[id];
    if (record?.state === "changed") return clean(record.value, 400);
    return base[id]?.value ?? "n.a.";
  };
  const derived = kind === "vendor" ? derivedVendor(entry, finalValue, asOf) : derivedPart(entry, finalValue, asOf);
  for (const id of DERIVED[kind]) if (!payload.auto?.[id] && !extras.auto?.[id] && !entry.baseline[id]) base[id] = derived[id];
  // A field with no value states when a lookup last ran. An entry the team added has no lookup until the analysis reads a source for it.
  const stepStatus = new Map((Array.isArray(payload.analysis?.steps) ? payload.analysis.steps : []).map(row => [row.id, row.status]));
  const analysisDay = [payload.analysis?.day, payload.analysis?.at].map(value => String(value || "").slice(0, 10)).find(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) || "";
  const lookedOn = (id) => {
    const read = (step) => stepStatus.get(step) === "read";
    if (analysisDay && ((kind === "vendor" && STEP_OF[id] && read(STEP_OF[id])) || (AI_FIELDS[kind].includes(id) && read("ai")))) return analysisDay;
    return entry.custom ? "" : entry.asOf || asOf;
  };
  const emptyField = (id) => {
    const day = lookedOn(id);
    return day
      ? baselineField("n.a.", { label: "No trusted public source found", url: "" }, "P", day)
      : baselineField("n.a.", { label: "Not looked up yet", url: "" }, "P", entry.asOf || asOf, { unchecked: true });
  };
  const fields = {};
  for (const def of fieldsFor(kind)) {
    const baseline = base[def.id] && !(missing(base[def.id].value) && !base[def.id].source?.url && base[def.id].source?.label === "No trusted public source found") ? base[def.id] : emptyField(def.id);
    const record = confirmed[def.id];
    // A confirmation goes stale when the sourced value moved, or when the watch recorded a change after it.
    const stale = Boolean(record && (clean(record.baseline, 400) !== clean(baseline.value, 400) || (baseline.changedAt && record.at && baseline.changedAt > record.at)));
    if (!record) { fields[def.id] = { ...baseline, id: def.id, state: "baseline", baselineValue: baseline.value, baselineSource: baseline.source }; continue; }
    fields[def.id] = record.state === "changed"
      ? { ...baseline, id: def.id, value: clean(record.value, 400), detail: clean(record.detail, 700), source: record.source?.label || record.source?.url ? { label: clean(record.source.label, 160), url: safeUrl(record.source.url) } : { label: "No source recorded", url: "" }, tier: "R", asOf: /^\d{4}-\d{2}-\d{2}/.test(String(record.at || "")) ? String(record.at).slice(0, 10) : baseline.asOf, state: "changed", baselineValue: baseline.value, baselineSource: baseline.source, reason: clean(record.reason, 600), by: record.by, role: record.role, at: record.at, stale }
      : { ...baseline, id: def.id, state: "confirmed", baselineValue: baseline.value, baselineSource: baseline.source, by: record.by, role: record.role, at: record.at, stale };
  }
  const cleared = Array.isArray(payload.cleared) ? payload.cleared : [];
  const recheck = [];
  for (const review of extras.reviews || []) {
    if (cleared.some(row => row.reviewId === review.id && row.at >= review.at)) continue;
    recheck.push({ reviewId: review.id, kind: "review", title: clean(review.title, 240), url: safeUrl(review.url), topics: review.topics || [], role: review.ownerRole || "trade", at: review.at, note: clean(review.note, 400) });
  }
  for (const def of fieldsFor(kind)) {
    if (fields[def.id].stale) recheck.push({ reviewId: `field:${def.id}`, kind: "field", title: `${def.label} changed after it was confirmed. The sourced value is now ${fields[def.id].baselineValue}.`, url: fields[def.id].source?.url || "", topics: [], role: def.owner, at: fields[def.id].changedAt || fields[def.id].asOf, note: "" });
  }
  return {
    ...entry, fields, version: overlay?.version || 0,
    recheck, cleared,
    log: Array.isArray(payload.log) ? payload.log : [],
    analysis: payload.analysis || null,
  };
}

// Builds the working catalog from the seed, custom entries, and overlay documents.
// options.auto maps "vendor:<id>" or "part:<id>" to refreshed values. options.reviews lists material watch reviews.
export function mergeCatalog(seed, documents = [], options = {}) {
  const asOf = seed.asOf;
  const keyOf = (doc) => String(doc.key || "").replace(/^practice:/, "");
  const byKey = new Map(documents.map(doc => [`${doc.kind}:${keyOf(doc)}`, doc]));
  const reviews = Array.isArray(options.reviews) ? options.reviews : [];
  const collect = (kind, rows) => {
    const base = rows.map(row => expandEntry(kind, row, asOf));
    for (const doc of documents) {
      if (doc.kind !== `catalog-${kind}` || !doc.payload?.custom || base.some(row => row.id === keyOf(doc))) continue;
      base.push(expandEntry(kind, { ...doc.payload.custom, id: keyOf(doc), custom: true, asOf: doc.payload.custom.asOf }, asOf));
    }
    const list = kind === "vendor" ? "vendors" : "parts";
    return base.map(entry => applyOverlay(entry, byKey.get(`catalog-${kind}:${entry.id}`), asOf, {
      auto: options.auto?.[`${kind}:${entry.id}`],
      reviews: reviews.filter(review => (review.affected?.[list] || []).includes(entry.id)),
    }));
  };
  const vendors = collect("vendor", seed.vendors || []);
  const parts = collect("part", seed.parts || []).filter(part => vendors.some(vendor => vendor.id === part.vendor) && categoryOf(part.category));
  return { asOf, vendors, parts, practice: Boolean(options.practice) };
}

export const valueOf = (entry, id) => entry?.fields?.[id]?.value ?? "n.a.";
export const isConfirmed = (entry, id) => Boolean(entry?.fields?.[id] && entry.fields[id].state !== "baseline" && !entry.fields[id].stale);
export const vendorOf = (catalog, part) => catalog.vendors.find(vendor => vendor.id === part?.vendor) || null;
// Joins the vendor and part names. A part name that already opens with the brand stands alone.
export function partTitle(vendorName, partName) {
  const vendor = String(vendorName || "").trim();
  const part = String(partName || "").trim();
  if (!vendor || !part) return vendor || part;
  const brand = vendor.toLowerCase().replace(/[()|,]/g, " ").split(/\s+/).filter(Boolean);
  return brand.includes(part.split(/\s+/)[0].toLowerCase()) ? part : `${vendor} ${part}`;
}
export function parentKey(vendor) {
  const parent = valueOf(vendor, "ultimateParent");
  return coreName(missing(parent) || /^none reported|^no parent/i.test(parent) ? valueOf(vendor, "legalName") || vendor?.name : parent) || vendor?.id || "";
}

// Names used to check a vendor against the screening list and the dated lists: its own names and its recorded parent.
export function entityNames(vendor) {
  const legal = valueOf(vendor, "legalName");
  const parent = valueOf(vendor, "ultimateParent");
  const names = [vendor?.name, ...(vendor?.names || []), missing(legal) ? "" : legal, missing(parent) || /^none reported|^no parent/i.test(parent) ? "" : parent];
  return [...new Set(names.map(name => clean(name, 200)).filter(Boolean))];
}

// ---------- Fit against the reference design ----------

export function frequencyFit(value, regionId) {
  const need = REGIONS.find(region => region.id === regionId)?.frequency || 60;
  const text = String(value || "");
  const has50 = /(^|[^0-9])50([^0-9]|$)/.test(text);
  const has60 = /(^|[^0-9])60([^0-9]|$)/.test(text);
  if (!has50 && !has60) return "unknown";
  return (need === 60 ? has60 : has50) ? "fit" : "unfit";
}

// Engineering and compliance criteria by category. Each one names its public source.
export const CRITERIA = [
  { id: "frequency", label: "Frequency matches the region", kind: "frequency", group: "Functional", categories: "ac",
    expect: { US: "60 Hz supply in the United States.", MY: "50 Hz supply in Malaysia.", EU: "50 Hz supply in the European Union." },
    cite: { US: CITES.guide, MY: CITES.myFrequency, EU: CITES.euFrequency } },
  { id: "rating", label: "Rated output or capacity stated", kind: "rating", group: "Functional", categories: "all",
    expect: "The maker states the rating, so the unit count and spare count can be sized.", cite: CITES.guide },
  { id: "duty", label: "Continuous or prime duty rating", kind: "pattern", field: "rating", pattern: /continuous|prime|\bCOP\b|\bPRP\b|base ?load/i, group: "Functional",
    categories: ["gas-engine-set", "gas-turbine", "fuel-cell"], powers: ["island", "btm"],
    expect: "A plant that supplies prime power runs outside the emergency engine hour limits and must meet the requirements for non-emergency engines.", cite: CITES.cfr63 },
  { id: "transient", label: "ISO 8528-5 transient class stated", kind: "pattern", field: "standards", pattern: /8528/i, group: "Design",
    categories: ["gas-engine-set", "standby-set"], expect: "ISO 8528-5 sets classes G1 to G3 for voltage and frequency response. G3 is the most stringent of the three.", cite: CITES.iso8528 },
  { id: "ul2200", label: "UL 2200 status stated", kind: "pattern", field: "standards", pattern: /UL\s?2200/i, group: "Compliance", regions: ["US"],
    categories: ["gas-engine-set", "standby-set"], expect: "Confirm whether the set is designed to UL 2200 or listed to it. The two statements are different.", cite: CITES.guide },
  { id: "turbineAir", label: "Combustion turbine air standard", kind: "ask", group: "Compliance", regions: ["US"], categories: ["gas-turbine"],
    expect: "The federal standard at 40 CFR part 60 subpart KKKKa applies to new stationary combustion turbines. Ask for the emissions guarantee.", cite: CITES.epaTurbines },
  { id: "ul9540a", label: "UL 9540A fire test report for the exact model", kind: "pattern", field: "standards", pattern: /9540A/i, group: "Compliance",
    categories: ["battery-storage"], regions: ["US"], expect: "The 2026 edition of NFPA 855 calls for fire testing under UL 9540A. Ask for the test report for the exact model.", cite: CITES.ulEss },
  { id: "ul9540", label: "UL 9540 listing stated", kind: "pattern", field: "standards", pattern: /9540(?!A)/i, group: "Compliance",
    categories: ["battery-storage"], regions: ["US"], expect: "UL 9540 is the system safety standard that installation codes reference for energy storage.", cite: CITES.ulEss },
  { id: "euBattery", label: "EU battery passport", kind: "ask", group: "Compliance", regions: ["EU"], categories: ["battery-storage"],
    expect: "Industrial batteries above 2 kWh need a battery passport from February 18, 2027.", cite: CITES.euBattery },
  { id: "myBattery", label: "Malaysia battery storage safety guideline", kind: "ask", group: "Compliance", regions: ["MY"], categories: ["battery-storage"],
    expect: "The Energy Commission safety guideline for battery energy storage systems applies.", cite: CITES.myBattery },
  { id: "controlSecurity", label: "IEC 62443 security statement", kind: "pattern", field: "standards", pattern: /62443/i, group: "Design",
    categories: ["generator-controller", "plant-control", "ot-monitoring", "relay"], expect: "NIST Special Publication 800-82, Revision 3, guides the security of the control network. Ask the maker which IEC 62443 certificates the product holds.", cite: CITES.nist80082 },
  { id: "ul2755", label: "UL 2755 certification stated", kind: "pattern", field: "standards", pattern: /2755/i, group: "Compliance", regions: ["US"],
    categories: ["module"], expect: "UL 2755 lets a certifier evaluate a prefabricated modular data center as a single integrated product.", cite: CITES.ul2755 },
  { id: "euMachinery", label: "CE marking and the EU Machinery Regulation", kind: "pattern", field: "standards", pattern: /\bCE\b/, group: "Compliance", regions: ["EU"],
    categories: ["module", "cdu", "heat-rejection", "gas-engine-set", "standby-set"], expect: "CE marking applies in the European Union. The Machinery Regulation applies from January 20, 2027.", cite: CITES.euMachinery },
  { id: "coolant", label: "Coolant supply range covers the rack", kind: "ask", group: "Design", categories: ["cdu"],
    expect: "The NVIDIA Vera Rubin NVL72 rack accepts coolant from 17°C to 45°C. Confirm the supply temperature range and capacity of the unit.", cite: CITES.nvl72 },
  { id: "w45", label: "Heat rejection suits the coolant class", kind: "ask", group: "Design", categories: ["heat-rejection"],
    expect: "At a 45°C coolant supply, the ASHRAE W45 class lists a cooling tower as the primary heat rejection plant.", cite: CITES.ashrae },
  { id: "gwpUs", label: "Refrigerant limit in the United States", kind: "ask", group: "Compliance", regions: ["US"], categories: ["heat-rejection"],
    expect: "A global warming potential limit of 700 applies to new data center cooling equipment from January 1, 2027. Ask for the refrigerant and its value.", cite: CITES.epaGwp },
  { id: "gwpEu", label: "Refrigerant limit in the European Union", kind: "ask", group: "Compliance", regions: ["EU"], categories: ["heat-rejection"],
    expect: "Chillers above 12 kW face a global warming potential limit of 750 from January 1, 2027.", cite: CITES.euFgas },
  { id: "rackPower", label: "Rack power input matches the distribution", kind: "ask", group: "Design", categories: ["rack-platform", "gpu-server"],
    expect: "The NVIDIA Vera Rubin NVL72 rack takes power at 415 to 480 V AC. Confirm the input of the chosen platform against the site distribution voltage.", cite: CITES.nvl72 },
  { id: "passiveProof", label: "Maker, origin, and quality certificates", kind: "ask", group: "Compliance", categories: ["busway", "rack", "cable", "fiber"],
    expect: "Tier 1 items need the maker, the country of origin, quality and material certificates, and inspection on arrival.", cite: CITES.guide },
];

function criterionApplies(row, part, context) {
  const category = categoryOf(part.category);
  if (!category) return false;
  if (row.categories === "ac" && !category.ac) return false;
  if (Array.isArray(row.categories) && !row.categories.includes(category.id)) return false;
  if (row.regions && !row.regions.includes(context.region)) return false;
  if (row.powers && !row.powers.includes(context.power)) return false;
  return true;
}

// Names who stands behind a recorded value: the owning role, the maker, or another cited source.
const statedBy = (field) => field?.state === "changed"
  ? `The ${FIELD_ROLE_LABEL[field.role] || "owning"} role recorded`
  : String(field?.tier) === "4" ? "The maker states" : "The cited source states";

// Returns the most likely fit for each criterion, with the fact it rests on.
export function fitCheck(part, context = {}) {
  const ctx = { region: "US", power: "island", ...context };
  return CRITERIA.filter(row => criterionApplies(row, part, ctx)).map(row => {
    const expect = typeof row.expect === "string" ? row.expect : row.expect[ctx.region];
    const cite = row.cite?.label ? row.cite : row.cite[ctx.region];
    const out = { id: row.id, label: row.label, group: row.group, expect, cite, field: row.field || (row.kind === "frequency" ? "frequency" : row.kind === "rating" ? "rating" : "") };
    if (row.kind === "frequency") {
      const fit = frequencyFit(valueOf(part, "frequency"), ctx.region);
      return { ...out, status: fit === "fit" ? "Likely fit" : fit === "unfit" ? "Does not fit" : "Not stated", basis: fit === "unknown" ? "No recorded source states a frequency." : `${statedBy(part.fields?.frequency)} ${valueOf(part, "frequency")}.` };
    }
    if (row.kind === "rating") {
      const stated = !missing(valueOf(part, "rating"));
      return { ...out, status: stated ? "Stated" : "Not stated", basis: stated ? `${statedBy(part.fields?.rating)} ${valueOf(part, "rating")}.` : "No recorded source states a rating." };
    }
    if (row.kind === "pattern") {
      const text = valueOf(part, row.field);
      const hit = row.pattern.test(text);
      const byMaker = part.fields?.[row.field]?.state !== "changed" && String(part.fields?.[row.field]?.tier) === "4";
      return { ...out, status: hit ? (byMaker ? "Stated by the maker" : "Stated") : "Not stated", basis: hit ? `The ${row.field === "rating" ? "rating" : "standards"} field reads: ${text}.` : "No recorded source states it. Ask the supplier." };
    }
    return { ...out, status: "Ask the supplier", basis: "This point is not published at the model level. It is collected from the supplier." };
  });
}

export function fitSummary(checks) {
  if (checks.some(row => row.status === "Does not fit")) return "Does not fit";
  if (checks.some(row => ["Not stated", "Ask the supplier"].includes(row.status))) return "Fit to confirm";
  return "Likely fit";
}

// ---------- Benchmark ----------

const TRADE_RULES = ["screening", "fcc", "fccInverter", "eo", "s1260h", "chinaExport", "chips"];

// Returns an indicated posture with the reason and source for each rule, plus confidence and information requests.
// A missing fact lowers confidence and creates a request. It never raises the posture.
export function benchmark(part, catalog, context = {}) {
  const ctx = { region: "US", design: "A", power: "island", held: {}, hasAlternate: null, ...context };
  const held = ctx.held || {};
  const vendor = vendorOf(catalog, part);
  const category = categoryOf(part?.category) || {};
  const reasons = [];
  const requests = [];
  const add = (rule, level, text, cite) => reasons.push({ rule, level, text, cite });
  if (!vendor) return { posture: "Yellow", action: POSTURE_ACTION.Yellow, reasons: [{ rule: "vendor", level: "Yellow", text: "The vendor record is missing. Add the vendor before this part is used.", cite: CITES.guide }], requests: [], confidence: { confirmed: 0, sourced: 0, total: 0, label: "Pending" }, tradeFlag: false, fit: [], fitSummary: "Fit to confirm" };

  // 1. Screening list.
  const screening = valueOf(vendor, "screening");
  const detail = vendor.fields.screening?.detail || "";
  if (screening === "Match") {
    const confirmed = isConfirmed(vendor, "screening");
    const blocked = /Specially Designated Nationals/i.test(detail);
    if (confirmed && blocked) add("screening", "Red", "Trade confirmed a match on the Specially Designated Nationals list. Dealings with a blocked party are generally prohibited for US persons. Do not proceed until counsel resolves it.", CITES.csl);
    else add("screening", "Orange", `${confirmed ? "Trade confirmed a screening list match." : "The vendor or its parent has a name match on a screening list that Trade has not yet confirmed."} ${detail} Counsel states what the listing restricts before any purchase.`, CITES.csl);
  } else if (screening === "Similar name" && !isConfirmed(vendor, "screening")) {
    requests.push("Trade clears or confirms the similar name on the screening list.");
  }

  // 2. FCC Covered List, named producer.
  if (valueOf(vendor, "fccCovered") === "Named producer") {
    if (ctx.region === "US" && category.telecom) add("fcc", "Orange", "The FCC Covered List names this producer. Covered equipment cannot receive a new FCC equipment authorization. Confirm that the exact model holds an earlier authorization, or choose another maker.", CITES.fcc);
    else add("fcc", "Yellow", ctx.region === "US" ? "The FCC Covered List names this producer for telecommunications or video surveillance equipment. Confirm that this part is outside the covered equipment." : "The FCC Covered List names this producer. The list governs equipment authorized for the United States market, so it is an indicator at this site.", CITES.fcc);
  }

  // 3. FCC entry for foreign-produced power inverters.
  const inverter = valueOf(part, "fccInverter");
  if (ctx.region === "US" && inverter === "Covered") add("fccInverter", "Orange", "Trade recorded that the inverter in this part is a covered foreign-produced power inverter with no authorization or conditional approval.", CITES.fccInverter);
  else if (ctx.region === "US" && inverter === "Confirm") {
    add("fccInverter", "Yellow", "Foreign-produced power inverters are on the FCC Covered List unless they hold a conditional approval. Models authorized earlier may still be sold and used. Confirm the inverter maker and its authorization.", CITES.fccInverter);
    requests.push("Supplier names the inverter maker, the country of production, and the FCC authorization or conditional approval.");
  }

  // 4. Executive Order 14420.
  const eoType = valueOf(part, "eoType");
  const assembly = valueOf(part, "assemblyCountry");
  const linked = valueOf(vendor, "nexus126") === "Link" || Boolean(itarLink(assembly));
  if (eoType === "Determination recorded") {
    if (ctx.region === "US") add("eo", "Red", "Trade recorded a Department of Energy determination against this equipment under Executive Order 14420. Do not proceed until counsel resolves it.", CITES.eo);
    else add("eo", "Orange", "Trade recorded a Department of Energy determination against this equipment under Executive Order 14420. The order reaches transactions subject to United States jurisdiction. Counsel states whether it reaches this purchase.", CITES.eo);
  } else if (ctx.region === "US" && eoType === "Listed" && linked) {
    const protectedCase = held.disclosure && held.counsel && (held.alternate || ctx.hasAlternate);
    if (protectedCase) add("eo", "Yellow", "The equipment type is on the Executive Order 14420 list and the maker, its parent, or the factory links to a 22 CFR 126.1 country. The supplier disclosure, outside counsel's written view, and a named alternate are held.", CITES.eo);
    else add("eo", "Orange", `The equipment type is on the Executive Order 14420 list and the maker, its parent, or the factory links to a 22 CFR 126.1 country. ${ctx.power === "island" ? "The position for an islanded site is open. " : ""}Hold the supplier disclosure, outside counsel's written view, and a named alternate before purchase.`, CITES.eo);
  } else if (ctx.region === "US" && eoType === "Possible" && linked && !isConfirmed(part, "eoType")) {
    requests.push("Trade confirms whether this unit is a listed type under Executive Order 14420. Applicability can depend on voltage, capacity, connectivity, function, and operational effect.");
  }
  if (ctx.region === "US" && eoType !== "Not named" && missing(assembly)) requests.push("Supplier names the factory and country of final assembly.");

  // 5. Section 1260H.
  if (valueOf(vendor, "section1260h") === "Listed") add("s1260h", "Yellow", "The Section 1260H list names this entity or its parent. Section 805 limits Department of War contracting with listed entities. For a private owner this is an indicator to weigh with the end customer.", CITES.s1260h);

  // 6. Chinese export controls.
  const china = valueOf(part, "chinaExport");
  if (china === "Exposed") add("chinaExport", "Yellow", "Trade recorded that the part or its materials need a Chinese export license. Supply can stop when a license is refused or a suspension ends. Hold stock or qualify a source outside China.", CITES.mofcom58);
  else if (china === "Not assessed" && category.tier !== 1) requests.push("Supplier states which parts or materials ship from China and whether a Chinese export license applies.");

  // 7. US chip export rules.
  if (valueOf(part, "chipControl") === "Relevant") {
    if (ctx.design === "C") add("chips", held.license ? "Yellow" : "Orange", held.license ? "The site is in a destination that needs a United States license for AI chips. The license or the exception is recorded for this line." : "The site is in a destination that needs a United States license for AI chips. Record the license, or the exception for companies headquartered in the United States with monthly reports, before shipment.", CITES.bisRemote);
    else if (ctx.design === "B") add("chips", "Yellow", "A multi-tenant site needs tenant screening and a ledger of who uses how much compute. A license is required above the tenant threshold in the remote access rule.", CITES.bisRemote);
  }

  // 8. Tier 3 connected device.
  const tier = valueOf(part, "deviceTier");
  if (tier === "Tier 3" && !held.protections) add("tier3", "Yellow", "This is a Tier 3 device. It needs ownership screened to the ultimate parent, a software list and signed firmware, a firmware reload with factory logins removed, and approved, logged remote access.", CITES.guide);
  else if (tier === "Tier 2" && !held.protections) requests.push("Confirm the firmware version, that no radio is fitted, and that unused ports are sealed.");

  // 9. Alternate source.
  if (ctx.hasAlternate === false) add("alternate", "Yellow", "No alternate from a different ultimate parent is named. Qualify a second source before the first order.", CITES.guide);

  // Ownership facts that every rule above depends on.
  if (missing(valueOf(vendor, "ultimateParent"))) requests.push("Supplier states the ownership chain to the ultimate parent company.");
  if (missing(valueOf(vendor, "hqCountry"))) requests.push("Confirm the headquarters country of the vendor.");

  // An open recheck is a request to the owning role. It does not move the posture.
  for (const row of [...(vendor.recheck || []), ...(part.recheck || [])]) {
    requests.push(`${FIELD_ROLE_LABEL[row.role] || "Trade"} rechecks this entry after a change: ${row.title}`);
  }

  const relevant = [
    [vendor, "hqCountry"], [vendor, "ultimateParent"], [vendor, "parentCountry"], [vendor, "screening"], [vendor, "section1260h"], [vendor, "nexus126"],
    ...(category.telecom || valueOf(vendor, "fccCovered") === "Named producer" ? [[vendor, "fccCovered"]] : []),
    [part, "deviceTier"], [part, "assemblyCountry"],
    ...(eoType !== "Not named" ? [[part, "eoType"]] : []),
    ...(category.inverter ? [[part, "fccInverter"]] : []),
    ...(category.chips ? [[part, "chipControl"]] : []),
    ...(category.tier !== 1 ? [[part, "chinaExport"]] : []),
  ];
  const confirmed = relevant.filter(([entry, id]) => isConfirmed(entry, id)).length;
  const sourced = relevant.filter(([entry, id]) => !missing(valueOf(entry, id))).length;
  const share = relevant.length ? confirmed / relevant.length : 0;
  const label = confirmed === 0 ? "Pending" : share >= 0.8 && sourced === relevant.length ? "High" : share >= 0.5 ? "Medium" : "Low";
  const posture = worst(reasons.map(row => row.level));
  const fit = fitCheck(part, ctx);
  return {
    posture, action: POSTURE_ACTION[posture], reasons, requests: [...new Set(requests)],
    confidence: { confirmed, sourced, total: relevant.length, label },
    tradeFlag: reasons.some(row => TRADE_RULES.includes(row.rule)), fit, fitSummary: fitSummary(fit),
  };
}

// Ranks alternates from the same category that sit under a different ultimate parent.
export function alternates(part, catalog, context = {}, limit = 5) {
  const vendor = vendorOf(catalog, part);
  if (!part || !vendor) return [];
  const own = parentKey(vendor);
  const confidenceRank = { High: 0, Medium: 1, Low: 2, Pending: 3 };
  const fitRank = { "Likely fit": 0, "Fit to confirm": 1, "Does not fit": 2 };
  return catalog.parts
    .filter(row => row.id !== part.id && row.category === part.category)
    .map(row => ({ part: row, vendor: vendorOf(catalog, row) }))
    .filter(row => row.vendor && parentKey(row.vendor) !== own)
    .map(row => ({ ...row, result: benchmark(row.part, catalog, { ...context, hasAlternate: null }), recheck: (row.part.recheck || []).length + (row.vendor.recheck || []).length }))
    .filter(row => row.result.posture !== "Red" && row.result.fitSummary !== "Does not fit")
    .sort((a, b) => rank(a.result.posture) - rank(b.result.posture)
      || Math.sign(a.recheck) - Math.sign(b.recheck)
      || a.result.reasons.length - b.result.reasons.length
      || fitRank[a.result.fitSummary] - fitRank[b.result.fitSummary]
      || confidenceRank[a.result.confidence.label] - confidenceRank[b.result.confidence.label]
      || b.result.confidence.sourced - a.result.confidence.sourced
      || a.vendor.name.localeCompare(b.vendor.name))
    .slice(0, limit);
}

// ---------- Watch scope ----------

export const WATCH_TOPICS = [
  { id: "eo14420", label: "Executive Order 14420 and DOE action", role: "trade", pattern: /bulk[- ]power|1442[01]/i,
    help: "The program refers to this order as Executive Order 14420 and cites it as 91 FR 55995. The Federal Register and most press items number it 14421, so the watch matches both numbers." },
  { id: "chips", label: "US chip export rules", role: "trade", pattern: /advanced computing|semiconductor|remote access|integrated circuit|AI chip|artificial intelligence chip|AI diffusion/i },
  { id: "entity-list", label: "Entity List and end-user controls", role: "trade", pattern: /entity list|unverified list|military end[- ]user|affiliates rule|end[- ]user control/i },
  { id: "fcc", label: "FCC Covered List", role: "trade", pattern: /covered list|equipment authorization/i },
  { id: "1260h", label: "Section 1260H list", role: "trade", pattern: /1260H|chinese military compan/i },
  { id: "china-export", label: "Chinese export controls", role: "trade", pattern: /MOFCOM|ministry of commerce|rare earth|gallium|germanium|graphite|antimony|export control law|unreliable entity/i },
  { id: "itar126", label: "22 CFR 126.1 country list", role: "trade", pattern: /126\.1|arms embargo|prohibited exports, imports,? and sales|polic(?:y|ies) of denial|country policy/i },
  { id: "ics", label: "Control system security advisories", role: "cpi", pattern: /\bICSA-\d|industrial control system/i },
  { id: "grid", label: "Grid, large load, and reliability rules", role: "cpi", pattern: /large load|co-?location|behind[- ]the[- ]meter|comput(?:ing|ational) load|\bNERC\b|RM26-4/i },
  { id: "policy", label: "Other executive and legislative action", role: "trade", fallback: true, pattern: /data cent(?:er|re)|export control|supply chain|critical infrastructure|artificial intelligence|super ?intelligence|semiconductor/i },
];
export const topicOf = (id) => WATCH_TOPICS.find(row => row.id === id) || null;
// The fallback topic applies only when no specific topic matches.
export function classifyTopics(text) {
  const value = String(text || "");
  const specific = WATCH_TOPICS.filter(row => !row.fallback && row.pattern.test(value)).map(row => row.id);
  if (specific.length) return specific;
  return WATCH_TOPICS.filter(row => row.fallback && row.pattern.test(value)).map(row => row.id);
}

// True when the needle stands in the text as a whole word.
function standsAlone(hay, needle) {
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? " " : hay[at - 1];
    const after = at + needle.length >= hay.length ? " " : hay[at + needle.length];
    if (!/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after)) return true;
    from = at + 1;
  }
}
// The names of one vendor that a text contains, without the legal form. Short names must match with their exact capitals.
function namesFound(raw, lower, vendor) {
  return [vendor.name, ...(vendor.names || [])]
    .map(name => clean(name, 120).replace(/,?\s+(Inc\.?|Corp\.?|Corporation|Co\.,? Ltd\.?|Ltd\.?|Limited|plc|AG|SE|S\.A\.|GmbH|LLC|Company)$/i, "").trim())
    .filter(clip => clip.length >= 3 && (clip.length <= 5 ? standsAlone(raw, clip) : standsAlone(lower, clip.toLowerCase())));
}

// Vendors named in a text.
export function vendorsNamed(text, vendors) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  return vendors.filter(vendor => namesFound(raw, lower, vendor).length).map(vendor => vendor.id);
}

const onAList = (vendor) => valueOf(vendor, "screening") === "Match" || valueOf(vendor, "fccCovered") === "Named producer"
  || valueOf(vendor, "section1260h") === "Listed" || valueOf(vendor, "nexus126") === "Link";

// Vendors that a text names clearly. A one-word name can also be a surname or a common word, as in a bill named after a person.
// It counts on its own only for a vendor that carries a list entry or a 22 CFR 126.1 country link. A name of two or more words always counts.
export function vendorsNamedClearly(text, vendors) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  return vendors.filter(vendor => {
    const found = namesFound(raw, lower, vendor);
    return found.some(name => /\s/.test(name)) || (found.length > 0 && onAList(vendor));
  }).map(vendor => vendor.id);
}

// Entries a material change touches. Narrow by default. Broad adds every part of the affected type.
export function affectedEntries(catalog, { topics = [], vendors = [], broad = false } = {}) {
  const vendorIds = new Set(vendors.filter(id => catalog.vendors.some(row => row.id === id)));
  const partIds = new Set();
  const has = (id) => topics.includes(id);
  for (const vendor of catalog.vendors) {
    if (has("fcc") && valueOf(vendor, "fccCovered") === "Named producer") vendorIds.add(vendor.id);
    if (has("1260h") && valueOf(vendor, "section1260h") === "Listed") vendorIds.add(vendor.id);
    if (has("entity-list") && valueOf(vendor, "screening") !== "No match") vendorIds.add(vendor.id);
    if (has("itar126") && (valueOf(vendor, "nexus126") === "Link" || broad)) vendorIds.add(vendor.id);
    if (has("china-export") && [valueOf(vendor, "hqCountry"), valueOf(vendor, "parentCountry")].includes("CN")) vendorIds.add(vendor.id);
  }
  for (const part of catalog.parts) {
    const vendor = vendorOf(catalog, part);
    const category = categoryOf(part.category) || {};
    if (vendors.includes(part.vendor)) partIds.add(part.id);
    if (has("eo14420") && valueOf(part, "eoType") !== "Not named" && (broad || valueOf(vendor, "nexus126") === "Link" || itarLink(valueOf(part, "assemblyCountry")))) partIds.add(part.id);
    if (has("chips") && valueOf(part, "chipControl") === "Relevant") partIds.add(part.id);
    if (has("fcc") && (valueOf(part, "fccInverter") !== "Not applicable" || (category.telecom && (broad || vendorIds.has(part.vendor))))) partIds.add(part.id);
    if (has("china-export") && (valueOf(part, "chinaExport") === "Exposed" || (broad && category.tier !== 1))) partIds.add(part.id);
    if (has("ics") && vendors.includes(part.vendor) && valueOf(part, "deviceTier") === "Tier 3") partIds.add(part.id);
    if ((has("1260h") || has("entity-list") || has("itar126")) && vendorIds.has(part.vendor)) partIds.add(part.id);
  }
  return { vendors: [...vendorIds], parts: [...partIds] };
}

// ---------- Field changes and new entries ----------

// Validates one confirm or change request against the field definition and the acting role.
export function fieldChangeBlock(kind, fieldId, input, role) {
  const def = fieldDef(kind, fieldId);
  if (!def) return "Choose a field that belongs to this record.";
  if (role !== def.owner) return `Only the ${FIELD_ROLE_LABEL[def.owner]} role confirms or changes this field: ${def.label}.`;
  if (!["confirm", "change", "reset"].includes(input?.action)) return "Choose Confirm, Change, or Reset.";
  if (input.action !== "change") return "";
  const value = clean(input.value, 400);
  if (!value) return "Enter the new value.";
  if (def.options && !def.options.includes(value)) return `Choose one of: ${def.options.join(", ")}.`;
  if (def.country && !/^[A-Z]{2}$/.test(value) && value !== "n.a.") return "Use a two-letter country code, or n.a. when the country is not yet disclosed.";
  if (clean(input.reason, 600).length < 8) return "State the reason for the change in a full sentence.";
  if (input.sourceUrl && !safeUrl(input.sourceUrl)) return "Use an HTTP or HTTPS source address without credentials.";
  return "";
}

// The domain of a vendor website, or an empty string when the text is not a plain web address.
export function siteDomain(value) {
  const host = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, "");
  return /^(?=.{4,160}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : "";
}

export function newEntryBlock(kind, input, catalog) {
  const name = clean(kind === "vendor" ? input?.legalName : input?.model, 160);
  if (name.length < 2) return kind === "vendor" ? "Enter the vendor's legal name." : "Enter the model as the maker writes it.";
  if (kind === "vendor" && String(input?.website || "").trim() && !siteDomain(input.website)) return "Write the website as a domain name, such as example.com.";
  if (kind === "part") {
    if (!catalog.vendors.some(row => row.id === input.vendor)) return "Choose the vendor that makes this part. Add the vendor first when it is new.";
    if (!categoryOf(input.category)) return "Choose the part category.";
    if (input.sourceUrl && !safeUrl(input.sourceUrl)) return "Use an HTTP or HTTPS address for the maker's product page.";
  }
  const id = kind === "vendor" ? entryId(name) : entryId(`${input.vendor}-${name}`);
  if (!id) return "Use letters or numbers in the name.";
  // The same vendor or model written another way is the same entry. Legal forms, case, spacing, and punctuation are ignored.
  const core = coreName(name);
  const compact = (value) => entryId(value).replace(/-/g, "");
  const same = kind === "vendor"
    ? catalog.vendors.find(row => row.id === id || (core && [row.name, valueOf(row, "legalName")].some(text => coreName(text) === core)))
    : catalog.parts.find(row => row.id === id || (row.vendor === input.vendor && [row.name, valueOf(row, "model")].some(text => compact(text) === compact(name))));
  if (same) return `This ${kind} is already in the repository as ${same.name}. Open it and confirm or change its fields.`;
  return "";
}
