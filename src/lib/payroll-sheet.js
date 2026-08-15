import { formatHrKesFull } from "@/components/hr/hr-shared";

/** Legacy payroll sheet column order (Moonlight-style). */
export const PAYROLL_SHEET_COLUMNS = [
  { key: "no", label: "No", align: "left" },
  { key: "name", label: "Name", align: "left" },
  { key: "basic_salary", label: "Basic salary", align: "right" },
  { key: "overtime", label: "O/TIME", align: "right" },
  { key: "gross_salary", label: "Gross salary", align: "right" },
  { key: "advance", label: "Advance", align: "right" },
  { key: "nssf", label: "Nssf", align: "right" },
  { key: "shif", label: "Sha", align: "right" },
  { key: "housing", label: "Housing", align: "right" },
  { key: "paye", label: "Paye", align: "right" },
  { key: "loan_absent", label: "Loan/ABSENT", align: "right" },
  { key: "total_ded", label: "Total ded", align: "right" },
  { key: "net_pay", label: "Net pay", align: "right" },
  { key: "account_number", label: "Acc no", align: "left" },
];

const NUMERIC_KEYS = PAYROLL_SHEET_COLUMNS.filter((col) => col.align === "right").map((col) => col.key);

function contractBasicFromMeta(meta, payroll) {
  return Number(payroll.contract_monthly_salary ?? meta.basic_salary ?? 0);
}

function advanceAmount(payroll) {
  const detail = payroll?.deductions_detail ?? [];
  return detail
    .filter((item) => item.type === "cash_advance")
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

function loanDeductionsAmount(payroll, otherDeductions) {
  const detail = payroll?.deductions_detail ?? [];
  const nonAdvance = detail
    .filter((item) => item.type !== "cash_advance")
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  if (nonAdvance > 0) return nonAdvance;
  return Math.max(0, Number(otherDeductions ?? 0) - advanceAmount(payroll));
}

function attendanceHoldAmount(payroll) {
  const absent = Number(payroll?.absent_amount ?? 0);
  const unpaid = Number(payroll?.unpaid_leave_amount ?? 0);
  const lateness = Number(payroll?.lateness_amount ?? 0);
  if (payroll?.absent_amount != null || payroll?.lateness_amount != null || payroll?.unpaid_leave_amount != null) {
    return Math.round((absent + unpaid + lateness) * 100) / 100;
  }
  if (Number(payroll?.attendance_deduction ?? 0) > 0) {
    return Math.round(Number(payroll.attendance_deduction) * 100) / 100;
  }

  const attendance = payroll?.attendance ?? {};
  const daily = Number(payroll?.daily_rate ?? 0);
  const contract = Number(payroll?.contract_monthly_salary ?? 0);
  const absentDays =
    Number(attendance.absent_days ?? payroll?.absent_days ?? 0) +
    Number(attendance.unpaid_leave_days ?? payroll?.unpaid_leave_days ?? 0);
  const lateMinutes = Number(
    attendance.late_minutes_total ?? payroll?.late_minutes_total ?? 0,
  );
  const expectedHours = Number(payroll?.expected_hours ?? attendance.expected_hours ?? 0);
  const fromDays = daily > 0 ? absentDays * daily : 0;
  const fromLate =
    lateMinutes > 0 && expectedHours > 0 && contract > 0
      ? contract * (lateMinutes / 60 / expectedHours)
      : 0;
  return Math.round((fromDays + fromLate) * 100) / 100;
}

/** Loans / other non-advance deductions plus absent and lateness holds. Overtime is not deducted here. */
function loanAbsentAmount(payroll, otherDeductions) {
  return Math.round((loanDeductionsAmount(payroll, otherDeductions) + attendanceHoldAmount(payroll)) * 100) / 100;
}

function primaryAccountNumber(line) {
  const accounts = line?.employee?.bank_accounts ?? line?.employee?.bankAccounts ?? [];
  if (!Array.isArray(accounts) || !accounts.length) return "";
  const primary = accounts.find((row) => row.is_primary) ?? accounts[0];
  return String(primary?.account_number ?? "").trim();
}

function coalesceAmount(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const amount = Number(value);
    if (Number.isFinite(amount)) return amount;
  }
  return 0;
}

function lineGrossPay(line, meta) {
  const fromLine = coalesceAmount(line?.gross_pay, meta?.period_gross, meta?.gross_pay);
  if (fromLine > 0) return fromLine;

  const payroll = meta?.payroll ?? {};
  const periodBasic = Number(payroll.period_basic ?? 0);
  const overtime = Number(payroll.overtime ?? 0);
  const reconstructed =
    (periodBasic > 0 ? periodBasic : contractBasicFromMeta(meta, payroll)) + overtime;
  return reconstructed > 0 ? reconstructed : fromLine;
}

function lineNetPay(line, meta, grossPay) {
  const direct = coalesceAmount(line?.net_pay, meta?.net_pay);
  if (direct > 0) return direct;

  const deductions = Number(line?.deductions ?? 0);
  if (grossPay > 0 && deductions > 0) {
    return Math.max(0, Math.round((grossPay - deductions) * 100) / 100);
  }

  return direct;
}

/** Plain decimal string for CSV/Excel (no currency symbol or thousands separators). */
export function formatPayrollSheetExportAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  if (amount === 0) return "0.00";
  return amount.toFixed(2);
}

/** Full account number for export — never coerce to a number. */
export function formatPayrollSheetExportAccount(value) {
  return String(value ?? "").trim();
}

/**
 * @param {object} line
 * @param {number} index
 * @param {(line: object) => string} [nameResolver]
 */
export function payrollSheetNumericRow(line, index, nameResolver) {
  const meta = line?.statutory_meta ?? {};
  const payroll = meta.payroll ?? {};
  const name =
    typeof nameResolver === "function"
      ? nameResolver(line)
      : line?.employee?.full_name ?? `#${line?.employee_id ?? ""}`;

  const grossPay = lineGrossPay(line, meta);
  const netPay = lineNetPay(line, meta, grossPay);

  return {
    no: index + 1,
    name,
    basic_salary: contractBasicFromMeta(meta, payroll),
    overtime: Number(payroll.overtime ?? 0),
    gross_salary: grossPay,
    advance: advanceAmount(payroll),
    nssf: Number(line?.nssf ?? 0),
    shif: Number(line?.shif ?? 0),
    housing: Number(line?.housing_levy ?? 0),
    paye: Number(line?.paye ?? 0),
    loan_absent: loanAbsentAmount(payroll, line?.other_deductions),
    total_ded: Number(line?.deductions ?? 0),
    net_pay: netPay,
    account_number: primaryAccountNumber(line),
  };
}

/** @param {object} numeric */
export function payrollSheetDisplayRow(numeric) {
  return {
    no: String(numeric.no ?? ""),
    name: numeric.name ?? "",
    basic_salary: formatHrKesFull(numeric.basic_salary),
    overtime: numeric.overtime > 0 ? formatHrKesFull(numeric.overtime) : "",
    gross_salary: formatHrKesFull(numeric.gross_salary),
    advance: numeric.advance > 0 ? formatHrKesFull(numeric.advance) : "",
    nssf: formatHrKesFull(numeric.nssf),
    shif: formatHrKesFull(numeric.shif),
    housing: formatHrKesFull(numeric.housing),
    paye: formatHrKesFull(numeric.paye),
    loan_absent: numeric.loan_absent > 0 ? formatHrKesFull(numeric.loan_absent) : "",
    total_ded: formatHrKesFull(numeric.total_ded),
    net_pay: formatHrKesFull(numeric.net_pay),
    account_number: numeric.account_number || "—",
  };
}

/** @param {object} numeric */
export function payrollSheetExportRow(numeric) {
  return {
    no: String(numeric.no ?? ""),
    name: numeric.name ?? "",
    basic_salary: formatPayrollSheetExportAmount(numeric.basic_salary),
    overtime: numeric.overtime > 0 ? formatPayrollSheetExportAmount(numeric.overtime) : "",
    gross_salary: formatPayrollSheetExportAmount(numeric.gross_salary),
    advance: numeric.advance > 0 ? formatPayrollSheetExportAmount(numeric.advance) : "",
    nssf: formatPayrollSheetExportAmount(numeric.nssf),
    shif: formatPayrollSheetExportAmount(numeric.shif),
    housing: formatPayrollSheetExportAmount(numeric.housing),
    paye: formatPayrollSheetExportAmount(numeric.paye),
    loan_absent: numeric.loan_absent > 0 ? formatPayrollSheetExportAmount(numeric.loan_absent) : "",
    total_ded: formatPayrollSheetExportAmount(numeric.total_ded),
    net_pay: formatPayrollSheetExportAmount(numeric.net_pay),
    account_number: formatPayrollSheetExportAccount(numeric.account_number),
  };
}

/**
 * @param {object[]} lines
 * @param {(line: object) => string} [nameResolver]
 */
export function buildPayrollSheetRows(lines, nameResolver) {
  return (lines ?? []).map((line, index) =>
    payrollSheetDisplayRow(payrollSheetNumericRow(line, index, nameResolver)),
  );
}

/**
 * CSV-friendly rows: plain decimals (Excel-safe) and full account numbers as text.
 * @param {object[]} lines
 * @param {(line: object) => string} [nameResolver]
 */
export function buildPayrollSheetExportRows(lines, nameResolver) {
  return (lines ?? []).map((line, index) =>
    payrollSheetExportRow(payrollSheetNumericRow(line, index, nameResolver)),
  );
}

/** @param {object[]} lines @param {(line: object) => string} [nameResolver] */
export function buildPayrollSheetFooter(lines, nameResolver) {
  const totals = Object.fromEntries(NUMERIC_KEYS.map((key) => [key, 0]));
  for (let i = 0; i < (lines ?? []).length; i += 1) {
    const numeric = payrollSheetNumericRow(lines[i], i, nameResolver);
    for (const key of NUMERIC_KEYS) {
      totals[key] += Number(numeric[key] ?? 0);
    }
  }
  return payrollSheetDisplayRow({
    no: "",
    name: "Total",
    ...totals,
    account_number: "",
  });
}

/** @param {object[]} lines @param {(line: object) => string} [nameResolver] */
export function buildPayrollSheetExportFooter(lines, nameResolver) {
  const totals = Object.fromEntries(NUMERIC_KEYS.map((key) => [key, 0]));
  for (let i = 0; i < (lines ?? []).length; i += 1) {
    const numeric = payrollSheetNumericRow(lines[i], i, nameResolver);
    for (const key of NUMERIC_KEYS) {
      totals[key] += Number(numeric[key] ?? 0);
    }
  }
  return payrollSheetExportRow({
    no: "",
    name: "Total",
    ...totals,
    account_number: "",
  });
}
