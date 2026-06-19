/** HR report slugs registered in the API catalog under `hr`. */
export const HR_REPORT_DEFS = [
  { key: "leave-balance", label: "Leave balance", subtitle: "Employee leave balances by type" },
  { key: "payroll-summary", label: "Payroll summary", subtitle: "Payroll run totals and breakdown" },
  { key: "statutory-deductions", label: "Statutory deductions", subtitle: "PAYE, NSSF, NHIF and other statutory lines" },
  { key: "bank-transfer", label: "Bank transfer", subtitle: "Net pay due for bank disbursement" },
  { key: "staff-turnover", label: "Staff turnover", subtitle: "Joiners, leavers, and turnover rate" },
  { key: "headcount", label: "Headcount", subtitle: "Workforce headcount by department and status" },
  { key: "contract-expiry", label: "Contract expiry", subtitle: "Contracts nearing end date" },
  { key: "hr-dashboard-kpi", label: "HR dashboard KPIs", subtitle: "Key HR metrics at a glance" },
];

export const HR_REPORT_KEYS = HR_REPORT_DEFS.map((r) => r.key);

/** @param {string} key */
export function hrReportSubtitle(key) {
  return HR_REPORT_DEFS.find((r) => r.key === key)?.subtitle ?? null;
}
