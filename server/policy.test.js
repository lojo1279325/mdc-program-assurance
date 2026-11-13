import test from "node:test";
import assert from "node:assert/strict";
import { decideAccess, designatedAdministrators, isAllowedDomain, normalizeEmail } from "./policy.js";

test("domain match is exact", () => {
  assert.equal(normalizeEmail(" Louverture.Jones@BlackEngTech.com "), "louverture.jones@blackengtech.com");
  assert.equal(isAllowedDomain("person@alvarezandmarsal.com"), true);
  assert.equal(isAllowedDomain("person@gmail.com"), false);
  assert.equal(isAllowedDomain("person@corp.alvarezandmarsal.com"), false);
});

test("both allowed domains have a designated administrator when none is configured", () => {
  const prior = process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_EMAILS;
  const admins = designatedAdministrators();
  if (prior === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = prior;
  assert.equal(admins.includes("louverture.jones@blackengtech.com"), true);
  assert.equal(admins.includes("louverture.jones@alvarezandmarsal.com"), true);
});

test("a missing grant stays pending and does not raise a risk", () => {
  assert.equal(decideAccess({ email: "a@blackengtech.com", emailVerified: true, grantRole: null, grantRevoked: false }), "pending");
  assert.equal(decideAccess({ email: "a@blackengtech.com", emailVerified: true, grantRole: "nstt", grantRevoked: false }), "granted");
  assert.equal(decideAccess({ email: "a@gmail.com", emailVerified: true, grantRole: "nstt", grantRevoked: false }), "domain");
});
