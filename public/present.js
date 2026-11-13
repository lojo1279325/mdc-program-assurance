function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function shortName(value) {
  const text = String(value || "");
  return text.length > 18 ? `${text.slice(0, 17)}...` : text;
}

function bars(rows, label) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const height = 28 + rows.length * 36;
  const body = rows.map((row, index) => {
    const y = 18 + index * 36;
    const width = Math.max(8, Math.round((row.value / max) * 280));
    return `<g>
      <text x="0" y="${y + 14}" fill="#1B1E24" font-size="13" font-family="IBM Plex Sans, Segoe UI, sans-serif">${esc(shortName(row.label))}</text>
      <rect x="250" y="${y}" width="${width}" height="16" rx="3" fill="${row.color || "#01244A"}"></rect>
      <text x="${258 + width}" y="${y + 13}" fill="#5C6570" font-size="13" font-family="IBM Plex Sans, Segoe UI, sans-serif">${esc(row.value)}</text>
    </g>`;
  }).join("");
  return `<svg class="map-picture" viewBox="0 0 620 ${height}" role="img" aria-label="${esc(label)}">${body}</svg>`;
}

function metric(value, label) {
  return `<article class="present-metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></article>`;
}

export function presentationSlides(brief) {
  const actions = brief.actions || {};
  const vendors = (brief.vendors || []).slice(0, 6);
  const accuracy = { High: 0, Medium: 0, Low: 0, Pending: 0 };
  const links = { High: 0, Medium: 0, Low: 0, Pending: 0 };
  for (const vendor of brief.vendors || []) {
    accuracy[vendor.accuracy] = (accuracy[vendor.accuracy] || 0) + 1;
    for (const part of vendor.parts || []) links[part.confidence] = (links[part.confidence] || 0) + 1;
  }
  const open = brief.slides?.find((slide) => slide.id === "open");
  const openRows = open?.rows || [];
  return [
    {
      id: "cover",
      title: "Current decision",
      picture: `<div class="present-cover">
        <p>Draft for discussion</p>
        <h2>${esc(brief.headline || "This project is not ready for an executive decision.")}</h2>
        <p>${esc(brief.projectName || "MDC Program Assurance")} · ${esc(brief.generatedOn || "Current register")}</p>
      </div>`,
    },
    {
      id: "ready",
      title: "What is ready",
      picture: `<div class="present-sheet">
        <h2>No approved record is available for a decision</h2>
        <div class="present-metrics">
          ${metric(brief.records || 0, "Review records")}
          ${metric(brief.approved || 0, "Approved")}
          ${metric(brief.ready || 0, "Prepared for review")}
          ${metric(brief.missingAction || 0, "Need an action")}
          ${metric(brief.pending || 0, "Pending confidence")}
          ${metric(brief.missingLifecycle || 0, "Need a lifecycle note")}
        </div>
      </div>`,
    },
    {
      id: "decision",
      title: "Decision line",
      picture: `<div class="present-sheet">
        <h2>Approved records only</h2>
        ${bars([
          { label: "Proceed", value: actions.Proceed || 0, color: "#437A22" },
          { label: "Proceed with protections", value: actions["Proceed with protections"] || 0, color: "#B87700" },
          { label: "Proceed with active mitigation", value: actions["Proceed with active mitigation"] || 0, color: "#C46A2B" },
          { label: "Do not proceed absent resolution", value: actions["Do not proceed absent resolution"] || 0, color: "#A13544" },
        ], "Approved action counts")}
        <p>A record that is not approved stays off this line, even when its action is already set.</p>
      </div>`,
    },
    {
      id: "open",
      title: "Still open",
      picture: `<div class="present-sheet">
        <h2>${esc((brief.records || 0) - (brief.approved || 0))} records remain outside the decision line</h2>
        <table>
          <thead><tr><th>Record</th><th>Part</th><th>Confidence</th></tr></thead>
          <tbody>${openRows.slice(0, 4).map((row) => `<tr><td>${esc(row.code)}</td><td>${esc(row.title)}</td><td>${esc(row.confidence || "Pending")}</td></tr>`).join("") || "<tr><td colspan=\"3\">No open record is listed.</td></tr>"}</tbody>
        </table>
      </div>`,
    },
    {
      id: "vendors",
      title: "Vendor map",
      picture: `<div class="present-sheet">
        <h2>${esc((brief.vendors || []).length)} named vendors in the live map</h2>
        ${vendors.length ? bars(vendors.map((vendor) => ({ label: vendor.name, value: vendor.parts.length, color: "#01244A" })), "Vendor concentration") : "<p>No named vendor is recorded in this project.</p>"}
        <p>${vendors.map((vendor) => `${esc(vendor.name)}: ${vendor.parts.length}`).join(". ")}</p>
        <p>${esc((brief.unnamed || []).length)} parts have no named vendor. Their accuracy stays pending.</p>
      </div>`,
    },
    {
      id: "accuracy",
      title: "Accuracy",
      picture: `<div class="present-sheet">
        <h2>Accuracy confidence is a link check, not a risk color</h2>
        <table>
          <thead><tr><th>Accuracy</th><th>Named vendors</th><th>Named part links</th></tr></thead>
          <tbody>${["High", "Medium", "Low", "Pending"].map((name) => `<tr><td>${name}</td><td>${accuracy[name] || 0}</td><td>${links[name] || 0}</td></tr>`).join("")}</tbody>
        </table>
        <p>A missing fact lowers confidence. It does not change the risk band.</p>
      </div>`,
    },
  ];
}

export function drawPresentation(brief, slideIndex) {
  const slides = presentationSlides(brief);
  const index = Math.min(Math.max(0, slideIndex || 0), slides.length - 1);
  const slide = slides[index];
  const previews = slides.map((item, itemIndex) => `<button type="button" class="preview ${itemIndex === index ? "on" : ""}" data-slide-index="${itemIndex}" aria-label="Preview ${itemIndex + 1}. ${esc(item.title)}">
    <span class="preview-picture" aria-hidden="true">${item.picture}</span>
    <span>${itemIndex + 1}. ${esc(item.title)}</span>
  </button>`).join("");
  return `<section class="presentation" aria-label="Live presentation">
    <div class="brief-bar">
      <p class="quiet">Slide ${index + 1} of ${slides.length}. This presentation follows the selected project and changes when a record is saved or approved.</p>
      <div class="row-actions">
        <button type="button" class="ghost" data-brief="prev" ${index === 0 ? "disabled" : ""}>Previous</button>
        <button type="button" class="ghost" data-brief="next" ${index === slides.length - 1 ? "disabled" : ""}>Next</button>
        <button type="button" class="primary" data-brief="export">Download decision brief</button>
      </div>
    </div>
    <div class="preview-strip" aria-label="Slide previews">${previews}</div>
    <article class="present-stage" aria-label="${esc(slide.title)}">
      ${slide.picture}
      <p class="quiet">Draft for discussion. Generated from the current register. It is not a legal conclusion.</p>
    </article>
  </section>`;
}
