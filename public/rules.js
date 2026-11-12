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
  { role: "nstt", duty: "Prepares the assurance record and the recommendation." },
  { role: "cpi", duty: "Reviews component and supplier facts. Does not approve its own draft." },
  { role: "trade", duty: "Reviews trade and export conditions before approval of a trade-sensitive record." },
  { role: "administrator", duty: "Grants roles. Cannot approve a record that same person prepared." },
];

export const VIEWS = [
  { role: "china", duty: "Input view only. Not a sign-in account." },
  { role: "client", duty: "Receives the action, conditions, and lifecycle. Does not see the method notes." },
];

const LIMIT = 2000;

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
    updates: Array.isArray(input.updates) ? input.updates.slice(-12).map(cleanUpdate) : [],
  };
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
  if (actor.email === item.preparedBy) return "The person who prepared this record cannot approve it.";
  if (!actor.role || actor.role === item.ownerRole) return "Approval requires a different role from the owner role.";
  if (item.tradeSensitive && actor.role !== "trade" && item.reviewerRole === "trade" && actor.role !== "administrator") {
    return "A trade-sensitive record needs the trade review before approval.";
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
    `${count.pendingConfidence} records have pending confidence.`,
    "A missing fact lowers confidence. It does not change the risk band.",
    `${count.missingLifecycle} records still need a future policy and lifecycle note.`,
  ];
  return { count, sentences };
}

export function actionList(items) {
  const actions = [];
  for (const item of items.map(normalizeReview)) {
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
