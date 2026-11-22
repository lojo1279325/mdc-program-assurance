import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES, PART_FIELDS, POSTURE_ACTION, SOURCE_TIERS, SUBSYSTEMS, VENDOR_FIELDS, WATCH_TOPICS,
  affectedEntries, alternates, benchmark, buildScreeningIndex, categoryOf, classifyTopics, coreName, countryName, entityNames,
  entryId, fieldChangeBlock, fieldDef, fitCheck, fitSummary, frequencyFit, isConfirmed, itarLink, mergeCatalog, newEntryBlock,
  parentKey, partTitle, safeUrl, screenNames, screeningDetail, screeningSignature, siteDomain, valueOf, vendorOf, vendorsNamed, vendorsNamedClearly,
} from "../public/catalog-model.js";
import { CATALOG_SEED } from "../public/catalog-seed.js";
import { listChecks } from "./analysis.js";
import { syntheticSeed } from "./guide-fixtures.js";

const doc = (kind, key, payload, version = 1) => ({ kind: `catalog-${kind}`, key, payload, version });
const confirmed = (baseline, role = "trade", at = "2026-11-21T10:00:00.000Z") => ({ state: "confirmed", baseline, by: `${role}@example.com`, role, at });
const changed = (value, baseline, role = "trade", extra = {}) => ({ state: "changed", value, baseline, reason: "The owning role recorded a different value.", by: `${role}@example.com`, role, at: "2026-11-21T10:00:00.000Z", ...extra });
const build = (documents = [], options = {}) => mergeCatalog(syntheticSeed(), documents, options);
const vendorIn = (catalog, id) => catalog.vendors.find(row => row.id === id);
const partIn = (catalog, id) => catalog.parts.find(row => row.id === id);
const rules = (result) => Object.fromEntries(result.reasons.map(row => [row.rule, row.level]));
const us = { region: "US", design: "A", power: "island" };

const screeningRows = [
  { name: "Synthetic Listed Works Co., Ltd.", alt_names: ["Synthetic Listed"], source: "Entity List (EL) - Bureau of Industry and Security", source_list_url: "https://example.gov/el", type: "Entity" },
  { name: "Synthetic Parent Group. Affiliated Entity: Synthetic Child Works", source: "Entity List (EL) - Bureau of Industry and Security", type: "Entity" },
  { name: "Synthetic Person, Example", source: "Specially Designated Nationals (SDN) - Treasury Department", type: "Individual" },
  { name: "Example Trading House of Synthetic Power", source: "Specially Designated Nationals (SDN) - Treasury Department", type: "Entity" },
];

test("a name is reduced to its core before it is compared with a list", () => {
  assert.equal(coreName("Synthetic Controls GmbH"), "SYNTHETIC CONTROLS");
  assert.equal(coreName("The Synthetic Power Company, Inc."), "SYNTHETIC POWER");
  assert.equal(coreName("Société Générale S.A."), "SOCIETE GENERALE");
  assert.equal(coreName("AT&T Inc."), "AT AND T");
  assert.equal(coreName("Synthetic Public Limited Company"), "SYNTHETIC");
  assert.equal(coreName("S.A. Synthetic (Holdings) Co., Ltd."), "SA SYNTHETIC");
  assert.equal(coreName("ABB"), "ABB");
  assert.equal(coreName(""), "");
});

test("screening separates an exact match, a similar name, and no match", () => {
  const index = buildScreeningIndex(screeningRows);
  const exact = screenNames(index, ["Synthetic Listed Works"]);
  assert.equal(exact.value, "Match");
  assert.equal(exact.exact[0].list, "Entity List (EL)");
  assert.equal(exact.exact[0].url, "https://example.gov/el");
  assert.equal(screeningDetail(exact), "Name match on Entity List (EL) (Synthetic Listed Works Co., Ltd.). A list match is a finding to resolve. It is not a legal conclusion.");
  // An Entity List row can name a parent and then the listed affiliate. The affiliate is matched on its own name.
  assert.equal(screenNames(index, ["Synthetic Child Works"]).value, "Match");
  const similar = screenNames(index, ["Synthetic Power Corp"]);
  assert.equal(similar.value, "Similar name");
  assert.match(screeningDetail(similar), /^No exact name match\. Similar name on Specially Designated Nationals \(SDN\) \(Example Trading House of Synthetic Power\)\. Trade decides whether it is the same party\.$/);
  // A vendor name that carries a listed name inside it is also a similar name.
  assert.equal(screenNames(index, ["Shanghai Synthetic Listed Works Trading"]).value, "Similar name");
  const clear = screenNames(index, ["Unrelated Maker"]);
  assert.equal(clear.value, "No match");
  assert.equal(screeningDetail(clear), "No name match. A clear result is not an approval.");
});

test("a person on a list who shares a word with a company is not a similar company", () => {
  const index = buildScreeningIndex(screeningRows);
  assert.equal(index.find(row => row.name === "Synthetic Person, Example").person, true);
  assert.equal(screenNames(index, ["Synthetic Person"]).value, "No match");
  assert.equal(screenNames(index, ["Example"]).value, "No match");
  // The full name of the listed person is still an exact match.
  assert.equal(screenNames(index, ["Synthetic Person, Example"]).value, "Match");
});

test("the signature of a screening result ignores the order of the list rows", () => {
  const forward = screenNames(buildScreeningIndex(screeningRows), ["Synthetic Listed Works", "Synthetic Power Corp"]);
  const reverse = screenNames(buildScreeningIndex([...screeningRows].reverse()), ["Synthetic Power Corp", "Synthetic Listed Works"]);
  assert.equal(screeningSignature(forward), screeningSignature(reverse));
  assert.notEqual(screeningSignature(forward), screeningSignature(screenNames(buildScreeningIndex(screeningRows), ["Synthetic Listed Works"])));
  assert.equal(screeningSignature(screenNames(buildScreeningIndex(screeningRows), ["Unrelated Maker"])), "");
});

test("the 22 CFR 126.1 link is derived from the recorded countries", () => {
  const catalog = build();
  const linked = vendorIn(catalog, "syn-cn").fields.nexus126;
  assert.equal(linked.value, "Link");
  assert.equal(linked.tier, "P");
  assert.equal(linked.source.url, "https://www.ecfr.gov/current/title-22/section-126.1");
  assert.equal(linked.detail, "The headquarters is in China, which paragraph (d)(1) names. The ultimate parent is in China, which paragraph (d)(1) names.");
  assert.equal(vendorIn(catalog, "syn-de").fields.nexus126.value, "No link");
  assert.match(vendorIn(catalog, "syn-de").fields.nexus126.detail, /Neither the headquarters country nor the ultimate parent country is named/);
  assert.match(vendorIn(catalog, "syn-open").fields.nexus126.detail, /No country is recorded yet/);
  assert.equal(itarLink("CN"), "(d)(1)");
  assert.equal(itarLink("ru"), "(d)(2)");
  assert.equal(itarLink("DE"), "");
  assert.equal(countryName("my"), "Malaysia");
});

test("Hong Kong and Macau are flagged for Trade and are not treated as a named country", () => {
  const seed = syntheticSeed();
  const registry = (value) => [value, "Synthetic registry record", "https://registry.example/record", 2, ""];
  seed.vendors.push({ id: "syn-hk", name: "Synthetic Harbour Ltd", names: ["Synthetic Harbour Ltd"], fields: { legalName: registry("Synthetic Harbour Ltd"), hqCountry: registry("HK"), parentCountry: registry("HK") } });
  const field = vendorIn(mergeCatalog(seed, []), "syn-hk").fields.nexus126;
  assert.equal(field.value, "No link");
  assert.equal(field.detail, "Hong Kong and Macau are not named in the section text. Trade confirms the treatment.");
});

test("part fields that follow a rule are derived from the category", () => {
  const catalog = build();
  const generator = partIn(catalog, "syn-us-gen").fields;
  assert.equal(generator.deviceTier.value, "Tier 3");
  assert.equal(generator.eoType.value, "Listed");
  assert.equal(generator.eoType.detail, "Generators are a listed type.");
  assert.equal(generator.eoType.source.url, "https://www.federalregister.gov/d/2026-17843");
  assert.equal(generator.fccInverter.value, "Not applicable");
  assert.equal(generator.chipControl.value, "Not applicable");
  assert.equal(generator.chinaExport.value, "Not assessed");
  assert.equal(partIn(catalog, "syn-us-bess").fields.fccInverter.value, "Confirm");
  assert.equal(partIn(catalog, "syn-us-gpu").fields.chipControl.value, "Relevant");
  assert.equal(partIn(catalog, "syn-us-cable").fields.deviceTier.value, "Tier 1");
  assert.equal(partIn(catalog, "syn-us-cable").fields.eoType.value, "Not named");
  for (const part of catalog.parts) for (const def of PART_FIELDS) assert.ok(part.fields[def.id], `${part.id} ${def.id}`);
  for (const vendor of catalog.vendors) for (const def of VENDOR_FIELDS) assert.ok(vendor.fields[def.id], `${vendor.id} ${def.id}`);
});

test("a confirmation keeps the sourced value and records who confirmed it", () => {
  const catalog = build([doc("vendor", "syn-us", { fields: { hqCountry: confirmed("US", "cpi") } }, 4)]);
  const vendor = vendorIn(catalog, "syn-us");
  const field = vendor.fields.hqCountry;
  assert.equal(field.state, "confirmed");
  assert.equal(field.value, "US");
  assert.equal(field.tier, 2);
  assert.equal(field.source.label, "Synthetic registry record");
  assert.equal(field.role, "cpi");
  assert.equal(field.stale, false);
  assert.equal(vendor.version, 4);
  assert.equal(isConfirmed(vendor, "hqCountry"), true);
  assert.equal(isConfirmed(vendor, "ultimateParent"), false);
  assert.deepEqual(vendor.recheck, []);
});

test("a change is shown as entered by the role, with its reason and the sourced value kept beside it", () => {
  const record = changed("CN", "US", "cpi", { reason: "The registry record shows a move.", source: { label: "Registry extract", url: "https://registry.example/extract" }, detail: "Extract dated November 21, 2026." });
  const catalog = build([doc("vendor", "syn-us", { fields: { hqCountry: record } })]);
  const vendor = vendorIn(catalog, "syn-us");
  const field = vendor.fields.hqCountry;
  assert.equal(field.state, "changed");
  assert.equal(field.value, "CN");
  assert.equal(field.tier, "R");
  assert.equal(field.asOf, "2026-11-21");
  assert.equal(field.baselineValue, "US");
  assert.equal(field.baselineSource.label, "Synthetic registry record");
  assert.equal(field.source.url, "https://registry.example/extract");
  assert.equal(field.reason, "The registry record shows a move.");
  // A derived field follows the value the role recorded.
  assert.equal(vendor.fields.nexus126.value, "Link");
  assert.match(vendor.fields.nexus126.detail, /The headquarters is in China/);
  const bare = build([doc("vendor", "syn-us", { fields: { hqCountry: changed("CA", "US", "cpi") } })]);
  assert.equal(vendorIn(bare, "syn-us").fields.hqCountry.source.label, "No source recorded");
});

test("a confirmation goes stale when the sourced value moves, and the entry shows a recheck", () => {
  const catalog = build([doc("vendor", "syn-us", { fields: { hqCountry: confirmed("CA", "cpi") } })]);
  const vendor = vendorIn(catalog, "syn-us");
  assert.equal(vendor.fields.hqCountry.stale, true);
  assert.equal(isConfirmed(vendor, "hqCountry"), false);
  assert.deepEqual(vendor.recheck.map(row => [row.reviewId, row.kind, row.role, row.title]), [["field:hqCountry", "field", "cpi", "Headquarters country changed after it was confirmed. The sourced value is now US."]]);
});

test("a screening result that the watch refreshed after a confirmation needs a recheck", () => {
  const auto = { "vendor:syn-us": { screening: { value: "Match", source: { label: "US Consolidated Screening List", url: "https://www.trade.gov/consolidated-screening-list" }, tier: 1, asOf: "2026-11-22", detail: "Name match on Entity List (EL).", changedAt: "2026-11-22T11:00:00.000Z", changedFrom: "No match" } } };
  const record = confirmed("No match", "trade", "2026-11-20T10:00:00.000Z");
  const catalog = build([doc("vendor", "syn-us", { fields: { screening: record } })], { auto });
  const field = vendorIn(catalog, "syn-us").fields.screening;
  assert.equal(field.value, "Match");
  assert.equal(field.asOf, "2026-11-22");
  assert.equal(field.changedFrom, "No match");
  assert.equal(field.stale, true);
  assert.equal(vendorIn(catalog, "syn-us").recheck[0].at, "2026-11-22T11:00:00.000Z");
  // The same value still needs a recheck when the list rows behind it moved after the confirmation.
  const moved = { "vendor:syn-us": { screening: { ...auto["vendor:syn-us"].screening, value: "No match", changedFrom: "Similar name" } } };
  assert.equal(vendorIn(build([doc("vendor", "syn-us", { fields: { screening: record } })], { auto: moved }), "syn-us").fields.screening.stale, true);
  // A confirmation recorded after the change stands.
  const later = confirmed("Match", "trade", "2026-11-22T12:00:00.000Z");
  const settled = vendorIn(build([doc("vendor", "syn-us", { fields: { screening: later } })], { auto }), "syn-us");
  assert.equal(settled.fields.screening.stale, false);
  assert.equal(isConfirmed(settled, "screening"), true);
});

test("a material watch review flags the entries it names until the owning role clears it", () => {
  const review = { id: "rev-1", title: "The FCC added a producer to the Covered List", url: "https://www.federalregister.gov/d/2026-00001", topics: ["fcc"], ownerRole: "trade", at: "2026-11-21T12:00:00.000Z", note: "Read the notice.", affected: { vendors: ["syn-cn"], parts: ["syn-cn-switch"] } };
  const open = build([], { reviews: [review] });
  assert.deepEqual(vendorIn(open, "syn-cn").recheck.map(row => [row.reviewId, row.kind, row.role]), [["rev-1", "review", "trade"]]);
  assert.equal(partIn(open, "syn-cn-switch").recheck.length, 1);
  assert.equal(vendorIn(open, "syn-us").recheck.length, 0);
  assert.equal(partIn(open, "syn-cn-gen").recheck.length, 0);
  const cleared = build([doc("vendor", "syn-cn", { cleared: [{ reviewId: "rev-1", at: "2026-11-21T13:00:00.000Z", by: "trade@example.com" }] })], { reviews: [review] });
  assert.equal(vendorIn(cleared, "syn-cn").recheck.length, 0);
  // Clearing the vendor does not clear the part. Each entry is cleared on its own record.
  assert.equal(partIn(cleared, "syn-cn-switch").recheck.length, 1);
  const early = build([doc("vendor", "syn-cn", { cleared: [{ reviewId: "rev-1", at: "2026-11-21T11:00:00.000Z", by: "trade@example.com" }] })], { reviews: [review] });
  assert.equal(vendorIn(early, "syn-cn").recheck.length, 1);
});

test("an entry the team adds says Not looked up yet until a source has been read", () => {
  const typed = (value) => [value, "Entered by NSTT", "", "R", ""];
  const vendorDoc = (payload = {}) => doc("vendor", "new-maker", { custom: { name: "New Maker", names: ["New Maker"], domain: "newmaker.example", asOf: "2026-11-22", fields: { legalName: typed("New Maker") } }, ...payload });
  const partDoc = doc("part", "new-maker-x1", { custom: { vendor: "new-maker", category: "relay", name: "X1", asOf: "2026-11-22", fields: { model: typed("X1") } } });
  const orphan = doc("part", "orphan-x1", { custom: { vendor: "nobody", category: "relay", name: "X1", fields: {} } });
  const first = build([vendorDoc(), partDoc, orphan]);
  const vendor = vendorIn(first, "new-maker");
  assert.equal(vendor.custom, true);
  assert.equal(vendor.fields.legalName.tier, "R");
  assert.equal(vendor.fields.hqCountry.value, "n.a.");
  assert.equal(vendor.fields.hqCountry.source.label, "Not looked up yet");
  assert.equal(vendor.fields.hqCountry.unchecked, true);
  assert.equal(partIn(first, "new-maker-x1").fields.rating.unchecked, true);
  assert.equal(partIn(first, "new-maker-x1").fields.eoType.value, "Listed");
  assert.equal(partIn(first, "orphan-x1"), undefined);
  // After the registry step reads its source, an empty registry field is dated to that day. The SEC field is still not looked up.
  const read = build([vendorDoc({ analysis: { day: "2026-11-22", steps: [{ id: "registry", status: "read" }, { id: "sec", status: "unavailable" }, { id: "ai", status: "not run" }] } })]);
  const after = vendorIn(read, "new-maker").fields;
  assert.equal(after.hqCountry.source.label, "No trusted public source found");
  assert.equal(after.hqCountry.asOf, "2026-11-22");
  assert.equal(after.hqCountry.unchecked, undefined);
  assert.equal(after.cik.unchecked, true);
  // A seeded entry was looked up when the repository was built.
  assert.equal(vendorIn(first, "syn-open").fields.hqCountry.source.label, "No trusted public source found");
  assert.equal(vendorIn(first, "syn-open").fields.hqCountry.asOf, "2026-11-20");
});

test("practice overlays are read by the same keys and marked as practice", () => {
  const catalog = build([doc("vendor", "practice:syn-us", { fields: { hqCountry: confirmed("US", "cpi") } })], { practice: true });
  assert.equal(catalog.practice, true);
  assert.equal(vendorIn(catalog, "syn-us").fields.hqCountry.state, "confirmed");
  assert.equal(build().practice, false);
});

test("Red is indicated only when Trade has confirmed a match on the Specially Designated Nationals list", () => {
  const open = build();
  const unconfirmed = benchmark(partIn(open, "syn-sdn-gen"), open, us);
  assert.equal(unconfirmed.posture, "Orange");
  assert.match(unconfirmed.reasons[0].text, /name match on a screening list that Trade has not yet confirmed/);
  const sdn = build([doc("vendor", "syn-sdn", { fields: { screening: confirmed("Match") } })]);
  const blocked = benchmark(partIn(sdn, "syn-sdn-gen"), sdn, us);
  assert.equal(blocked.posture, "Red");
  assert.equal(blocked.action, "Do not proceed absent resolution");
  assert.match(blocked.reasons[0].text, /Trade confirmed a match on the Specially Designated Nationals list/);
  assert.equal(blocked.reasons[0].cite.url, "https://www.trade.gov/consolidated-screening-list");
  // A confirmed match on another list is a finding for counsel. It does not indicate Red.
  const listed = build([doc("vendor", "syn-cn", { fields: { screening: confirmed("Match") } })]);
  const entity = benchmark(partIn(listed, "syn-cn-gen"), listed, us);
  assert.equal(entity.posture, "Orange");
  assert.match(entity.reasons[0].text, /^Trade confirmed a screening list match\./);
  // A confirmation that went stale no longer counts.
  const stale = build([doc("vendor", "syn-sdn", { fields: { screening: confirmed("No match") } })]);
  assert.equal(benchmark(partIn(stale, "syn-sdn-gen"), stale, us).posture, "Orange");
});

test("a missing fact adds an information request and never raises the posture", () => {
  const catalog = build();
  const known = benchmark(partIn(catalog, "syn-us-gen"), catalog, us);
  const unknown = benchmark(partIn(catalog, "syn-open-gen"), catalog, us);
  assert.equal(known.posture, "Yellow");
  assert.equal(unknown.posture, "Yellow");
  assert.deepEqual(rules(unknown), rules(known));
  assert.deepEqual(unknown.requests, [
    "Supplier names the factory and country of final assembly.",
    "Supplier states which parts or materials ship from China and whether a Chinese export license applies.",
    "Supplier states the ownership chain to the ultimate parent company.",
    "Confirm the headquarters country of the vendor.",
  ]);
  assert.ok(unknown.confidence.sourced < known.confidence.sourced);
  assert.equal(unknown.confidence.label, "Pending");
  // A similar name is a request to Trade until Trade clears or confirms it.
  const seed = syntheticSeed();
  seed.vendors.find(row => row.id === "syn-us").fields.screening[0] = "Similar name";
  const similar = mergeCatalog(seed, []);
  const result = benchmark(partIn(similar, "syn-us-gen"), similar, us);
  assert.equal(result.posture, "Yellow");
  assert.ok(result.requests.includes("Trade clears or confirms the similar name on the screening list."));
  const cleared = mergeCatalog(seed, [doc("vendor", "syn-us", { fields: { screening: confirmed("Similar name") } })]);
  assert.ok(!benchmark(partIn(cleared, "syn-us-gen"), cleared, us).requests.some(text => /similar name/.test(text)));
});

test("a listed type under Executive Order 14420 with a 22 CFR 126.1 link is Orange in the United States until the proof is held", () => {
  const catalog = build();
  const part = partIn(catalog, "syn-cn-gen");
  const open = benchmark(part, catalog, us);
  assert.equal(rules(open).eo, "Orange");
  const reason = open.reasons.find(row => row.rule === "eo");
  assert.match(reason.text, /^The equipment type is on the Executive Order 14420 list and the maker, its parent, or the factory links to a 22 CFR 126\.1 country\. The position for an islanded site is open\. Hold the supplier disclosure, outside counsel's written view, and a named alternate before purchase\.$/);
  assert.equal(reason.cite.url, "https://www.federalregister.gov/d/2026-17843");
  assert.doesNotMatch(benchmark(part, catalog, { ...us, power: "btm" }).reasons.find(row => row.rule === "eo").text, /islanded site/);
  assert.equal(rules(benchmark(part, catalog, { ...us, held: { disclosure: true, counsel: true, alternate: true } })).eo, "Yellow");
  assert.equal(rules(benchmark(part, catalog, { ...us, held: { disclosure: true, counsel: true }, hasAlternate: true })).eo, "Yellow");
  assert.equal(rules(benchmark(part, catalog, { ...us, held: { disclosure: true, counsel: true } })).eo, "Orange");
  assert.equal(rules(benchmark(part, catalog, { ...us, held: { disclosure: true, alternate: true } })).eo, "Orange");
  // The order reaches the United States grid. It is not applied to a site in Malaysia or the European Union.
  assert.equal(rules(benchmark(part, catalog, { region: "MY", design: "C", power: "island" })).eo, undefined);
  assert.equal(rules(benchmark(part, catalog, { region: "EU", design: "A", power: "island" })).eo, undefined);
  // A listed type with no link is not raised.
  assert.equal(rules(benchmark(partIn(catalog, "syn-us-gen"), catalog, us)).eo, undefined);
  // A factory in a named country is a link even when the vendor has none.
  const factory = build([doc("part", "syn-us-gen", { fields: { assemblyCountry: changed("CN", "US", "cpi") } })]);
  assert.equal(rules(benchmark(partIn(factory, "syn-us-gen"), factory, us)).eo, "Orange");
});

test("a recorded Department of Energy determination is Red in the United States and Orange elsewhere", () => {
  const record = changed("Determination recorded", "Listed", "trade", { source: { label: "Department of Energy determination", url: "https://www.energy.gov/determination" } });
  const catalog = build([doc("part", "syn-us-gen", { fields: { eoType: record } })]);
  const part = partIn(catalog, "syn-us-gen");
  const home = benchmark(part, catalog, us);
  assert.equal(home.posture, "Red");
  assert.match(home.reasons.find(row => row.rule === "eo").text, /Trade recorded a Department of Energy determination against this equipment under Executive Order 14420/);
  const abroad = benchmark(part, catalog, { region: "EU", design: "A", power: "island" });
  assert.equal(rules(abroad).eo, "Orange");
  assert.match(abroad.reasons.find(row => row.rule === "eo").text, /Counsel states whether it reaches this purchase/);
});

test("the FCC rules follow the category and the region", () => {
  const catalog = build();
  const network = partIn(catalog, "syn-cn-switch");
  assert.equal(rules(benchmark(network, catalog, us)).fcc, "Orange");
  assert.equal(rules(benchmark(network, catalog, { region: "EU", design: "A", power: "grid" })).fcc, "Yellow");
  assert.equal(rules(benchmark(partIn(catalog, "syn-cn-gen"), catalog, us)).fcc, "Yellow");
  const storage = partIn(catalog, "syn-us-bess");
  const home = benchmark(storage, catalog, us);
  assert.equal(rules(home).fccInverter, "Yellow");
  assert.ok(home.requests.includes("Supplier names the inverter maker, the country of production, and the FCC authorization or conditional approval."));
  assert.equal(home.tradeFlag, true);
  assert.equal(rules(benchmark(storage, catalog, { region: "EU", design: "A", power: "island" })).fccInverter, undefined);
  const covered = build([doc("part", "syn-us-bess", { fields: { fccInverter: changed("Covered", "Confirm"), chinaExport: changed("Exposed", "Not assessed") } })]);
  const result = benchmark(partIn(covered, "syn-us-bess"), covered, us);
  assert.equal(rules(result).fccInverter, "Orange");
  assert.equal(rules(result).chinaExport, "Yellow");
  assert.deepEqual(result.requests, []);
});

test("the chip export rule follows the reference design", () => {
  const catalog = build();
  const server = partIn(catalog, "syn-us-gpu");
  assert.equal(rules(benchmark(server, catalog, us)).chips, undefined);
  assert.equal(benchmark(server, catalog, us).tradeFlag, false);
  assert.equal(rules(benchmark(server, catalog, { ...us, design: "B" })).chips, "Yellow");
  const malaysia = benchmark(server, catalog, { region: "MY", design: "C", power: "island" });
  assert.equal(malaysia.posture, "Orange");
  assert.equal(rules(malaysia).chips, "Orange");
  assert.equal(malaysia.tradeFlag, true);
  assert.match(malaysia.reasons.find(row => row.rule === "chips").text, /Record the license, or the exception for companies headquartered in the United States with monthly reports, before shipment/);
  const licensed = benchmark(server, catalog, { region: "MY", design: "C", power: "island", held: { license: true } });
  assert.equal(rules(licensed).chips, "Yellow");
  assert.equal(licensed.posture, "Yellow");
  assert.equal(rules(benchmark(partIn(catalog, "syn-us-gen"), catalog, { region: "MY", design: "C", power: "island" })).chips, undefined);
});

test("a connected device is Yellow until its protections are held, and a line with no alternate is Yellow", () => {
  const catalog = build();
  const generator = partIn(catalog, "syn-us-gen");
  const open = benchmark(generator, catalog, us);
  assert.deepEqual(rules(open), { tier3: "Yellow" });
  assert.equal(open.action, POSTURE_ACTION.Yellow);
  assert.equal(open.tradeFlag, false);
  const held = benchmark(generator, catalog, { ...us, held: { protections: true } });
  assert.equal(held.posture, "Green");
  assert.equal(held.action, "Proceed");
  const cable = partIn(catalog, "syn-us-cable");
  assert.equal(benchmark(cable, catalog, us).posture, "Green");
  assert.deepEqual(benchmark(cable, catalog, us).requests, []);
  const single = benchmark(cable, catalog, { ...us, hasAlternate: false });
  assert.deepEqual(rules(single), { alternate: "Yellow" });
  assert.equal(single.tradeFlag, false);
  assert.equal(rules(benchmark(cable, catalog, { ...us, hasAlternate: true })).alternate, undefined);
  // The Section 1260H list is an indicator for a private owner.
  assert.equal(rules(benchmark(partIn(catalog, "syn-cn-gen"), catalog, us)).s1260h, "Yellow");
});

test("confidence rises with the share of rule fields a role has confirmed", () => {
  const base = build();
  const vendor = vendorIn(base, "syn-us");
  const part = partIn(base, "syn-us-gen");
  const vendorIds = ["hqCountry", "ultimateParent", "parentCountry", "screening", "section1260h", "nexus126"];
  const confirm = (entry, ids, role) => Object.fromEntries(ids.map(id => [id, confirmed(entry.fields[id].value, role)]));
  assert.equal(benchmark(part, base, us).confidence.label, "Pending");
  const one = build([doc("vendor", "syn-us", { fields: confirm(vendor, ["hqCountry"], "cpi") })]);
  assert.equal(benchmark(partIn(one, "syn-us-gen"), one, us).confidence.label, "Low");
  const half = build([doc("vendor", "syn-us", { fields: confirm(vendor, vendorIds.slice(0, 5), "cpi") })]);
  assert.deepEqual(benchmark(partIn(half, "syn-us-gen"), half, us).confidence, { confirmed: 5, sourced: 9, total: 10, label: "Medium" });
  // Every field confirmed still reads Medium while the Chinese export exposure is not assessed.
  const partFields = confirm(part, ["deviceTier", "assemblyCountry", "eoType", "chinaExport"], "trade");
  const all = build([doc("vendor", "syn-us", { fields: confirm(vendor, vendorIds, "cpi") }), doc("part", "syn-us-gen", { fields: partFields })]);
  assert.deepEqual(benchmark(partIn(all, "syn-us-gen"), all, us).confidence, { confirmed: 10, sourced: 9, total: 10, label: "Medium" });
  const assessed = build([doc("vendor", "syn-us", { fields: confirm(vendor, vendorIds, "cpi") }), doc("part", "syn-us-gen", { fields: { ...partFields, chinaExport: changed("Not exposed", "Not assessed") } })]);
  const high = benchmark(partIn(assessed, "syn-us-gen"), assessed, us);
  assert.deepEqual(high.confidence, { confirmed: 10, sourced: 10, total: 10, label: "High" });
  // Confidence and posture are separate. The posture did not move.
  assert.equal(high.posture, "Yellow");
});

test("an open recheck is a request to the owning role and does not move the posture", () => {
  const review = { id: "rev-2", title: "A control system advisory names this maker", url: "https://www.cisa.gov/advisory", topics: ["ics"], ownerRole: "cpi", at: "2026-11-21T12:00:00.000Z", affected: { vendors: ["syn-us"], parts: [] } };
  const catalog = build([], { reviews: [review] });
  const result = benchmark(partIn(catalog, "syn-us-gen"), catalog, us);
  assert.equal(result.posture, "Yellow");
  assert.ok(result.requests.includes("CPI rechecks this entry after a change: A control system advisory names this maker"));
});

test("a part with no vendor record cannot be benchmarked as clear", () => {
  const result = benchmark({ id: "loose", vendor: "nobody", category: "relay", fields: {} }, build(), us);
  assert.equal(result.posture, "Yellow");
  assert.equal(result.reasons[0].rule, "vendor");
  assert.equal(result.confidence.label, "Pending");
});

test("the fit check names the fact behind each reading and who stated it", () => {
  const catalog = build();
  const part = partIn(catalog, "syn-us-gen");
  const checks = fitCheck(part, { region: "US", power: "island" });
  assert.deepEqual(checks.map(row => [row.id, row.status]), [["frequency", "Likely fit"], ["rating", "Stated"], ["duty", "Stated by the maker"], ["transient", "Stated by the maker"], ["ul2200", "Stated by the maker"]]);
  assert.equal(checks[0].basis, "The maker states 60 Hz.");
  assert.equal(checks[1].basis, "The maker states 2.5 MW continuous.");
  assert.equal(checks[4].basis, "The standards field reads: UL 2200; ISO 8528-5 G3.");
  assert.ok(checks.every(row => row.expect && row.cite?.label));
  assert.equal(fitSummary(checks), "Likely fit");
  // The United States listing is not asked for in the European Union. CE marking is.
  const europe = fitCheck(part, { region: "EU", power: "island" });
  assert.deepEqual(europe.map(row => [row.id, row.status]), [["frequency", "Does not fit"], ["rating", "Stated"], ["duty", "Stated by the maker"], ["transient", "Stated by the maker"], ["euMachinery", "Not stated"]]);
  assert.equal(europe.at(-1).basis, "No recorded source states it. Ask the supplier.");
  assert.equal(fitSummary(europe), "Does not fit");
  // Continuous duty matters only when the plant supplies prime power.
  assert.ok(!fitCheck(part, { region: "US", power: "grid" }).some(row => row.id === "duty"));
  // A value the role recorded is not attributed to the maker.
  const edited = build([doc("part", "syn-us-gen", { fields: { standards: changed("UL 2200 listed; ISO 8528-5 G3", "UL 2200; ISO 8528-5 G3", "cpi"), frequency: changed("60 Hz", "60 Hz", "nstt") } })]);
  const after = fitCheck(partIn(edited, "syn-us-gen"), { region: "US", power: "island" });
  assert.equal(after.find(row => row.id === "ul2200").status, "Stated");
  assert.equal(after[0].basis, "The NSTT role recorded 60 Hz.");
});

test("a criterion with no public answer at the model level is asked of the supplier", () => {
  const catalog = build();
  const server = fitCheck(partIn(catalog, "syn-us-gpu"), { region: "US", power: "island" });
  assert.deepEqual(server.map(row => [row.id, row.status]), [["rating", "Stated"], ["rackPower", "Ask the supplier"]]);
  assert.equal(fitSummary(server), "Fit to confirm");
  const bare = fitCheck(partIn(catalog, "syn-open-gen"), { region: "US", power: "island" });
  assert.deepEqual(bare.map(row => row.status), ["Not stated", "Not stated", "Not stated", "Not stated", "Not stated"]);
  assert.equal(bare[0].basis, "No recorded source states a frequency.");
  assert.equal(fitSummary(bare), "Fit to confirm");
  assert.equal(fitSummary([]), "Likely fit");
  const storage = fitCheck(partIn(catalog, "syn-us-bess"), { region: "US", power: "island" });
  assert.deepEqual(storage.filter(row => /^ul9540/.test(row.id)).map(row => [row.id, row.status]), [["ul9540a", "Stated by the maker"], ["ul9540", "Stated by the maker"]]);
  assert.ok(fitCheck(partIn(catalog, "syn-us-bess"), { region: "EU", power: "island" }).some(row => row.id === "euBattery" && row.status === "Ask the supplier"));
});

test("frequency fit reads 50 Hz, 60 Hz, or both from the recorded text", () => {
  assert.equal(frequencyFit("60 Hz", "US"), "fit");
  assert.equal(frequencyFit("50 Hz", "US"), "unfit");
  assert.equal(frequencyFit("50 / 60 Hz", "MY"), "fit");
  assert.equal(frequencyFit("60 Hz", "EU"), "unfit");
  assert.equal(frequencyFit("n.a.", "US"), "unknown");
  assert.equal(frequencyFit("600 V", "US"), "unknown");
});

test("alternates come from the same category and a different ultimate parent, best posture first", () => {
  const catalog = build();
  const ranked = (id, context, limit) => alternates(partIn(catalog, id), catalog, context, limit).map(row => `${row.part.id}:${row.result.posture}`);
  assert.deepEqual(ranked("syn-us-gen", us), ["syn-de-gen:Yellow", "syn-de2-gen:Yellow", "syn-open-gen:Yellow", "syn-sdn-gen:Orange", "syn-cn-gen:Orange"]);
  // The other part from the same vendor is never offered, and neither is a sister company under the same parent.
  assert.ok(!ranked("syn-us-gen", us).some(row => row.startsWith("syn-us-50")));
  assert.deepEqual(ranked("syn-de-gen", us), ["syn-us-gen:Yellow", "syn-open-gen:Yellow", "syn-sdn-gen:Orange", "syn-cn-gen:Orange"]);
  assert.deepEqual(ranked("syn-us-gen", us, 2), ["syn-de-gen:Yellow", "syn-de2-gen:Yellow"]);
  // A part that does not fit the region is left out.
  assert.deepEqual(ranked("syn-us-50", { region: "EU", design: "A", power: "island" }), ["syn-de-gen:Yellow", "syn-open-gen:Yellow"]);
  assert.deepEqual(ranked("syn-us-cable", us), []);
  assert.deepEqual(alternates(null, catalog, us), []);
  // A Red part is never offered as an alternate.
  const blocked = build([doc("vendor", "syn-sdn", { fields: { screening: confirmed("Match") } })]);
  assert.ok(!alternates(partIn(blocked, "syn-us-gen"), blocked, us).some(row => row.part.id === "syn-sdn-gen"));
  assert.equal(parentKey(vendorIn(catalog, "syn-de")), parentKey(vendorIn(catalog, "syn-de2")));
  assert.equal(parentKey(vendorIn(catalog, "syn-us")), "SYNTHETIC POWER");
  assert.deepEqual(entityNames(vendorIn(catalog, "syn-de")), ["Synthetic Controls GmbH", "Synthetic Holding SE"]);
  assert.deepEqual(entityNames(vendorIn(catalog, "syn-us")), ["Synthetic Power Corp"]);
});

test("watch items are sorted into rule topics, and the bulk-power order is matched under both numbers", () => {
  assert.deepEqual(classifyTopics("Executive Order 14420 on bulk-power system electric equipment"), ["eo14420"]);
  assert.deepEqual(classifyTopics("Agencies respond to Executive Order 14421"), ["eo14420"]);
  assert.deepEqual(classifyTopics("Securing the bulk power system"), ["eo14420"]);
  assert.deepEqual(classifyTopics("Additions to the Entity List"), ["entity-list"]);
  assert.deepEqual(classifyTopics("FCC adds to Covered List and semiconductor rules"), ["chips", "fcc"]);
  assert.deepEqual(classifyTopics("ICSA-26-123-01 Synthetic controller"), ["ics"]);
  assert.deepEqual(classifyTopics("Large load interconnection, docket RM26-4"), ["grid"]);
  assert.deepEqual(classifyTopics("MOFCOM announces rare earth controls"), ["china-export"]);
  assert.deepEqual(classifyTopics("Chinese military companies under Section 1260H"), ["1260h"]);
  assert.deepEqual(classifyTopics("Amendment to 22 CFR 126.1"), ["itar126"]);
  // The general topic applies only when no rule topic matches.
  assert.deepEqual(classifyTopics("A statement on data center policy"), ["policy"]);
  assert.deepEqual(classifyTopics("A recipe for bread"), []);
  assert.deepEqual(WATCH_TOPICS.filter(row => row.role === "cpi").map(row => row.id), ["ics", "grid"]);
  assert.ok(WATCH_TOPICS.filter(row => row.role !== "cpi").every(row => row.role === "trade"));
  assert.match(WATCH_TOPICS[0].help, /Executive Order 14420 and cites it as 91 FR 55995.*numbers? it 14421/);
});

test("vendors named in a text are found on word boundaries, and short names need their exact capitals", () => {
  const catalog = build();
  assert.deepEqual(vendorsNamed("Synthetic Power Corp wins an order", catalog.vendors), ["syn-us"]);
  assert.deepEqual(vendorsNamed("synthetic controls announces a recall", catalog.vendors), ["syn-de"]);
  assert.deepEqual(vendorsNamed("A notice about Synthetic Listed Works Co., Ltd. and others", catalog.vendors), ["syn-cn"]);
  assert.deepEqual(vendorsNamed("Presynthetic Powerful engines", catalog.vendors), []);
  assert.deepEqual(vendorsNamed("Nothing here names a maker", catalog.vendors), []);
  const short = [{ id: "abb", name: "ABB", names: [] }, { id: "ge", name: "GE", names: ["GE Vernova"] }];
  assert.deepEqual(vendorsNamed("The ABB relay was updated", short), ["abb"]);
  assert.deepEqual(vendorsNamed("the abb relay was updated", short), []);
  assert.deepEqual(vendorsNamed("GE Vernova ships a turbine", short), ["ge"]);
  assert.deepEqual(vendorsNamed("GE ships a turbine", short), []);
});

test("a one-word name is a clear reference only for a vendor that carries a list entry or a 126.1 country link", () => {
  const field = (value) => ({ value });
  const clear = { screening: field("No match"), fccCovered: field("Not named"), section1260h: field("Not listed"), nexus126: field("No link") };
  const vendors = [
    { id: "surname", name: "Synthword", names: ["Synthword, Inc."], fields: clear },
    { id: "two-words", name: "Synthetic Power Corp", names: [], fields: clear },
    { id: "match", name: "Synthlisted", names: [], fields: { ...clear, screening: field("Match") } },
    { id: "similar", name: "Synthsimilar", names: [], fields: { ...clear, screening: field("Similar name") } },
    { id: "covered", name: "Synthcovered", names: [], fields: { ...clear, fccCovered: field("Named producer") } },
    { id: "military", name: "Synthmilitary", names: [], fields: { ...clear, section1260h: field("Listed") } },
    { id: "country", name: "Synthcountry", names: ["Synthcountry Technology Co., Ltd."], fields: { ...clear, nexus126: field("Link") } },
    { id: "no-fields", name: "Synthbare", names: [] },
  ];
  const both = (text) => [vendorsNamed(text, vendors), vendorsNamedClearly(text, vendors)];
  // A bill named after a person shares a word with a vendor. The word is found, and it is not a clear reference.
  assert.deepEqual(both("H.R. 1 - Charlotte Synthword Organ Transplant Act"), [["surname"], []]);
  assert.deepEqual(both("A statement on Synthword, Inc. and its suppliers"), [["surname"], []]);
  assert.deepEqual(both("Synthsimilar and Synthbare open a plant"), [["similar", "no-fields"], []]);
  // A name of two or more words is a clear reference.
  assert.deepEqual(both("Statement on Synthetic Power Corp"), [["two-words"], ["two-words"]]);
  assert.deepEqual(both("Synthcountry Technology Co., Ltd. is named in the bill"), [["country"], ["country"]]);
  // A one-word name is a clear reference for a vendor on a list or with a country link.
  assert.deepEqual(both("Stop Synthlisted Act"), [["match"], ["match"]]);
  assert.deepEqual(both("Synthcovered, Synthmilitary, and Synthcountry are named"), [["covered", "military", "country"], ["covered", "military", "country"]]);
  assert.deepEqual(both("Nothing here names a maker"), [[], []]);
});

test("a material change flags a narrow set of entries by default and a wider set when marked broad", () => {
  const catalog = build();
  const touched = (input) => affectedEntries(catalog, input);
  assert.deepEqual(touched({ topics: ["fcc"] }), { vendors: ["syn-cn"], parts: ["syn-cn-switch", "syn-us-bess"] });
  assert.deepEqual(touched({ topics: ["1260h"] }), { vendors: ["syn-cn"], parts: ["syn-cn-gen", "syn-cn-switch"] });
  assert.deepEqual(touched({ topics: ["itar126"] }), { vendors: ["syn-cn"], parts: ["syn-cn-gen", "syn-cn-switch"] });
  assert.equal(touched({ topics: ["itar126"], broad: true }).vendors.length, catalog.vendors.length);
  assert.deepEqual(touched({ topics: ["eo14420"] }), { vendors: [], parts: ["syn-cn-gen"] });
  assert.deepEqual(touched({ topics: ["eo14420"], broad: true }).parts, ["syn-us-gen", "syn-us-50", "syn-de-gen", "syn-de2-gen", "syn-cn-gen", "syn-sdn-gen", "syn-open-gen", "syn-us-bess"]);
  assert.deepEqual(touched({ topics: ["chips"] }), { vendors: [], parts: ["syn-us-gpu"] });
  assert.deepEqual(touched({ topics: ["china-export"] }), { vendors: ["syn-cn"], parts: [] });
  assert.ok(!touched({ topics: ["china-export"], broad: true }).parts.includes("syn-us-cable"));
  // A vendor with a match, a similar name, or no screening result is rechecked when the Entity List changes.
  assert.deepEqual(touched({ topics: ["entity-list"] }).vendors, ["syn-cn", "syn-sdn", "syn-open"]);
  // An advisory reaches only the connected parts of the vendors it names.
  assert.deepEqual(touched({ topics: ["ics"], vendors: ["syn-de"] }), { vendors: ["syn-de"], parts: ["syn-de-gen"] });
  assert.deepEqual(touched({ topics: ["ics"] }), { vendors: [], parts: [] });
  assert.deepEqual(touched({ vendors: ["syn-us", "not-in-the-repository"] }), { vendors: ["syn-us"], parts: ["syn-us-gen", "syn-us-50", "syn-us-gpu", "syn-us-cable", "syn-us-bess"] });
  assert.deepEqual(touched({ topics: ["policy"] }), { vendors: [], parts: [] });
});

test("only the owning role confirms or changes a field, and a change needs a valid value and a reason", () => {
  const reason = "The registry record shows Germany.";
  assert.equal(fieldChangeBlock("vendor", "not-a-field", { action: "confirm" }, "cpi"), "Choose a field that belongs to this record.");
  assert.equal(fieldChangeBlock("vendor", "hqCountry", { action: "confirm" }, "trade"), "Only the CPI role confirms or changes this field: Headquarters country.");
  assert.equal(fieldChangeBlock("part", "eoType", { action: "confirm" }, "nstt"), "Only the Trade role confirms or changes this field: Executive Order 14420 listed type.");
  assert.equal(fieldChangeBlock("part", "deviceTier", { action: "confirm" }, "cpi"), "Only the NSTT role confirms or changes this field: Device tier.");
  assert.equal(fieldChangeBlock("vendor", "hqCountry", { action: "confirm" }, "cpi"), "");
  assert.equal(fieldChangeBlock("part", "deviceTier", { action: "reset" }, "nstt"), "");
  assert.equal(fieldChangeBlock("vendor", "hqCountry", { action: "delete" }, "cpi"), "Choose Confirm, Change, or Reset.");
  assert.equal(fieldChangeBlock("vendor", "hqCountry", { action: "change", value: "" }, "cpi"), "Enter the new value.");
  assert.equal(fieldChangeBlock("vendor", "hqCountry", { action: "change", value: "Germany", reason }, "cpi"), "Use a two-letter country code, or n.a. when the country is not yet disclosed.");
  assert.equal(fieldChangeBlock("vendor", "hqCountry", { action: "change", value: "n.a.", reason: "The supplier has not disclosed it." }, "cpi"), "");
  assert.equal(fieldChangeBlock("vendor", "hqCountry", { action: "change", value: "DE", reason: "short" }, "cpi"), "State the reason for the change in a full sentence.");
  assert.equal(fieldChangeBlock("vendor", "hqCountry", { action: "change", value: "DE", reason, sourceUrl: "ftp://registry.example/record" }, "cpi"), "Use an HTTP or HTTPS source address without credentials.");
  assert.equal(fieldChangeBlock("vendor", "hqCountry", { action: "change", value: "DE", reason, sourceUrl: "https://registry.example/record" }, "cpi"), "");
  assert.equal(fieldChangeBlock("vendor", "screening", { action: "change", value: "Cleared", reason: "The name belongs to a different party." }, "trade"), "Choose one of: No match, Similar name, Match.");
  assert.equal(fieldChangeBlock("part", "deviceTier", { action: "change", value: "Tier 2", reason: "No network port is fitted." }, "nstt"), "");
});

test("every field has one owning role, and the rule fields offer fixed choices", () => {
  const owners = new Set([...VENDOR_FIELDS, ...PART_FIELDS].map(row => row.owner));
  assert.deepEqual([...owners].sort(), ["cpi", "nstt", "trade"]);
  assert.deepEqual(VENDOR_FIELDS.filter(row => row.owner === "trade").map(row => row.id), ["screening", "fccCovered", "section1260h", "nexus126"]);
  assert.deepEqual(PART_FIELDS.filter(row => row.owner === "trade").map(row => row.id), ["eoType", "fccInverter", "chipControl", "chinaExport"]);
  assert.deepEqual(PART_FIELDS.filter(row => row.owner === "nstt").map(row => row.id), ["model", "deviceTier", "rating", "frequency"]);
  assert.ok([...VENDOR_FIELDS, ...PART_FIELDS].every(row => row.label && row.help.endsWith(".")));
  assert.deepEqual(fieldDef("part", "eoType").options, ["Not named", "Possible", "Listed", "Determination recorded"]);
  assert.equal(fieldDef("vendor", "eoType"), null);
});

test("a new entry needs a usable name, a known vendor and category, and must not repeat an entry", () => {
  const catalog = build();
  assert.equal(newEntryBlock("vendor", { legalName: "" }, catalog), "Enter the vendor's legal name.");
  assert.equal(newEntryBlock("vendor", { legalName: "New Maker AG", website: "not a site" }, catalog), "Write the website as a domain name, such as example.com.");
  assert.equal(newEntryBlock("vendor", { legalName: "New Maker AG", website: "https://www.newmaker.example/" }, catalog), "");
  assert.equal(newEntryBlock("vendor", { legalName: "New Maker AG" }, catalog), "");
  assert.equal(newEntryBlock("vendor", { legalName: "!!" }, catalog), "Use letters or numbers in the name.");
  assert.equal(newEntryBlock("vendor", { legalName: "Syn US" }, catalog), "This vendor is already in the repository as Synthetic Power Corp. Open it and confirm or change its fields.");
  // The same legal name with another legal form, case, or punctuation is the same vendor.
  for (const name of ["Synthetic Power Corporation", "SYNTHETIC POWER CORP.", "The Synthetic Power Co., Inc."]) {
    assert.equal(newEntryBlock("vendor", { legalName: name }, catalog), "This vendor is already in the repository as Synthetic Power Corp. Open it and confirm or change its fields.", name);
  }
  assert.equal(newEntryBlock("vendor", { legalName: "Synthetic Power Systems Corp" }, catalog), "");
  assert.equal(newEntryBlock("part", { model: "", vendor: "syn-us", category: "relay" }, catalog), "Enter the model as the maker writes it.");
  assert.equal(newEntryBlock("part", { model: "X1", vendor: "nobody", category: "relay" }, catalog), "Choose the vendor that makes this part. Add the vendor first when it is new.");
  assert.equal(newEntryBlock("part", { model: "X1", vendor: "syn-us", category: "nothing" }, catalog), "Choose the part category.");
  assert.equal(newEntryBlock("part", { model: "X1", vendor: "syn-us", category: "relay", sourceUrl: "javascript:alert(1)" }, catalog), "Use an HTTP or HTTPS address for the maker's product page.");
  assert.equal(newEntryBlock("part", { model: "X1", vendor: "syn-us", category: "relay", sourceUrl: "https://maker.example/x1" }, catalog), "");
  assert.equal(newEntryBlock("part", { model: "Gen", vendor: "syn-us", category: "gas-engine-set" }, catalog), "This part is already in the repository as SYN-US-GEN. Open it and confirm or change its fields.");
  // The same model with other spacing or case is the same part under that vendor, and a new part under another vendor.
  assert.equal(newEntryBlock("part", { model: "syn us gen", vendor: "syn-us", category: "gas-engine-set" }, catalog), "This part is already in the repository as SYN-US-GEN. Open it and confirm or change its fields.");
  assert.equal(newEntryBlock("part", { model: "syn us gen", vendor: "syn-open", category: "gas-engine-set" }, catalog), "");
  assert.equal(entryId("Société Générale S.A."), "societe-generale-s-a");
  assert.equal(entryId("  New   Maker AG "), "new-maker-ag");
});

test("a vendor website is stored as a plain domain, and unsafe addresses are refused", () => {
  assert.equal(siteDomain("https://www.Example.com/products?x=1"), "example.com");
  assert.equal(siteDomain("example.com"), "example.com");
  assert.equal(siteDomain("sub.example.co.uk"), "sub.example.co.uk");
  assert.equal(siteDomain("not a site"), "");
  assert.equal(siteDomain("localhost"), "");
  assert.equal(siteDomain("http://user:secret@example.com"), "");
  assert.equal(siteDomain(""), "");
  assert.equal(safeUrl("https://www.ecfr.gov/current/title-22/section-126.1"), "https://www.ecfr.gov/current/title-22/section-126.1");
  assert.equal(safeUrl("https://user:secret@example.com/"), "");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,x"), "");
  assert.equal(safeUrl(""), "");
});

test("a part title does not repeat the brand when the part name already opens with it", () => {
  assert.equal(partTitle("Synthetic Power Corp", "Synthetic G3520"), "Synthetic G3520");
  assert.equal(partTitle("Synthetic Power Corp", "G3520"), "Synthetic Power Corp G3520");
  assert.equal(partTitle("", "G3520"), "G3520");
  assert.equal(partTitle("Synthetic Power Corp", ""), "Synthetic Power Corp");
});

test("the repository seed is complete and every recorded value names its source", () => {
  assert.equal(CATALOG_SEED.asOf, "2026-11-20");
  assert.equal(CATALOG_SEED.vendors.length, 90);
  assert.equal(CATALOG_SEED.parts.length, 135);
  const vendorIds = CATALOG_SEED.vendors.map(row => row.id);
  const partIds = CATALOG_SEED.parts.map(row => row.id);
  assert.equal(new Set(vendorIds).size, vendorIds.length);
  assert.equal(new Set(partIds).size, partIds.length);
  assert.ok([...vendorIds, ...partIds].every(id => id === entryId(id)));
  assert.deepEqual(CATALOG_SEED.parts.filter(row => !vendorIds.includes(row.vendor)).map(row => row.id), []);
  assert.deepEqual(CATALOG_SEED.parts.filter(row => !categoryOf(row.category)).map(row => row.id), []);
  // Every category and every subsystem in the guide has at least one part to benchmark.
  assert.deepEqual(CATEGORIES.filter(category => !CATALOG_SEED.parts.some(row => row.category === category.id)).map(row => row.id), []);
  assert.equal(new Set(CATALOG_SEED.parts.map(row => categoryOf(row.category).subsystem)).size, SUBSYSTEMS.length);
  assert.ok(CATEGORIES.every(category => SUBSYSTEMS.some(row => row.id === category.subsystem) && ["Listed", "Possible", "Not named"].includes(category.eo) && category.eoNote.endsWith(".")));
  const problems = [];
  for (const [kind, rows] of [["vendor", CATALOG_SEED.vendors], ["part", CATALOG_SEED.parts]]) {
    for (const row of rows) {
      if (!row.name) problems.push(`${row.id}: no name`);
      for (const [id, raw] of Object.entries(row.fields || {})) {
        const at = `${row.id}.${id}`;
        if (!fieldDef(kind, id)) { problems.push(`${at}: unknown field`); continue; }
        if (!Array.isArray(raw) || raw.length < 4 || raw.length > 5) { problems.push(`${at}: wrong shape`); continue; }
        const [value, label, url, tier, detail] = raw;
        if (!String(value || "").trim()) problems.push(`${at}: no value`);
        if (!String(label || "").trim()) problems.push(`${at}: no source label`);
        if (!SOURCE_TIERS[tier]) problems.push(`${at}: unknown source tier`);
        if (url && safeUrl(url) !== url && safeUrl(url) !== `${url}/`) problems.push(`${at}: unsafe source address`);
        // A government, registry, standards, or maker source must give its address.
        if ([1, 2, 3, 4].includes(Number(tier)) && !url) problems.push(`${at}: no source address`);
        if (/\u2014/.test(`${value} ${label} ${detail || ""}`)) problems.push(`${at}: em dash`);
        const def = fieldDef(kind, id);
        if (def.options && !def.options.includes(value)) problems.push(`${at}: value outside the choices`);
        // A country that is not public is recorded as n.a. with the source that was read.
        if (def.country && !/^[A-Z]{2}$/.test(value) && value !== "n.a.") problems.push(`${at}: country is not a two-letter code`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("every seeded vendor carries the three list checks, and each category offers a second parent where one exists", () => {
  const catalog = mergeCatalog(CATALOG_SEED, []);
  assert.equal(catalog.vendors.length, 90);
  assert.equal(catalog.parts.length, 135);
  for (const vendor of catalog.vendors) {
    for (const id of ["legalName", "screening", "fccCovered", "section1260h"]) assert.notEqual(valueOf(vendor, id), "n.a.", `${vendor.id} ${id}`);
    assert.equal(vendor.fields.screening.tier, 1, vendor.id);
    assert.equal(vendor.fields.screening.source.url, "https://www.trade.gov/consolidated-screening-list", vendor.id);
    assert.ok(vendor.fields.screening.detail, vendor.id);
  }
  const parents = new Map();
  for (const part of catalog.parts) parents.set(part.category, (parents.get(part.category) || new Set()).add(parentKey(vendorOf(catalog, part))));
  // Fuel cells have one maker in the repository. Every other category offers at least two ultimate parents.
  assert.deepEqual([...parents].filter(([, set]) => set.size < 2).map(([id]) => id), ["fuel-cell"]);
});

test("the seeded list results agree with the dated FCC and Section 1260H lists held in the workbench", () => {
  const catalog = mergeCatalog(CATALOG_SEED, []);
  const differences = [];
  for (const vendor of catalog.vendors) {
    const checks = listChecks(entityNames(vendor));
    for (const id of ["fccCovered", "section1260h"]) if (valueOf(vendor, id) !== checks[id].value) differences.push([vendor.id, id, valueOf(vendor, id), checks[id].value]);
  }
  assert.deepEqual(differences, []);
  assert.deepEqual(catalog.vendors.filter(row => valueOf(row, "fccCovered") === "Named producer").map(row => row.id), ["huawei", "hikvision", "dahua"]);
  assert.deepEqual(catalog.vendors.filter(row => valueOf(row, "section1260h") === "Listed").map(row => row.id), ["catl", "byd", "huawei", "hikvision", "dahua", "inspur"]);
  assert.deepEqual(catalog.vendors.filter(row => valueOf(row, "hqCountry") === "CN").map(row => row.id), ["catl", "byd", "sungrow", "huawei", "tbea", "envicool", "hikvision", "dahua", "inspur"]);
});

test("no seeded part is indicated Red before a role has confirmed a finding", () => {
  const catalog = mergeCatalog(CATALOG_SEED, []);
  const designs = [{ region: "US", design: "A" }, { region: "US", design: "B" }, { region: "MY", design: "C" }, { region: "EU", design: "A" }];
  const red = [];
  let raised = 0;
  for (const part of catalog.parts) {
    for (const context of designs) {
      for (const power of ["island", "grid"]) {
        const result = benchmark(part, catalog, { ...context, power });
        if (result.posture === "Red") red.push(`${part.id} ${context.region} ${context.design}`);
        if (result.posture === "Orange") raised += 1;
        assert.ok(result.reasons.every(row => row.text.endsWith(".") && row.cite?.label), part.id);
        assert.equal(result.confidence.label, "Pending", part.id);
      }
    }
  }
  assert.deepEqual(red, []);
  assert.ok(raised > 0);
  // The screening match on a seeded vendor is an unconfirmed finding, so it reads Orange.
  const huawei = benchmark(catalog.parts.find(row => row.id === "huawei-ups5000-h"), catalog, us);
  assert.equal(huawei.posture, "Orange");
  assert.equal(rules(huawei).screening, "Orange");
  assert.equal(rules(huawei).eo, "Orange");
  assert.equal(huawei.tradeFlag, true);
});
