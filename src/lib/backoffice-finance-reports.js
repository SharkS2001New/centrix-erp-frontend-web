import { reportModuleForSlug } from "@/lib/module-registry";

/**
 * Operational finance reports available in the backoffice workspace when full
 * accounting is disabled. Same routes as the accounting workspace — nav only.
 */
export const BACKOFFICE_FINANCE_REPORT_SLUGS = [
  "profit-loss",
  "top-debtors",
  "ar-aging",
  "expenses",
  "invoice-payments",
  "kra-receipts",
];

/** Either sales or accounting reports module unlocks these slugs. */
export const BACKOFFICE_FINANCE_REPORT_MODULES = ["sales.reports", "accounting.reports"];

/** @param {string} slug */
export function isBackofficeFinanceReport(slug) {
  return BACKOFFICE_FINANCE_REPORT_SLUGS.includes(slug);
}

/** @param {string} slug */
export function reportAccessModules(slug) {
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
  return modules.some((key) => isModuleEnabled(key));
}
