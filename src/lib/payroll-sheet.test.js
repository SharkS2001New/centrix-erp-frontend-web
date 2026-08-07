import { describe, expect, it } from "vitest";
import {
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
    expect(row.loan_absent).toContain("200");
    expect(row.account_number).toBe("1234567890");
  });

  it("totals numeric columns in the footer row", () => {
    const footer = buildPayrollSheetFooter([sampleLine, sampleLine], () => "Employee");
    expect(footer.name).toBe("Total");
    expect(footer.gross_salary).toContain("16,000");
    expect(footer.net_pay).toContain("13,200");
  });

  it("splits advance from loan/absent deductions", () => {
    const numeric = payrollSheetNumericRow(sampleLine, 0, () => "Alex");
    expect(numeric.advance).toBe(300);
    expect(numeric.loan_absent).toBe(200);
  });
});
