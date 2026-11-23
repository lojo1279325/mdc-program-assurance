import { coreName } from "../public/catalog-model.js";

// Dated copies of two public lists, used to prefill a new vendor or part. A role confirms every value.
// Each list names its source and the date it was read. The regulatory watch reports later changes as items to review.

// Section 1260H list of Chinese military companies, as published at 91 FR 35189 on June 10, 2026,
// less the entity removed by the notice at 91 FR 72536 on November 10, 2026. Names read exactly as the notice prints them.
export const S1260H_LIST = {
  asOf: "2026-11-10",
  label: "Section 1260H list, 91 FR 35189",
  url: "https://www.federalregister.gov/d/2026-11571",
  removal: { label: "Section 1260H removal notice, 91 FR 72536", url: "https://www.federalregister.gov/d/2026-22840" },
  entries: [
    "360 Security Technology, Inc. (Qihoo 360)",
    "Aerospace CH UAV Co., Ltd. (CH UAV)",
    "Aerosun Corporation (Aerosun)",
    "Alibaba Group Holding Limited (Alibaba)",
    "Autel Intelligent Technology Corp., Ltd. (Autel Technology)",
    "Aviation Industry Corporation of China, Ltd. (AVIC) (and AVIC subsidiaries: Align Aerospace LLC, Avicopter PLC, AVIC Aerospace Systems Co., Ltd., AVIC Airborne Systems Co., Ltd., AVIC Asset Management Corporation Ltd., AVIC Aviation High-Technology Company Limited (AVIC Aviation Hi-Tech), AVIC Chengdu Aircraft Co., Ltd. (formerly Zhonghang Electronic Measuring Instruments Company Limited (ZEMIC)), AVIC Electromechanical Systems Co. Ltd., AVIC Heavy Machinery Company Limited (AVIC Heavy Machinery), AVIC JONHON Optronic Technology Co., Ltd. (AVIC Jonhon), AVIC Shenyang Aircraft Company Limited (AVIC Shenyang), AVIC Xi'an Aircraft Industry Group Company Ltd. (formerly Xi'an Aircraft Industry Group Co., Ltd.), Changhe Aircraft Industries (Group) Co., Ltd., Cirrus Design Corporation, Continental Aerospace Technologies, Inc., Jiangxi Hongdu Aviation Industry Co., Ltd. (Hongdu Aviation), and Shenyang Aircraft Design Institute)",
    "Baicells Technologies Co., Ltd. (Baicells)",
    "Baidu, Inc. (Baidu)",
    "Beijing Zhidao Chuangyu Information Technology Co., Ltd. (Knownsec)",
    "BGI Group (and BGI Group subsidiaries: BGI Americas Corporation, BGI Genomics Co., Ltd. (BGI), Complete Genomics, Inc., Forensic Genomics International (FGI), GBI Diagnostics, Inc., Innomics, Inc., and STomics Americas, Ltd.)",
    "BOE Technology Group Co., Ltd. (BOE)",
    "BYD Company Limited (BYD)",
    "CALB Group Co., Ltd. (CALB)",
    "CETC Cyberspace Security Technology Co., Ltd. (formerly Chen Du Westone Information Industry Co., Ltd.)",
    "CETC Digital Technology Co., Ltd. (formerly Shanghai East China Computer Co., Ltd.)",
    "ChangXin Memory Technologies, Inc. (CXMT)",
    "Chengdu JOUAV Automation Tech Co., Ltd. (JOUAV)",
    "Chengdu Mengsheng Electronic Technology Co., Ltd. (M&S Electronics)",
    "China Aerospace Science and Industry Corporation Limited (CASIC) (and CASIC subsidiaries: Addisino Co., Ltd., Aerospace Precision Products Co., Ltd., Aisino Corporation, China Aerospace Automotive Co., Ltd.)",
    "China Cargo Airlines Co., Ltd. (CCA)",
    "China Communications Construction Group (Limited) (CCCG) (and CCCG subsidiaries: CCCC Design and Consulting Group Co., Ltd., CCCC First Harbor Engineering Bureau Co. Ltd., CCCC Second Navigation Engineering Bureau Co., Ltd., CCCC Third Navigation Engineering Bureau Co., Ltd., China Airport Construction Group Corporation, China Communications Construction (USA) Co., Ltd., China Communications Construction Company Limited (CCCC), China Transportation Materials Co., Ltd., John Holland Group Pty Ltd., John Holland Services Pty Ltd., Shanghai Zhenhua Shipping Co. Ltd., ZPMC North America, Inc.)",
    "China Construction Technology Co. Ltd. (CCTC)",
    "China Electronics Corporation (CEC) (and CEC subsidiaries: China Information Security Research Institute, IRICO Group Company, Ltd., Shenzhen CEC Blue Ocean Holdings Co., Ltd., The 6th Research Institute of CEC)",
    "China Electronics Technology Group Corporation (CETC) (and CETC subsidiaries: 14th Research Institute of CETC, 15th Research Institute of CETC, CETC Research Institute 32)",
    "China General Nuclear Power Corporation (CGN)",
    "China International Marine Containers (Group) Co., Ltd. (CIMC)",
    "China Mobile Communications Group Co., Ltd. (China Mobile Comm) (and China Mobile Comm subsidiaries: Aspire Technologies (Shenzhen) Limited, China Mobile Hong Kong (BVI) Limited, China Mobile Limited (China Mobile))",
    "China National Chemical Corporation Ltd. (ChemChina)",
    "China National Chemical Engineering Group Corporation (CNCEC)",
    "China National Nuclear Corporation (CNNC)",
    "China National Offshore Oil Corporation (CNOOC) (and CNOOC subsidiary: China BlueChemical Limited)",
    "China North Industries Group Corporation Limited (Norinco Group) (and Norinco Group subsidiaries: China North Chemical Research Academy Group Co., Ltd., Chinese Academy of Ordnance Science, Harbin First Machinery Group Ltd., Inner Mongolia First Machinery Group Co., Ltd. . Kiekert USA Inc., Merit Automotive Electronics Systems S.L.U, North Petroleum International Company Limited, and Yunnan Yuanjin Optical Instrument Co., Ltd.)",
    "China South Industries Group Corporation (CSGC) (and CSGC subsidiaries: Baoding Tianwei Baobian Electric Co., Ltd., Beijing Beiji Mechanical and Electrical Industry Co., Ltd., Changan US R&D Center, Inc., China South Industries Group Corporation No. 59 Research Institute Co., Ltd., Heilongjiang Northern Tools Co., Ltd., and Sichuan Jian'an Industry Co., Ltd.)",
    "China SpaceSat Co., Ltd. (China SpaceSat) (and China SpaceSat subsidiaries: Aerospace Star Space Technology Application Co., Ltd., Oriental Blue Sky Titanium Technology Co., Ltd., and Xi'an Aerospace Tianhua Data Technology Co., Ltd.)",
    "China State Construction Engineering Corporation Limited (CSCEC) (and CSCEC subsidiary: China Construction America, Inc.)",
    "China State Shipbuilding Corporation Limited (CSSC) (and CSSC subsidiary: China Shipbuilding Trading Co., Ltd. (CSTC))",
    "China Telecom Group Co., Ltd. (China Telecom) (and China Telecom subsidiaries: China Telecom Corporation Limited, China Telecom Satellite Communications Co., Ltd., New Guomai Digital Culture Co., Ltd., Tianyi Cloud Technology Co., Ltd., and Zhongjie Communications Co., Ltd.)",
    "China Three Gorges Corporation (CTG)",
    "CloudWalk Technology Co., Ltd. (CloudWalk)",
    "Commercial Aircraft Corporation of China Limited (COMAC) (and COMAC subsidiaries: Beijing Aeronautical Science & Technology Research Institute, COMAC America Corporation Shanghai Aircraft Design and Research Institute, and Shanghai Aircraft Manufacturing Co., Ltd.)",
    "Contemporary Amperex Technology Co., Ltd. (CATL)",
    "CRRC Corporation Limited (CRRC)",
    "CSSC Offshore & Marine Engineering (Group) Company Limited (COMEC) (and COMEC subsidiaries: Guangzhou Wenchuan Heavy Industry Co., Ltd., and Huacheng (Tianjin) Ship Leasing Co., Ltd.)",
    "Dawning Information Industry Co., Ltd. (Sugon)",
    "EVE Energy Co., Ltd. (EVE Energy)",
    "Global Tone Communication Technology Co., Ltd. (GTCOM) (and GTCOM subsidiary: GTCOM Technology Corporation (GTCOM-US))",
    "Guizhou Aviation Technical Development Co., Ltd. (Guizhou Aviation Tech)",
    "Hangzhou Hikvision Digital Technology Co., Ltd. (Hikvision)",
    "Hangzhou Yushu Technology Co., Ltd. (Unitree)",
    "Hesai Group (also known as Hesai Technology Co., Ltd.)",
    "Huawei Investment & Holding Co., Ltd. (Huawei Holding) (and Huawei Holding subsidiary: Huawei Technologies Co., Ltd. (Huawei))",
    "Inspur Group Co., Ltd. (Inspur)",
    "JA Solar Technology Co., Ltd. (JA Solar)",
    "MGI Tech Co., Ltd. (MGI)",
    "NetPosa Technologies, Ltd. (NetPosa)",
    "NIO, Inc. (NIO)",
    "Novogene Company Limited (Novogene)",
    "Origincell Technology Co., Ltd. (Origincell)",
    "Phenix Optical Company Limited (formerly Phoenix Optics Company Limited)",
    "Quectel Wireless Solutions Co., Ltd. (Quectel)",
    "RoboSense Technology Co., Ltd.",
    "SDIC Intelligence (Xiamen) Information Co., Ltd. (SDIC Intelligence) (and SDIC Intelligence subsidiaries: Beijing Meiya Hongshu Technology Co., Ltd., and Xiamen Meiya Zhongmin Electronic Technology Co., Ltd.)",
    "Semiconductor Manufacturing International Corporation (SMIC) (and SMIC subsidiaries: Better Way Enterprises Limited, China IC Capital Co., Ltd., Magnificent Tower Limited, Semiconductor Manufacturing International (Beijing) Corporation (SMIC Beijing), Semiconductor Manufacturing International (Shenzhen) Corporation (SMIC Shenzhen), Semiconductor Manufacturing International (Tianjin) Corporation (SMIC Tianjin), Semiconductor Manufacturing North China (Beijing) Corporation, Semiconductor Manufacturing South China Corporation (SMIC South China), SilTech Semiconductor Corporation, SMIC Holdings Limited (SMIC Holdings), SMIC Semiconductor Manufacturing (Shanghai) Co., Ltd (SMIC Shanghai), and SMIC, Americas)",
    "SenseTime Group, Inc. (SenseTime)",
    "Shanghai Yitu Network Technology Co., Ltd. (Yitu)",
    "Shenzhen DJI Technology Co., Ltd. (DJI) (and DJI subsidiary: Shenzhen Dajiang Baiwang Technology Co., Ltd.)",
    "Sinotrans & CSC Holdings Co., Ltd. (Sinotrans)",
    "Tencent Holdings Limited (Tencent)",
    "Tianma Microelectronics Co., Ltd. (Tianma)",
    "TP-Link Technologies Co., Ltd. (TP-Link)",
    "Trina Solar Co., Ltd. (Trina Solar)",
    "Wuhan Geosun Navigation Technology Co., Ltd. (Geosun)",
    "Yangtze Memory Technologies Co., Ltd. (YMTC)",
    "Zhejiang Dahua Technology Co., Ltd. (Dahua) (and Dahua subsidiary: Chengdu Dahua Wisdom Information Technology Co., Ltd.)",
    "Zhongji Innolight Co., Ltd. (Innolight)",
  ],
};

// FCC Covered List, as read on November 20, 2026. The page showed its tables as updated November 18, 2026.
// The list states that a named producer or provider includes its subsidiaries and affiliates.
export const FCC_LIST = {
  asOf: "2026-11-18",
  label: "FCC Covered List",
  url: "https://www.fcc.gov/supplychain/coveredlist",
  named: [
    { name: "Huawei Technologies Company", brand: "HUAWEI", scope: "telecommunications equipment", added: "March 12, 2021" },
    { name: "ZTE Corporation", brand: "ZTE", scope: "telecommunications equipment", added: "March 12, 2021" },
    { name: "Hytera Communications Corporation", brand: "HYTERA", scope: "video surveillance and telecommunications equipment", added: "March 12, 2021" },
    { name: "Hangzhou Hikvision Digital Technology Company", brand: "HIKVISION", scope: "video surveillance and telecommunications equipment", added: "March 12, 2021" },
    { name: "Dahua Technology Company", brand: "DAHUA", scope: "video surveillance and telecommunications equipment", added: "March 12, 2021" },
    { name: "AO Kaspersky Lab", brand: "KASPERSKY", scope: "information security products, solutions, and services", added: "March 25, 2022" },
    { name: "Kaspersky Lab, Inc.", brand: "KASPERSKY", scope: "cybersecurity and anti-virus software", added: "July 23, 2024" },
    { name: "China Mobile International USA Inc", scope: "international telecommunications services", added: "March 25, 2022" },
    { name: "China Telecom (Americas) Corp.", scope: "telecommunications services", added: "March 25, 2022" },
    { name: "China Unicom (Americas) Operations Limited", scope: "international telecommunications services", added: "September 20, 2022" },
    { name: "Pacific Networks Corp", scope: "international telecommunications services", added: "September 20, 2022" },
    { name: "ComNet (USA) LLC", scope: "international telecommunications services", added: "September 20, 2022" },
    { name: "Digitalsystem Technology Inc.", scope: "international telecommunications services", added: "July 7, 2026" },
  ],
  // Conditional approvals for foreign-produced power inverters. An approval covers the named models only.
  inverterApprovals: [
    { holder: "Nextpower, LLC", models: "APCS-UL and APV-UL product families", date: "November 6, 2026" },
    { holder: "Ingeteam Power Technology, S.A.", models: "INGECON 3POWER C, C Plus, C HV, and M power inverter models", date: "October 30, 2026" },
    { holder: "Bloom Energy Corporation", models: "INV-750, AC7, RI7, and Central power inverter platforms", date: "October 23, 2026" },
    { holder: "Hitachi Energy Power Conversion Solutions S.L.U.", models: "WD3 and WD4 power inverters", date: "October 23, 2026" },
    { holder: "Power Electronics España, S.L.U.", models: "GEN3 platform utility-scale solar power inverters, including the HEM and the PCSM and Multi PCSM bidirectional battery storage inverters", date: "October 16, 2026" },
    { holder: "Dynapower Company, LLC", models: "CPS-2500, CPS-1250, and MPS-125 series power inverters", date: "October 16, 2026" },
    { holder: "GE Grid Solutions, LLC", models: "FLEXINVERTER 1.5kV Solar version, 1.5kV BESS version, 2KV Solar version, and SiC Variant power inverters", date: "October 9, 2026" },
  ],
};

const GENERIC = new Set(["GROUP", "LIMITED", "AMERICAS", "USA", "CHINA", "HOLDINGS", "TECHNOLOGY", "TECHNOLOGIES", "SUBSIDIARIES", "SUBSIDIARY"]);
const usable = (core) => core.length >= 3 && !GENERIC.has(core);
const coresOf = (names) => [...new Set((Array.isArray(names) ? names : [names]).map(coreName).filter(usable))];
const inside = (haystack, needle) => ` ${haystack} `.includes(` ${needle} `);
const strong = (core) => core.includes(" ") || core.length >= 8;

// Splits one notice entry into the names it carries: the main name, short names, former names, and subsidiaries.
export function noticeNames(entry) {
  const text = String(entry || "")
    .replace(/,\s*(?=(?:Ltd|Inc|LLC|Limited|Co)\b\.?)/g, " ")
    .replace(/\(\s*and [^:()]*subsidiar(?:y|ies):/gi, ",")
    .replace(/\(\s*(?:formerly|also known as)\s+/gi, ",")
    .replace(/\((Group|Limited|USA|BVI|Beijing|Shenzhen|Tianjin|Shanghai|Xiamen)\)/g, " $1 ");
  return text.split(/[,()]/).map(piece => piece.replace(/^\s*and\s+/i, "").trim()).filter(Boolean);
}

const NOTICE_INDEX = S1260H_LIST.entries.map(entry => {
  const names = noticeNames(entry);
  return { entry, cores: names.map(coreName), main: coreName(names[0]) };
});

// Returns the notice entry that names any of the given names, or null.
// A full-name match is preferred. A match on a short name alone is marked for confirmation.
export function match1260h(names) {
  let short = null;
  for (const query of coresOf(names)) {
    for (const row of NOTICE_INDEX) {
      if (!row.cores.some(core => usable(core) && core === query)) continue;
      if (query.includes(" ") || query === row.main) return { entry: row.entry, short: false };
      short ||= { entry: row.entry, short: true };
    }
  }
  return short;
}

// Words in parentheses, such as (Americas), are part of the listed name.
const FCC_INDEX = FCC_LIST.named.map(row => ({ ...row, core: coreName(row.name.replace(/[()]/g, " ")) }));

// Returns the Covered List entry for a producer name, or null.
// An exact name is a direct match. A shared brand or a longer or shorter form of the name is marked as an affiliate to confirm.
export function matchFccNamed(names) {
  const list = Array.isArray(names) ? names : [names];
  const queries = [...new Set([...coresOf(list.map(name => String(name || "").replace(/[()]/g, " "))), ...coresOf(list)])];
  for (const row of FCC_INDEX) {
    if (queries.some(query => query === row.core)) return { ...row, affiliate: false };
  }
  for (const row of FCC_INDEX) {
    if (queries.some(query => (strong(row.core) && inside(query, row.core)) || (strong(query) && inside(row.core, query)))) return { ...row, affiliate: true };
    if (row.brand && queries.some(query => inside(query, row.brand))) return { ...row, affiliate: true };
  }
  return null;
}

const APPROVAL_INDEX = FCC_LIST.inverterApprovals.map(row => ({ ...row, core: coreName(row.holder) }));

// Returns the conditional approvals held by a company with one of the given names.
export function inverterApprovalsFor(names) {
  const queries = coresOf(names);
  return APPROVAL_INDEX.filter(row => queries.some(query => query === row.core || (strong(query) && (inside(row.core, query) || inside(query, row.core)))));
}
