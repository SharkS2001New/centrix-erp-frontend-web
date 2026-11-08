import { defaultDashboardDateRange } from "@/lib/dashboard-dates";
import { getReportsDefaultDateRange } from "@/lib/sales-settings";

/**
 * Offset-from-today helper (0 = today, 6 = last 7 inclusive days).
 * Prefer `getReportsDefaultDateRange(moduleSettings)` for org/platform defaults.
 */
export function defaultReportDateRange(days = 6) {
  return defaultDashboardDateRange(days);
}

/**
 * Branch filter default: branch-scoped users stay on their branch;
 * org-wide users see all branches unless they pick one.
 */
export function defaultReportBranchId(user, isOrgWide) {
  if (isOrgWide?.()) return "";
  return user?.branch_id ? String(user.branch_id) : "";
}

export function buildInitialReportFilters(user, isOrgWide, moduleSettings = null) {
  const { from, to } = getReportsDefaultDateRange(moduleSettings);
  const branchId = defaultReportBranchId(user, isOrgWide);
  return {
    fromDate: from,
    toDate: to,
    branchId,
    applied: { fromDate: from, toDate: to, branchId, extraFilters: {} },
  };
}
