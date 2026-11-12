export const ALLOWED_DOMAINS = ["blackengtech.com", "alvarezandmarsal.com"];
export const ROLES = ["administrator", "nstt", "cpi", "trade"];
export const ENVIRONMENTS = ["development", "test", "production"];

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function currentEnvironment(value = process.env.APP_ENV) {
  const name = String(value || "development").trim().toLowerCase();
  if (name === "test") return "test";
  if (name === "production" || name === "prod") return "production";
  if (name === "local") return "development";
  return "development";
}

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!EMAIL.test(email) || email.includes("..") || email.startsWith(".") || email.includes(".@")) return null;
  return email;
}

export function isAllowedDomain(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  return ALLOWED_DOMAINS.includes(domain);
}

export function designatedAdministrators() {
  const configured = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  return configured.length ? configured : ["louverture.jones@blackengtech.com"];
}

export function decideAccess({ email, emailVerified, grantRole, grantRevoked }) {
  if (!isAllowedDomain(email)) return "domain";
  if (!emailVerified) return "unverified";
  if (!grantRole || grantRevoked || !ROLES.includes(grantRole)) return "pending";
  return "granted";
}
