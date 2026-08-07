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

function periodBasicFromMeta(meta, payroll) {
  const contractBasic = Number(
    payroll.contract_monthly_salary ?? meta.basic_salary ?? 0,
  );
  if (payroll.use_attendance_proration && Number(payroll.expected_work_days) > 0) {
    const daily = Number(payroll.daily_rate ?? 0);
    const paid = Number(payroll.paid_work_days ?? 0);
    if (daily > 0 && paid > 0) return Math.round(daily * paid * 100) / 100;
  }
  return Number(meta.basic_salary ?? contractBasic);
}

function advanceAmount(payroll) {
  const detail = payroll?.deductions_detail ?? [];
  return detail
    .filter((item) => item.type === "cash_advance")
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

function loanAbsentAmount(payroll, otherDeductions) {
  const detail = payroll?.deductions_detail ?? [];
  const nonAdvance = detail
    .filter((item) => item.type !== "cash_advance")
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  if (nonAdvance > 0) return nonAdvance;
  return Math.max(0, Number(otherDeductions ?? 0) - advanceAmount(payroll));
}

function primaryAccountNumber(line) {
  const accounts = line?.employee?.bank_accounts ?? line?.employee?.bankAccounts ?? [];
  if (!Array.isArray(accounts) || !accounts.length) return "";
  const primary = accounts.find((row) => row.is_primary) ?? accounts[0];
  return String(primary?.account_number ?? "").trim();
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

  return {
    no: index + 1,
    name,
    basic_salary: periodBasicFromMeta(meta, payroll),
    overtime: Number(payroll.overtime ?? 0),
    gross_salary: Number(line?.gross_pay ?? 0),
    advance: advanceAmount(payroll),
    nssf: Number(line?.nssf ?? 0),
    shif: Number(line?.shif ?? 0),
    housing: Number(line?.housing_levy ?? 0),
    paye: Number(line?.paye ?? 0),
    loan_absent: loanAbsentAmount(payroll, line?.other_deductions),
    total_ded: Number(line?.deductions ?? 0),
    net_pay: Number(line?.net_pay ?? 0),
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

/**
 * @param {object[]} lines
 * @param {(line: object) => string} [nameResolver]
 */
export function buildPayrollSheetRows(lines, nameResolver) {
  return (lines ?? []).map((line, index) =>
    payrollSheetDisplayRow(payrollSheetNumericRow(line, index, nameResolver)),
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
