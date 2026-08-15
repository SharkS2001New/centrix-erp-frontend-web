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
  { key: "absentism", label: "Absentism", align: "right" },
  { key: "damages", label: "Damages", align: "right" },
  { key: "loans", label: "Loans", align: "right" },
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

function loansAmount(payroll) {
  const detail = payroll?.deductions_detail ?? [];
  return detail
    .filter((item) => {
      const t = String(item.type ?? "").toLowerCase();
      return t === "loan" || t === "employee_deduction" || t === "staff_loan";
    })
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

function damagesAmount(payroll) {
  const detail = payroll?.deductions_detail ?? [];
  return detail
    .filter((item) => {
      const t = String(item.type ?? "").toLowerCase();
      return t === "damage" || t === "damages" || t === "write_off" || t === "damage_write_off";
    })
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
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
  const payroll = meta?.payroll ?? {};
  const contractBasic = Number(payroll.contract_monthly_salary ?? meta?.basic_salary ?? 0);
  const overtime = Number(payroll.overtime ?? line?.overtime ?? 0);
  const periodBasic = Number(payroll.period_basic ?? 0);
  const fromLine = coalesceAmount(line?.gross_pay, meta?.period_gross, meta?.gross_pay);

  const baseSalary = contractBasic > 0 ? contractBasic : periodBasic > 0 ? periodBasic : 0;
  const computedGross = baseSalary + overtime;
  if (computedGross > 0) return Math.round(computedGross * 100) / 100;
  return fromLine > 0 ? fromLine : 0;
}

function lineNetPay(line, meta, grossPay) {
  const direct = coalesceAmount(line?.net_pay, meta?.net_pay);
  const payroll = meta?.payroll ?? {};
  const advance = advanceAmount(payroll);
  const nssf = Number(line?.nssf ?? 0);
  const shif = Number(line?.employee && (line.employee.pays_sha === false || line.employee.pays_sha === 0) ? 0 : (line?.shif ?? 0));
  const housing = Number(line?.housing_levy ?? 0);
  const paye = Number(line?.paye ?? 0);
  const loans = loansAmount(payroll);
  const absentism = attendanceHoldAmount(payroll);
  const damages = damagesAmount(payroll);
  const total = Math.round((advance + nssf + shif + housing + paye + loans + absentism + damages) * 100) / 100;

  if (grossPay > 0 && total >= 0) {
    return Math.max(0, Math.round((grossPay - total) * 100) / 100);
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

  const computedTotal = Math.round((advanceAmount(payroll) + Number(line?.nssf ?? 0) + ((line?.employee && (line.employee.pays_sha === false || line.employee.pays_sha === 0)) ? 0 : Number(line?.shif ?? 0)) + Number(line?.housing_levy ?? 0) + Number(line?.paye ?? 0) + loansAmount(payroll) + attendanceHoldAmount(payroll) + damagesAmount(payroll)) * 100) / 100;

  return {
    no: index + 1,
    name,
    basic_salary: contractBasicFromMeta(meta, payroll),
    overtime: Number(payroll.overtime ?? 0),
    gross_salary: grossPay,
    advance: advanceAmount(payroll),
    nssf: Number(line?.nssf ?? 0),
    // SHA (shif) may be employee-specific; front-end display respects an employee flag if present.
    shif: (line?.employee && (line.employee.pays_sha === false || line.employee.pays_sha === 0))
      ? 0
      : Number(line?.shif ?? 0),
    housing: Number(line?.housing_levy ?? 0),
    paye: Number(line?.paye ?? 0),
    absentism: attendanceHoldAmount(payroll),
    damages: damagesAmount(payroll),
    loans: loansAmount(payroll),
    total_ded: computedTotal,
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
    absentism: numeric.absentism > 0 ? formatHrKesFull(numeric.absentism) : "",
    damages: numeric.damages > 0 ? formatHrKesFull(numeric.damages) : "",
    loans: numeric.loans > 0 ? formatHrKesFull(numeric.loans) : "",
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
    absentism: numeric.absentism > 0 ? formatPayrollSheetExportAmount(numeric.absentism) : "",
    damages: numeric.damages > 0 ? formatPayrollSheetExportAmount(numeric.damages) : "",
    loans: numeric.loans > 0 ? formatPayrollSheetExportAmount(numeric.loans) : "",
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
