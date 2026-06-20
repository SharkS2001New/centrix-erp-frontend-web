/** HR report slugs registered in the API catalog under `hr`. */
export const HR_REPORT_DEFS = [
  { key: "leave-balance", label: "Leave balance", subtitle: "Employee leave balances by type", icon: "clipboard" },
  { key: "payroll-summary", label: "Payroll summary", subtitle: "Payroll run totals and breakdown", icon: "receipt" },
  { key: "statutory-deductions", label: "Statutory deductions", subtitle: "PAYE, NSSF, NHIF and other statutory lines", icon: "percent" },
  { key: "bank-transfer", label: "Bank transfer", subtitle: "Net pay due for bank disbursement", icon: "wallet" },
  { key: "staff-turnover", label: "Staff turnover", subtitle: "Joiners, leavers, and turnover rate", icon: "swap" },
  { key: "headcount", label: "Headcount", subtitle: "Workforce headcount by department and status", icon: "hr" },
  { key: "contract-expiry", label: "Contract expiry", subtitle: "Contracts nearing end date", icon: "alert" },
  {
    key: "hr-dashboard-kpi",
    label: "Workforce summary",
    subtitle: "Organization-wide headcount, payroll, and contracts",
    icon: "dashboard",
  },
];

export const HR_REPORT_KEYS = HR_REPORT_DEFS.map((r) => r.key);

/** @param {string} key */
export function hrReportSubtitle(key) {
  return HR_REPORT_DEFS.find((r) => r.key === key)?.subtitle ?? null;
}
