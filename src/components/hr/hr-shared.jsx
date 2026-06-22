"use client";

import { formatOrgCurrency, formatOrgCurrencyCompact, formatOrgDate } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";

export const LOCKED_COUNTRY = "Kenya";
export const LOCKED_NATIONALITY = "Kenyan";

export function isAdminUser(user) {
  return user?.is_admin === true || user?.is_admin === 1;
}

export const PAYMENT_METHOD_OPTIONS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
];

export const KENYA_BANKS = [
  "KCB Bank",
  "Equity Bank",
  "Co-operative Bank",
  "ABSA Bank Kenya",
  "Stanbic Bank",
  "NCBA Bank",
  "DTB Kenya",
  "I&M Bank",
  "Standard Chartered",
  "Family Bank",
  "Prime Bank",
  "Bank of Africa",
  "Citibank Kenya",
  "HF Group",
  "Kingdom Bank",
  "Other",
];

let paymentKeyCounter = 0;

export function newPaymentAccountKey() {
  paymentKeyCounter += 1;
  return `pay-${Date.now()}-${paymentKeyCounter}`;
}

export function createEmptyPaymentAccount({ isPrimary = false, paymentMethod = "bank_transfer" } = {}) {
  return {
    id: null,
    _key: newPaymentAccountKey(),
    payment_method: paymentMethod,
    bank_name: "",
    bank_branch: "",
    account_number: "",
    account_name: "",
    is_primary: isPrimary,
  };
}

export function defaultPaymentAccountsForNewEmployee(employmentType = "permanent") {
  const method = employmentType === "casual" ? "mpesa" : "bank_transfer";
  return [createEmptyPaymentAccount({ isPrimary: true, paymentMethod: method })];
}

export const EMPTY_EMPLOYEE_FORM = {
  first_name: "",
  middle_name: "",
  last_name: "",
  photo_url: "",
  gender: "",
  date_of_birth: "",
  national_id: "",
  id_document_type: "national_id",
  marital_status: "",
  personal_email: "",
  email: "",
  phone: "",
  alt_phone: "",
  physical_address: "",
  postal_address: "",
  city: "",
  county: "",
  branch_id: "",
  department_id: "",
  position_id: "",
  shift_id: "",
  user_id: "",
  reports_to_employee_id: "",
  job_title: "",
  employment_status: "active",
  employment_type: "permanent",
  hire_date: "",
  confirmation_date: "",
  probation_end_date: "",
  contract_start_date: "",
  contract_end_date: "",
  notice_period_days: "",
  pay_frequency: "monthly",
  base_salary: "",
  monthly_allowance: "",
  kra_pin: "",
  nssf_number: "",
  sha_number: "",
  housing_levy_number: "",
  is_active: true,
  payment_accounts: defaultPaymentAccountsForNewEmployee(),
  emergency_contacts: [createEmptyEmergencyContact({ isPrimary: true })],
  next_of_kin: createEmptyNextOfKin(),
};

export function createEmptyEmergencyContact({ isPrimary = false } = {}) {
  return {
    id: null,
    _key: newPaymentAccountKey(),
    full_name: "",
    relationship: "",
    phone: "",
    email: "",
    address: "",
    is_primary: isPrimary,
  };
}

export function createEmptyNextOfKin() {
  return {
    full_name: "",
    relationship: "",
    national_id: "",
    phone: "",
    address: "",
  };
}

export function emergencyContactsToForm(contacts = []) {
  const list = Array.isArray(contacts) ? contacts : [];
  if (list.length === 0) {
    return [createEmptyEmergencyContact({ isPrimary: true })];
  }
  const mapped = list.map((c) => ({
    id: c.id ?? null,
    _key: String(c.id ?? newPaymentAccountKey()),
    full_name: c.full_name ?? "",
    relationship: c.relationship ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    is_primary: !!c.is_primary,
  }));
  if (!mapped.some((c) => c.is_primary)) {
    mapped[0] = { ...mapped[0], is_primary: true };
  }
  return mapped;
}

export function nextOfKinToForm(nextOfKin) {
  if (!nextOfKin?.full_name && !nextOfKin?.phone) {
    return createEmptyNextOfKin();
  }
  return {
    full_name: nextOfKin.full_name ?? "",
    relationship: nextOfKin.relationship ?? "",
    national_id: nextOfKin.national_id ?? "",
    phone: nextOfKin.phone ?? "",
    address: nextOfKin.address ?? "",
  };
}

export function employeeBankAccounts(employee) {
  return employee?.bank_accounts ?? employee?.bankAccounts ?? [];
}

export function paymentAccountsToForm(bankAccounts = [], employmentType = "permanent") {
  const list = bankAccounts.length ? bankAccounts : defaultPaymentAccountsForNewEmployee(employmentType);
  const mapped = list.map((b) => ({
    id: b.id ?? null,
    _key: String(b.id ?? newPaymentAccountKey()),
    payment_method: b.payment_method ?? "bank_transfer",
    bank_name:
      ["M-Pesa", "Cash", "Cheque"].includes(b.bank_name) ? "" : (b.bank_name ?? ""),
    bank_branch: b.bank_branch ?? "",
    account_number: b.account_number === "N/A" ? "" : (b.account_number ?? ""),
    account_name: b.account_name ?? "",
    is_primary: !!b.is_primary,
  }));
  if (mapped.length > 0 && !mapped.some((a) => a.is_primary)) {
    mapped[0] = { ...mapped[0], is_primary: true };
  }
  return mapped;
}

export function paymentMethodLabel(method) {
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? method ?? "—";
}

/** Expected paid hours for one scheduled day from shift start/end (matches API leave calculator). */
export function shiftExpectedHoursPerDay(shift) {
  if (!shift) return null;
  const start = shift.start_time;
  const end = shift.end_time;
  if (!start || !end) return 8;

  const toSeconds = (time) => {
    const parts = String(time).slice(0, 8).split(":");
    const h = Number(parts[0]) || 0;
    const m = Number(parts[1]) || 0;
    return h * 3600 + m * 60;
  };

  let inSec = toSeconds(start);
  let outSec = toSeconds(end);
  if (outSec <= inSec) {
    outSec += 86400;
  }

  const hours = (outSec - inSec) / 3600;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return 8;

  return Math.round(hours * 100) / 100;
}

export function formatShiftExpectedHours(shift) {
  const hours = shiftExpectedHoursPerDay(shift);
  if (hours == null) return null;
  const n = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${n} hour${hours === 1 ? "" : "s"} expected per scheduled work day`;
}

/** Work shift label for employee profile and selects. */
export function formatWorkShiftLabel(shift, { includeExpectedHours = false } = {}) {
  if (!shift) return "—";
  const name = shift.shift_name ?? shift.shift_code ?? "Shift";
  const start = String(shift.start_time ?? "").slice(0, 5);
  const end = String(shift.end_time ?? "").slice(0, 5);
  let label = start && end ? `${name} (${start}–${end})` : name;
  if (includeExpectedHours) {
    const hoursText = formatShiftExpectedHours(shift);
    if (hoursText) label = `${label} — ${hoursText}`;
  }
  return label;
}

export function formatPaymentAccountSummary(account) {
  if (!account) return "—";
  const method = paymentMethodLabel(account.payment_method);
  if (account.payment_method === "mpesa") {
    return `M-Pesa · ${account.account_number}`;
  }
  if (account.payment_method === "cash") {
    return `Cash · ${account.account_name}`;
  }
  return `${account.bank_name} · ${account.account_number} (${method})`;
}

export function buildPaymentAccountApiBody(account, fullName) {
  const method = account.payment_method || "bank_transfer";
  let bank_name = account.bank_name?.trim() ?? "";
  let account_number = account.account_number?.trim() ?? "";
  const account_name = account.account_name?.trim() || fullName?.trim() || "Payee";

  if (method === "mpesa") {
    bank_name = bank_name || "M-Pesa";
  } else if (method === "cash") {
    bank_name = bank_name || "Cash";
    account_number = account_number || "N/A";
  } else if (method === "cheque") {
    bank_name = bank_name || "Cheque";
  }

  return {
    bank_name,
    bank_branch: account.bank_branch?.trim() || null,
    account_number,
    account_name,
    payment_method: method,
    is_primary: !!account.is_primary,
  };
}

export function validatePaymentAccounts(accounts) {
  const errors = {};
  if (!accounts?.length) {
    errors.payment_accounts = "Add at least one payment method.";
    return errors;
  }
  const primaryCount = accounts.filter((a) => a.is_primary).length;
  if (primaryCount !== 1) {
    errors.payment_primary = "Mark exactly one payment method as primary.";
  }
  accounts.forEach((acc, i) => {
    const method = acc.payment_method || "bank_transfer";
    if (method === "bank_transfer" || method === "cheque") {
      if (!acc.bank_name?.trim()) errors[`payment_${i}_bank_name`] = "Bank is required.";
      if (!acc.account_number?.trim()) {
        errors[`payment_${i}_account_number`] = "Account number is required.";
      }
      if (!acc.account_name?.trim()) errors[`payment_${i}_account_name`] = "Account name is required.";
    } else if (method === "mpesa") {
      if (!acc.account_number?.trim()) {
        errors[`payment_${i}_account_number`] = "M-Pesa phone number is required.";
      }
      if (!acc.account_name?.trim()) {
        errors[`payment_${i}_account_name`] = "Name on M-Pesa is required.";
      }
    } else if (method === "cash") {
      if (!acc.account_name?.trim()) errors[`payment_${i}_account_name`] = "Payee name is required.";
    }
  });
  return errors;
}

export function validateEmergencyContacts(contacts) {
  const errors = {};
  (contacts ?? []).forEach((contact, i) => {
    const hasAny =
      contact.full_name?.trim() ||
      contact.phone?.trim() ||
      contact.email?.trim() ||
      contact.address?.trim() ||
      contact.relationship?.trim();
    if (!hasAny) return;
    if (!contact.full_name?.trim()) errors[`emergency_${i}_full_name`] = "Contact name is required.";
    if (!contact.phone?.trim()) errors[`emergency_${i}_phone`] = "Contact phone is required.";
  });
  return errors;
}

export function validateNextOfKin(nextOfKin) {
  const errors = {};
  const hasAny =
    nextOfKin?.full_name?.trim() ||
    nextOfKin?.phone?.trim() ||
    nextOfKin?.national_id?.trim() ||
    nextOfKin?.address?.trim() ||
    nextOfKin?.relationship?.trim();
  if (!hasAny) return errors;
  if (!nextOfKin.full_name?.trim()) errors.nok_full_name = "Next of kin name is required.";
  if (!nextOfKin.phone?.trim()) errors.nok_phone = "Next of kin phone is required.";
  return errors;
}

export const EMPTY_DEPARTMENT_FORM = {
  department_code: "",
  department_name: "",
};

export const EMPTY_PAY_PERIOD_FORM = {
  period_code: "",
  period_start: "",
  period_end: "",
  status: "open",
};

/** Kenya statutory deductions — always applied on payroll; rates are system-configured. */
export const KENYA_STATUTORY_DEDUCTIONS = [
  {
    id: "nssf",
    label: "NSSF",
    hint: "National Social Security Fund (employee share)",
  },
  {
    id: "shif",
    label: "SHIF",
    hint: "Social Health Insurance Fund",
  },
  {
    id: "housing_levy",
    label: "Housing levy",
    hint: "Affordable Housing Levy (employee share)",
  },
  {
    id: "paye",
    label: "PAYE",
    hint: "Pay As You Earn (KRA income tax)",
  },
];

export const EMPTY_PAYROLL_RUN_FORM = {
  pay_period_id: "",
  run_date: new Date().toISOString().slice(0, 10),
  department_id: "",
  include_allowances: true,
  use_attendance_proration: true,
  include_overtime: true,
  /** Loans, advances, and custom employee deductions (not NSSF/PAYE/SHIF/AHL). */
  include_employee_deductions: true,
};

export const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "terminated", label: "Terminated" },
  { value: "retired", label: "Retired" },
];

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "casual", label: "Casual" },
  { value: "intern", label: "Intern" },
];

export function formatHrKes(value, settings = GENERAL_DEFAULTS) {
  return formatOrgCurrencyCompact(value, settings);
}

export function formatHrKesFull(value, settings = GENERAL_DEFAULTS) {
  if (value == null || value === "") return "—";
  return formatOrgCurrency(value, settings);
}

export function composeEmployeeDisplayName(source) {
  if (!source) return "";
  const first = source.first_name?.trim() ?? "";
  const middle = source.middle_name?.trim() ?? "";
  const last = source.last_name?.trim() ?? "";
  const composed = [first, middle, last].filter(Boolean).join(" ").trim();
  if (composed) return composed;
  return String(source.full_name ?? "").trim();
}

export function employeeToForm(employee) {
  const bankAccounts = employeeBankAccounts(employee);
  const hasParts =
    employee.first_name || employee.middle_name || employee.last_name;
  const split = hasParts ? null : splitFullName(employee.full_name);
  return {
    first_name: employee.first_name ?? split?.first_name ?? "",
    middle_name: employee.middle_name ?? split?.middle_name ?? "",
    last_name: employee.last_name ?? split?.last_name ?? "",
    photo_url: employee.photo_url ?? "",
    gender: employee.gender ?? "",
    date_of_birth: employee.date_of_birth?.slice?.(0, 10) ?? "",
    national_id: employee.national_id ?? "",
    id_document_type: employee.id_document_type ?? "national_id",
    marital_status: employee.marital_status ?? "",
    personal_email: employee.personal_email ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    alt_phone: employee.alt_phone ?? "",
    physical_address: employee.physical_address ?? "",
    postal_address: employee.postal_address ?? "",
    city: employee.city ?? "",
    county: employee.county ?? "",
    branch_id: employee.branch_id != null ? String(employee.branch_id) : "",
    department_id: employee.department_id != null ? String(employee.department_id) : "",
    position_id: employee.position_id != null ? String(employee.position_id) : "",
    shift_id: employee.shift_id != null ? String(employee.shift_id) : "",
    user_id: employee.user_id != null ? String(employee.user_id) : "",
    reports_to_employee_id:
      employee.reports_to_employee_id != null ? String(employee.reports_to_employee_id) : "",
    job_title: employee.job_title ?? "",
    employment_status: employee.employment_status ?? "active",
    employment_type: employee.employment_type ?? "permanent",
    hire_date: employee.hire_date?.slice?.(0, 10) ?? "",
    confirmation_date: employee.confirmation_date?.slice?.(0, 10) ?? "",
    probation_end_date: employee.probation_end_date?.slice?.(0, 10) ?? "",
    contract_start_date: employee.contract_start_date?.slice?.(0, 10) ?? "",
    contract_end_date: employee.contract_end_date?.slice?.(0, 10) ?? "",
    notice_period_days:
      employee.notice_period_days != null ? String(employee.notice_period_days) : "",
    pay_frequency: employee.pay_frequency ?? "monthly",
    base_salary: employee.base_salary != null ? String(employee.base_salary) : "",
    monthly_allowance:
      employee.monthly_allowance != null ? String(employee.monthly_allowance) : "",
    kra_pin: employee.kra_pin ?? "",
    nssf_number: employee.nssf_number ?? "",
    sha_number: employee.sha_number ?? "",
    housing_levy_number: employee.housing_levy_number ?? "",
    is_active: employee.is_active !== false && employee.employment_status !== "terminated",
    payment_accounts: paymentAccountsToForm(bankAccounts, employee.employment_type ?? "permanent"),
    emergency_contacts: emergencyContactsToForm(employee.emergency_contacts ?? employee.emergencyContacts),
    next_of_kin: nextOfKinToForm(employee.next_of_kin ?? employee.nextOfKin),
  };
}

/** Split full name for API name columns (optional storage). */
export function splitFullName(fullName) {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return { first_name: null, middle_name: null, last_name: null };
  }
  if (parts.length === 1) {
    return { first_name: parts[0], middle_name: null, last_name: parts[0] };
  }
  return {
    first_name: parts[0],
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    last_name: parts[parts.length - 1],
  };
}

/** Preview next code: EMP#0001, EMP#0002, … */
export function previewNextEmployeeCode(employees) {
  let max = 0;
  for (const e of employees) {
    const code = String(e.employee_code ?? "");
    const m = code.match(/^EMP#?(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `EMP#${String(max + 1).padStart(4, "0")}`;
}

export const EMPLOYEE_FORM_TABS = [
  { id: "identity", label: "Identity" },
  { id: "contact", label: "Contact" },
  { id: "employment", label: "Employment" },
  { id: "payment", label: "Bank & payment" },
  { id: "emergency", label: "Emergency & kin" },
  { id: "payroll", label: "Payroll & tax" },
];

export function validateEmployeeTab(tabId, form, { showBranchSelect = false } = {}) {
  const errors = {};
  if (tabId === "identity") {
    if (!form.first_name?.trim()) {
      errors.first_name = "First name is required.";
    }
    if (!form.last_name?.trim()) {
      errors.last_name = "Last name is required.";
    }
  }
  if (tabId === "contact") {
    if (!form.phone?.trim()) errors.phone = "Mobile number is required.";
  }
  if (tabId === "employment") {
    if (showBranchSelect && !form.branch_id) errors.branch_id = "Select a branch.";
    if (!form.department_id) errors.department_id = "Select a department.";
    if (!form.shift_id) errors.shift_id = "Select a work shift (required for payroll and attendance).";
    if (!form.hire_date) errors.hire_date = "Date hired is required.";
    if (!form.job_title?.trim()) errors.job_title = "Job title is required.";
  }
  if (tabId === "payment") {
    Object.assign(errors, validatePaymentAccounts(form.payment_accounts));
  }
  if (tabId === "emergency") {
    Object.assign(errors, validateEmergencyContacts(form.emergency_contacts));
    Object.assign(errors, validateNextOfKin(form.next_of_kin));
  }
  if (tabId === "payroll") {
    if (form.base_salary === "" || Number(form.base_salary) < 0) {
      errors.base_salary = "Enter a valid basic salary (KES).";
    }
  }
  return errors;
}

export function isEmployeeTabComplete(tabId, form, options) {
  return Object.keys(validateEmployeeTab(tabId, form, options)).length === 0;
}

export function buildEmployeeBody(form, organizationId, branchId, { isEdit = false, employeeCode = null } = {}) {
  const status = form.employment_status || "active";
  const first_name = form.first_name.trim();
  const middle_name = form.middle_name?.trim() || null;
  const last_name = form.last_name.trim();
  const body = {
    organization_id: organizationId,
    branch_id: branchId,
    department_id: form.department_id ? Number(form.department_id) : null,
    position_id: form.position_id ? Number(form.position_id) : null,
    shift_id: form.shift_id ? Number(form.shift_id) : null,
    user_id: form.user_id ? Number(form.user_id) : null,
    reports_to_employee_id: form.reports_to_employee_id
      ? Number(form.reports_to_employee_id)
      : null,
    first_name,
    middle_name,
    last_name,
    full_name: composeEmployeeDisplayName({ first_name, middle_name, last_name }),
    gender: form.gender || null,
    date_of_birth: form.date_of_birth || null,
    nationality: LOCKED_NATIONALITY,
    national_id: form.national_id.trim() || null,
    id_document_type: form.id_document_type || "national_id",
    marital_status: form.marital_status || null,
    personal_email: form.personal_email.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    alt_phone: form.alt_phone.trim() || null,
    physical_address: form.physical_address.trim() || null,
    postal_address: form.postal_address.trim() || null,
    city: form.city.trim() || null,
    county: form.county.trim() || null,
    country: LOCKED_COUNTRY,
    employment_status: status,
    employment_type: form.employment_type || "permanent",
    job_title: form.job_title.trim() || null,
    hire_date: form.hire_date || null,
    confirmation_date: form.confirmation_date || null,
    probation_end_date: form.probation_end_date || null,
    contract_start_date: form.contract_start_date || null,
    contract_end_date: form.contract_end_date || null,
    notice_period_days: form.notice_period_days ? Number(form.notice_period_days) : null,
    pay_frequency: form.pay_frequency || "monthly",
    base_salary: form.base_salary !== "" ? parseFloat(form.base_salary) : 0,
    monthly_allowance:
      form.monthly_allowance !== "" ? parseFloat(form.monthly_allowance) : 0,
    kra_pin: form.kra_pin.trim() || null,
    nssf_number: form.nssf_number.trim() || null,
    sha_number: form.sha_number.trim() || null,
    housing_levy_number: form.housing_levy_number.trim() || null,
    is_active: form.is_active && status === "active",
  };
  if (isEdit && employeeCode) {
    body.employee_code = employeeCode;
    body.payroll_number = employeeCode;
  }
  return body;
}

/** Rows for Kenya statutory breakdown UI from payroll line or calculate API */
export function kenyaStatutoryRows(line) {
  const meta = line?.statutory_meta ?? line ?? {};
  return [
    { label: "Gross pay", value: line?.gross_pay ?? meta.gross_pay, emphasis: true },
    { label: "NSSF (employee)", value: line?.nssf ?? meta.nssf },
    { label: "SHIF", value: line?.shif ?? meta.shif },
    { label: "Housing levy (employee)", value: line?.housing_levy ?? meta.housing_levy },
    { label: "Taxable income", value: line?.taxable_income ?? meta.taxable_income },
    { label: "PAYE", value: line?.paye ?? meta.paye },
    { label: "Other deductions", value: line?.other_deductions ?? meta.other_deductions },
    { label: "Total deductions", value: line?.deductions ?? meta.deductions },
    { label: "Net pay", value: line?.net_pay ?? meta.net_pay, emphasis: true },
    { label: "Employer NSSF", value: line?.employer_nssf ?? meta.employer_nssf, muted: true },
    {
      label: "Employer housing levy",
      value: line?.employer_housing ?? meta.employer_housing,
      muted: true,
    },
  ];
}

export function buildDepartmentBody(form, organizationId) {
  const name = form.department_name.trim();
  const code =
    form.department_code.trim() ||
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20);
  return {
    organization_id: organizationId,
    department_code: code,
    department_name: name,
    is_active: true,
  };
}

export function buildPayPeriodBody(form, organizationId) {
  return {
    organization_id: organizationId,
    period_code: form.period_code.trim(),
    period_start: form.period_start,
    period_end: form.period_end,
    status: form.status || "open",
  };
}

/** Prefill for the calendar month containing `date` (default: today). */
export function suggestCurrentPayPeriodForm(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    period_code: `${year}-${pad(month + 1)}`,
    period_start: `${year}-${pad(month + 1)}-01`,
    period_end: `${year}-${pad(month + 1)}-${pad(end.getDate())}`,
    status: "open",
  };
}

export function suggestEmployeeCode() {
  return null;
}

export function formatPeriodRange(period) {
  if (!period) return "—";
  const fmt = (iso) =>
    new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short" });
  const start = period.period_start ? fmt(period.period_start) : "";
  const end = period.period_end ? fmt(period.period_end) : "";
  if (!start && !end) return "—";
  return `${start} – ${end}`;
}

export function periodLabel(period) {
  if (!period) return "—";
  if (period.period_start) {
    return new Date(period.period_start).toLocaleDateString("en-KE", {
      month: "long",
      year: "numeric",
    });
  }
  const code = period.period_code ?? "";
  const m = code.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString("en-KE", {
      month: "long",
      year: "numeric",
    });
  }
  return code.replace(/-/g, " ") || formatPeriodRange(period);
}

function statutoryAmount(line, meta, id) {
  return Number(line?.[id] ?? meta[id] ?? 0);
}

/** Earnings + locked statutory sections for payroll line detail panels. */
export function payrollBreakdownSections(line, employee) {
  const meta = line?.statutory_meta ?? {};
  const payroll = meta.payroll ?? {};
  const contractBasic = Number(
    payroll.contract_monthly_salary ?? meta.basic_salary ?? employee?.base_salary ?? 0,
  );
  const basic = Number(meta.basic_salary ?? payrollBasicFromMeta(payroll, contractBasic));
  const allowanceLines = payroll.allowance_lines ?? [];
  const allowances = Number(
    meta.allowances ?? payroll.allowances_period ?? 0,
  );
  const overtime = Number(payroll.overtime ?? 0);
  const gross = Number(line?.gross_pay ?? basic + allowances + overtime);
  const other = Number(line?.other_deductions ?? meta.other_deductions ?? 0);

  const earnings = [
    { label: "Contract monthly salary", value: contractBasic, muted: payroll.use_attendance_proration },
    { label: "Basic pay (this period)", value: basic },
  ];
  if (allowanceLines.length > 0) {
    for (const line of allowanceLines) {
      earnings.push({
        label: `Allowance: ${line.name}`,
        value: Number(line.amount ?? 0),
      });
    }
  } else if (allowances > 0) {
    earnings.push({ label: "Allowances (this period)", value: allowances });
  }
  if (overtime > 0) {
    earnings.push({ label: "Overtime", value: overtime });
  }
  earnings.push({ label: "Gross pay", value: gross, emphasis: true });

  const attendance = payroll.attendance;
  const attendanceNote =
    attendance && payroll.use_attendance_proration
      ? `${attendance.paid_days ?? 0} paid days of ${attendance.expected_days ?? 0} scheduled · ${attendance.absent_days ?? 0} absent · ${attendance.unpaid_leave_days ?? 0} unpaid leave`
      : null;

  return {
    earnings,
    attendanceNote,
    statutory: KENYA_STATUTORY_DEDUCTIONS.map((d) => ({
      id: d.id,
      label: d.label,
      hint: d.hint,
      value: statutoryAmount(line, meta, d.id),
      system: true,
    })),
    otherDeductions: payrollDeductionRows(payroll, other),
    net: { label: "Net salary", value: Number(line?.net_pay ?? meta.net_pay ?? 0) },
  };
}

function payrollDeductionRows(payroll, otherTotal) {
  const detail = payroll.deductions_detail ?? [];
  const percentBase = payroll.other_deductions_percent_base;
  if (detail.length > 0) {
    return detail.map((item) => {
      const name = item.name ?? (item.type === "cash_advance" ? "Cash advance" : "Deduction");
      const pct =
        item.calc_type === "percentage" && item.percentage != null
          ? ` (${item.percentage}% of contract gross)`
          : "";
      return {
        label: `${name}${pct}`,
        value: Number(item.amount ?? 0),
        hint:
          item.prorated === false && payroll.other_deductions_not_prorated
            ? "Full amount for this pay run"
            : undefined,
      };
    });
  }
  if (otherTotal > 0) {
    return [
      {
        label: "Other deductions (total)",
        value: otherTotal,
        hint:
          payroll.other_deductions_not_prorated && percentBase > 0
            ? "Not reduced for attendance proration"
            : undefined,
      },
    ];
  }
  return [];
}

function payrollBasicFromMeta(payroll, contractBasic) {
  if (payroll.use_attendance_proration && payroll.expected_work_days > 0) {
    const daily = Number(payroll.daily_rate ?? 0);
    const paid = Number(payroll.paid_work_days ?? 0);
    if (daily > 0 && paid > 0) return Math.round(daily * paid * 100) / 100;
  }
  return contractBasic;
}

/** Flat list (legacy / compact grids). */
export function payrollBreakdownRows(line, employee) {
  const { earnings, statutory, otherDeductions, net } = payrollBreakdownSections(line, employee);
  return [
    ...earnings,
    ...statutory.map((r) => ({ label: r.label, value: r.value, system: true })),
    ...otherDeductions,
    { label: net.label, value: net.value, emphasis: true },
  ];
}

export function payrollRunIsCompleted(status) {
  return status === "paid" || status === "processed";
}

/** Whether API allows deleting this payroll run (20-minute window after creation). */
export function payrollRunCanDelete(run) {
  if (run?.can_delete === false) return false;
  if (run?.can_delete === true) return true;
  if (!run?.delete_locked_after) return true;
  return Date.now() < new Date(run.delete_locked_after).getTime();
}

export function payrollRunDeleteLockHint(run) {
  if (payrollRunCanDelete(run)) return null;
  const until = run?.delete_locked_after
    ? new Date(run.delete_locked_after).toLocaleString("en-KE", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const mins = run?.delete_lock_minutes ?? 20;
  return until
    ? `Delete locked after ${mins} minutes (since ${until}).`
    : `Delete locked after ${mins} minutes.`;
}

/** Client-side check if a pay period may be run today (mirrors API schedule). */
export function payPeriodRunnableToday(period, date = new Date(), graceDays = 7) {
  if (!period?.period_end) return false;
  const grace = Math.max(1, Number(graceDays) || 7);
  const today = new Date(date);
  today.setHours(0, 0, 0, 0);
  const end = new Date(period.period_end);
  end.setHours(0, 0, 0, 0);
  const periodYm = end.getFullYear() * 100 + (end.getMonth() + 1);
  const todayYm = today.getFullYear() * 100 + (today.getMonth() + 1);
  if (periodYm > todayYm) return false;
  if (periodYm === todayYm) {
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return today.getDate() === lastDay;
  }
  const graceMonth = end.getMonth() === 11 ? 0 : end.getMonth() + 1;
  const graceYear = end.getMonth() === 11 ? end.getFullYear() + 1 : end.getFullYear();
  if (today.getFullYear() === graceYear && today.getMonth() === graceMonth) {
    return today.getDate() <= grace;
  }
  return false;
}

/** Matches payroll auto-process eligibility (active, salary, work shift). */
export function isPayrollEligible(employee) {
  if (!employee) return false;
  return (
    employee.is_active !== false &&
    employee.employment_status === "active" &&
    Number(employee.base_salary) > 0 &&
    employee.shift_id != null
  );
}

/** Monthly allowances for payroll preview (employee field, else 10% of basic). */
export function defaultPayrollAllowances(baseSalary, employee = null) {
  const fromEmployee = Number(employee?.monthly_allowance ?? 0);
  if (fromEmployee > 0) return fromEmployee;
  const basic = Number(baseSalary);
  if (!Number.isFinite(basic) || basic <= 0) return 0;
  return Math.round(basic * 0.1 * 100) / 100;
}

export function employeeInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function EmployeeStatusBadge({ active, status }) {
  const s = status ?? (active !== false ? "active" : "inactive");
  const styles = {
    active: "bg-[#EAF3DE] text-[#27500A]",
    suspended: "bg-amber-50 text-amber-800",
    terminated: "bg-red-50 text-red-800",
    retired: "bg-slate-100 text-slate-600",
    inactive: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
        styles[s] ?? styles.inactive
      }`}
    >
      {s}
    </span>
  );
}

export function PayrollRunStatusBadge({ status }) {
  const styles = {
    draft: "bg-slate-100 text-slate-700",
    pending_approval: "bg-amber-50 text-amber-800",
    approved: "bg-indigo-50 text-indigo-800",
    processed: "bg-[#E6F1FB] text-[#0C447C]",
    paid: "bg-[#EAF3DE] text-[#27500A]",
    void: "bg-red-50 text-red-800",
  };
  const labels = {
    draft: "Draft",
    pending_approval: "Awaiting approval",
    approved: "Approved",
    processed: "Processed",
    paid: "Completed",
    void: "Void",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
        styles[status] ?? styles.draft
      }`}
    >
      {labels[status] ?? status ?? "Draft"}
    </span>
  );
}

export function payrollLinesForEmployee(lines, employeeId) {
  return lines.filter((l) => Number(l.employee_id) === Number(employeeId));
}

export function sumEmployeeYtd(lines, employeeId) {
  return payrollLinesForEmployee(lines, employeeId).reduce(
    (sum, l) => sum + Number(l.net_pay ?? 0),
    0,
  );
}

function BreakdownAmountRow({ label, value, emphasis = false, system = false, muted = false }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm ${
        system ? "border border-slate-200/80 bg-slate-50" : "bg-slate-50"
      } ${muted ? "opacity-80" : ""}`}
    >
      <dt className="flex items-center gap-1.5 text-slate-600">
        {system ? <LockIcon className="shrink-0 text-slate-400" /> : null}
        {label}
      </dt>
      <dd className={emphasis ? "font-semibold text-slate-900" : "font-medium text-slate-800"}>
        {formatHrKesFull(value)}
      </dd>
    </div>
  );
}

/** Shown in generate-payroll drawer — statutory items are always on. */
export function StatutoryDeductionsPanel({ compact = false }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      {!compact ? (
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Government deductions (Kenya)
        </p>
      ) : null}
      <p className={`text-xs leading-relaxed text-slate-500 ${compact ? "" : "mt-1"}`}>
        NSSF, SHIF, Housing Levy, and PAYE are always applied when payroll is generated. Rates are
        system-configured and cannot be edited or removed.
      </p>
      <ul className="mt-3 space-y-2">
        {KENYA_STATUTORY_DEDUCTIONS.map((d) => (
          <li
            key={d.id}
            className="flex items-start gap-2 rounded-md border border-slate-200/80 bg-white px-3 py-2 text-sm"
          >
            <LockIcon className="mt-0.5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <span className="font-medium text-slate-800">{d.label}</span>
              {!compact ? <p className="text-xs text-slate-500">{d.hint}</p> : null}
            </div>
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              System
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { GovernmentDeductionsAside } from "@/components/hr/government-deductions-aside";

/** Normalize to HH:MM (24h) from time input, HH:MM:SS, or 12h text e.g. 9:30 PM. */
export function normalizeTime24h(value) {
  if (value == null || String(value).trim() === "") return null;
  const t = String(value).trim();

  const m24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const h = Number(m24[1]);
    const m = Number(m24[2]);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return null;
  }

  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = Number(m12[1]);
    const min = Number(m12[2]);
    const pm = m12[3].toUpperCase() === "PM";
    if (h < 1 || h > 12 || min < 0 || min >= 60) return null;
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  return null;
}

/** Friendly 12h label under the picker (e.g. 9:30 PM). */
export function formatTimeDisplay12h(hhmm) {
  const n = normalizeTime24h(hhmm);
  if (!n) return "";
  const [hStr, mStr] = n.split(":");
  let h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${suffix}`;
}

/** Split stored HH:MM into 12-hour picker parts. */
export function time24hToParts(hhmm) {
  const n = normalizeTime24h(hhmm);
  if (!n) return { hour: "", minute: "", period: "AM" };
  const [hStr, mStr] = n.split(":");
  let h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { hour: String(h), minute: mStr, period };
}

/** Build HH:MM (24h) from 12-hour picker parts. */
export function partsToTime24h(hour12, minute, period) {
  if (!hour12 || minute === "" || !period) return "";
  let h = parseInt(hour12, 10);
  const m = String(minute).padStart(2, "0");
  if (Number.isNaN(h) || h < 1 || h > 12) return "";
  if (period === "AM") {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }
  return `${String(h).padStart(2, "0")}:${m}`;
}

/** Send HH:MM or HH:MM:SS to API (MySQL TIME). */
export function formatTimeForApi(value) {
  const n = normalizeTime24h(value);
  return n ? `${n}:00` : null;
}

/**
 * @param {{ allowOvernight?: boolean }} [options]
 *   allowOvernight: when false, check-out must be later than check-in on the same day.
 */
export function computeAttendanceHours(checkIn, checkOut, options = {}) {
  const { allowOvernight = false } = options;
  const inT = normalizeTime24h(checkIn);
  const outT = normalizeTime24h(checkOut);
  if (!inT || !outT) return null;

  const parse = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 3600 + m * 60;
  };
  let inSec = parse(inT);
  let outSec = parse(outT);
  if (outSec <= inSec) {
    if (!allowOvernight) return null;
    outSec += 86400;
  }
  const hours = (outSec - inSec) / 3600;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
  return Math.round(hours * 100) / 100;
}

/** Full breakdown for line detail sidebar. */
export function PayrollBreakdownPanel({ line, employee, loading = false }) {
  if (loading || !line) {
    return <p className="text-sm text-slate-500">Loading breakdown…</p>;
  }

  const sections = payrollBreakdownSections(line, employee);

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Earnings</h3>
        <dl className="mt-2 space-y-2">
          {sections.earnings.map((row) => (
            <div key={row.label}>
              <BreakdownAmountRow
                label={row.label}
                value={row.value}
                emphasis={row.emphasis}
                muted={row.muted}
              />
              {row.hint ? <p className="mt-0.5 px-3 text-[11px] text-slate-500">{row.hint}</p> : null}
            </div>
          ))}
        </dl>
        {sections.attendanceNote ? (
          <p className="mt-2 text-xs text-slate-500">{sections.attendanceNote}</p>
        ) : null}
      </section>

      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Government deductions
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">Auto-calculated · system configured</p>
        <dl className="mt-2 space-y-2">
          {sections.statutory.map((row) => {
            const meta = line?.statutory_meta ?? {};
            let hint = null;
            if (row.id === "nssf" && meta.nssf_tier1 != null) {
              hint = `Tier I ${formatHrKesFull(meta.nssf_tier1)} + Tier II ${formatHrKesFull(meta.nssf_tier2 ?? 0)}`;
            }
            if (row.id === "paye" && meta.paye_before_relief != null) {
              hint = `Before relief ${formatHrKesFull(meta.paye_before_relief)} − relief ${formatHrKesFull((meta.personal_relief ?? 0) + (meta.insurance_relief ?? 0))}`;
            }
            return (
              <div key={row.id}>
                <BreakdownAmountRow label={row.label} value={row.value} system />
                {hint ? <p className="mt-0.5 px-3 text-[11px] text-slate-500">{hint}</p> : null}
              </div>
            );
          })}
        </dl>
      </section>

      {sections.otherDeductions.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Other deductions
          </h3>
          <dl className="mt-2 space-y-2">
            {sections.otherDeductions.map((row) => (
              <div key={row.label}>
                <BreakdownAmountRow label={row.label} value={row.value} />
                {row.hint ? (
                  <p className="mt-0.5 px-3 text-[11px] text-slate-500">{row.hint}</p>
                ) : null}
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="border-t border-slate-200 pt-4">
        <BreakdownAmountRow
          label={sections.net.label}
          value={sections.net.value}
          emphasis
        />
      </section>
    </div>
  );
}

function LockIcon({ className = "" }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
