import { defaultDashboardDateRange } from "@/lib/dashboard-dates";
import { getReportsDefaultDateRange } from "@/lib/sales-settings";
import { selectedGlobalBranchId } from "@/lib/global-branch";

/**
 * Offset-from-today helper (0 = today, 6 = last 7 inclusive days).
 * Prefer `getReportsDefaultDateRange(moduleSettings)` for org/platform defaults.
 */
export function defaultReportDateRange(days = 6) {
  return defaultDashboardDateRange(days);
}

/**
 * The global branch takes precedence; otherwise branch-scoped users stay on
 * their branch and org-wide users see all branches.
 */
export function defaultReportBranchId(
  user,
  isOrgWide,
  globalBranchId = selectedGlobalBranchId(),
) {
  if (globalBranchId) return globalBranchId;
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
