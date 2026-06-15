/**
 * SaaS: organization is chosen at login (company code), not fixed per deployment.
 * Env vars are optional defaults for development convenience only.
 */
const COMPANY_CODE_KEY = "pos_erp_company_code";

export function getStoredCompanyCode() {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(COMPANY_CODE_KEY)?.trim();
  return stored ? stored.toUpperCase() : null;
}

export function hasStoredCompanyCode() {
  return !!getStoredCompanyCode();
}

export function clearStoredCompanyCode() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(COMPANY_CODE_KEY);
}

export function setStoredCompanyCode(code) {
  if (typeof window === "undefined" || !code) return;
  localStorage.setItem(COMPANY_CODE_KEY, code.toUpperCase());
}

export function getDefaultCompanyCode() {
  const env = process.env.NEXT_PUBLIC_COMPANY_CODE?.trim();
  return env ? env.toUpperCase() : "DEMO";
}

export function getCompanyCode() {
  return getStoredCompanyCode() ?? getDefaultCompanyCode();
}

export function getCompanyName() {
  return process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || null;
}
