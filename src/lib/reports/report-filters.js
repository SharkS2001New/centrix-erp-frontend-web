import { defaultDashboardDateRange } from "@/lib/dashboard-dates";

/** Default date window for tabular reports — matches the sales dashboard. */
export function defaultReportDateRange(days = 29) {
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

export function buildInitialReportFilters(user, isOrgWide) {
  const { from, to } = defaultReportDateRange();
  const branchId = defaultReportBranchId(user, isOrgWide);
  return {
    fromDate: from,
    toDate: to,
    branchId,
    applied: { fromDate: from, toDate: to, branchId, extraFilters: {} },
  };
}
