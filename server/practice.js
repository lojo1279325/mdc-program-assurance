import { normalizeReview } from "../public/rules.js";
import { cleanProjectId } from "../public/boards.js";

export const PRACTICE_PROJECT = "PRACTICE";

export const PRACTICE_ACTORS = {
  nstt: "practice-nstt@development.local",
  cpi: "practice-cpi@development.local",
  trade: "practice-trade@development.local",
};

export function practiceRoleFrom(value) {
  const role = String(value || "").trim().toLowerCase();
  return role === "nstt" || role === "cpi" || role === "trade" ? role : "";
}

export function practiceActor({
  environment,
  designated,
  grantRole,
  email,
  requestedRole,
  projectId,
  existingProjectId,
}) {
  const role = practiceRoleFrom(requestedRole);
  const currentProject = existingProjectId ? cleanProjectId(existingProjectId) : "";
  const nextProject = projectId ? cleanProjectId(projectId) : "";
  if (!role) {
    if (currentProject === PRACTICE_PROJECT && grantRole === "administrator") {
      return {
        role: grantRole,
        email,
        practice: false,
        error: "Use a practice role to change a practice record. Your administrator grant stays unchanged.",
      };
    }
    return { role: grantRole, email, practice: false, error: "" };
  }
  if (environment !== "development") {
    return { role: grantRole, email, practice: false, error: "Practice roles are available only in development." };
  }
  if (!designated || grantRole !== "administrator") {
    return { role: grantRole, email, practice: false, error: "Only a designated administrator can use a practice role in development." };
  }
  if (currentProject && currentProject !== PRACTICE_PROJECT) {
    return { role: grantRole, email, practice: false, error: "A practice role can change only the practice project. The MDC register stays unchanged." };
  }
  if (nextProject !== PRACTICE_PROJECT) {
    return { role: grantRole, email, practice: false, error: "A practice role can change only the practice project. The MDC register stays unchanged." };
  }
  return { role, email: PRACTICE_ACTORS[role], practice: true, error: "" };
}

export function practiceSamples() {
  return [
    normalizeReview({
      code: "S-01",
      title: "Sample power module",
      projectId: PRACTICE_PROJECT,
      status: "Open",
      ownerRole: "nstt",
      reviewerRole: "cpi",
      stage: "Why",
      layer: "Part significance",
      supplier: "Example Supplier LLC",
      sourceItem: "PM-100",
      drawing: "DWG-100",
      module: "Power",
      risk: "Medium",
      preparedBy: PRACTICE_ACTORS.nstt,
      changeNote: "Practice sample for development testing.",
    }),
    normalizeReview({
      code: "S-02",
      title: "Sample cable assembly",
      projectId: PRACTICE_PROJECT,
      status: "In review",
      ownerRole: "nstt",
      reviewerRole: "cpi",
      stage: "How",
      layer: "Supply-chain resilience",
      supplier: "Example Supplier LLC",
      sourceItem: "CA-200",
      drawing: "DWG-200",
      module: "Power",
      action: "Proceed with protections",
      evidence: "The drawing and the source note are on file.",
      lifecycle: "Review again before the next buy.",
      condition: "Use a second source before the next buy.",
      risk: "Medium",
      confidence: "Medium",
      preparedBy: PRACTICE_ACTORS.nstt,
      changeNote: "Practice sample for development testing.",
    }),
    normalizeReview({
      code: "S-03",
      title: "Sample control board",
      projectId: PRACTICE_PROJECT,
      status: "In review",
      ownerRole: "nstt",
      reviewerRole: "trade",
      tradeSensitive: true,
      stage: "Where",
      layer: "Governance",
      supplier: "Example Controls LLC",
      sourceItem: "CB-300",
      drawing: "DWG-300",
      module: "Controls",
      action: "Proceed with active mitigation",
      evidence: "The control drawing and the trade question are on file.",
      lifecycle: "Review again if the destination or the control design changes.",
      condition: "Confirm the destination before the next buy.",
      risk: "High",
      confidence: "Low",
      preparedBy: PRACTICE_ACTORS.nstt,
      changeNote: "Practice sample for development testing.",
    }),
  ];
}

export function practiceSeedPlan(existingItems) {
  const samples = practiceSamples();
  const created = [];
  const skipped = [];
  const blocked = [];
  for (const sample of samples) {
    const existing = (existingItems || []).find((item) => item?.code === sample.code);
    if (!existing) {
      created.push(sample);
      continue;
    }
    if (cleanProjectId(existing.projectId) !== PRACTICE_PROJECT) blocked.push(sample.code);
    else skipped.push(sample.code);
  }
  return { created, skipped, blocked };
}
