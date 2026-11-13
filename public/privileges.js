import { methodChecklist, normalizeReview } from "./rules.js";
import { approvalBlock } from "./rules.js";

export const ROLE_LABEL = {
  administrator: "Administrator",
  nstt: "NSTT",
  cpi: "CPI",
  trade: "Trade",
};

const PREPARE_FIELDS = [
  "title",
  "stage",
  "layer",
  "module",
  "supplier",
  "sourceItem",
  "drawing",
  "risk",
  "confidence",
  "action",
  "condition",
  "lifecycle",
  "evidence",
  "openFact",
  "tradeSensitive",
  "projectId",
  "sourceCategory",
  "sourceStatus",
  "confidenceScore",
];

function same(left, right, field) {
  if (field === "tradeSensitive") return Boolean(left) === Boolean(right);
  return String(left ?? "") === String(right ?? "");
}

function changed(prior, next, fields) {
  return fields.filter((field) => !same(prior[field], next[field], field));
}

function isMethodTemplate(record) {
  const template = methodChecklist().find((item) => item.code === record.code);
  if (!template) return false;
  return template.ownerRole === record.ownerRole
    && template.reviewerRole === record.reviewerRole
    && template.stage === record.stage
    && template.layer === record.layer;
}

export function roleSummary(role) {
  if (role === "administrator") {
    return "The administrator role grants access for this environment and can create a project. It does not prepare or approve an analysis record.";
  }
  if (role === "nstt") {
    return "The NSTT role prepares the analysis and can send a complete record to review. It cannot approve, grant access, or create a project.";
  }
  if (role === "cpi") {
    return "The CPI role reviews component and supplier facts on records assigned to CPI. It does not prepare an NSTT record, import the register, or grant access.";
  }
  if (role === "trade") {
    return "The Trade role reviews trade and export conditions. A trade-sensitive record needs a trade note before approval. This role does not import the register or grant access.";
  }
  return "A granted role is required before a record can change.";
}

export function recordAccess(actor, record) {
  const role = actor?.role || "";
  const item = record ? normalizeReview(record) : null;
  const closed = { mode: "none", message: "Select a record to begin.", canSave: false, canSend: false, canReturn: false, canApprove: false, canNote: false };
  if (!item) return closed;
  if (role === "administrator") {
    return { mode: "locked", message: "The administrator role can read this record. It does not prepare or approve it.", canSave: false, canSend: false, canReturn: false, canApprove: false, canNote: false };
  }
  if (item.status === "Approved") {
    const canReturn = role === item.reviewerRole;
    return {
      mode: "locked",
      message: canReturn
        ? "This record is approved. You can return it with a note if the decision must be reopened."
        : "This record is approved. It is locked.",
      canSave: false,
      canSend: false,
      canReturn,
      canApprove: false,
      canNote: canReturn,
    };
  }
  if (item.status === "In review") {
    const isReviewer = role === item.reviewerRole;
    const isTradeNote = role === "trade" && item.tradeSensitive;
    return {
      mode: isReviewer || isTradeNote ? "review" : "locked",
      message: isReviewer
        ? "This record is with your role. Add a note, return it, or approve it. Do not change the analysis."
        : isTradeNote
          ? "This record is trade sensitive. Add a trade review note. You can approve it only if Trade is the assigned reviewer."
          : "This record is in review. Your role cannot change it.",
      canSave: false,
      canSend: false,
      canReturn: isReviewer,
      canApprove: isReviewer,
      canNote: isReviewer || isTradeNote,
    };
  }
  if (role === item.ownerRole && (item.status === "Open" || item.status === "Returned")) {
    return {
      mode: "prepare",
      message: "You prepare this record. A missing fact keeps confidence pending and does not change the risk band. You cannot approve it.",
      canSave: true,
      canSend: true,
      canReturn: false,
      canApprove: false,
      canNote: true,
    };
  }
  return { mode: "locked", message: "This record is prepared by another role. You can read it. You cannot change it.", canSave: false, canSend: false, canReturn: false, canApprove: false, canNote: false };
}

export function privilegeDecision(actor, existing, proposed) {
  const role = actor?.role || "";
  if (!["administrator", "nstt", "cpi", "trade"].includes(role)) {
    return "A granted role is required before a record can change.";
  }
  if (role === "administrator") {
    return "The administrator role grants access. It does not prepare or approve an analysis record.";
  }
  const prior = existing ? normalizeReview(existing) : null;
  const next = normalizeReview(proposed);
  if (prior && next.ownerRole !== prior.ownerRole) return "A role cannot change the owner role.";
  if (prior && next.reviewerRole !== prior.reviewerRole) return "A role cannot change the assigned reviewer.";
  if (prior?.preparedBy && next.preparedBy && next.preparedBy !== prior.preparedBy) return "The preparer cannot be reassigned.";
  if (!prior && role !== "nstt") return "Only the NSTT role can start a new analysis record.";
  if (!prior && !isMethodTemplate(next) && next.ownerRole !== "nstt") return "A new analysis record stays with the NSTT role.";
  if (!prior && !isMethodTemplate(next) && !["cpi", "trade"].includes(next.reviewerRole)) return "Choose CPI or Trade as the reviewer.";
  if (!prior && next.status !== "Open") return "A new record starts as Open. Send it to review after the analysis is complete.";

  const analysisChanged = prior ? changed(prior, next, PREPARE_FIELDS).length > 0 : true;
  if (next.status === "Approved") {
    if (!prior || prior.status === "Approved") return "An approved record is locked. The assigned reviewer can return it with a note.";
    if (prior.status !== "In review") return "Send the record to review before a different role approves it.";
    if (analysisChanged) return "Approval cannot change the analysis. Return the record if a fact must change.";
    return approvalBlock(actor, next);
  }
  if (prior?.status === "Approved") {
    if (next.status === "Returned" && role === prior.reviewerRole && !analysisChanged) return "";
    return "An approved record can only be returned by the assigned reviewer.";
  }
  if (prior && prior.status === "In review" && next.status === "In review") {
    if (analysisChanged) return "The reviewer can add a note, return the record, or approve it. The reviewer cannot change the analysis.";
    if (role === prior.reviewerRole) return "";
    if (role === "trade" && prior.tradeSensitive) return "";
    return "Only the assigned reviewer can add a review note while the record is in review.";
  }
  if (next.status === "Returned") {
    if (!prior || prior.status !== "In review") return "Only a record in review can be returned.";
    if (role !== prior.reviewerRole) return "Only the assigned reviewer can return this record.";
    if (analysisChanged) return "A return keeps the analysis as prepared. Add a review note instead of changing the record.";
    return "";
  }
  if (next.status === "In review") {
    if (!prior || (prior.status !== "Open" && prior.status !== "Returned")) return "Only the preparing role can send an open or returned record to review.";
    if (role !== prior.ownerRole) return "Only the preparing role can send this record to review.";
    if (!next.action || !next.evidence || !next.lifecycle) return "Send to review after the action, the evidence, and the lifecycle are recorded.";
    return "";
  }
  if (role !== (prior?.ownerRole || "nstt")) return "This role can review the record. It cannot change the analysis.";
  if (prior && prior.status !== "Open" && prior.status !== "Returned") return "This record is with the reviewer. Wait for a return before changing the analysis.";
  if (prior && next.status !== prior.status && next.status !== "Open") return "Use Send to review. This role cannot set another status.";
  return "";
}

export function importPrivilege(role, existing, next) {
  if (role !== "nstt") return "Only the NSTT role can import register updates.";
  const prior = existing ? normalizeReview(existing) : null;
  const record = normalizeReview(next);
  if (prior?.status === "Approved" || record.status === "Approved") return "Import cannot change an approved record. The assigned reviewer must return it first.";
  if (record.ownerRole !== "nstt") return "Import can update records prepared by NSTT. It cannot take over another role's record.";
  if (prior && prior.ownerRole !== "nstt") return "Import cannot change a record prepared by another role.";
  if (prior && prior.reviewerRole !== record.reviewerRole) return "Import cannot change the assigned reviewer.";
  if (!prior && !["cpi", "trade"].includes(record.reviewerRole)) return "A new imported record uses CPI or Trade as the reviewer.";
  if (record.status === "In review" && (!record.action || !record.evidence || !record.lifecycle)) {
    return "Import cannot send a record to review until the action, the evidence, and the lifecycle are recorded.";
  }
  return "";
}

export function restorePrivilege(role, record, current) {
  const item = normalizeReview(record);
  const live = current ? normalizeReview(current) : null;
  if (live?.status === "Approved") {
    return role === live.reviewerRole ? "" : "An approved record can only be returned by the assigned reviewer.";
  }
  if (role !== (live?.ownerRole || item.ownerRole)) return "Only the preparing role can restore a version of this record.";
  return "";
}

export function projectPrivilege(role) {
  return role === "administrator" ? "" : "Only an administrator can create a project.";
}

export function libraryPrivilege(role) {
  return role === "administrator" || role === "nstt" ? "" : "Only NSTT or an administrator can add a library name. A review role can read the library.";
}
