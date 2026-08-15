import { describe, expect, it } from "vitest";
import {
  buildPayrollSheetExportFooter,
  buildPayrollSheetExportRows,
  buildPayrollSheetFooter,
  buildPayrollSheetRows,
  payrollSheetNumericRow,
} from "@/lib/payroll-sheet";

describe("payroll-sheet", () => {
  const sampleLine = {
    employee_id: 1,
    gross_pay: 8000,
    nssf: 480,
    shif: 300,
    housing_levy: 120,
    paye: 0,
    other_deductions: 500,
    deductions: 1400,
    net_pay: 6600,
    employee: {
      full_name: "Alexandria Quincy",
      bank_accounts: [{ is_primary: true, account_number: "1234567890" }],
    },
    statutory_meta: {
      basic_salary: 8000,
      payroll: {
        contract_monthly_salary: 8000,
        overtime: 0,
        deductions_detail: [
          { type: "cash_advance", amount: 300 },
          { type: "loan", name: "Staff loan", amount: 200 },
        ],
      },
    },
  };

  it("orders columns like the legacy payroll sheet", () => {
    const row = buildPayrollSheetRows([sampleLine], () => "Alexandria Quincy")[0];
    expect(row.name).toBe("Alexandria Quincy");
    expect(row.basic_salary).toContain("8,000");
    expect(row.shif).toContain("300");
    expect(row.advance).toContain("300");
    expect(row.loans).toContain("200");
    expect(row.account_number).toBe("1234567890");
  });

  it("totals numeric columns in the footer row", () => {
    const footer = buildPayrollSheetFooter([sampleLine, sampleLine], () => "Employee");
    expect(footer.name).toBe("Total");
    expect(footer.gross_salary).toContain("16,000");
    expect(footer.net_pay).toContain("13,200");
  });

  it("adds absent and lateness holds to loan/absent and keeps overtime on O/TIME", () => {
    const line = {
      ...sampleLine,
      other_deductions: 500,
      gross_pay: 9300,
      statutory_meta: {
        ...sampleLine.statutory_meta,
        payroll: {
          ...sampleLine.statutory_meta.payroll,
          contract_monthly_salary: 8000,
          overtime: 1300,
          absent_amount: 500,
          unpaid_leave_amount: 0,
          lateness_amount: 150,
          deductions_detail: [
            { type: "cash_advance", amount: 300 },
            { type: "employee_deduction", name: "Staff loan", amount: 200 },
          ],
        },
      },
    };
    const numeric = payrollSheetNumericRow(line, 0, () => "Alex");
    expect(numeric.overtime).toBe(1300);
    expect(numeric.gross_salary).toBe(9300);
    expect(numeric.advance).toBe(300);
    expect(numeric.loans).toBe(200);
    expect(numeric.absentism).toBe(650);
  });

  it("reconstructs loan/absent from attendance when amounts are missing", () => {
    const line = {
      ...sampleLine,
      other_deductions: 200,
      statutory_meta: {
        ...sampleLine.statutory_meta,
        payroll: {
          contract_monthly_salary: 8000,
          overtime: 0,
          daily_rate: 258.06,
          expected_hours: 176,
          deductions_detail: [{ type: "employee_deduction", name: "Staff loan", amount: 200 }],
          attendance: { absent_days: 2, unpaid_leave_days: 0, late_minutes_total: 60 },
        },
      },
    };
    const numeric = payrollSheetNumericRow(line, 0, () => "Alex");
    expect(numeric.loans).toBe(200);
    expect(numeric.absentism).toBe(Math.round((2 * 258.06 + 8000 * (1 / 176)) * 100) / 100);
    expect(numeric.overtime).toBe(0);
  });

  it("keeps basic salary as contract gross when attendance proration is on", () => {
    const line = {
      ...sampleLine,
      gross_pay: 3612.9,
      statutory_meta: {
        ...sampleLine.statutory_meta,
        basic_salary: 8000,
        period_gross: 3612.9,
        payroll: {
          ...sampleLine.statutory_meta.payroll,
          contract_monthly_salary: 8000,
          period_basic: 3612.9,
          use_attendance_proration: true,
          expected_work_days: 31,
          paid_work_days: 14,
          daily_rate: 258.06,
        },
      },
    };
    const numeric = payrollSheetNumericRow(line, 0, () => "Alex");
    expect(numeric.basic_salary).toBe(8000);
    expect(numeric.gross_salary).toBe(3612.9);
  });

  it("falls back to statutory_meta when gross_pay and net_pay are zero on the line", () => {
    const line = {
      ...sampleLine,
      gross_pay: 0,
      net_pay: 0,
      statutory_meta: {
        ...sampleLine.statutory_meta,
        period_gross: 8000,
        net_pay: 6600,
      },
    };
    const numeric = payrollSheetNumericRow(line, 0, () => "Alex");
    expect(numeric.gross_salary).toBe(8000);
    expect(numeric.net_pay).toBe(6600);
  });

  it("exports plain decimals and full account numbers for CSV", () => {
    const line = {
      ...sampleLine,
      employee: {
        ...sampleLine.employee,
        bank_accounts: [{ is_primary: true, account_number: "01234567890123456789" }],
      },
    };
    const row = buildPayrollSheetExportRows([line], () => "Alex")[0];
    expect(row.gross_salary).toBe("8000.00");
    expect(row.net_pay).toBe("6600.00");
    expect(row.basic_salary).toBe("8000.00");
    expect(row.account_number).toBe("01234567890123456789");
    const footer = buildPayrollSheetExportFooter([line], () => "Alex");
    expect(footer.gross_salary).toBe("8000.00");
    expect(footer.net_pay).toBe("6600.00");
  });
});
