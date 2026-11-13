export const ACTIONS = [
  "Proceed",
  "Proceed with protections",
  "Proceed with active mitigation",
  "Do not proceed absent resolution",
];

export const CONFIDENCE = ["High", "Medium", "Low", "Pending"];

export const RISK = ["Low", "Medium", "High", "Critical", "Not assessed"];

export const STATUSES = ["Open", "In review", "Returned", "Approved"];

export const STAGES = ["Why", "What", "When", "Where", "Who", "How"];

export const LAYERS = [
  "Identification",
  "Part significance",
  "Supply-chain resilience",
  "Governance",
  "Recommendation",
];

export const DUTIES = [
  { role: "nstt", duty: "Prepares the assurance record and the recommendation. Sends a complete record to a different role. Does not approve." },
  { role: "cpi", duty: "Reviews component and supplier facts on records assigned to CPI. Does not change the analysis or approve its own draft." },
  { role: "trade", duty: "Reviews trade and export conditions. A trade-sensitive record needs a trade note before approval. Does not import the register." },
  { role: "administrator", duty: "Grants roles for one environment and can create a project. Does not prepare or approve an analysis record." },
];

export const VIEWS = [
  { role: "china", duty: "Input view only. Not a sign-in account." },
  { role: "client", duty: "Receives the action, conditions, and lifecycle. Does not see the method notes." },
];

const LIMIT = 4000;

export const IMPORT_FIELDS = [
  "title",
  "module",
  "sourceItem",
  "supplier",
  "drawing",
  "risk",
  "confidence",
  "confidenceScore",
  "sourceCategory",
  "action",
  "status",
  "ownerRole",
  "reviewerRole",
  "stage",
  "layer",
  "condition",
  "lifecycle",
  "evidence",
  "openFact",
  "sourceStatus",
];

export function blankReview(input = {}) {
  return {
    code: input.code || "",
    kind: input.kind || "review",
    title: input.title || "",
    stage: STAGES.includes(input.stage) ? input.stage : "What",
    layer: LAYERS.includes(input.layer) ? input.layer : "Recommendation",
    ownerRole: input.ownerRole || "nstt",
    reviewerRole: input.reviewerRole || "cpi",
    status: STATUSES.includes(input.status) ? input.status : "Open",
    risk: RISK.includes(input.risk) ? input.risk : "Not assessed",
    confidence: CONFIDENCE.includes(input.confidence) ? input.confidence : "Pending",
    action: ACTIONS.includes(input.action) ? input.action : "",
    condition: clip(input.condition),
    lifecycle: clip(input.lifecycle),
    evidence: clip(input.evidence),
    openFact: clip(input.openFact),
    tradeSensitive: Boolean(input.tradeSensitive),
    preparedBy: clip(input.preparedBy, 120),
    reviewedBy: clip(input.reviewedBy, 120),
    version: Number.isInteger(Number(input.version)) ? Number(input.version) : 0,
    module: clip(input.module, 80),
    sourceItem: clip(input.sourceItem, 80),
    supplier: clip(input.supplier, 300),
    drawing: clip(input.drawing, 120),
    confidenceScore: clip(input.confidenceScore, 40),
    sourceCategory: clip(input.sourceCategory, 80),
    sourceStatus: clip(input.sourceStatus, 240),
    projectId: cleanProjectId(input.projectId),
    changeNote: clip(input.changeNote, 300),
    updates: Array.isArray(input.updates) ? input.updates.slice(-12).map(cleanUpdate) : [],
  };
}

export function cleanProjectId(value) {
  const code = String(value || "MDC").trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{1,11}$/.test(code) ? code : "MDC";
}

export function methodChecklist() {
  return [
    blankReview({ code: "R-07", title: "Purpose of the review", layer: "Identification", stage: "Why", ownerRole: "nstt", reviewerRole: "cpi" }),
    blankReview({ code: "R-01", title: "Legal entity and supply role", layer: "Identification", stage: "Who", ownerRole: "nstt", reviewerRole: "cpi" }),
    blankReview({ code: "R-02", title: "Part significance", layer: "Part significance", stage: "What", ownerRole: "nstt", reviewerRole: "cpi" }),
    blankReview({ code: "R-03", title: "Supply continuity", layer: "Supply-chain resilience", stage: "When", ownerRole: "cpi", reviewerRole: "nstt" }),
    blankReview({ code: "R-04", title: "Governance and trade conditions", layer: "Governance", stage: "Where", ownerRole: "trade", reviewerRole: "nstt", tradeSensitive: true }),
    blankReview({ code: "R-05", title: "Recommendation", layer: "Recommendation", stage: "How", ownerRole: "nstt", reviewerRole: "trade" }),
    blankReview({ code: "R-06", title: "Future policy and lifecycle", layer: "Governance", stage: "When", ownerRole: "nstt", reviewerRole: "trade" }),
  ];
}

export function normalizeReview(input) {
  const record = blankReview(input);
  if (!record.evidence || !record.lifecycle) record.confidence = "Pending";
  return record;
}

export function approvalBlock(actor, record) {
  const item = normalizeReview(record);
  if (!actor?.email) return "Sign-in is required before a record can be approved.";
  if (actor.role === "administrator") return "The administrator role grants access. It does not approve an analysis record.";
  if (actor.email === item.preparedBy) return "The person who prepared this record cannot approve it.";
  if (!actor.role || actor.role === item.ownerRole) return "Approval requires a different role from the owner role.";
  if (actor.role !== item.reviewerRole) return "Approval is limited to the assigned reviewer role.";
  if (item.tradeSensitive && actor.role !== "trade") {
    const tradeNoted = (item.updates || []).some((update) => update.role === "trade" && String(update.text || "").trim());
    if (!tradeNoted) return "A trade-sensitive record needs a trade review note before approval.";
  }
  if (!ACTIONS.includes(item.action)) return "Approval requires an action.";
  if (!item.lifecycle) return "Approval requires a future policy and lifecycle note.";
  if (!item.evidence) return "A missing fact keeps confidence pending. Approval waits for that fact.";
  return "";
}

export function metrics(items) {
  const reviews = items.map(normalizeReview);
  const byAction = { "Not set": 0 };
  for (const action of ACTIONS) byAction[action] = 0;
  const byConfidence = { High: 0, Medium: 0, Low: 0, Pending: 0 };
  let missingLifecycle = 0;
  for (const item of reviews) {
    byAction[item.action || "Not set"] += 1;
    byConfidence[item.confidence] += 1;
    if (!item.lifecycle) missingLifecycle += 1;
  }
  return {
    records: reviews.length,
    open: reviews.filter((item) => item.status !== "Approved").length,
    inReview: reviews.filter((item) => item.status === "In review").length,
    approved: reviews.filter((item) => item.status === "Approved").length,
    byAction,
    byConfidence,
    missingLifecycle,
    pendingConfidence: byConfidence.Pending,
  };
}

export function clientView(items) {
  return items.map(normalizeReview).map((item) => ({
    code: item.code,
    title: item.title,
    action: item.action || "Not set",
    condition: item.condition,
    lifecycle: item.lifecycle,
    confidence: item.confidence,
    status: item.status,
  }));
}

export function scorecard(items) {
  const count = metrics(items);
  const sentences = [
    `The register has ${count.records} review records.`,
    `${count.byAction.Proceed} may proceed.`,
    `${count.byAction["Proceed with protections"]} may proceed with documented protections.`,
    `${count.byAction["Proceed with active mitigation"]} may proceed only with active mitigation.`,
    `${count.byAction["Do not proceed absent resolution"]} should not proceed until the open fact is resolved.`,
    `${count.byAction["Not set"] || 0} records still need one of the four actions.`,
    `${count.pendingConfidence} records have pending confidence.`,
    "A missing fact lowers confidence. It does not change the risk band.",
    `${count.missingLifecycle} records still need a future policy and lifecycle note.`,
  ];
  return { count, sentences };
}

export function actionList(items) {
  const actions = [];
  for (const item of items.map(normalizeReview)) {
    if (!item.action && item.sourceCategory) actions.push({ code: item.code, owner: item.ownerRole, text: `${item.code} still needs one of the four actions. The source category is not an approval.` });
    if (!item.lifecycle) actions.push({ code: item.code, owner: "nstt", text: `${item.code} still needs a future policy and lifecycle note before it can be approved.` });
    if (!item.evidence) actions.push({ code: item.code, owner: item.ownerRole, text: `${item.code} is missing a fact. Confidence stays pending. The risk band does not change.` });
    if (item.action === "Do not proceed absent resolution") actions.push({ code: item.code, owner: item.ownerRole, text: `${item.code} should not proceed until the open fact is resolved.` });
    if (item.status !== "Approved" && item.action && item.lifecycle && item.evidence) actions.push({ code: item.code, owner: item.reviewerRole, text: `${item.code} is ready for a different role to review.` });
  }
  return actions;
}

export function nextCode(items) {
  const numbers = items.map((item) => Number(String(item.code || "").slice(2))).filter((value) => Number.isInteger(value));
  const next = Math.max(0, ...numbers) + 1;
  return `R-${String(next).padStart(2, "0")}`;
}

export function validRecordCode(code) {
  return /^(?:[A-Z]-\d{2,4}|[A-Z]{1,4}\d{2,4})$/.test(String(code || "").trim());
}

export function canonicalAction(value) {
  const text = String(value || "").trim().toLowerCase();
  return ACTIONS.find((action) => action.toLowerCase() === text) || "";
}

function canonicalChoice(value, choices, aliases = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  const alias = aliases[text.toLowerCase()];
  if (alias) return alias;
  return choices.find((choice) => choice.toLowerCase() === text.toLowerCase()) || null;
}

export function applyImportRow(existing, row, actorEmail) {
  const code = String(row.code || "").trim().toUpperCase();
  if (!validRecordCode(code)) return { result: "rejected", code, message: "The code is not a review key." };
  const current = existing ? normalizeReview(existing) : null;
  const rawVersion = row.version === "" || row.version == null ? null : Number(row.version);
  if (current && (rawVersion == null || rawVersion !== current.version)) {
    return {
      result: "rejected",
      code,
      message: `Version ${rawVersion ?? "blank"} does not match version ${current.version}. Export the register again before this update.`,
    };
  }
  if (!current && rawVersion != null && rawVersion !== 0) {
    return { result: "rejected", code, message: "A new record must use version 0." };
  }
  const next = {
    ...(current || blankReview({
      code,
      ownerRole: "nstt",
      reviewerRole: "cpi",
      stage: "What",
      layer: "Part significance",
      status: "Open",
    })),
  };
  let changed = !current;
  for (const field of IMPORT_FIELDS) {
    if (row[field] == null || String(row[field]).trim() === "") continue;
    const value = String(row[field]).trim();
    if (value.toUpperCase() === "CLEAR") {
      if (next[field]) {
        next[field] = "";
        changed = true;
      }
      continue;
    }
    if (field === "action") {
      const mapped = canonicalAction(value);
      if (!mapped) return { result: "rejected", code, message: "Action must be one of the four review actions, or left blank." };
      if (mapped !== next.action) {
        next.action = mapped;
        changed = true;
      }
      continue;
    }
    if (field === "status") {
      if (value === "Approved") return { result: "rejected", code, message: "Import cannot approve a record. A different role uses Approve after review." };
      const status = canonicalChoice(value, STATUSES);
      if (!status) return { result: "rejected", code, message: "Status is not a known workflow status." };
      if (status !== next.status) {
        next.status = status;
        changed = true;
      }
      continue;
    }
    if (field === "risk") {
      const risk = canonicalChoice(value, RISK, { l: "Low", m: "Medium", h: "High", moderate: "Medium" });
      if (!risk) return { result: "rejected", code, message: "Risk is not a known band." };
      if (risk !== next.risk) {
        next.risk = risk;
        changed = true;
      }
      continue;
    }
    if (field === "confidence") {
      const confidence = canonicalChoice(value, CONFIDENCE, { moderate: "Medium" });
      if (!confidence) return { result: "rejected", code, message: "Confidence is not a known value." };
      if (confidence !== next.confidence) {
        next.confidence = confidence;
        changed = true;
      }
      continue;
    }
    if (field === "ownerRole" || field === "reviewerRole") {
      const role = canonicalChoice(value, ["nstt", "cpi", "trade"]);
      if (!role) return { result: "rejected", code, message: "Use nstt, cpi, or trade for the owner and reviewer roles." };
      if (role !== next[field]) {
        next[field] = role;
        changed = true;
      }
      continue;
    }
    if (field === "stage") {
      const stage = canonicalChoice(value, STAGES);
      if (!stage) return { result: "rejected", code, message: "Stage is not one of Why, What, When, Where, Who, or How." };
      if (stage !== next.stage) {
        next.stage = stage;
        changed = true;
      }
      continue;
    }
    if (field === "layer") {
      const layer = canonicalChoice(value, LAYERS);
      if (!layer) return { result: "rejected", code, message: "Layer is not a known review layer." };
      if (layer !== next.layer) {
        next.layer = layer;
        changed = true;
      }
      continue;
    }
    if (String(next[field] || "") !== value) {
      next[field] = value;
      changed = true;
    }
  }
  const record = normalizeReview({ ...next, code, preparedBy: current?.preparedBy || actorEmail || "" });
  if (!changed) return { result: "unchanged", code, record, message: "No field changed." };
  record.version = (current?.version || 0) + 1;
  record.changeNote = clip(row.changeNote || "Imported update.", 300);
  return { result: "applied", code, record, message: record.changeNote };
}

function clip(value, max = LIMIT) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanUpdate(update) {
  return {
    at: clip(update?.at, 40),
    by: clip(update?.by, 120),
    role: clip(update?.role, 40),
    text: clip(update?.text, 500),
  };
}
