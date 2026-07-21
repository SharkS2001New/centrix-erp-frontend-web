import { reportModuleForSlug, isModuleEnabledForNav } from "@/lib/module-registry";

/**
 * Operational finance reports available in the backoffice workspace when full
 * accounting is disabled. Same routes as the accounting workspace — nav only.
 */
export const BACKOFFICE_FINANCE_REPORT_SLUGS = [
  "profit-loss",
  "profit-loss-by-product",
  "top-debtors",
  "ar-aging",
  "invoice-payments",
  "kra-receipts",
];

/** Either sales or accounting reports module unlocks these slugs. */
export const BACKOFFICE_FINANCE_REPORT_MODULES = ["sales.reports", "accounting.reports"];

/** Customer/supplier transaction statements (sidebar under Customers / Suppliers). */
export const STATEMENT_REPORT_SLUGS = ["customer-statement", "supplier-statement"];

/** @param {string} slug */
export function isBackofficeFinanceReport(slug) {
  return BACKOFFICE_FINANCE_REPORT_SLUGS.includes(slug);
}

/** @param {string} slug */
export function isStatementReportSlug(slug) {
  return STATEMENT_REPORT_SLUGS.includes(slug);
}

/** @param {string} slug @param {string} workspaceId */
export function statementReportBelongsToWorkspace(slug, workspaceId) {
  if (!isStatementReportSlug(slug)) return false;
  if (slug === "customer-statement") {
    return workspaceId === "backoffice" || workspaceId === "accounting";
  }
  return workspaceId === "backoffice";
}

/** @param {string} slug */
export function reportAccessModules(slug) {
  if (slug === "customer-statement" || slug === "supplier-statement") {
    return ["customers_suppliers"];
  }
  if (isBackofficeFinanceReport(slug)) {
    return BACKOFFICE_FINANCE_REPORT_MODULES;
  }
  const primary = reportModuleForSlug(slug);
  return primary ? [primary] : [];
}

/** @param {string} slug @param {(key: string) => boolean} isModuleEnabled */
export function isReportModuleEnabled(slug, isModuleEnabled) {
  const modules = reportAccessModules(slug);
  if (!modules.length) return true;
  return modules.some((key) => isModuleEnabledForNav(key, isModuleEnabled));
}
