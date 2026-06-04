"use client";

export const LOCKED_COUNTRY = "Kenya";
export const LOCKED_NATIONALITY = "Kenyan";

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
  full_name: "",
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
  kra_pin: "",
  nssf_number: "",
  sha_number: "",
  housing_levy_number: "",
  is_active: true,
  payment_accounts: defaultPaymentAccountsForNewEmployee(),
};

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

export const EMPTY_PAYROLL_RUN_FORM = {
  pay_period_id: "",
  run_date: new Date().toISOString().slice(0, 10),
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

export function formatHrKes(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export function formatHrKesFull(value) {
  if (value == null || value === "") return "—";
  return `KES ${Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function employeeToForm(employee) {
  const bankAccounts = employeeBankAccounts(employee);
  return {
    full_name: employee.full_name ?? "",
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
    kra_pin: employee.kra_pin ?? "",
    nssf_number: employee.nssf_number ?? "",
    sha_number: employee.sha_number ?? "",
    housing_levy_number: employee.housing_levy_number ?? "",
    is_active: employee.is_active !== false && employee.employment_status !== "terminated",
    payment_accounts: paymentAccountsToForm(bankAccounts, employee.employment_type ?? "permanent"),
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
  { id: "payroll", label: "Payroll & tax" },
];

export function validateEmployeeTab(tabId, form, { showBranchSelect = false } = {}) {
  const errors = {};
  if (tabId === "identity") {
    if (!form.full_name?.trim() || form.full_name.trim().length < 2) {
      errors.full_name = "Full name is required (at least 2 characters).";
    }
  }
  if (tabId === "contact") {
    if (!form.phone?.trim()) errors.phone = "Mobile number is required.";
  }
  if (tabId === "employment") {
    if (showBranchSelect && !form.branch_id) errors.branch_id = "Select a branch.";
    if (!form.department_id) errors.department_id = "Select a department.";
    if (!form.hire_date) errors.hire_date = "Date hired is required.";
    if (!form.job_title?.trim()) errors.job_title = "Job title is required.";
  }
  if (tabId === "payment") {
    Object.assign(errors, validatePaymentAccounts(form.payment_accounts));
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
  const names = splitFullName(form.full_name);
  const body = {
    organization_id: organizationId,
    branch_id: branchId,
    department_id: form.department_id ? Number(form.department_id) : null,
    user_id: form.user_id ? Number(form.user_id) : null,
    reports_to_employee_id: form.reports_to_employee_id
      ? Number(form.reports_to_employee_id)
      : null,
    full_name: form.full_name.trim(),
    ...names,
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

export function suggestEmployeeCode() {
  return null;
}

export function formatPeriodRange(period) {
  if (!period) return "—";
  const start = period.period_start
    ? new Date(period.period_start).toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
      })
    : "";
  const end = period.period_end
    ? new Date(period.period_end).toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
  return `${start} – ${end}`;
}

export function periodLabel(period) {
  if (!period) return "—";
  if (period.period_code) return period.period_code.replace(/-/g, " ");
  return formatPeriodRange(period);
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
    processed: "bg-[#E6F1FB] text-[#0C447C]",
    paid: "bg-[#EAF3DE] text-[#27500A]",
    void: "bg-red-50 text-red-800",
  };
  const labels = {
    draft: "Draft",
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
