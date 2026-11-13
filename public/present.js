import { executiveSlides, SLIDE_WIDTH, SLIDE_HEIGHT } from "./presentation-model.js";

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

function polygon(shape) {
  const { x, y, w, h, type } = shape;
  const points = type === "octagon"
    ? [[0.293, 0], [0.707, 0], [1, 0.293], [1, 0.707], [0.707, 1], [0.293, 1], [0, 0.707], [0, 0.293]]
    : type === "trapezoid"
      ? [[0.2, 0], [0.8, 0], [1, 1], [0, 1]]
      : [[0, 0.25], [0.65, 0.25], [0.65, 0], [1, 0.5], [0.65, 1], [0.65, 0.75], [0, 0.75]];
  return points.map(([px, py]) => `${(x + px * w) * 72},${(y + py * h) * 72}`).join(" ");
}

export function slideSvg(slide, { decorative = false } = {}) {
  const body = slide.shapes.map((shape) => {
    const x = shape.x * 72;
    const y = shape.y * 72;
    const w = shape.w * 72;
    const h = shape.h * 72;
    if (shape.type === "text") {
      const anchor = shape.align === "ctr" ? "middle" : shape.align === "r" ? "end" : "start";
      const left = x + (anchor === "middle" ? w / 2 : anchor === "end" ? w : 0);
      const lineHeight = shape.size * 1.12;
      const height = shape.lines.length * lineHeight;
      const top = y + (shape.valign === "ctr" ? Math.max(0, (h - height) / 2) : shape.valign === "b" ? Math.max(0, h - height) : 0);
      return `<text data-slot="${esc(shape.slot)}" x="${left}" y="${top + shape.size * 0.9}" fill="#${shape.color}" font-family="Arial, sans-serif" font-size="${shape.size}" font-weight="${shape.bold ? 700 : 400}" text-anchor="${anchor}">${shape.lines.map((line, index) => `<tspan x="${left}" dy="${index ? lineHeight : 0}">${esc(line)}</tspan>`).join("")}</text>`;
    }
    const style = `fill="${shape.fill ? `#${shape.fill}` : "none"}" stroke="${shape.stroke ? `#${shape.stroke}` : "none"}" stroke-width="${shape.strokeWidth || 0}"`;
    let element;
    if (shape.type === "line") {
      const x1 = x + (shape.flipH ? w : 0);
      const x2 = x + (shape.flipH ? 0 : w);
      const y1 = y + (shape.flipV ? h : 0);
      const y2 = y + (shape.flipV ? 0 : h);
      element = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${style}/>`;
    } else if (shape.type === "ellipse") {
      element = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${style}/>`;
    } else if (["octagon", "trapezoid", "rightArrow"].includes(shape.type)) {
      element = `<polygon points="${polygon(shape)}" ${style}/>`;
    } else {
      element = `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${style}/>`;
    }
    return shape.rotation ? `<g transform="rotate(${shape.rotation} ${x + w / 2} ${y + h / 2})">${element}</g>` : element;
  }).join("");
  return `<svg class="executive-slide" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SLIDE_WIDTH * 72} ${SLIDE_HEIGHT * 72}" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="${esc(slide.title)}"`}><title>${esc(slide.title)}</title><rect width="100%" height="100%" fill="#FFFFFF"/>${body}</svg>`;
}

export function presentationSlides(brief) {
  return executiveSlides(brief).map((slide) => ({ ...slide, picture: slideSvg(slide) }));
}

function recordDetail(record) {
  return `<details class="presentation-record">
    <summary>${esc(record.code)}: ${esc(record.title)}</summary>
    <dl>
      <div><dt>Supplier</dt><dd>${esc(record.supplier)}</dd></div>
      <div><dt>Status</dt><dd>${esc(record.status)}${record.status === "Approved" ? "" : ". This record is not a purchasing approval."}</dd></div>
      <div><dt>Action</dt><dd>${esc(record.action)}</dd></div>
      <div><dt>Risk</dt><dd>${esc(record.risk)}</dd></div>
      <div><dt>Confidence</dt><dd class="presentation-confidence">${esc(record.confidence)}</dd></div>
      ${record.sourceItem ? `<div><dt>Source item</dt><dd>${esc(record.sourceItem)}</dd></div>` : ""}
      ${record.drawing ? `<div><dt>Drawing</dt><dd>${esc(record.drawing)}</dd></div>` : ""}
      <div class="wide"><dt>Condition</dt><dd>${esc(record.condition)}</dd></div>
      <div class="wide"><dt>Future Policy/Lifecycle</dt><dd>${esc(record.lifecycle)}</dd></div>
    </dl>
  </details>`;
}

export function drawPresentation(brief, slideIndex, options = {}) {
  const slides = presentationSlides(brief);
  const index = Math.min(Math.max(0, slideIndex || 0), slides.length - 1);
  const slide = slides[index];
  const previews = slides.map((item, itemIndex) => `<button type="button" class="preview ${itemIndex === index ? "on" : ""}" data-slide-index="${itemIndex}" ${itemIndex === index ? 'aria-current="true"' : ""} aria-label="Preview ${itemIndex + 1}. ${esc(item.title)}">
    <span class="preview-picture" aria-hidden="true">${slideSvg(item, { decorative: true })}</span>
    <span class="preview-caption">${itemIndex + 1}. ${esc(item.title)}</span>
  </button>`).join("");
  const readable = options.readable === true;
  return `<section class="presentation reference-presentation" data-readable="${readable}" aria-label="Live presentation">
    <div class="brief-bar">
      <div><p class="presentation-page">Slide ${index + 1} of ${slides.length}</p><p class="quiet">Current project: ${esc(brief.projectName || "MDC Program Assurance")}. Draft for discussion.</p></div>
      <div class="row-actions">
        <button type="button" class="ghost" data-brief="prev" ${index === 0 ? "disabled" : ""}>Previous</button>
        <button type="button" class="ghost" data-brief="next" ${index === slides.length - 1 ? "disabled" : ""}>Next</button>
        <button type="button" class="ghost" data-presentation-zoom aria-pressed="${readable}">${readable ? "Fit width" : "Readable size"}</button>
        <button type="button" class="primary" data-brief="export">Download PowerPoint</button>
      </div>
    </div>
    <div class="preview-strip" aria-label="Slide previews">${previews}</div>
    <div class="presentation-viewport" tabindex="0" aria-label="Slide canvas. Use Left and Right Arrow to change slides.">
      <article class="present-stage" aria-label="${esc(slide.title)}">${slide.picture}</article>
    </div>
    <details class="presentation-details">
      <summary>Slide details and complete record text${slide.records.length ? ` (${slide.records.length} records)` : ""}</summary>
      <h2>${esc(slide.title)}</h2>
      <p>${esc(slide.subtitle)}</p>
      ${slide.note ? `<p>${esc(slide.note)}</p>` : ""}
      ${slide.overflow.map((item) => `<p><strong>${esc(item.label)}:</strong> ${esc(item.text)}</p>`).join("")}
      <p>Only approved records enter the decision line. Full conditions and Future Policy/Lifecycle notes are included in the PowerPoint speaker notes.</p>
      <div class="presentation-records">${slide.records.map(recordDetail).join("") || "<p>No component record is assigned to this planning guide.</p>"}</div>
    </details>
  </section>`;
}
