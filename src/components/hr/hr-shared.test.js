import { describe, it, expect } from "vitest";
import {
  buildEmployeeBody,
  buildPayrollAttendanceNote,
  classifyTodayAttendanceSessions,
  employeeToForm,
  EMPTY_EMPLOYEE_FORM,
  payableAmountDaysHint,
  payrollBreakdownSections,
} from "@/components/hr/hr-shared";

describe("classifyTodayAttendanceSessions", () => {
  it("maps a 17:02 home punch to clock out, not lunch, even with a duplicate morning open", () => {
    const punches = classifyTodayAttendanceSessions(
      [
        {
          clock_in_at: "2026-09-02T08:04:00+03:00",
          clock_out_at: "2026-09-02T17:02:00+03:00",
        },
        {
          clock_in_at: "2026-09-02T08:04:20+03:00",
          clock_out_at: null,
        },
      ],
      { lunchRequired: true, shiftEndMinutes: 17 * 60 },
    );

    expect(punches.clockIn).toBe("2026-09-02T08:04:00+03:00");
    expect(punches.lunchOut).toBeNull();
    expect(punches.lunchIn).toBeNull();
    expect(punches.clockOut).toBe("2026-09-02T17:02:00+03:00");
    expect(punches.status).toBe("clocked_out");
  });

  it("still maps a real lunch break across two sessions", () => {
    const punches = classifyTodayAttendanceSessions(
      [
        {
          clock_in_at: "2026-09-02T08:05:00+03:00",
          clock_out_at: "2026-09-02T13:02:00+03:00",
        },
        {
          clock_in_at: "2026-09-02T14:01:00+03:00",
          clock_out_at: "2026-09-02T17:10:00+03:00",
        },
      ],
      { lunchRequired: true, shiftEndMinutes: 17 * 60 },
    );

    expect(punches.lunchOut).toBe("2026-09-02T13:02:00+03:00");
    expect(punches.lunchIn).toBe("2026-09-02T14:01:00+03:00");
    expect(punches.clockOut).toBe("2026-09-02T17:10:00+03:00");
    expect(punches.status).toBe("clocked_out");
  });
});

describe("hr-shared pays_sha", () => {
  it("includes pays_sha in API body when true", () => {
    const form = { ...EMPTY_EMPLOYEE_FORM, pays_sha: true, base_salary: "1000", sha_number: "S123", housing_levy_number: "H1", nssf_number: "N1", first_name: "A", last_name: "B", phone: "0712345678" };
    const body = buildEmployeeBody(form, 10, 2, { isEdit: false });
    expect(body.pays_sha).toBe(true);
  });

  it("includes pays_sha false in API body when unchecked", () => {
    const form = { ...EMPTY_EMPLOYEE_FORM, pays_sha: false, base_salary: "1000", sha_number: "", housing_levy_number: "H1", nssf_number: "N1", first_name: "A", last_name: "B", phone: "0712345678" };
    const body = buildEmployeeBody(form, 10, 2, { isEdit: false });
    expect(body.pays_sha).toBe(false);
  });

  it("employeeToForm sets pays_sha default true when missing", () => {
    const employee = { first_name: "A", last_name: "B" };
    const form = employeeToForm(employee);
    expect(form.pays_sha).toBe(true);
  });

  it("employeeToForm preserves pays_sha when provided", () => {
    const employee = { first_name: "A", last_name: "B", pays_sha: false };
    const form = employeeToForm(employee);
    expect(form.pays_sha).toBe(false);
  });
});

describe("payroll attendance breakdown copy", () => {
  const payroll = {
    use_attendance_proration: true,
    paid_work_days: 26,
    expected_work_days: 30,
    scheduled_work_days: 26,
    late_minutes_total: 312,
    attendance: {
      paid_days: 26,
      expected_days: 30,
      scheduled_work_days: 26,
      rest_days_off: 5,
      absent_days: 4,
      clock_in_late_minutes_total: 312,
      late_minutes_total: 312,
    },
  };

  it("shows fixed-30 payable days (Sundays included) and only workday absents", () => {
    const sections = payrollBreakdownSections(
      {
        gross_pay: 50000,
        statutory_meta: { payroll },
      },
      null,
    );
    // 30 − 4 absents = 26 payable days on the month basis
    expect(sections.earnings[1].label).toBe("Payable amount (26 of 30 payable days)");
    expect(buildPayrollAttendanceNote(payroll)).toBe(
      "26 of 30 payable days · 4 absent days deducted · 312 min late clock-in · 312 min late overall",
    );
  });

  it("shows 30 of 30 when all workdays are present (Sundays credited, no rest-day offs listed)", () => {
    const perfect = {
      use_attendance_proration: true,
      paid_work_days: 26,
      expected_work_days: 30,
      scheduled_work_days: 26,
      attendance: {
        paid_days: 26,
        expected_days: 30,
        scheduled_work_days: 26,
        rest_days_off: 5,
        absent_days: 0,
      },
    };
    expect(payableAmountDaysHint(perfect)).toBe("30 of 30 payable days");
    expect(buildPayrollAttendanceNote(perfect)).toBeNull();
  });

  it("lists requested offs on workdays, not weekly rest", () => {
    const withRequestedOff = {
      use_attendance_proration: true,
      paid_work_days: 25,
      expected_work_days: 30,
      scheduled_work_days: 26,
      attendance: {
        paid_days: 25,
        expected_days: 30,
        scheduled_work_days: 26,
        rest_days_off: 5,
        absent_days: 0,
        unpaid_leave_days: 1,
        deductible_off_days: 1,
        non_deductible_off_days: 0,
      },
    };
    expect(payableAmountDaysHint(withRequestedOff)).toBe("29 of 30 payable days");
    expect(buildPayrollAttendanceNote(withRequestedOff)).toBe(
      "29 of 30 payable days · 1 unpaid / requested off",
    );
  });

  it("shows unpaid hourly leave in hours on the payroll note", () => {
    const hourlyUnpaid = {
      use_attendance_proration: true,
      paid_work_days: 21.88,
      expected_work_days: 22,
      scheduled_work_days: 22,
      unpaid_leave_days: 0.13,
      unpaid_leave_hours: 1,
      attendance: {
        paid_days: 21.88,
        expected_days: 22,
        scheduled_work_days: 22,
        absent_days: 0,
        unpaid_leave_days: 0.13,
        unpaid_leave_hours: 1,
      },
    };
    expect(buildPayrollAttendanceNote(hourlyUnpaid)).toBe(
      "21.88 of 22 payable days · 0.13 unpaid leave (1 h)",
    );
  });

  it("uses compact copy on payslip receipts only", () => {
    expect(payableAmountDaysHint(payroll, { forReceipt: true })).toBe("26 workdays");
    expect(buildPayrollAttendanceNote(payroll, { forReceipt: true })).toBe(
      "26 Payable workdays · 4 absent days deducted · 312 min late clock-in · 312 min late overall",
    );
    const sections = payrollBreakdownSections(
      {
        gross_pay: 50000,
        statutory_meta: { payroll },
      },
      null,
      { forReceipt: true },
    );
    expect(sections.earnings[1].label).toBe("Payable amount (26 workdays)");
  });
});
