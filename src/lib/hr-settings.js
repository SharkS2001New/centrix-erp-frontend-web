export const HR_PAYROLL_DEFAULTS = {
  pay_frequency: "monthly",
  grace_days_after_month_end: 7,
  payroll_run_delete_lock_minutes: 20,
  auto_calculate_statutory: true,
  close_cycle_on_process: true,
  include_overtime_in_payroll: true,
  include_other_deductions_in_payroll: true,
  require_payroll_approval: false,
  require_attendance_for_payroll: false,
  standard_work_hours_per_day: 8,
  overtime_rate_multiplier: 1.5,
  default_probation_months: 3,
  enable_cash_advance_deductions: true,
  deduct_cash_advances_on_payroll: true,
  attendance_capture_mode: "clock_device",
  company_premises_latitude: null,
  company_premises_longitude: null,
  company_premises_radius_metres: 5,
  company_face_match_threshold: 0.72,
  company_fingerprint_match_threshold: 0.85,
  company_mobile_verification_method: "face_or_fingerprint",
};

export function mergeHrPayrollSettings(moduleSettings) {
  return { ...HR_PAYROLL_DEFAULTS, ...(moduleSettings?.hr_payroll ?? {}) };
}

export function isCashAdvanceDeductionsEnabled(moduleSettings) {
  return Boolean(mergeHrPayrollSettings(moduleSettings).enable_cash_advance_deductions);
}

/** Defaults for the payroll generate drawer — aligned with org HR settings. */
export function payrollRunFormDefaults(moduleSettings) {
  const hr = mergeHrPayrollSettings(moduleSettings);
  return {
    include_allowances: true,
    use_attendance_proration: hr.require_attendance_for_payroll,
    include_overtime: hr.include_overtime_in_payroll,
    include_employee_deductions: hr.include_other_deductions_in_payroll,
  };
}

export function payrollGraceDays(moduleSettings, schedule) {
  const fromSchedule = schedule?.grace_days_after_month_end;
  if (fromSchedule != null && Number.isFinite(Number(fromSchedule))) {
    return Number(fromSchedule);
  }
  return mergeHrPayrollSettings(moduleSettings).grace_days_after_month_end;
}

export function isCompanyMobileAttendanceEnabled(moduleSettings) {
  return mergeHrPayrollSettings(moduleSettings).attendance_capture_mode === "company_mobile";
}

export function isClockDeviceAttendanceEnabled(moduleSettings) {
  return mergeHrPayrollSettings(moduleSettings).attendance_capture_mode !== "company_mobile";
}

export function formatAttendanceSource(source) {
  if (source === "company_mobile") return "Company mobile";
  if (source === "clock_device") return "Clock device";
  if (source === "manual") return "Manual";
  return source ? String(source).replace(/_/g, " ") : "—";
}

export function hrPayrollFormFromApi(res) {
  const hr = mergeHrPayrollSettings({ hr_payroll: res?.hr_payroll ?? res });
  return {
    pay_frequency: hr.pay_frequency || "monthly",
    grace_days_after_month_end: String(hr.grace_days_after_month_end ?? 7),
    payroll_run_delete_lock_minutes: String(hr.payroll_run_delete_lock_minutes ?? 20),
    auto_calculate_statutory: Boolean(hr.auto_calculate_statutory),
    close_cycle_on_process: Boolean(hr.close_cycle_on_process),
    include_overtime_in_payroll: Boolean(hr.include_overtime_in_payroll),
    include_other_deductions_in_payroll: Boolean(hr.include_other_deductions_in_payroll),
    require_payroll_approval: Boolean(hr.require_payroll_approval),
    require_attendance_for_payroll: Boolean(hr.require_attendance_for_payroll),
    standard_work_hours_per_day: String(hr.standard_work_hours_per_day ?? 8),
    overtime_rate_multiplier: String(hr.overtime_rate_multiplier ?? 1.5),
    default_probation_months: String(hr.default_probation_months ?? 3),
    enable_cash_advance_deductions: Boolean(hr.enable_cash_advance_deductions),
    deduct_cash_advances_on_payroll: Boolean(hr.deduct_cash_advances_on_payroll),
    attendance_capture_mode: hr.attendance_capture_mode || "clock_device",
    company_premises_radius_metres: String(hr.company_premises_radius_metres ?? 5),
    company_face_match_threshold: String(hr.company_face_match_threshold ?? 0.72),
    company_fingerprint_match_threshold: String(hr.company_fingerprint_match_threshold ?? 0.85),
    company_mobile_verification_method:
      hr.company_mobile_verification_method === "device_biometric"
        ? "fingerprint"
        : hr.company_mobile_verification_method === "face_or_device_biometric"
          ? "face_or_fingerprint"
          : hr.company_mobile_verification_method || "face_or_fingerprint",
  };
}

export function hrPayrollPayloadFromForm(form) {
  return {
    pay_frequency: form.pay_frequency || "monthly",
    grace_days_after_month_end: Number(form.grace_days_after_month_end) || 7,
    payroll_run_delete_lock_minutes: Number(form.payroll_run_delete_lock_minutes) || 20,
    auto_calculate_statutory: Boolean(form.auto_calculate_statutory),
    close_cycle_on_process: Boolean(form.close_cycle_on_process),
    include_overtime_in_payroll: Boolean(form.include_overtime_in_payroll),
    include_other_deductions_in_payroll: Boolean(form.include_other_deductions_in_payroll),
    require_payroll_approval: Boolean(form.require_payroll_approval),
    require_attendance_for_payroll: Boolean(form.require_attendance_for_payroll),
    standard_work_hours_per_day: Number(form.standard_work_hours_per_day) || 8,
    overtime_rate_multiplier: Number(form.overtime_rate_multiplier) || 1.5,
    default_probation_months: Number(form.default_probation_months) || 0,
    enable_cash_advance_deductions: Boolean(form.enable_cash_advance_deductions),
    deduct_cash_advances_on_payroll: Boolean(form.deduct_cash_advances_on_payroll),
    attendance_capture_mode: form.attendance_capture_mode || "clock_device",
    company_premises_radius_metres: Number(form.company_premises_radius_metres) || 5,
    company_face_match_threshold: Number(form.company_face_match_threshold) || 0.72,
    company_fingerprint_match_threshold: Number(form.company_fingerprint_match_threshold) || 0.85,
    company_mobile_verification_method:
      form.company_mobile_verification_method || "face_or_fingerprint",
  };
}
