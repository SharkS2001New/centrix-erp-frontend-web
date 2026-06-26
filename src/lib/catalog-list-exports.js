export const EMPLOYEE_EXPORT_COLUMNS = [
  { key: "employee_code", label: "Employee code" },
  { key: "payroll_number", label: "Payroll #" },
  { key: "full_name", label: "Full name" },
  { key: "job_title", label: "Job title" },
  { key: "department_name", label: "Department" },
  { key: "position_name", label: "Position" },
  { key: "shift_name", label: "Shift" },
  { key: "branch_name", label: "Branch" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "employment_status", label: "Status" },
  { key: "employment_type", label: "Type" },
  { key: "hire_date", label: "Hire date" },
  { key: "base_salary", label: "Base salary", align: "right" },
  { key: "kra_pin", label: "KRA PIN" },
  { key: "nssf_number", label: "NSSF" },
  { key: "sha_number", label: "SHA" },
  { key: "is_active", label: "Active" },
];

export const ATTENDANCE_EXPORT_COLUMNS = [
  { key: "attendance_date", label: "Date" },
  { key: "employee_name", label: "Employee" },
  { key: "employee_code", label: "Code" },
  { key: "branch_name", label: "Branch" },
  { key: "check_in", label: "Check in" },
  { key: "check_out", label: "Check out" },
  { key: "hours_worked", label: "Hours", align: "right" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "notes", label: "Notes" },
];

export const LEAVE_DAY_EXPORT_COLUMNS = [
  { key: "leave_date", label: "Date" },
  { key: "employee_name", label: "Employee" },
  { key: "employee_code", label: "Code" },
  { key: "leave_type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "days", label: "Days", align: "right" },
  { key: "reason", label: "Reason" },
];

export const DEPARTMENT_EXPORT_COLUMNS = [
  { key: "department_code", label: "Code" },
  { key: "department_name", label: "Name" },
  { key: "is_active", label: "Active" },
];

export const POSITION_EXPORT_COLUMNS = [
  { key: "position_code", label: "Code" },
  { key: "position_title", label: "Title" },
  { key: "is_active", label: "Active" },
];

export const EXPENSE_EXPORT_COLUMNS = [
  { key: "expense_date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "expense_amount", label: "Amount", align: "right" },
  { key: "invoice_no", label: "Invoice #" },
  { key: "notes", label: "Notes" },
];

export const USER_EXPORT_COLUMNS = [
  { key: "username", label: "Username" },
  { key: "full_name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "is_active", label: "Active" },
];

export const BRANCH_EXPORT_COLUMNS = [
  { key: "branch_code", label: "Code" },
  { key: "branch_name", label: "Name" },
  { key: "town", label: "Town" },
  { key: "is_active", label: "Active" },
];

export const CATEGORY_EXPORT_COLUMNS = [
  { key: "category_name", label: "Category" },
];

export const UOM_EXPORT_COLUMNS = [
  { key: "full_name", label: "Unit" },
  { key: "measure_name", label: "Measure" },
  { key: "conversion_factor", label: "Factor", align: "right" },
  { key: "is_active", label: "Active" },
];

export const VAT_EXPORT_COLUMNS = [
  { key: "vat_code", label: "Code" },
  { key: "vat_name", label: "Name" },
  { key: "vat_percentage", label: "Rate %", align: "right" },
  { key: "is_active", label: "Active" },
];

export const PAYROLL_RUN_EXPORT_COLUMNS = [
  { key: "id", label: "Run #" },
  { key: "status", label: "Status" },
  { key: "period_label", label: "Period" },
  { key: "total_gross", label: "Gross", align: "right" },
  { key: "total_net", label: "Net", align: "right" },
  { key: "created_at", label: "Created" },
];

/** Derive export columns from HrCrudPage column defs (skips computed render-only columns). */
export function exportColumnsFromHrCrud(columns) {
  return (columns ?? [])
    .filter((col) => col.key && !col.render)
    .map((col) => ({ key: col.key, label: col.label, align: col.align }));
}
