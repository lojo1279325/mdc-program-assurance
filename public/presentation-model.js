import { ACTIONS } from "./rules.js";
import { PRESENTATION_LAYOUTS, ARIAL_WIDTHS } from "./presentation-layouts.js";

export const SLIDE_WIDTH = 13.333333;
export const SLIDE_HEIGHT = 7.5;

const ACTION_STYLE = {
  Proceed: { label: "GREEN", color: "52B74C" },
  "Proceed with protections": { label: "YELLOW", color: "FFD447" },
  "Proceed with active mitigation": { label: "ORANGE", color: "F79432" },
  "Do not proceed absent resolution": { label: "RED", color: "DC4148" },
};
const GREY = "E4E9EE";
const NAVY = "01244A";
const CATEGORIES = {
  ties: { title: "Cable ties", pattern: /\bcable ties?\b|\btie wraps?\b/i },
  containment: { title: "Cable containment", pattern: /cable (tray|containment)|wire mesh|cable ladder/i },
  mounting: { title: "Mounting metal", pattern: /mounting.*(metal|plate)|mounting sheet|metal.*mount/i },
  power: { title: "Power and control", pattern: /transformer|ring.main|switchgear|control cabinet|distribution/i },
  transformer: { title: "Transformer", pattern: /transformer/i },
  ring: { title: "Ring-main unit", pattern: /ring.main|\brmu\b|medium.voltage.*(cabinet|switch)|switchgear/i },
  interface: { title: "Cooled power\ninterface", pattern: /cooled.*(power|interface)|power.*(connector|interface)|liquid.*connector/i },
  controls: { title: "Data acquisition\nand controls", pattern: /data acquisition|controller|control system|monitoring/i },
  camera: { title: "Surveillance camera", pattern: /surveillance|camera/i },
  fire: { title: "Fire control panel", pattern: /fire.*(control|panel)|suppression.*control/i },
  cooling: { title: "Cooling supply", pattern: /cooling unit|air.condition|precision.*cool|cooling system|\bcd[u]?\b/i },
  frame: { title: "Structural frame", pattern: /power.*frame|container frame|structural frame|module frame/i },
};

function clean(value) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\u2014/g, ". ").replace(/\u2013/g, "-").trim();
}

function width(text, size, bold = false) {
  return [...text].reduce((sum, character) => sum + (ARIAL_WIDTHS[character] ?? (/[\u2e80-\uffff]/u.test(character) ? 1 : 0.57)), 0) * size * (bold ? 1.035 : 1);
}

export function wrapText(text, box) {
  const limit = box.w * 72;
  const lines = [];
  for (const paragraph of clean(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const proposed = line ? `${line} ${word}` : word;
      if (width(proposed, box.size, box.bold) <= limit) {
        line = proposed;
      } else {
        if (line) lines.push(line);
        line = "";
        for (const character of word) {
          if (line && width(line + character, box.size, box.bold) > limit) {
            lines.push(line);
            line = character;
          } else line += character;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

function selected(records, category) {
  const matches = records.filter((record) => CATEGORIES[category].pattern.test(record.title));
  return matches.sort((a, b) => Number(b.status === "Approved") - Number(a.status === "Approved") || a.title.length - b.title.length || a.code.localeCompare(b.code))[0] || null;
}

function actionStyle(record) {
  return ACTION_STYLE[record?.action] || { label: "NOT SET", color: GREY };
}

function vendorText(record, limit = 34) {
  if (!record) return "No matching record";
  if (!record.supplier) return `Supplier not named | ${record.code}`;
  const value = `${record.supplier} | ${record.code}`;
  return value.length <= limit ? value : `Supplier in details | ${record.code}`;
}

function briefCondition(record, limit = 85) {
  if (!record) return "Select and assess the component in the register.";
  const condition = clean(record.condition);
  if (!condition) return "No condition is recorded. Complete the record.";
  const sentence = condition.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  if (sentence && sentence.length <= limit) return sentence;
  if (/^withhold|^do not|^hold\b/i.test(condition)) return "Release is withheld pending the recorded checks.";
  if (/conditional candidate/i.test(condition)) return "This is a conditional candidate. Complete the recorded checks.";
  return `Read the full condition for ${record.code} in the slide details.`;
}

function briefLifecycle(record, limit = 86) {
  if (!record) return "Future Policy/Lifecycle remains to be recorded.";
  const lifecycle = clean(record.lifecycle);
  if (!lifecycle) return "Future Policy/Lifecycle is missing. Complete the record.";
  const sentences = lifecycle.match(/[^.!?]+[.!?](?:\s|$)/g) || [];
  const specific = sentences.map((text) => text.trim()).find((text) => /^(retain|review|record|confirm|track|recheck|keep|update|reassess|verify|monitor|control)\b/i.test(text) && text.length <= limit);
  if (specific) return specific;
  return `Read the full Future Policy/Lifecycle note for ${record.code}.`;
}

function stateText(record) {
  if (!record) return "No matching record.\nAssessment is pending.";
  return `${record.status === "Approved" ? "Approved record." : "Not approved."}\nConfidence: ${record.confidence || "Pending"}.\n${record.action ? `${actionStyle(record).label} action${record.status === "Approved" ? "." : ": draft."}` : "Action is not set."}`;
}

function recordDetails(record) {
  return {
    code: record.code,
    title: record.title,
    supplier: record.supplier || "No named supplier",
    sourceItem: record.sourceItem || "",
    drawing: record.drawing || "",
    status: record.status || "Open",
    action: record.action || "Not set",
    risk: record.risk || "Not assessed",
    confidence: record.confidence || "Pending",
    condition: record.condition || "No condition is recorded.",
    lifecycle: record.lifecycle || "No Future Policy/Lifecycle note is recorded.",
  };
}

function addSlide(slides, brief, template, title, subtitle, values, records = [], overrides = {}, note = "") {
  const source = PRESENTATION_LAYOUTS[template - 1];
  const footer = `${brief.generatedOn || "Current register"} | Executive decision walkthrough`;
  const common = {
    "2": `${brief.projectName || "MDC Program Assurance"} | EXECUTIVE DECISION WALKTHROUGH`,
    "3": title,
    "5": subtitle,
  };
  const complete = { ...common, ...values };
  const overflow = [];
  const shapes = source.map((original) => {
    const shape = { ...original, ...(overrides[original.slot] || {}) };
    if (shape.type !== "text") return shape;
    let text = complete[shape.slot];
    if (shape.y > 6.9 && shape.y < 7) text = "Source: Current selected-project register. Full record conditions and lifecycle notes accompany this export.";
    if (shape.y > 7.2) {
      text = shape.x < 1 ? footer : shape.x < 5 ? "PROPRIETARY & CONFIDENTIAL" : shape.x < 12 ? "ALVAREZ & MARSAL" : String(slides.length + 1);
    }
    if (text === undefined) throw new Error(`Missing presentation slot ${template}:${shape.slot}`);
    shape.text = clean(text);
    shape.lines = wrapText(shape.text, shape);
    const maxLines = Math.max(1, Math.floor((shape.h * 72 + shape.size * 0.12) / (shape.size * 1.12)));
    if (shape.lines.length > maxLines) {
      overflow.push({ label: shape.slot === "2" ? "Project" : "Full slide text", text: shape.text });
      const fallback = shape.slot === "2" ? "EXECUTIVE DECISION WALKTHROUGH" : "Full text is in the slide details.";
      shape.lines = wrapText(fallback, shape);
      if (shape.lines.length > maxLines) shape.lines = ["See details."];
      shape.text = shape.lines.join("\n");
    }
    return shape;
  });
  const unique = [...new Map(records.filter(Boolean).map((record) => [record.code, record])).values()];
  slides.push({
    id: `executive-${template}`,
    template,
    title,
    subtitle,
    shapes,
    records: unique.map(recordDetails),
    note,
    overflow,
  });
}

function stripe(color) {
  return { fill: color, stroke: color };
}

function componentValues(record, category, slots) {
  return {
    [slots[0]]: CATEGORIES[category].title,
    [slots[1]]: vendorText(record),
    [slots[2]]: stateText(record),
    [slots[3]]: briefCondition(record),
    [slots[4]]: briefLifecycle(record),
  };
}

export function executiveSlides(brief = {}) {
  const records = (brief.presentationRecords || []).map((record) => ({ ...record }));
  const slides = [];
  const picks = Object.fromEntries(Object.keys(CATEGORIES).map((key) => [key, selected(records, key)]));
  const approved = Number(brief.approved || 0);
  const total = Number(brief.records || 0);
  const actions = brief.actions || {};
  const firstTitle = !total ? "Build the register before making a decision"
    : !approved ? "Review the register before authorizing procurement"
      : actions[ACTIONS[3]] ? "Resolve the approved barriers before proceeding"
        : actions[ACTIONS[2]] ? "Use the approved mitigation plan before release"
          : actions[ACTIONS[1]] ? "Apply the approved purchasing protections"
            : approved < total ? "Keep unapproved records outside the decision"
              : "Proceed with the approved scope";
  addSlide(slides, brief, 1, firstTitle,
    `${approved} of ${total} records are approved. Purchasing decisions use approved records only.`, {
      "8": `GREEN | ${actions[ACTIONS[0]] || 0} APPROVED`,
      "9": "Proceed.",
      "18": "Use the scope and conditions in the approved record.",
      "21": `YELLOW | ${actions[ACTIONS[1]] || 0} APPROVED`,
      "22": "Proceed with\nprotections.",
      "27": "Complete the recorded protections before release.",
      "30": `ORANGE | ${actions[ACTIONS[2]] || 0} APPROVED`,
      "31": "Proceed with\nactive mitigation.",
      "48": "Use the recorded owner, plan and change triggers.",
      "51": `RED | ${actions[ACTIONS[3]] || 0} APPROVED`,
      "52": "Do not proceed\nabsent resolution.",
      "56": "Resolve the recorded barrier before release.",
      "57": "Missing facts lower confidence, not risk. Open records are not purchasing approval.",
    }, records, {}, brief.headline || "The selected project has no approved decision.");

  const supplierValues = {};
  const supplierOverrides = {};
  const rowSlots = [[15, 16, 18, 19, 17], [30, 31, 33, 34, 32], [40, 41, 43, 44, 42], [59, 60, 62, 63, 61], [76, 77, 79, 80, 78], [94, 95, 97, 98, 96]];
  const rowKeys = ["ties", "containment", "mounting", "power", "cooling", "frame"];
  const chosen = new Set();
  rowKeys.forEach((key, index) => {
    const record = picks[key] || records.find((item) => item.supplier && !chosen.has(item.code)) || null;
    if (record) chosen.add(record.code);
    const [name, product, badge, condition, background] = rowSlots[index];
    supplierValues[name] = record?.supplier && record.supplier.length <= 36 ? record.supplier : record ? `Supplier in details | ${record.code}` : "No supplier record";
    supplierValues[product] = `${picks[key] ? CATEGORIES[key].title.replace("\n", " ") : record?.title || CATEGORIES[key].title}${record ? ` | ${record.code}` : ""}`;
    supplierValues[badge] = actionStyle(record).label;
    supplierValues[condition] = `${record ? record.status === "Approved" ? "Approved. " : "Not approved. " : ""}${briefCondition(record, 88)}`;
    supplierOverrides[background] = stripe(actionStyle(record).color);
    supplierOverrides[badge] = { color: NAVY };
  });
  supplierValues["99"] = "These are selected supplier paths. The complete record set remains in the register and the export notes.";
  addSlide(slides, brief, 2, "Review the supplier paths for each component",
    "Apply the recorded conditions. Draft actions are not permission to purchase.",
    supplierValues, records.filter((record) => chosen.has(record.code)), supplierOverrides,
    approved ? `${approved} approved ${approved === 1 ? "record is" : "records are"} available for a decision.` : "No approved record is available for a decision.");

  const powerValues = {
    ...componentValues(picks.transformer, "transformer", [9, 10, 27, 28, 29]),
    ...componentValues(picks.ring, "ring", [33, 34, 48, 49, 50]),
    ...componentValues(picks.interface, "interface", [54, 55, 65, 66, 67]),
    "8": actionStyle(picks.transformer).label,
    "32": actionStyle(picks.ring).label,
    "53": actionStyle(picks.interface).label,
    "68": "Equipment classes are matched by record title. Confirm exact models, scope and quantities in the record.",
  };
  addSlide(slides, brief, 3, "Protect module power continuity",
    "Use the recorded qualification checks and Future Policy/Lifecycle requirements.",
    powerValues, [picks.transformer, picks.ring, picks.interface], {
      "7": stripe(actionStyle(picks.transformer).color),
      "31": stripe(actionStyle(picks.ring).color),
      "52": stripe(actionStyle(picks.interface).color),
      "8": { color: NAVY }, "32": { color: NAVY }, "53": { color: NAVY },
    });

  addSlide(slides, brief, 4, "Verify smart-device safeguards before commissioning",
    "Use evidence from the installed configuration. Confidence remains separate from risk.", {
      ...componentValues(picks.controls, "controls", [8, 9, 52, 19, 20]),
      ...componentValues(picks.camera, "camera", [23, 24, 53, 29, 30]),
      ...componentValues(picks.fire, "fire", [33, 34, 54, 44, 45]),
      "46": "Full conditions, unresolved information and Future Policy/Lifecycle remain with each record.",
    }, [picks.controls, picks.camera, picks.fire], {
      "7": stripe(actionStyle(picks.controls).color), "22": stripe(actionStyle(picks.camera).color), "32": stripe(actionStyle(picks.fire).color),
    });

  addSlide(slides, brief, 5, "Confirm the primary path before qualifying a backup",
    "Use the same technical specification to assess each proposed alternative.", {
      "8": "Cooling supply",
      "9": vendorText(picks.cooling),
      "66": stateText(picks.cooling),
      "21": briefCondition(picks.cooling),
      "22": briefLifecycle(picks.cooling),
      "25": "Structural frame",
      "26": vendorText(picks.frame),
      "67": stateText(picks.frame),
      "39": briefCondition(picks.frame),
      "40": briefLifecycle(picks.frame),
      "43": "Power backup",
      "44": picks.ring ? `Scope to assess | ${picks.ring.code}` : "No matching ring-main record",
      "58": "Qualify the exact equipment and its interfaces.",
      "59": "Keep supplier roles and component scopes separate.",
      "60": "A named supplier is not a qualified substitute. No backup qualification is created by this presentation.",
    }, [picks.cooling, picks.frame, picks.ring], {
      "7": stripe(actionStyle(picks.cooling).color), "24": stripe(actionStyle(picks.frame).color), "42": stripe(GREY),
    });

  addSlide(slides, brief, 6, "Prepare supply and design fallbacks for active mitigation",
    "These are planning options. Part-specific conditions control the decision.", {
      "8": "Keep the design.",
      "9": "Plan A uses the current supply path.",
      "18": "Record safeguards, tests and recovery.",
      "19": "Seek staged orders and change rights.",
      "22": "Qualify a backup.",
      "23": "Plan B preserves the required function.",
      "33": "Match duty, interfaces and support.",
      "34": "Confirm supply and qualification timing.",
      "37": "Redesign the module.",
      "38": "Plan C provides a design fallback.",
      "51": "Update drawings and the parts list.",
      "52": "Include installation and retest time.",
      "53": "These are proposed options, not qualified designs or agreed rights. Use the approved part-specific plan.",
    }, records.filter((record) => record.action === ACTIONS[2]));

  addSlide(slides, brief, 7, "Act on policy and operational change triggers",
    "Reassess the affected equipment, transaction and module when the evidence changes.", {
      "15": "Policy requirements change.",
      "16": "Refer the affected scope to Trade for a current-source review.",
      "30": "A critical test fails.",
      "31": "Reassess the recorded supply or design fallback.",
      "41": "Delivery or support fails.",
      "42": "Recheck the need date and the approved supply path.",
      "44": "Proposed change process",
      "57": "Current module",
      "68": "Qualified change",
      "82": "Next module version",
      "83": "Record the affected module, evidence, owner and effective date before a change.",
      "84": "Future Policy/Lifecycle applies to every part. Changes require the assigned review.",
    }, records, {}, "This workflow is a planning guide. It does not state that a particular regulation applies or that a change is qualified.");

  addSlide(slides, brief, 8, "Assign an owner to every mitigation checkpoint",
    "Proposed responsibilities require confirmation before implementation.", {
      "8": "At the PO decision",
      "9": "Procurement and counsel",
      "18": "Confirm the seller, scope and quantities.",
      "19": "Record protections and purchasing options.",
      "22": "Before equipment\nis used",
      "23": "Engineering and security",
      "33": "Accept safety and recovery tests.",
      "34": "Confirm support and access controls.",
      "37": "At each module\nchange",
      "38": "Design and program leads",
      "51": "Qualify changes and revise the parts list.",
      "52": "Track triggers and escalate barriers.",
      "53": "Proposed duties do not change app privileges. Approval remains with the assigned reviewer.",
    }, [], {}, "NSTT prepares analysis. The assigned CPI or Trade reviewer approves it. Administrators manage access and do not approve analyses.");
  return slides;
}

export function slideNotes(slide) {
  const lines = [slide.title, slide.subtitle, slide.note, ...slide.overflow.map((item) => `${item.label}: ${item.text}`)].filter(Boolean);
  for (const record of slide.records) {
    lines.push(
      `${record.code}: ${record.title}`,
      `Supplier: ${record.supplier}`,
      [record.sourceItem && `Source item: ${record.sourceItem}`, record.drawing && `Drawing: ${record.drawing}`].filter(Boolean).join(". "),
      `Status: ${record.status}. Action: ${record.action}. Risk: ${record.risk}. Confidence: ${record.confidence}.`,
      `Condition: ${record.condition}`,
      `Future Policy/Lifecycle: ${record.lifecycle}`,
    );
  }
  return lines.filter(Boolean);
}
