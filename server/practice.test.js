import test from "node:test";
import assert from "node:assert/strict";
import { approvalBlock } from "../public/rules.js";
import { privilegeDecision } from "../public/privileges.js";
import { PRACTICE_ACTORS, PRACTICE_PROJECT, practiceActor, practiceSamples, practiceSeedPlan } from "./practice.js";

const admin = {
  environment: "development",
  designated: true,
  grantRole: "administrator",
  email: "louverture.jones@blackengtech.com",
};

test("a practice role does not replace the administrator grant and cannot touch MDC", () => {
  const idle = practiceActor({ ...admin, requestedRole: "", projectId: "MDC" });
  assert.equal(idle.role, "administrator");
  assert.equal(idle.email, admin.email);
  assert.equal(idle.error, "");

  const nstt = practiceActor({ ...admin, requestedRole: "nstt", projectId: PRACTICE_PROJECT });
  assert.equal(nstt.role, "nstt");
  assert.equal(nstt.email, PRACTICE_ACTORS.nstt);
  assert.notEqual(nstt.email, admin.email);

  assert.match(practiceActor({ ...admin, environment: "production", requestedRole: "cpi", projectId: PRACTICE_PROJECT }).error, /development/);
  assert.match(practiceActor({ ...admin, designated: false, requestedRole: "cpi", projectId: PRACTICE_PROJECT }).error, /designated administrator/);
  assert.match(practiceActor({ ...admin, grantRole: "nstt", requestedRole: "cpi", projectId: PRACTICE_PROJECT }).error, /designated administrator/);
  assert.match(practiceActor({ ...admin, requestedRole: "cpi", projectId: "MDC" }).error, /MDC register/);
  assert.match(practiceActor({ ...admin, requestedRole: "cpi", projectId: PRACTICE_PROJECT, existingProjectId: "MDC" }).error, /MDC register/);
  assert.match(practiceActor({ ...admin, requestedRole: "", existingProjectId: PRACTICE_PROJECT }).error, /administrator grant/);
});

test("practice samples let a different person review and approve without changing MDC", () => {
  const samples = practiceSamples();
  assert.deepEqual(samples.map((item) => item.code), ["S-01", "S-02", "S-03"]);
  assert.equal(samples.every((item) => item.projectId === PRACTICE_PROJECT), true);
  assert.equal(samples[0].evidence, "");
  assert.equal(samples[0].confidence, "Pending");
  assert.equal(samples[1].status, "In review");
  assert.equal(samples[2].tradeSensitive, true);
  assert.equal(samples.some((item) => /wuxi|softbank|oracle/i.test(JSON.stringify(item))), false);

  const cpi = practiceActor({ ...admin, requestedRole: "cpi", projectId: PRACTICE_PROJECT, existingProjectId: PRACTICE_PROJECT });
  const trade = practiceActor({ ...admin, requestedRole: "trade", projectId: PRACTICE_PROJECT, existingProjectId: PRACTICE_PROJECT });
  const nstt = practiceActor({ ...admin, requestedRole: "nstt", projectId: PRACTICE_PROJECT, existingProjectId: PRACTICE_PROJECT });
  assert.equal(privilegeDecision(cpi, samples[1], { ...samples[1], status: "Approved" }), "");
  assert.equal(approvalBlock(cpi, samples[1]), "");
  assert.match(privilegeDecision(nstt, samples[1], { ...samples[1], status: "Approved" }), /cannot approve|prepared/);
  assert.match(privilegeDecision(cpi, samples[2], { ...samples[2], status: "Approved" }), /assigned reviewer/);
  assert.equal(privilegeDecision(trade, samples[2], { ...samples[2], status: "Approved" }), "");

  const plan = practiceSeedPlan([{ code: "S-01", projectId: "MDC" }, { code: "S-02", projectId: PRACTICE_PROJECT }]);
  assert.deepEqual(plan.blocked, ["S-01"]);
  assert.deepEqual(plan.skipped, ["S-02"]);
  assert.equal(plan.created[0].code, "S-03");
});
