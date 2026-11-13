const GUIDE = {
  title: "Practice guide",
  intro: "This guide is for Practice reviews in development. It does not change an administrator grant, and it does not change the MDC register.",
  steps: [
    {
      role: "Administrator",
      text: "Leave Practice as on Administrator. You can grant access and create a project. You cannot start, import, or approve an analysis.",
    },
    {
      role: "NSTT",
      text: "Choose NSTT under Practice as, then open Guided analysis. Finish S-01 through Why, What, When, Where, Who, and How. Record an action, the evidence, and a lifecycle note, then send the record to CPI. New analysis starts the next sample in this project only. You cannot approve a record you prepared.",
    },
    {
      role: "CPI",
      text: "Choose CPI under Practice as, then open Guided analysis. S-02 is waiting. Check the facts and the evidence, add a review note, then approve or return the record. Do not rewrite the analysis.",
    },
    {
      role: "Trade",
      text: "Choose Trade under Practice as, then open Guided analysis. S-03 is waiting. Add a trade review note, then approve or return the record. A reviewer who is not Trade cannot approve this record until that note is recorded.",
    },
    {
      role: "Brief",
      text: "After an approval, open Decision brief while Practice reviews is selected. The decision line uses approved records only. Choose MDC in the project filter to confirm that register is unchanged.",
    },
  ],
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function practiceGuide() {
  return GUIDE;
}

export function drawPracticeGuide({ open = false } = {}) {
  const steps = GUIDE.steps.map((step) => `<li><strong>${esc(step.role)}.</strong> ${esc(step.text)}</li>`).join("");
  return `<details class="practice-guide duty" aria-label="Practice guide" ${open ? "open" : ""}><summary>${esc(GUIDE.title)}<span>Preparation, review, and approval using sample records.</span></summary><p>${esc(GUIDE.intro)}</p><ol>${steps}</ol></details>`;
}
