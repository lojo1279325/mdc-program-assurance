import { ACTIONS } from "./rules.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function posture(action) {
  return {
    Proceed: "green",
    "Proceed with protections": "yellow",
    "Proceed with active mitigation": "orange",
    "Do not proceed absent resolution": "red",
  }[action] || "grey";
}

function rowCard(row) {
  const action = ACTIONS.includes(row.action) ? row.action : "";
  return `<article class="card">
    <p class="label">${esc(row.code)} ${esc(row.title)}</p>
    <div class="pills">${action ? `<span class="pill ${posture(action)}">${esc(action)}</span>` : ""}<span class="pill grey">Confidence ${esc(row.confidence || "Pending")}</span></div>
    <p>${esc(row.text)}</p>
  </article>`;
}

export function drawBrief(brief, slideIndex) {
  const slides = brief.slides.length ? brief.slides : [{ title: "Decision support", kicker: "", lines: ["This project has no review records."], rows: [] }];
  const index = Math.min(Math.max(0, slideIndex || 0), slides.length - 1);
  const slide = slides[index];
  return `<div class="brief-bar">
    <p class="quiet">Slide ${index + 1} of ${slides.length}. This brief follows the selected project and changes when a record is saved or approved.</p>
    <div class="row-actions">
      <button type="button" class="ghost" data-brief="prev" ${index === 0 ? "disabled" : ""}>Previous</button>
      <button type="button" class="ghost" data-brief="next" ${index === slides.length - 1 ? "disabled" : ""}>Next</button>
      <button type="button" class="primary" data-brief="export">Download decision brief</button>
      <button type="button" class="ghost" data-brief="vendors">Download vendor map</button>
    </div>
  </div>
  <div class="jump">${slides.map((item, itemIndex) => `<button type="button" class="${itemIndex === index ? "on" : ""}" data-slide-index="${itemIndex}">${itemIndex + 1}. ${esc(item.title)}</button>`).join("")}</div>
  <article class="slide" aria-label="${esc(slide.title)}">
    <p class="kicker">${esc(slide.kicker || "Draft for discussion")}</p>
    <h2>${esc(slide.title)}</h2>
    <div class="slide-lines">${(slide.lines || []).map((line) => `<p>${esc(line)}</p>`).join("")}</div>
    ${slide.rows?.length ? `<div class="cards">${slide.rows.map(rowCard).join("")}</div>` : ""}
    <p class="quiet">Draft for discussion. Generated from the current register. It is not a legal conclusion.</p>
  </article>`;
}

export function drawVendorMap(map, query) {
  const needle = String(query || "").trim().toLowerCase();
  const vendors = (map.vendors || []).filter((vendor) => {
    if (!needle) return true;
    const blob = `${vendor.name} ${vendor.parts.map((part) => `${part.code} ${part.title}`).join(" ")}`.toLowerCase();
    return blob.includes(needle);
  });
  const unnamed = (map.unnamed || []).filter((part) => {
    if (!needle) return true;
    return `${part.code} ${part.title}`.toLowerCase().includes(needle);
  });
  const vendorCards = vendors.map((vendor) => `<article class="card">
    <p class="label">${esc(vendor.name)}</p>
    <h2 style="font-size:16px;margin:4px 0 8px;">${vendor.parts.length} related part${vendor.parts.length === 1 ? "" : "s"}</h2>
    <div class="pills"><span class="pill grey">Accuracy ${esc(vendor.accuracy)}</span><span class="pill">${vendor.approved} approved</span></div>
    <p>Accuracy confidence is the weakest vendor and part link under this name. It is not a risk color.</p>
    <div style="margin-top:8px;"><table>
      <thead><tr><th>Part</th><th>Name</th><th>Action</th><th>Accuracy</th><th>Status</th></tr></thead>
      <tbody>${vendor.parts.map((part) => `<tr>
        <td><button type="button" class="item code-link" data-code="${esc(part.code)}" data-open="queue">${esc(part.code)}</button></td>
        <td>${esc(part.title)}</td>
        <td><span class="pill ${posture(part.action)}">${esc(part.action || "Action not set")}</span></td>
        <td><span class="pill grey">${esc(part.confidence)}</span></td>
        <td>${esc(part.status)}</td>
      </tr>`).join("")}</tbody>
    </table></div>
  </article>`).join("");
  const unnamedBlock = unnamed.length ? `<article class="card">
    <p class="label">No named vendor</p>
    <h2 style="font-size:16px;margin:4px 0 8px;">${unnamed.length} part${unnamed.length === 1 ? "" : "s"}</h2>
    <div class="pills"><span class="pill grey">Accuracy Pending</span></div>
    <p>These parts do not have a named vendor. Accuracy confidence stays pending. The risk band does not change.</p>
    <div class="pills">${unnamed.slice(0, 24).map((part) => `<button type="button" class="item code-link" data-code="${esc(part.code)}" data-open="queue">${esc(part.code)}</button>`).join("")}</div>
    ${unnamed.length > 24 ? `<p class="quiet">${unnamed.length - 24} more parts are in the vendor map download.</p>` : ""}
  </article>` : "";
  return `<div class="brief-bar">
    <p class="quiet">Each vendor shows the parts related to it and the accuracy confidence of that link. Search narrows this map. It follows the selected project.</p>
    <button type="button" class="primary" data-brief="vendors">Download vendor map</button>
  </div>
  <div class="cards vendor-map">${vendorCards || `<article class="card"><p>No named vendor matches this search.</p></article>`}${unnamedBlock}</div>`;
}
