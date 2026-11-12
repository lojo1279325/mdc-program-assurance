import test from "node:test";
import assert from "node:assert/strict";
import { decideAccess, isAllowedDomain, normalizeEmail } from "./policy.js";

test("domain match is exact", () => {
  assert.equal(normalizeEmail(" Louverture.Jones@BlackEngTech.com "), "louverture.jones@blackengtech.com");
  assert.equal(isAllowedDomain("person@alvarezandmarsal.com"), true);
  assert.equal(isAllowedDomain("person@gmail.com"), false);
  assert.equal(isAllowedDomain("person@corp.alvarezandmarsal.com"), false);
});

test("a missing grant stays pending and does not raise a risk", () => {
  assert.equal(decideAccess({ email: "a@blackengtech.com", emailVerified: true, grantRole: null, grantRevoked: false }), "pending");
  assert.equal(decideAccess({ email: "a@blackengtech.com", emailVerified: true, grantRole: "nstt", grantRevoked: false }), "granted");
  assert.equal(decideAccess({ email: "a@gmail.com", emailVerified: true, grantRole: "nstt", grantRevoked: false }), "domain");
});
