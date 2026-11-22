// Program guide model: design basis, reference designs, gates, sourcing lines, and portfolio rows.
// The content follows the program design, sourcing, and power guide. Rule dates are public and cited.
// Project dates and decisions are entered per project and stored with their history.

import {
  CITES, REGIONS, SUBSYSTEMS, VENDOR_FIELDS, PART_FIELDS, benchmark, categoryOf, subsystemOf, clean, parentKey, programDay, vendorOf,
} from "./catalog-model.js";

export const GUIDE_CITES = {
  ferc: { label: "FERC, Docket RM26-4 page", url: "https://www.ferc.gov/rm26-4" },
  fercNews: { label: "FERC, news release on large-load actions", url: "https://www.ferc.gov/news-events/news/ferc-launches-aggressive-targeted-action-speed-large-load-integration" },
  fercOrder: { label: "FERC order, Docket RD26-7-000", url: "https://www.ferc.gov/sites/default/files/2026-07/RD26-7-000.pdf" },
  fpa: { label: "Federal Power Act, 16 U.S.C. 824", url: "https://uscode.house.gov/us/usc/t16/s824/" },
  nercPlan: { label: "NERC, Large Loads Action Plan update", url: "https://www.nerc.com/globalassets/initiatives/large-loads-action-plan/llap-quarterly-update-q3-2026.pdf" },
  nercClo: { label: "NERC, proposed standard CLO-001-1", url: "https://www.nerc.com/standards/reliability-standards/clo/clo-001-1" },
  nercDraft: { label: "NERC, draft data request for computational load sites", url: "https://www.nerc.com/globalassets/programs/rapa/section-1600-data-requests/draft_section-1600-dr_computational-load-sites_20261030.pdf" },
  nercInsights: { label: "NERC, Reliability Insights on large computational loads", url: "https://www.nerc.com/globalassets/who-we-are/news/2026/09/reliability-insights_large-computational-load-risks-due-to-voltage-sensitivity.pdf" },
  epaIsland: { label: "EPA, memorandum on islanded power generators", url: "https://www.epa.gov/system/files/documents/2026-07/epa-issues-clarification-on-islanded-power-generators-and-acid-rain-program-provisions.pdf" },
  lenovoNvl72: { label: "Lenovo Press, NVIDIA Vera Rubin NVL72 product guide", url: "https://lenovopress.lenovo.com/lp2527-lenovo-nvidia-vera-rubin-nvl72" },
  amdHelios: { label: "AMD, Helios product page", url: "https://www.amd.com/en/products/rackscale-solutions/helios.html" },
  mi355x: { label: "GIGABYTE, liquid-cooled rack for AMD Instinct MI355X", url: "https://www.gigabyte.com/us/Enterprise/GIGAPOD-Rack-Scale/AI-DLC-Rack_AMD-Instinct-MI355X" },
  myInstall: { label: "Energy Commission of Malaysia, installation registration", url: "https://www.st.gov.my/stakeholders/electricity/installation" },
  myLicence: { label: "Energy Commission of Malaysia, guidelines on licence application", url: "https://st.gov.my/sites/default/files/2026-02/GUIDELINES-ON-LICENCE-APPLICATION.pdf" },
  myDataCentre: { label: "Malaysia MITI, sustainable data centre guidelines", url: "https://www.miti.gov.my/miti/resources/Media%20Release/Final_Guidelines_for_Sustainable_Data_Centre.pdf" },
  myPress: { label: "The Star, report on data center power supply (press lead)", url: "https://www.thestar.com.my/business/business-news/2026/10/20/gas-and-turbine-shortage-damper-for-dc-power-plan" },
  euMcp: { label: "Directive (EU) 2015/2193 on medium combustion plants", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015L2193" },
  euEts: { label: "Directive 2003/87/EC, Annex I", url: "https://eur-lex.europa.eu/eli/dir/2003/87/2024-03-01/eng" },
  eirgrid: { label: "EirGrid, Data Centre Connection Offer Process and Policy", url: "https://www.eirgrid.ie/sites/default/files/publications/Data-Centre-Connection-Offer-Process-and-Policy-V3-May-2026.pdf" },
  enefg: { label: "German Energy Efficiency Act, section 11", url: "https://www.gesetze-im-internet.de/enefg/__11.html" },
  uae: { label: "BIS rule on advanced computing items for the United Arab Emirates", url: "https://www.federalregister.gov/documents/full_text/html/2026/07/14/2026-14132.html" },
};
const G = GUIDE_CITES;

// ---------- Design basis ----------

export const TENANCY = [
  { id: "private", label: "Private: one known user", sets: "One known user makes screening simple. Confirm the end customer's headquarters and ultimate parent company in writing before the design basis is frozen." },
  { id: "multi", label: "Multi-tenant: many users", sets: "A multi-tenant site needs tenant screening and a ledger of who uses how much compute." },
];
export const POWER = [
  { id: "island", label: "Islanded on-site plant", short: "Islanded", sets: "Gas engines and batteries on the site supply all power, and no wire runs to the utility grid." },
  { id: "btm", label: "On-site plant with a grid tie", short: "Behind the meter, grid-tied", sets: "An on-site plant runs behind the utility meter and the site keeps a utility connection." },
  { id: "grid", label: "Grid supply with backup", short: "Grid-fed with backup", sets: "The utility supplies the site and generators run for emergencies only." },
];
export const PLATFORMS = [
  { id: "nvl72", label: "NVIDIA Vera Rubin NVL72", facts: "Each rack holds 72 GPUs, is liquid cooled, and takes power at 415 to 480 V AC. One rack gives off about 227 kW of heat, and about 96% of that heat leaves through liquid. The rack accepts coolant from 17°C to 45°C.", cites: [CITES.nvl72, G.lenovoNvl72] },
  { id: "helios", label: "AMD Helios reference design", facts: "Helios is a rack-scale reference design with 72 GPUs.", cites: [G.amdHelios] },
  { id: "mi355x", label: "AMD Instinct MI355X servers", facts: "One MI355X rack product holds 64 GPUs, draws up to 120 kW, and takes a 415 V input.", cites: [G.mi355x] },
  { id: "other", label: "Another platform", facts: "Size power and cooling for the densest rack the site may host. Keep busway and coolant manifolds accessible so that a later platform can be fitted.", cites: [] },
];
export const CUSTOMER = [
  { id: "open", label: "Not yet confirmed in writing" },
  { id: "us", label: "United States headquarters and ultimate parent, confirmed in writing" },
  { id: "other", label: "Headquarters or ultimate parent outside the United States, confirmed in writing" },
];

export const REFERENCE_DESIGNS = {
  A: { id: "A", label: "Private single-user site", fit: "One known user in the United States or Europe.", moves: "Islanded power where allowed. No vendor cloud links. Firmware reloaded before use.", watch: "The parent chain of the owner and the user." },
  B: { id: "B", label: "Allied multi-tenant site", fit: "Many users in the United States, Europe, or approved entities in the United Arab Emirates.", moves: "Tenant screening before access. A compute ledger across linked sites. Logged access.", watch: "Tenant changes and moves of compute between tenants." },
  C: { id: "C", label: "Licensed high-scrutiny site", fit: "Malaysia and other destinations that need a United States chip license.", moves: "Licenses and permits first. Location and attestation evidence. Chain of custody.", watch: "Monthly reports and diversion red flags." },
};

// A destination that needs a United States chip license leads to Design C. Many users lead to Design B.
export function referenceDesign(basis) {
  if (basis?.region === "MY") return "C";
  return basis?.tenancy === "multi" ? "B" : "A";
}

export const CORE_DESIGN = [
  "Factory-built modules with one layout",
  "Liquid cooling to every rack",
  "Generator blocks with spare units",
  "Battery buffer for fast load swings",
  "Controls held by the owner, with no supplier remote access",
  "Origin and ownership records for every smart device",
];

export const BUILDING_BLOCKS = [
  { id: "fuel", label: "Fuel supply", design: "Gas demand, delivery pressure, and an outage plan", source: "Firm gas transport and metering", prove: "Pipeline approval and a pressure test" },
  { id: "generation", label: "Power generation", design: "Unit count, spare units, and output on the hottest design day", source: "Generator sets, engines, alternators, and controllers", prove: "Factory load test and the air permit", subsystems: ["generator", "controls"] },
  { id: "storage", label: "Battery storage", design: "Size for the fastest load step", source: "Cells, inverters, and management software", prove: "Fire test report and spacing agreed with the fire official", subsystems: ["battery"] },
  { id: "distribution", label: "Electrical distribution", design: "Voltage, fault levels, and protection", source: "Switchgear, relays, transformers, uninterruptible power supply units, and busway", prove: "Signed studies and tested protection settings", subsystems: ["switchgear", "passive"] },
  { id: "compute", label: "Compute hall", design: "Rack density and layout", source: "Factory-built modules and GPU racks", prove: "Product certification and factory test records", subsystems: ["modules", "gpu"] },
  { id: "cooling", label: "Cooling", design: "Coolant temperature and heat rejection", source: "Coolant distribution units, pumps, and coolers", prove: "Flow test and a refrigerant check", subsystems: ["modules"] },
  { id: "network", label: "Network and security", design: "Separate networks for tenants, controls, and security", source: "Switches, firewalls, and cameras", prove: "Configuration held by the owner", subsystems: ["network"] },
  { id: "controls", label: "Controls and remote access", design: "One plant controller and one approved access path", source: "Controllers and monitoring software", prove: "Owner-held credentials and logged access", subsystems: ["controls"] },
  { id: "site", label: "Site and approvals", design: "A site plan with room for a future substation", source: "Land, zoning, and permits", prove: "Approvals in hand before installation" },
];

// Rules for each power arrangement. Each cell states the rule and names its source.
export const POWER_RULES = [
  { id: "federal", label: "Federal power law",
    grid: { text: "A utility tariff governs service. FERC rulemaking docket RM26-4 on large loads remains open.", cite: G.ferc },
    btm: { text: "FERC lists co-location agreements and behind-the-meter generation among its reform categories. Final terms for this arrangement are not set.", cite: G.fercNews },
    island: { text: "The Federal Power Act covers interstate transmission and wholesale sales. Outside counsel confirms how a power sale from a third-party plant owner to the site is treated.", cite: G.fpa } },
  { id: "reliability", label: "Grid reliability",
    grid: { text: "NERC proposes to register sites with 50 MW or more of computing load connected at 100 kV or above.", cite: G.nercPlan },
    btm: { text: "The same threshold applies. NERC filed three proposed standards, CLO-001-1, CLO-002-1, and CLO-003-1, with FERC on November 16, 2026. They await approval.", cite: G.nercClo },
    island: { text: "The NERC draft data request covers sites supplied through equipment connected to the bulk power system. The draft does not address a site with no utility connection.", cite: G.nercDraft } },
  { id: "eo", label: "Executive Order 14420",
    grid: { text: "The order lists battery energy storage systems, uninterruptible power supply systems supporting critical infrastructure, generators, protective relaying, high voltage circuit breakers, substation transformers, and industrial control systems. Its bulk-power system includes transmission lines of 69 kV or more and excludes local distribution.", cite: CITES.eo },
    btm: { text: "The same list applies. DOE says applicability may depend on the voltage, capacity, connectivity, function, and operational effect of the equipment.", cite: CITES.doeFaq },
    island: { text: "The position is open. DOE says its answers create no new legal requirements, and they do not address an islanded site. Outside counsel gives the written view.", cite: CITES.doeFaq } },
  { id: "air", label: "Air permits",
    grid: { text: "An emergency engine may run up to 100 hours per calendar year for maintenance and testing. Up to 50 of those hours may be non-emergency use.", cite: CITES.cfr63 },
    btm: { text: "An engine that supplies prime power runs outside those limits. It must meet all requirements for non-emergency engines.", cite: CITES.cfr63 },
    island: { text: "The prime power requirements apply. EPA stated on July 16, 2026 that its Acid Rain Program does not apply to generation that is not connected in any way to the larger grid. A later grid connection may bring that program in.", cite: G.epaIsland } },
  { id: "contracts", label: "Supply contracts",
    grid: { text: "The utility tariff sets minimum demand, contract term, collateral, and exit fees. Read the large-load tariff of the serving utility.", cite: CITES.guide },
    btm: { text: "Utility terms apply to the grid share. A gas supply contract covers the plant.", cite: CITES.guide },
    island: { text: "No utility contract applies. The gas supply contract and the power contract carry the full supply risk.", cite: CITES.guide } },
  { id: "state", label: "State and local approval",
    grid: { text: "Confirm the state siting threshold for transmission lines and the zoning status of the site.", cite: CITES.guide },
    btm: { text: "Confirm the state siting thresholds for generating plants and gas pipelines and the zoning status of the site.", cite: CITES.guide },
    island: { text: "Confirm the state siting thresholds for generating plants and gas pipelines, whether state law recognizes a self-power system, and the zoning status of the site.", cite: CITES.guide } },
];

export const CONSIDERATIONS = [
  { id: "stability", label: "Stability without the grid", why: "NERC reports a July 2024 event in which 1,500 MW of computing load dropped off the grid. An islanded plant must ride through load swings of that kind without tripping.", require: "Require a dynamic study and a witnessed load-step test before acceptance.", cite: G.nercInsights },
  { id: "transient", label: "Voltage and frequency class", why: "ISO 8528-5 sets classes G1 to G3 for voltage and frequency response. G3 is the most stringent of the three.", require: "Ask the supplier to list each exception and to state the class the whole plant meets with its batteries.", cite: CITES.iso8528 },
  { id: "spares", label: "Spare units", why: "The unit count must carry the design load on the hottest design day and still leave spare units.", require: "Ask for the design load, the unit output on the hottest design day, and the spare count.", cite: CITES.guide },
  { id: "fault", label: "Fault protection", why: "Many generators on one bus add to the fault current that breakers must interrupt.", require: "Require short-circuit, protection coordination, and arc-flash studies signed by the engineer of record.", cite: CITES.guide },
  { id: "fuel", label: "Fuel supply", why: "A site that relies on a single pipeline has no backup if that pipeline fails.", require: "Require firm gas transport, a delivery pressure guarantee, and a written plan for a pipeline outage.", cite: CITES.guide },
  { id: "battery", label: "Battery safety", why: "The 2026 edition of NFPA 855 calls for fire testing under UL 9540A and large-scale fire testing in certain situations.", require: "Ask for the test report for the exact battery model. Agree container spacing with the local fire official.", cite: CITES.ulEss },
  { id: "air", label: "Air permit", why: "A plant that runs all year is prime power and must meet the non-emergency engine requirements.", require: "Check the stated emissions level against the permit limit.", cite: CITES.epaEngines },
  { id: "cooling", label: "Cooling", why: "The densest rack sets the coolant temperature and the heat rejection plant. In the United States, a global warming potential limit of 700 applies to new data center cooling equipment from January 1, 2027.", require: "Size heat rejection for the coolant class, check the refrigerant, and put cooling pumps and fans on protected power.", cite: CITES.epaGwp },
  { id: "controls", label: "Controls and remote access", why: "The party that controls the controllers controls the power.", require: "Confirm the controller model, give the owner the administrator credentials, and keep remote access off by default. Follow NIST Special Publication 800-82, Revision 3, for the control network.", cite: CITES.nist80082 },
  { id: "local", label: "Local approval", why: "A local moratorium or a zoning limit can stop a site that meets every technical requirement.", require: "Confirm the zoning status of the site and engage the local authority early.", cite: CITES.guide },
];
export const DESIGN_RULE = "Build the plant so the owner can prove three things on any day. The power arrangement matches the design basis. The owner controls every login. Each smart device has a known maker, parent company, and firmware version.";
export const CONSIDERATION_STATES = ["Open", "In progress", "Addressed", "Not applicable"];

export const REGIONAL_KITS = {
  US: { label: "United States", power: "60 Hz power", rows: [
    { topic: "Power system", text: "Supply is 60 Hz. Confirm the distribution voltage in the design basis.", cites: [CITES.guide] },
    { topic: "Product approval", text: "UL 2755 certification and National Electrical Code Article 646 apply to a prefabricated modular data center.", cites: [CITES.ul2755] },
    { topic: "Plant approval", text: "A state siting certificate where the state requires one, a state air permit, and the federal engine rules.", cites: [CITES.epaEngines] },
    { topic: "Grid and supply", text: "An islanded site makes no interconnection request. Check equipment against Executive Order 14420 and track any DOE rule.", cites: [CITES.eo, CITES.doeStatus] },
    { topic: "Environment", text: "A refrigerant global warming potential limit of 700 applies to new data center cooling equipment from January 1, 2027.", cites: [CITES.epaGwp] },
    { topic: "Chips and trade", text: "The remote access rule applies to data centers in any destination. Screen who uses the compute.", cites: [CITES.bisRemote] },
  ] },
  MY: { label: "Malaysia", power: "50 Hz power, 400 V", rows: [
    { topic: "Power system", text: "Supply is 230/400 V at 50 Hz. Ask the supplier for a 50 Hz rating.", cites: [CITES.myFrequency] },
    { topic: "Product approval", text: "The installation is registered with the Energy Commission. A locally registered Professional Engineer submits the plans.", cites: [G.myInstall] },
    { topic: "Plant approval", text: "Generation that a third party sells to the site under a power purchase agreement is a public installation and needs a license. The Minister approves installations of 30 MW and above. Apply four months before operation.", cites: [G.myLicence] },
    { topic: "Grid and supply", text: "Press reports say award letters for new data centers require an off-grid energy supply and that a 30% renewable energy requirement applies. Confirm both with the regulator.", cites: [G.myPress] },
    { topic: "Environment", text: "The national guideline sets a design PUE of 1.4 and below for hyperscale sites and a recommended design WUE of 2.2 m3/MWh or lower. The battery storage safety guideline applies.", cites: [G.myDataCentre, CITES.myBattery] },
    { topic: "Chips and trade", text: "A United States license is required for AI chips sent to Malaysia. An exception covers companies headquartered in the United States when the exporter files monthly reports under 15 CFR 743.10. Malaysia has required a Strategic Trade Permit to export, transship, or transit AI chips of United States origin since July 14, 2025.", cites: [CITES.bisRemote, CITES.mitiChips] },
  ] },
  EU: { label: "European Union", power: "50 Hz power", rows: [
    { topic: "Power system", text: "Supply is 50 Hz. Ask the supplier for a 50 Hz rating and confirm the national supply voltage.", cites: [CITES.euFrequency] },
    { topic: "Product approval", text: "CE marking applies. The Machinery Regulation applies from January 20, 2027.", cites: [CITES.euMachinery] },
    { topic: "Plant approval", text: "A combustion plant with 1 MW to under 50 MW of thermal input needs a permit or registration. The EU carbon market applies above 20 MW of total thermal input, and units under 3 MW are not counted.", cites: [G.euMcp, G.euEts] },
    { topic: "Grid and supply", text: "Rules vary by country. Ireland requires a new data center of 10 MVA or more to bring dispatchable generation or storage equal to 100% of its import capacity. Germany requires a PUE of 1.2 or less for sites that start operating from July 1, 2026.", cites: [G.eirgrid, G.enefg] },
    { topic: "Environment", text: "Chillers above 12 kW face a refrigerant global warming potential limit of 750 from January 1, 2027. Industrial batteries above 2 kWh need a battery passport from February 18, 2027.", cites: [CITES.euFgas, CITES.euBattery] },
    { topic: "Chips and trade", text: "The tenant threshold in the remote access rule applies in every country. Confirm the license position for the chosen country with outside counsel.", cites: [CITES.bisRemote] },
  ] },
};

export const DEVICE_TIERS = [
  { id: "Tier 1", label: "Passive", what: "No processor, no firmware, and no way to communicate.", examples: "Cables, busbars, racks, pipes, enclosures, and mechanical breakers.", proof: ["Maker and country of origin", "Quality and material certificates", "Inspection on arrival"] },
  { id: "Tier 2", label: "Embedded, offline", what: "Has a processor or firmware but no active network link.", examples: "Electronic breaker trip units, standalone pump drives, and sealed battery controllers.", proof: ["Maker, owner, and firmware version", "Confirmation that no radio is fitted", "Unused ports sealed and rechecked"] },
  { id: "Tier 3", label: "Smart, connected", what: "Runs firmware and can communicate, or has a slot built for a network card.", examples: "Generator and plant controllers, battery inverters, UPS units, networked relays, GPU servers, and switches.", proof: ["Ownership screened to the ultimate parent", "Software list and signed firmware", "Firmware reloaded, factory logins removed", "Remote access approved and logged"] },
];
export const TIER_RULE = "A device moves to Tier 3 the moment anyone adds a network link. Treat any device with a processor as Tier 2 or higher until it has been opened or tested.";

export const CONTRACT_TERMS = [
  { id: "disclosure", label: "Disclosure", text: "The supplier names the maker, factory, and ultimate parent company of every Tier 2 and Tier 3 device and updates the list when anything changes." },
  { id: "binding", label: "Binding performance", text: "The performance values and the scope of supply are written into the purchase agreement." },
  { id: "witness", label: "Witness and baseline rights", text: "The owner may witness factory tests and record the firmware version of each device before shipment." },
  { id: "firmware", label: "Firmware and access", text: "The supplier delivers signed firmware images to the owner, removes factory logins, and obtains owner approval for each remote session." },
  { id: "substitution", label: "No silent substitution", text: "A change of maker, factory, engine variant, or controller needs the owner's written consent." },
  { id: "regulatory", label: "Regulatory change", text: "Any compliance certificate identifies Executive Order 14420 by its Federal Register citation, 91 FR 55995. The owner may replace equipment or exit if DOE prohibits a device." },
  { id: "flowdown", label: "Operator flow-down", text: "Under a power purchase agreement, the same terms bind the company that operates the plant." },
];
export const TERM_STATES = ["Open", "Agreed", "Not applicable"];

export const STOP_SIGNS = [
  { id: "factory", text: "A supplier will not name a factory or a parent company." },
  { id: "radio", text: "A device has a radio, modem, or cloud link that its documents do not show." },
  { id: "firmware", text: "Firmware cannot be reloaded or checked against the owner's image." },
  { id: "seal", text: "A shipment arrives with a broken seal that no one can explain." },
  { id: "variant", text: "An engine variant or controller changes without notice." },
];

export const DELIVERY_ROLES = [
  { group: "Owner", roles: [{ label: "Owner", does: "Sets requirements and holds every approval." }] },
  { group: "Independent checks", note: "Report only to the owner and hold no stake in delivery.", roles: [
    { label: "Owner's engineer", does: "Reviews the design and witnesses factory and site tests." },
    { label: "Commissioning agent", does: "Proves that the site works before handover." },
    { label: "Outside counsel", does: "Advises on the executive order, permits, and contracts." },
    { label: "Compliance assurance", does: "Checks origin, ownership, and gate evidence." },
  ] },
  { group: "Delivery", note: "Under contract to the owner to design, supply, and build.", roles: [
    { label: "Build manager", does: "Runs design, purchasing, and construction with the module supplier, the engineer of record, and the site contractor." },
    { label: "Power supplier", does: "Builds and runs the on-site plant with the generator maker, the battery supplier, and the gas supplier." },
    { label: "Engineer of record", does: "Signs the drawings and the electrical studies." },
  ] },
];
export const SELECTION_CRITERIA = [
  { id: "experience", label: "Experience", text: "Completed designs for liquid-cooled halls above 100 kW per rack and for on-site gas plants with battery storage." },
  { id: "license", label: "License", text: "A licensed engineer who can sign the drawings and studies in the state or country of the site." },
  { id: "independence", label: "Independence", text: "A written statement of any financial tie to the build manager, the power supplier, or an equipment maker." },
  { id: "security", label: "Security", text: "Acceptance of owner-held credentials, device records, and firmware control as design requirements." },
  { id: "capacity", label: "Capacity", text: "Named staff and a schedule that supports the installation start." },
  { id: "screening", label: "Screening", text: "Ownership and sanctions screening of the firm, completed by compliance assurance before contract." },
];
export const SELECTION_RULE = "Appoint the owner's engineer and the commissioning agent first. They review the design basis, the supplier disclosures, and the test plans before the owner releases a purchase order.";

// ---------- Risk register ----------

export const RATINGS = ["Green", "Yellow", "Orange", "Red"];
export const RATING_MEANING = {
  Green: "Proceed.",
  Yellow: "Proceed with documented protections.",
  Orange: "The item needs a mitigation plan, a fallback option, purchase-order flexibility, and change triggers.",
  Red: "Reserved for a confirmed critical barrier.",
};
export const RISK_ROWS = [
  { id: "eo", label: "Executive Order 14420", rating: "Yellow", ratingNote: "Yellow with the supplier disclosure, outside counsel's written view, and a named alternate. Orange without them.", why: "The order looks at who owns the equipment maker.", openFact: "Any DOE rule. The factory and parent company of each engine and alternator.", action: "Gate 1 disclosure. Outside counsel's written view. A named alternate source.", topics: ["eo14420"] },
  { id: "gridTie", label: "Later grid connection", rating: "Yellow", why: "A grid tie can bring in FERC, NERC, utility, and Acid Rain Program rules, and it reopens the executive order analysis.", openFact: "Whether a tie is in the long-term plan.", action: "Gate 5 review before any tie equipment is ordered.", topics: ["grid"] },
  { id: "stability", label: "Islanded stability", rating: "Yellow", why: "A voltage or frequency excursion can drop the whole computing load.", openFact: "Dynamic study results. The ISO 8528-5 exceptions.", action: "Witnessed load-step test. Battery sizing confirmed." },
  { id: "controller", label: "Controller access", rating: "Yellow", why: "The party that controls the controllers controls the power.", openFact: "The controller model. Who holds the credentials.", action: "Owner-held credentials. Access off by default. Logged sessions.", topics: ["ics"] },
  { id: "permits", label: "Permits and zoning", rating: "Yellow", why: "Siting, air, and zoning approvals sit on the path to the installation start.", openFact: "The permit path and zoning status at the site.", action: "Pre-application meetings now. Early engagement with the local authority." },
  { id: "gas", label: "Gas supply", rating: "Yellow", why: "The site has one fuel and may have one pipeline.", openFact: "Firm transport and delivery pressure.", action: "Firm supply contract. Written outage plan." },
  { id: "concentration", label: "Supplier concentration", rating: "Yellow", why: "A plan that relies on one generator packager has no fallback if that source is held.", openFact: "The delivery tranche allocated to this site.", action: "A second source qualified for the first tranche." },
  { id: "independence", label: "Independence", rating: "Yellow", why: "A build manager with a financial stake in a supplier cannot also act as the owner's independent check.", openFact: "Final ownership and reporting lines.", action: "An independent owner's engineer and commissioning agent." },
  { id: "factory", label: "Factory build route", rating: "Yellow", ratingNote: "Yellow with baselines, firmware reload, seals, and login removal. Orange without them.", why: "Factory-built equipment arrives configured and loaded with software.", openFact: "The final route and the custody plan.", action: "Baselines, firmware reload, seals, and login removal.", topics: ["china-export"] },
  { id: "chips", label: "Chip export rules", rating: "Green", ratingNote: "Green for a private site with a confirmed United States end customer. Yellow for a multi-tenant site.", why: "The remote access rule turns on who uses the compute.", openFact: "The end customer and its parent company, in writing.", action: "Tenant screening and a compute ledger.", topics: ["chips", "entity-list"] },
];
export function defaultRiskRating(id, basis) {
  if (id === "chips") return referenceDesign(basis) === "A" && basis?.customer === "us" ? "Green" : "Yellow";
  if (id === "gridTie" && basis?.power === "grid") return "Yellow";
  return RISK_ROWS.find(row => row.id === id)?.rating || "Yellow";
}

// ---------- Pathways, gates, decisions, actions ----------

export const PATHWAYS = [
  { id: 1, label: "Pathway 1. Islanded plant", text: "The site runs on its own gas engines and batteries and has no grid connection. It depends on the generator source, the gas supply, and the Executive Order 14420 position.", power: ["island"] },
  { id: 2, label: "Pathway 2. Islanded now, grid tie later", text: "The site starts with an on-site plant and adds a utility connection when one is available. The grid tie is a separate decision at Gate 5 with its own legal review, studies, and permits.", power: ["island", "btm"] },
  { id: 3, label: "Pathway 3. Grid first, with backup", text: "The site waits for a utility connection and uses generators for emergencies only. The utility contract terms and the emergency engine hour limits apply.", power: ["grid"] },
];
export const pathwaysFor = (power) => PATHWAYS.filter(row => row.power.includes(power));

export const GATES = [
  { id: 0, label: "Gate 0. Design basis frozen", short: "Design basis frozen", decision: "Fix the power arrangement, voltage, chip platform, and end customer.", signoff: "Owner", reviewer: "cpi",
    evidence: ["Signed design basis", "Statement that no grid tie is built, for an islanded design", "End customer confirmed in writing"] },
  { id: 1, label: "Gate 1. Before purchase", short: "Before purchase", decision: "Release purchase orders.", signoff: "Owner and outside counsel", reviewer: "trade",
    evidence: ["Maker, factory, and parent company for each Tier 2 and Tier 3 device", "Controller model and engine variant", "Outside counsel's written view", "Contract terms agreed with the supplier"] },
  { id: 2, label: "Gate 2. Before installation", short: "Before installation", decision: "Ship and install.", signoff: "Owner's engineer and compliance assurance", reviewer: "cpi",
    evidence: ["Siting certificate and air permit, or a written finding that none is needed", "Witnessed factory tests and device baselines", "Seal and custody records"] },
  { id: 3, label: "Gate 3. Before power-on", short: "Before power-on", decision: "Energize the plant.", signoff: "Commissioning agent", reviewer: "cpi",
    evidence: ["Firmware reloaded from owner-held images", "Factory logins removed", "Protection settings tested", "Dynamic study and load-step test passed"] },
  { id: 4, label: "Gate 4. Before networking", short: "Before networking", decision: "Connect the control and tenant networks.", signoff: "Owner and compliance assurance", reviewer: "trade",
    evidence: ["Each remote access path approved, owner-held, and logged", "Tenant screening complete"] },
  { id: 5, label: "Gate 5. Before a grid tie", short: "Before a grid tie", decision: "Connect to the utility, only if a tie is chosen.", signoff: "Owner and outside counsel", reviewer: "trade",
    evidence: ["New legal review under each rule set for the power arrangement", "Utility studies and agreement", "Updated permits"] },
];
export const GATE_RULES = [
  { label: "One written decision for each gate.", text: "The sign-off party records the evidence reviewed, the decision, and any condition." },
  { label: "Missing evidence holds the gate.", text: "A missing fact lowers confidence in the decision. It is logged as an open item with an owner and a date." },
  { label: "A change reopens a gate.", text: "A new factory, engine variant, controller, tenant, or power arrangement returns the item to the gate that covered it." },
];
export const EVIDENCE_STATES = ["Held", "Missing", "Not applicable"];
export const GATE_STATUS = ["Not started", "In preparation", "Hold", "Ready for decision", "Passed", "Passed with conditions"];
export const GATE_RESULTS = ["Passed", "Passed with conditions"];
export const OPEN_ITEM_OWNERS = ["NSTT", "CPI", "Trade", "Owner", "Outside counsel", "Owner's engineer", "Commissioning agent", "Supplier"];
export const gatePassed = (gate) => GATE_RESULTS.includes(gate?.status);

export const DECISIONS = [
  { id: "power", label: "Power arrangement", position: "Choose the power arrangement and record it in the design basis. For an islanded plant, leave room on the site plan for a future substation and install no grid-tie equipment before Gate 5.", who: "Owner, with the engineer of record", when: "Gate 0" },
  { id: "generator", label: "Generator source", position: "Hold the first purchase order until the supplier confirms in writing each engine and alternator factory, the ownership chain, the engine variant, and the controller model.", who: "Owner, with outside counsel", when: "Gate 1, before purchase" },
  { id: "contract", label: "Contract route", position: "Choose between a power purchase agreement and an equipment purchase. In both routes, bind the party that operates the plant to the contract terms in the sourcing workflow.", who: "Owner, with outside counsel", when: "Before signing" },
  { id: "checks", label: "Independent checks", position: "Appoint an owner's engineer and a commissioning agent that have no financial tie to the build manager or the power supplier.", who: "Owner", when: "Within 30 days" },
  { id: "legal", label: "Legal position", position: "Obtain outside counsel's written view on Executive Order 14420 for the chosen power arrangement. Update it when DOE issues a rule.", who: "Outside counsel", when: "Before Gate 1" },
  { id: "gridTie", label: "Future grid tie", position: "Treat any later connection to the utility as a new decision with its own legal review and studies.", who: "Owner", when: "Gate 5, only if a tie is chosen" },
];
export const DECISION_STATES = ["Open", "Decided"];

export const ACTIONS_90 = [
  { block: "Days 1 to 30", items: [
    { id: "a1", text: "Freeze the design basis: power arrangement, voltage, chip platform, and end customer (Gate 0)." },
    { id: "a2", text: "Send the supplier a disclosure request on factories, the ownership chain, the engine variant, the controller model, the spare count, and the ISO 8528-5 exceptions." },
    { id: "a3", text: "Appoint the owner's engineer and the commissioning agent." },
    { id: "a4", text: "Ask outside counsel for a written view on Executive Order 14420 for the chosen power arrangement." },
    { id: "a5", text: "Open pre-application meetings on siting, the air permit, and zoning." },
  ] },
  { block: "Days 31 to 60", items: [
    { id: "b1", text: "Review any DOE rule and update row 1 of the risk register." },
    { id: "b2", text: "Complete the dynamic study and the three protection studies." },
    { id: "b3", text: "Agree the contract terms and choose the power purchase agreement or the purchase route." },
    { id: "b4", text: "Qualify an alternate generator source for the first tranche." },
  ] },
  { block: "Days 61 to 90", items: [
    { id: "c1", text: "Take the Gate 1 decision on the first purchase orders." },
    { id: "c2", text: "Approve the factory test plan and the procedure for device baselines and seals." },
    { id: "c3", text: "File the permit applications and sign the gas supply agreement." },
    { id: "c4", text: "Decide whether a grid tie is in the long-term plan. If it is, start Gate 5 planning." },
  ] },
];
export const ACTION_STATES = ["Open", "Done", "Not applicable"];
const ACTION_IDS = ACTIONS_90.flatMap(block => block.items.map(item => item.id));

// Public rule dates. Each one names its source. Regions limit a date to the kits it applies to.
export const PUBLIC_DATES = [
  { date: "2026-11-19", label: "The remote access rule took effect. Existing service above the threshold needs a license within 90 days.", cite: CITES.bisRemote, topic: "chips" },
  { date: "2026-12-24", approx: true, label: "The 120-day mark under Executive Order 14420. The order calls for DOE rules within 120 days as needed. The date is a program calculation.", cite: CITES.eo, topic: "eo14420" },
  { date: "2026-12-31", label: "FERC deadline for NERC to file reliability standards on computing loads.", cite: G.fercOrder, topic: "grid" },
  { date: "2027-01-01", label: "A refrigerant global warming potential limit of 700 applies to new data center cooling equipment.", cite: CITES.epaGwp, regions: ["US"] },
  { date: "2027-01-01", label: "Chillers above 12 kW face a refrigerant global warming potential limit of 750.", cite: CITES.euFgas, regions: ["EU"] },
  { date: "2027-01-10", label: "The suspension of the Affiliates Rule ends unless it is extended again.", cite: CITES.affiliates, topic: "entity-list" },
  { date: "2027-01-19", label: "Comments on the remote access rule are due.", cite: CITES.bisRemote, topic: "chips" },
  { date: "2027-01-20", label: "The EU Machinery Regulation starts to apply.", cite: CITES.euMachinery, regions: ["EU"] },
  { date: "2027-02-18", label: "Industrial batteries above 2 kWh need an EU battery passport.", cite: CITES.euBattery, regions: ["EU"] },
];
export const publicDatesFor = (region) => PUBLIC_DATES.filter(row => !row.regions || row.regions.includes(region));

export const UPDATE_TRIGGERS = [
  { text: "DOE issues a rule or determination under Executive Order 14420. Update risk 1 and Gate 1.", topic: "eo14420" },
  { text: "FERC acts on Docket RM26-4 or on a NERC filing on computing loads. Recheck the rules for the power arrangement.", topic: "grid" },
  { text: "The remote access rule is amended. Recheck the tenant threshold and the license position.", topic: "chips" },
  { text: "The state changes its siting law or limits data centers. Recheck the permit path and zoning status.", topic: "" },
];

// ---------- Standard workflow responsibility for each role ----------

const fieldLabels = (kind, role) => (kind === "vendor" ? VENDOR_FIELDS : PART_FIELDS).filter(row => row.owner === role).map(row => row.label);
export const ROLE_WORKFLOWS = [
  { role: "nstt", label: "NSTT", summary: "Prepares the design basis, the gates, and each sourcing line.", steps: [
    { area: "Program plan", text: "Record the design basis, pathway, milestones, decisions, design considerations, risk register, and 90-day actions." },
    { area: "Gates", text: "Mark each evidence item Held, Missing, or Not applicable. Log open items with an owner and a date. Send the gate for decision." },
    { area: "Sourcing workflow", text: "Add a line for each subsystem. Choose the primary part and a named alternate, complete the confirm-before-purchase checklist, and send the line to review." },
    { area: "Repository", text: "Add new vendors and parts. Confirm or change the engineering fields of each part." },
    { area: "Regulatory watch", text: "Run Check now, read the daily items, and raise items that touch a sourcing line with the reviewing role." },
  ] },
  { role: "cpi", label: "CPI", summary: "Reviews engineering fit, ownership facts, and the gates that turn on physical evidence.", steps: [
    { area: "Program plan", text: "Read the plan and raise gaps with NSTT." },
    { area: "Gates", text: "Record the decision for Gates 0, 2, and 3 once the sign-off party has signed." },
    { area: "Sourcing workflow", text: "Review and approve or return each line that carries no trade flag." },
    { area: "Repository", text: "Confirm or change the identity and ownership fields of each vendor and the standards and assembly fields of each part." },
    { area: "Regulatory watch", text: "Record whether control system security advisories and grid rule items are material." },
  ] },
  { role: "trade", label: "Trade", summary: "Reviews export control, screening, and listed-equipment questions.", steps: [
    { area: "Program plan", text: "Read the plan and the legal position on Executive Order 14420." },
    { area: "Gates", text: "Record the decision for Gates 1, 4, and 5 once the sign-off party has signed." },
    { area: "Sourcing workflow", text: "Review and approve or return each line that carries a trade flag." },
    { area: "Repository", text: "Confirm or change the screening, list, and export control fields of each vendor and part." },
    { area: "Regulatory watch", text: "Record whether export control, screening list, Covered List, and executive order items are material, and name the entries they affect." },
  ] },
  { role: "administrator", label: "Administrator", summary: "Reads every screen and manages access and projects.", steps: [
    { area: "All screens", text: "Read the plan, gates, sourcing lines, repository, watch, and portfolio. An administrator does not prepare, confirm, or approve." },
    { area: "Regulatory watch", text: "Run Check now and confirm that the daily run is recorded." },
  ] },
];
export const roleFields = (role) => ({ vendor: fieldLabels("vendor", role), part: fieldLabels("part", role) });

// ---------- Program plan document ----------

export const DEFAULT_MILESTONES = [
  { id: "basis", label: "Design basis frozen (Gate 0)" },
  { id: "purchase", label: "First purchase order (Gate 1)" },
  { id: "install", label: "Installation start (Gate 2)" },
  { id: "poweron", label: "Power-on (Gate 3)" },
  { id: "service", label: "First building in service (Gate 4)" },
];
export const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const pick = (values, value, fallback) => values.includes(value) ? value : fallback;
const ids = (rows) => rows.map(row => row.id);

export function normalizeProgram(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const basisIn = source.basis || {};
  const power = pick(ids(POWER), basisIn.power, "island");
  const basis = {
    tenancy: pick(ids(TENANCY), basisIn.tenancy, "private"),
    power,
    platform: pick(ids(PLATFORMS), basisIn.platform, "nvl72"),
    region: pick(ids(REGIONS), basisIn.region, "US"),
    customer: pick(ids(CUSTOMER), basisIn.customer, "open"),
    voltage: clean(basisIn.voltage, 40),
    note: clean(basisIn.note, 600),
  };
  const allowed = pathwaysFor(power).map(row => row.id);
  const pathway = allowed.includes(Number(source.pathway)) ? Number(source.pathway) : allowed[0];
  const custom = (Array.isArray(source.milestones) ? source.milestones : []).filter(row => row && !DEFAULT_MILESTONES.some(item => item.id === row.id)).slice(0, 12)
    .map((row, index) => ({ id: /^m\d{1,3}$/.test(String(row.id)) ? row.id : `m${index + 1}`, label: clean(row.label, 120), date: validDate(row.date) ? row.date : "" })).filter(row => row.label);
  const milestones = [
    ...DEFAULT_MILESTONES.map(item => {
      const saved = (Array.isArray(source.milestones) ? source.milestones : []).find(row => row?.id === item.id);
      return { ...item, date: validDate(saved?.date) ? saved.date : "" };
    }),
    ...custom,
  ];
  const map = (rows, shape) => Object.fromEntries(rows.map(row => [row.id, shape(source, row)]));
  const decisions = map(DECISIONS, (src, row) => {
    const saved = src.decisions?.[row.id] || {};
    return { status: pick(DECISION_STATES, saved.status, "Open"), position: clean(saved.position, 800), decidedOn: validDate(saved.decidedOn) ? saved.decidedOn : "", note: clean(saved.note, 600) };
  });
  const considerations = map(CONSIDERATIONS, (src, row) => {
    const saved = src.considerations?.[row.id] || {};
    return { status: pick(CONSIDERATION_STATES, saved.status, "Open"), note: clean(saved.note, 600) };
  });
  const risks = map(RISK_ROWS, (src, row) => {
    const saved = src.risks?.[row.id] || {};
    return { rating: pick(RATINGS, saved.rating, ""), openFact: clean(saved.openFact, 500), action: clean(saved.action, 500), note: clean(saved.note, 600) };
  });
  const actions = Object.fromEntries(ACTION_IDS.map(id => {
    const saved = source.actions?.[id] || {};
    return [id, { status: pick(ACTION_STATES, saved.status, "Open"), due: validDate(saved.due) ? saved.due : "", note: clean(saved.note, 400) }];
  }));
  const log = (Array.isArray(source.log) ? source.log : []).slice(-40).map(row => ({ at: clean(row.at, 40), by: clean(row.by, 120), role: clean(row.role, 20), section: clean(row.section, 40), summary: clean(row.summary, 300) }));
  return { basis, pathway, milestones, decisions, considerations, risks, actions, log };
}

export const PROGRAM_SECTIONS = ["basis", "milestones", "decisions", "considerations", "risks", "actions"];

// Checks one section before it is saved. Returns a message, or an empty string when the section is valid.
export function programSectionBlock(section, data, { role, gate0Passed = false, current } = {}) {
  if (role !== "nstt") return "Only the NSTT role prepares the program plan.";
  if (!PROGRAM_SECTIONS.includes(section)) return "Choose a section of the program plan.";
  if (section === "basis") {
    const next = normalizeProgram({ basis: data?.basis, pathway: data?.pathway });
    if (!ids(TENANCY).includes(data?.basis?.tenancy) || !ids(POWER).includes(data?.basis?.power) || !ids(PLATFORMS).includes(data?.basis?.platform) || !ids(REGIONS).includes(data?.basis?.region)) return "Choose who uses the site, how it is powered, the chip platform, and the region.";
    if (!pathwaysFor(next.basis.power).some(row => row.id === Number(data?.pathway))) return "Choose a pathway that matches the power arrangement.";
    const before = current ? normalizeProgram(current) : null;
    const changed = before && ["tenancy", "power", "platform", "region", "customer", "voltage"].some(key => before.basis[key] !== next.basis[key]);
    if (gate0Passed && (changed || before?.pathway !== next.pathway)) return "The design basis is frozen at Gate 0. Reopen Gate 0 with a reason before changing it.";
    return "";
  }
  if (section === "milestones") {
    const rows = Array.isArray(data?.milestones) ? data.milestones : [];
    if (rows.some(row => row?.date && !validDate(row.date))) return "Use a valid date for each milestone, or leave it empty.";
    return "";
  }
  if (section === "decisions") {
    for (const row of DECISIONS) {
      const saved = data?.decisions?.[row.id];
      if (saved?.status === "Decided" && (!validDate(saved.decidedOn) || clean(saved.position, 800).length < 8)) return `Record the position taken and the date for this decision: ${row.label}.`;
    }
    return "";
  }
  if (section === "considerations") {
    for (const row of CONSIDERATIONS) {
      const saved = data?.considerations?.[row.id];
      if (["Addressed", "Not applicable"].includes(saved?.status) && clean(saved.note, 600).length < 8) return `State the evidence or the reason for this consideration: ${row.label}.`;
    }
    return "";
  }
  if (section === "risks") {
    for (const row of RISK_ROWS) {
      const saved = data?.risks?.[row.id];
      if (saved?.rating && !RATINGS.includes(saved.rating)) return "Choose Green, Yellow, Orange, or Red.";
      if (saved?.rating === "Red" && clean(saved.note, 600).length < 8) return `Red is reserved for a confirmed critical barrier. State the barrier for this risk: ${row.label}.`;
    }
    return "";
  }
  for (const id of ACTION_IDS) {
    const saved = data?.actions?.[id];
    if (saved?.due && !validDate(saved.due)) return "Use a valid due date for each action, or leave it empty.";
  }
  return "";
}

// Returns the next program payload with one section replaced and one log entry added.
export function applyProgramSection(current, section, data, actor, now = new Date().toISOString()) {
  const before = normalizeProgram(current);
  const merged = section === "basis"
    ? { ...before, basis: data.basis, pathway: data.pathway }
    : { ...before, [section]: data[section] };
  const next = normalizeProgram(merged);
  const summary = section === "basis"
    ? `Design ${referenceDesign(next.basis)}, ${POWER.find(row => row.id === next.basis.power).short.toLowerCase()}, ${REGIONS.find(row => row.id === next.basis.region).label}, pathway ${next.pathway}.`
    : `Saved ${section}.`;
  next.log = [...before.log, { at: now, by: actor.email, role: actor.role, section, summary }].slice(-40);
  return next;
}

// The context every benchmark uses: region, reference design, and power arrangement.
export function designContext(program) {
  const plan = normalizeProgram(program);
  return { region: plan.basis.region, design: referenceDesign(plan.basis), power: plan.basis.power, tenancy: plan.basis.tenancy };
}

// ---------- Gates ----------

export function normalizeGate(payload, gateId) {
  const def = GATES[gateId];
  const source = payload && typeof payload === "object" ? payload : {};
  const evidence = def.evidence.map((_, index) => {
    const row = source.evidence?.[index] || {};
    return { state: pick(EVIDENCE_STATES, row.state, ""), note: clean(row.note, 400) };
  });
  const openItems = (Array.isArray(source.openItems) ? source.openItems : []).slice(0, 20).map(row => ({
    text: clean(row?.text, 300), owner: pick(OPEN_ITEM_OWNERS, row?.owner, ""), due: validDate(row?.due) ? row.due : "", closed: Boolean(row?.closed),
  })).filter(row => row.text);
  const decision = source.decision && typeof source.decision === "object" ? {
    result: pick(GATE_RESULTS, source.decision.result, "Passed"), condition: clean(source.decision.condition, 600), signoffRef: clean(source.decision.signoffRef, 200),
    note: clean(source.decision.note, 600), by: clean(source.decision.by, 120), role: clean(source.decision.role, 20), at: clean(source.decision.at, 40),
  } : null;
  const log = (Array.isArray(source.log) ? source.log : []).slice(-60).map(row => ({ at: clean(row.at, 40), by: clean(row.by, 120), role: clean(row.role, 20), action: clean(row.action, 40), note: clean(row.note, 600) }));
  return {
    gate: gateId, status: pick(GATE_STATUS, source.status, "Not started"), evidence, openItems,
    preparedBy: clean(source.preparedBy, 120), preparedAt: clean(source.preparedAt, 40), decision, log,
  };
}

// Gate 5 applies only when a grid tie is part of the pathway.
export function gateApplies(gateId, program) {
  return gateId !== 5 || normalizeProgram(program).pathway !== 1;
}

// Gates run in order. Gate 5 follows Gate 0 because a grid tie is its own decision.
export function priorGate(gateId) {
  if (gateId === 0) return null;
  return gateId === 5 ? 0 : gateId - 1;
}

const sentence = (value) => clean(value, 600).length >= 8;
// A reference is shown inside a sentence, so a period typed after it is dropped.
const reference = (value) => clean(value, 200).replace(/[.\s]+$/, "");

// Checks one gate action. Returns a message, or an empty string when the action is allowed.
export function gateBlock(current, action, input, actor, { priorPassed = true, applies = true } = {}) {
  const gate = normalizeGate(current, current?.gate ?? input?.gate ?? 0);
  const def = GATES[gate.gate];
  const passed = gatePassed(gate);
  if (!applies) return "Gate 5 applies only when a grid tie is part of the pathway. Change the pathway in the design basis first.";
  if (["save", "hold", "ready"].includes(action)) {
    if (actor.role !== "nstt") return "Only the NSTT role prepares gate evidence.";
    if (passed) return "This gate is passed. Reopen it with a reason before changing its evidence.";
    const next = normalizeGate({ ...gate, evidence: input?.evidence, openItems: input?.openItems }, gate.gate);
    for (const item of next.openItems) if (!item.owner || !item.due) return "Give every open item an owner and a due date.";
    if (action === "hold" && !next.openItems.some(item => !item.closed)) return "A hold needs at least one open item with an owner and a due date.";
    if (action === "ready") {
      const missing = def.evidence.filter((_, index) => next.evidence[index].state !== "Held" && next.evidence[index].state !== "Not applicable");
      if (missing.length) return `Ready for decision is refused while evidence is missing or not reviewed: ${missing.join("; ")}. Record a hold with an open item, or collect the evidence.`;
      const bare = def.evidence.filter((_, index) => next.evidence[index].state === "Not applicable" && !sentence(next.evidence[index].note));
      if (bare.length) return `State why this evidence is not applicable: ${bare.join("; ")}.`;
    }
    return "";
  }
  if (action === "decide" || action === "return") {
    if (actor.role !== def.reviewer) return `Only the ${def.reviewer === "cpi" ? "CPI" : "Trade"} role records the decision for this gate.`;
    if (gate.status !== "Ready for decision") return "The gate must be Ready for decision first.";
    if (actor.email === gate.preparedBy) return "The person who prepared the gate cannot record its decision.";
    if (action === "return") return sentence(input?.note) ? "" : "State why the gate is returned to preparation.";
    if (!priorPassed && priorGate(gate.gate) !== null) return `${GATES[priorGate(gate.gate)].label} must be passed first.`;
    if (!GATE_RESULTS.includes(input?.result)) return "Choose Passed or Passed with conditions.";
    if (reference(input?.signoffRef).length < 4) return `Record the reference of the decision signed by the sign-off party: ${def.signoff}.`;
    const open = gate.openItems.filter(item => !item.closed).length;
    if (input.result === "Passed" && open) return "Open items remain. Close them, or record Passed with conditions and state the condition.";
    if (input.result === "Passed with conditions" && !sentence(input?.condition)) return "State the condition in a full sentence.";
    return "";
  }
  if (action === "reopen") {
    if (!["nstt", def.reviewer].includes(actor.role)) return "Only the NSTT role or the reviewing role reopens this gate.";
    if (!passed) return "Only a passed gate can be reopened.";
    return sentence(input?.note) ? "" : "State the change that reopens the gate.";
  }
  return "Choose a gate action.";
}

// Ends a typed note with a period so that the history reads as full sentences.
const endSentence = (value, limit = 500) => { const text = clean(value, limit); return !text || /[.!?”"]$/.test(text) ? text : `${text}.`; };

export function applyGateAction(current, action, input, actor, now = new Date().toISOString()) {
  const gate = normalizeGate(current, current?.gate ?? input?.gate ?? 0);
  const entry = (note) => ({ at: now, by: actor.email, role: actor.role, action, note: clean(note, 600) });
  if (["save", "hold", "ready"].includes(action)) {
    const next = normalizeGate({ ...gate, evidence: input.evidence, openItems: input.openItems }, gate.gate);
    next.status = action === "hold" ? "Hold" : action === "ready" ? "Ready for decision" : "In preparation";
    next.preparedBy = actor.email;
    next.preparedAt = now;
    next.decision = null;
    const held = next.evidence.filter(row => row.state === "Held").length;
    const open = next.openItems.filter(row => !row.closed).length;
    next.log = [...gate.log, entry(`${held} of ${next.evidence.length} evidence items held. ${open} open ${open === 1 ? "item" : "items"}.`)].slice(-60);
    return next;
  }
  if (action === "return") return { ...gate, status: "In preparation", log: [...gate.log, entry(endSentence(input.note))].slice(-60) };
  if (action === "decide") {
    return {
      ...gate, status: input.result,
      decision: { result: input.result, condition: input.result === "Passed with conditions" ? endSentence(input.condition, 600) : "", signoffRef: reference(input.signoffRef), note: endSentence(input.note, 600), by: actor.email, role: actor.role, at: now },
      log: [...gate.log, entry(`${input.result}. Sign-off reference: ${reference(input.signoffRef)}.${input.result === "Passed with conditions" ? ` Condition: ${endSentence(input.condition, 400)}` : ""}`)].slice(-60),
    };
  }
  // Reopen keeps the earlier decision in the log and returns the gate to preparation.
  return { ...gate, status: "In preparation", decision: null, log: [...gate.log, entry(endSentence(input.note))].slice(-60) };
}

// The current gate is the first applicable gate that is not passed.
export function currentGate(gates, program) {
  for (const def of GATES) {
    if (!gateApplies(def.id, program)) continue;
    const gate = gates?.[def.id];
    if (!gatePassed(gate)) return { id: def.id, label: def.label, short: def.short, status: gate?.status || "Not started" };
  }
  return { id: -1, label: "All gates passed", short: "All gates passed", status: "Passed" };
}

// ---------- Sourcing lines ----------

export const CHECK_STATES = ["Open", "Confirmed", "Not applicable"];
export const LINE_STATUS = ["Draft", "In review", "Returned", "Approved"];
export const HELD_FLAGS = [
  { id: "disclosure", label: "Supplier disclosure held", help: "The supplier named the maker, factory, and ultimate parent company in writing." },
  { id: "counsel", label: "Outside counsel's written view held", help: "Counsel gave a written view on Executive Order 14420 for this equipment and power arrangement." },
  { id: "license", label: "Chip license or exception recorded", help: "The United States license, or the exception with monthly reports, is recorded for this line." },
  { id: "protections", label: "Device protections agreed", help: "The supplier accepted the proof this device tier needs, including firmware reload and removal of factory logins for Tier 3." },
];

export function normalizeSelection(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const subsystem = subsystemOf(source.subsystem);
  const confirm = subsystem?.confirm || [];
  const snapshot = (value) => value && typeof value === "object" ? {
    at: clean(value.at, 40), posture: pick(RATINGS, value.posture, "Green"), action: clean(value.action, 80), tradeFlag: Boolean(value.tradeFlag),
    confidence: clean(value.confidence, 20), confirmed: Number(value.confirmed) || 0, total: Number(value.total) || 0, requests: Number(value.requests) || 0,
    fit: clean(value.fit, 40), rules: (Array.isArray(value.rules) ? value.rules : []).slice(0, 20).map(row => ({ rule: clean(row.rule, 30), level: pick(RATINGS, row.level, "Yellow") })),
    primary: clean(value.primary, 80), alternate: clean(value.alternate, 80), context: { region: clean(value.context?.region, 4), design: clean(value.context?.design, 2), power: clean(value.context?.power, 10) },
  } : null;
  return {
    id: clean(source.id, 20), subsystem: subsystem?.id || "", category: categoryOf(source.category)?.id || "",
    primary: clean(source.primary, 80), alternate: clean(source.alternate, 80), noAlternateReason: clean(source.noAlternateReason, 400), note: clean(source.note, 600),
    checklist: confirm.map((_, index) => {
      const row = source.checklist?.[index] || {};
      return { state: pick(CHECK_STATES, row.state, "Open"), note: clean(row.note, 300) };
    }),
    terms: Object.fromEntries(CONTRACT_TERMS.map(row => [row.id, pick(TERM_STATES, source.terms?.[row.id], "Open")])),
    stops: Object.fromEntries(STOP_SIGNS.map(row => [row.id, Boolean(source.stops?.[row.id])])),
    stopNote: clean(source.stopNote, 400),
    held: Object.fromEntries(HELD_FLAGS.map(row => [row.id, Boolean(source.held?.[row.id])])),
    status: pick(LINE_STATUS, source.status, "Draft"), reviewerRole: pick(["cpi", "trade"], source.reviewerRole, ""),
    preparedBy: clean(source.preparedBy, 120), preparedAt: clean(source.preparedAt, 40), primaryChangedAt: clean(source.primaryChangedAt, 40),
    submitted: snapshot(source.submitted),
    decision: source.decision && typeof source.decision === "object" ? { by: clean(source.decision.by, 120), role: clean(source.decision.role, 20), at: clean(source.decision.at, 40), note: clean(source.decision.note, 600), snapshot: snapshot(source.decision.snapshot) } : null,
    log: (Array.isArray(source.log) ? source.log : []).slice(-60).map(row => ({ at: clean(row.at, 40), by: clean(row.by, 120), role: clean(row.role, 20), action: clean(row.action, 40), note: clean(row.note, 600) })),
  };
}

export const stopSigns = (selection) => STOP_SIGNS.filter(row => selection?.stops?.[row.id]);

// Checks the content of a line against the repository.
export function selectionSaveBlock(input, catalog) {
  const line = normalizeSelection(input);
  if (!line.subsystem) return "Choose the subsystem.";
  const category = categoryOf(line.category);
  if (!category || category.subsystem !== line.subsystem) return "Choose a part category that belongs to the subsystem.";
  const primary = catalog.parts.find(part => part.id === line.primary);
  if (!primary) return "Choose the primary part from the repository. Add the part first when it is new.";
  if (primary.category !== line.category) return "The primary part must belong to the chosen category.";
  if (line.alternate) {
    const alternate = catalog.parts.find(part => part.id === line.alternate);
    if (!alternate || subsystemOf(categoryOf(alternate.category)?.subsystem)?.id !== line.subsystem) return "Choose an alternate part from the same subsystem.";
    if (alternate.id === primary.id) return "The alternate must be a different part.";
    if (parentKey(vendorOf(catalog, alternate)) === parentKey(vendorOf(catalog, primary))) return "Choose an alternate from a different ultimate parent. Both parts trace to the same parent company.";
  }
  if (stopSigns(line).length && !sentence(line.stopNote)) return "Describe what was observed for the stop sign.";
  return "";
}

export function selectionSubmitBlock(input, catalog) {
  const line = normalizeSelection(input);
  const block = selectionSaveBlock(line, catalog);
  if (block) return block;
  if (stopSigns(line).length) return "A stop sign is recorded on this line. Pause the purchase and resolve it before the line goes to review.";
  if (!line.alternate && !sentence(line.noAlternateReason)) return "Name an alternate part, or state why no alternate is available.";
  return "";
}

// The stored copy of a benchmark result. A decision keeps the snapshot it was taken on.
export function snapshotOf(result, line, context, at = new Date().toISOString()) {
  return {
    at, posture: result.posture, action: result.action, tradeFlag: result.tradeFlag, confidence: result.confidence.label,
    confirmed: result.confidence.confirmed, total: result.confidence.total, requests: result.requests.length, fit: result.fitSummary,
    rules: result.reasons.map(row => ({ rule: row.rule, level: row.level })), primary: line.primary, alternate: line.alternate,
    context: { region: context.region, design: context.design, power: context.power },
  };
}

const ruleKey = (rows) => (rows || []).map(row => `${row.rule}:${row.level}`).sort().join("|");

// Reasons an approved line needs a second look. The approval itself never changes.
export function selectionRecheck(input, live, context, entries = []) {
  const line = normalizeSelection(input);
  const reasons = [];
  const snap = line.decision?.snapshot;
  if (line.status === "Approved" && snap && live) {
    if (snap.posture !== live.posture) reasons.push(`The indicated posture moved from ${snap.posture} to ${live.posture} since approval.`);
    else if (ruleKey(snap.rules) !== ruleKey(live.reasons)) reasons.push("The rules behind the indicated posture changed since approval.");
    if (context && (snap.context.region !== context.region || snap.context.design !== context.design || snap.context.power !== context.power)) reasons.push("The design basis changed since approval.");
  }
  for (const entry of entries) {
    for (const row of entry?.recheck || []) {
      if (line.status === "Approved" && line.decision?.at && row.at && row.at <= line.decision.at) continue;
      reasons.push(`${entry.name}: ${row.title}`);
    }
  }
  return [...new Set(reasons)];
}

// The live benchmark of a line's primary part, with the proof the line holds. Null when the part left the repository.
export function lineBenchmark(input, catalog, context) {
  const line = normalizeSelection(input);
  const primary = catalog.parts.find(part => part.id === line.primary);
  return primary ? benchmark(primary, catalog, { ...context, held: line.held, hasAlternate: Boolean(line.alternate) }) : null;
}

// Every reason a line needs a second look: a moved benchmark, a changed design basis, or an open recheck on its vendors and parts.
export function lineRecheck(input, catalog, context) {
  const line = normalizeSelection(input);
  const primary = catalog.parts.find(part => part.id === line.primary);
  const alternate = catalog.parts.find(part => part.id === line.alternate);
  const entries = [primary, primary && vendorOf(catalog, primary), alternate, alternate && vendorOf(catalog, alternate)].filter(Boolean);
  return selectionRecheck(line, lineBenchmark(line, catalog, context), context, entries);
}

export const nextLineId = (existing) => {
  const used = (existing || []).map(id => Number(String(id).replace(/^L-/, ""))).filter(Number.isFinite);
  return `L-${String(Math.max(0, ...used) + 1).padStart(2, "0")}`;
};

// ---------- Portfolio ----------

export function nextMilestone(program, today = programDay()) {
  const plan = normalizeProgram(program);
  const dated = [
    ...plan.milestones.filter(row => row.date).map(row => ({ date: row.date, label: row.label, kind: "Project milestone" })),
    ...publicDatesFor(plan.basis.region).map(row => ({ date: row.date, label: row.label, kind: "Public rule date", approx: Boolean(row.approx) })),
  ].filter(row => row.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return dated[0] || null;
}

export function timelineRows(program) {
  const plan = normalizeProgram(program);
  return [
    ...plan.milestones.filter(row => row.date).map(row => ({ date: row.date, label: row.label, kind: "project" })),
    ...publicDatesFor(plan.basis.region).map(row => ({ date: row.date, label: row.label, kind: "rule", approx: Boolean(row.approx), cite: row.cite })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function sourcingCoverage(selections) {
  const lines = (selections || []).map(normalizeSelection);
  const covered = (test) => SUBSYSTEMS.filter(row => lines.some(line => line.subsystem === row.id && test(line))).length;
  return {
    subsystems: SUBSYSTEMS.length,
    withPrimary: covered(line => Boolean(line.primary)),
    withAlternate: covered(line => Boolean(line.alternate)),
    approved: covered(line => line.status === "Approved"),
    lines: lines.length,
    inReview: lines.filter(line => line.status === "In review").length,
    approvedLines: lines.filter(line => line.status === "Approved").length,
    stopped: lines.filter(line => stopSigns(line).length).length,
  };
}

export function portfolioRow({ project, program, gates, selections, rechecks = 0, today }) {
  const started = Boolean(program);
  const plan = normalizeProgram(program);
  const gateList = GATES.map(def => normalizeGate(gates?.[def.id], def.id));
  const applicable = GATES.filter(def => gateApplies(def.id, plan));
  return {
    projectId: project.code, name: project.name || project.code, started,
    design: started ? referenceDesign(plan.basis) : "", region: started ? plan.basis.region : "", power: started ? plan.basis.power : "", pathway: started ? plan.pathway : 0,
    gate: currentGate(gateList, plan), gatesPassed: applicable.filter(def => gatePassed(gateList[def.id])).length, gatesTotal: applicable.length,
    nextMilestone: started ? nextMilestone(plan, today) : null,
    coverage: sourcingCoverage(selections),
    openItems: gateList.reduce((sum, gate) => sum + gate.openItems.filter(item => !item.closed).length, 0),
    rechecks,
    timeline: started ? timelineRows(plan) : [],
  };
}
