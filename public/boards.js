import { ACTIONS, STATUSES, STAGES, cleanProjectId, normalizeReview } from "./rules.js";

export const BUILT_IN_PROJECT = {
  id: "mdc",
  code: "MDC",
  name: "MDC Program Assurance",
  status: "Active",
  builtIn: true,
};

export { cleanProjectId };

export function validNewProjectCode(value) {
  const code = cleanProjectId(value);
  return code !== "MDC" && code === String(value || "").trim().toUpperCase();
}

export function projectOf(item) {
  return cleanProjectId(item?.projectId);
}

export function filterProject(items, projectId) {
  const code = cleanProjectId(projectId);
  return items.map(normalizeReview).filter((item) => projectOf(item) === code);
}

export function vendorKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function countBy(items, field, values) {
  const counts = {};
  for (const value of values) counts[value] = 0;
  for (const item of items) counts[item[field]] = (counts[item[field]] || 0) + 1;
  return counts;
}

export function workflowBoard(items) {
  const reviews = items.map(normalizeReview);
  const byStatus = countBy(reviews, "status", STATUSES);
  const byStage = countBy(reviews, "stage", STAGES);
  return {
    records: reviews.length,
    byStatus,
    byStage,
    building: reviews.filter((item) => item.status === "Open" || item.status === "Returned").length,
    inReview: byStatus["In review"] || 0,
    approved: byStatus.Approved || 0,
  };
}

export function completionBoard(items) {
  const reviews = items.map(normalizeReview);
  const total = reviews.length;
  const gate = (id, label, done) => ({ id, label, done, total, remaining: Math.max(0, total - done) });
  return {
    total,
    gates: [
      gate("action", "Action set", reviews.filter((item) => ACTIONS.includes(item.action)).length),
      gate("evidence", "Evidence recorded", reviews.filter((item) => item.evidence).length),
      gate("lifecycle", "Lifecycle recorded", reviews.filter((item) => item.lifecycle).length),
      gate("confidence", "Confidence decided", reviews.filter((item) => item.confidence !== "Pending").length),
      gate("approved", "Approved", reviews.filter((item) => item.status === "Approved").length),
    ],
    pendingConfidence: reviews.filter((item) => item.confidence === "Pending").length,
    ready: reviews.filter((item) => ACTIONS.includes(item.action) && item.evidence && item.lifecycle && item.status !== "Approved").length,
  };
}

export function userBoard(items, actor = {}) {
  const reviews = items.map(normalizeReview);
  const email = String(actor.email || "").toLowerCase();
  const role = String(actor.role || "");
  const prepared = reviews.filter((item) => item.preparedBy && item.preparedBy.toLowerCase() === email);
  const waiting = reviews.filter((item) => {
    if (item.status !== "In review" || !email || item.preparedBy.toLowerCase() === email) return false;
    if (role === "administrator") return item.ownerRole !== "administrator";
    return item.reviewerRole === role && item.ownerRole !== role;
  });
  const returned = reviews.filter((item) => item.status === "Returned" && (item.preparedBy.toLowerCase() === email || item.ownerRole === role));
  return { prepared, waiting, returned };
}

export function ownerBoard(items) {
  const reviews = items.map(normalizeReview);
  const roles = ["nstt", "cpi", "trade"];
  return roles.map((role) => {
    const rows = reviews.filter((item) => item.ownerRole === role);
    const preparers = new Map();
    for (const item of rows) {
      const key = item.preparedBy || "Not recorded";
      const current = preparers.get(key) || { email: key, records: 0, open: 0 };
      current.records += 1;
      if (item.status !== "Approved") current.open += 1;
      preparers.set(key, current);
    }
    return {
      role,
      records: rows.length,
      open: rows.filter((item) => item.status === "Open").length,
      inReview: rows.filter((item) => item.status === "In review").length,
      returned: rows.filter((item) => item.status === "Returned").length,
      approved: rows.filter((item) => item.status === "Approved").length,
      actionNotSet: rows.filter((item) => !item.action).length,
      pendingConfidence: rows.filter((item) => item.confidence === "Pending").length,
      preparers: [...preparers.values()].sort((a, b) => b.open - a.open || a.email.localeCompare(b.email)),
    };
  });
}

function evaluationSummary(rows) {
  const current = rows.slice().sort((a, b) => (b.version || 0) - (a.version || 0) || a.code.localeCompare(b.code))[0] || null;
  return {
    count: rows.length,
    current,
    open: rows.filter((item) => item.status !== "Approved").length,
    approved: rows.filter((item) => item.status === "Approved").length,
    pendingConfidence: rows.filter((item) => item.confidence === "Pending").length,
    codes: rows.map((item) => item.code).sort().slice(0, 8),
    more: Math.max(0, rows.length - 8),
  };
}

export function buildLibrary(items, vendors = [], parts = [], projectId = "MDC") {
  const reviews = items.map(normalizeReview);
  const selected = cleanProjectId(projectId);
  const vendorMap = new Map();
  const partMap = new Map();

  function vendorRow(name) {
    const key = vendorKey(name);
    if (!key) return null;
    if (!vendorMap.has(key)) {
      vendorMap.set(key, {
        key,
        name: String(name).trim(),
        country: "",
        identifier: "",
        note: "",
        saved: false,
        reviews: [],
      });
    }
    return vendorMap.get(key);
  }

  function partRow(code, name) {
    const key = String(code || "").trim().toUpperCase();
    if (!key) return null;
    if (!partMap.has(key)) {
      partMap.set(key, {
        key,
        code: key,
        name: String(name || "").trim(),
        drawing: "",
        vendorName: "",
        note: "",
        saved: false,
        reviews: [],
      });
    }
    return partMap.get(key);
  }

  for (const vendor of vendors) {
    const row = vendorRow(vendor.name);
    if (!row) continue;
    row.saved = true;
    row.name = vendor.name || row.name;
    row.country = vendor.country || "";
    row.identifier = vendor.identifier || "";
    row.note = vendor.note || "";
    row.id = vendor.id;
  }
  for (const part of parts) {
    const row = partRow(part.code, part.name);
    if (!row) continue;
    row.saved = true;
    row.name = part.name || row.name;
    row.drawing = part.drawing || "";
    row.vendorName = part.vendorName || "";
    row.note = part.note || "";
    row.id = part.id;
  }
  for (const item of reviews) {
    const vendor = vendorRow(item.supplier);
    if (vendor) {
      if (!vendor.saved && item.supplier.trim().length > vendor.name.length) vendor.name = item.supplier.trim();
      vendor.reviews.push(item);
    }
    const part = partRow(item.sourceItem || ((item.supplier || item.drawing) ? item.code : ""), item.title);
    if (part) {
      if (!part.name) part.name = item.title;
      if (!part.drawing && item.drawing) part.drawing = item.drawing;
      if (!part.vendorName && item.supplier) part.vendorName = item.supplier;
      part.reviews.push(item);
    }
  }

  function present(row) {
    const currentReviews = row.reviews.filter((item) => projectOf(item) === selected);
    const other = row.reviews.length - currentReviews.length;
    const summary = evaluationSummary(currentReviews);
    return {
      ...row,
      reviews: undefined,
      current: summary.current ? {
        code: summary.current.code,
        title: summary.current.title,
        action: summary.current.action,
        status: summary.current.status,
        confidence: summary.current.confidence,
        risk: summary.current.risk,
        lifecycle: summary.current.lifecycle,
      } : null,
      evaluations: summary.count,
      otherProjects: other,
      open: summary.open,
      approved: summary.approved,
      pendingConfidence: summary.pendingConfidence,
      codes: summary.codes,
      more: summary.more,
    };
  }

  const sortByName = (a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  return {
    vendors: [...vendorMap.values()].map(present).sort(sortByName),
    parts: [...partMap.values()].map(present).sort((a, b) => a.code.localeCompare(b.code)),
  };
}

export function workflowMarkup(board) {
  const statuses = STATUSES.map((status, index) => ({ status, count: board.byStatus[status] || 0, index }));
  const stages = STAGES.map((stage) => ({ stage, count: board.byStage[stage] || 0 }));
  const statusNodes = statuses.map((node) => {
    const x = 48 + node.index * 176;
    return `<g><circle cx="${x}" cy="36" r="18" fill="#01244a"></circle><text x="${x}" y="41" text-anchor="middle" fill="#ffffff" font-size="12" font-family="IBM Plex Sans, Segoe UI, sans-serif">${node.count}</text><text x="${x}" y="72" text-anchor="middle" fill="#1b1e24" font-size="12" font-family="IBM Plex Sans, Segoe UI, sans-serif">${escapeXml(node.status)}</text></g>`;
  }).join("");
  const stageNodes = stages.map((node, index) => {
    const x = 40 + index * 112;
    return `<g><rect x="${x - 36}" y="8" width="72" height="36" rx="6" fill="#ffffff" stroke="#01244a"></rect><text x="${x}" y="24" text-anchor="middle" fill="#01244a" font-size="12" font-family="IBM Plex Sans, Segoe UI, sans-serif">${escapeXml(node.stage)}</text><text x="${x}" y="38" text-anchor="middle" fill="#1b1e24" font-size="12" font-family="IBM Plex Sans, Segoe UI, sans-serif">${node.count}</text></g>`;
  }).join("");
  return {
    status: `<svg viewBox="0 0 720 88" role="img" aria-label="Status track from Open to Approved"><line x1="48" y1="36" x2="576" y2="36" stroke="#01244a" stroke-width="2"></line>${statusNodes}</svg>`,
    stages: `<svg viewBox="0 0 720 56" role="img" aria-label="Stage track from Why to How">${stageNodes}</svg>`,
  };
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
