"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, FormModal, inputClassName } from "@/components/catalog/catalog-shared";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";
import { EntityPhotoField } from "@/components/media/entity-photo-field";
import { employeePhotoFileUrl } from "@/components/media/entity-photo-display";
import {
  EMPTY_DEPARTMENT_FORM,
  EMPTY_EMPLOYEE_FORM,
  EMPLOYEE_FORM_TABS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  KENYA_BANKS,
  LOCKED_COUNTRY,
  LOCKED_NATIONALITY,
  PAYMENT_METHOD_OPTIONS,
  buildDepartmentBody,
  buildEmployeeBody,
  buildPaymentAccountApiBody,
  composeEmployeeDisplayName,
  createEmptyPaymentAccount,
  createEmptyEmergencyContact,
  employeeToForm,
  isEmployeeTabComplete,
  previewNextEmployeeCode,
  validateEmployeeTab,
} from "@/components/hr/hr-shared";
import {
  defaultBranchId,
  shouldShowBranchSelect,
} from "@/components/customers/customer-form";
import { shouldShowMobileFieldAttendance } from "@/lib/sales-settings";

export {
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  buildEmployeeBody,
  buildPaymentAccountApiBody,
};

export function useEmployeeFormResources() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deptRes, posRes, shiftRes, branchRes, userRes, empRes] = await Promise.all([
        apiRequest("/departments", { searchParams: { per_page: 200 } }),
        apiRequest("/positions", { searchParams: { per_page: 200 } }),
        apiRequest("/work-shifts", { searchParams: { per_page: 200 } }),
        apiRequest("/branches", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
        apiRequest("/employees", { searchParams: { per_page: 200 } }),
      ]);
      const orgId = user?.organization_id;
      setDepartments(deptRes.data ?? []);
      setPositions(posRes.data ?? []);
      setShifts(shiftRes.data ?? []);
      setBranches(
        (branchRes.data ?? []).filter((b) => !orgId || b.organization_id === orgId),
      );
      setUsers(userRes.data ?? []);
      setEmployees(empRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  useEffect(() => {
    load();
  }, [load]);

  const showBranchSelect = useMemo(
    () => shouldShowBranchSelect(user, branches),
    [user, branches],
  );

  const defaultBranch = useMemo(() => defaultBranchId(user, branches), [user, branches]);

  return {
    user,
    departments,
    positions,
    shifts,
    branches,
    users,
    employees,
    loading,
    showBranchSelect,
    defaultBranch,
    reload: load,
  };
}

export function resolveEmployeeBranchId(form, user, branches, showBranchSelect) {
  if (showBranchSelect && form.branch_id) return Number(form.branch_id);
  if (user?.branch_id != null) return user.branch_id;
  if (branches.length === 1) return branches[0].id;
  return form.branch_id ? Number(form.branch_id) : null;
}

export async function syncEmployeePaymentAccounts(employeeId, accounts, fullName) {
  const existing = await apiRequest(`/employees/${employeeId}/bank-accounts`);
  const existingList = Array.isArray(existing) ? existing : [];
  const keepIds = new Set(
    accounts.filter((a) => a.id).map((a) => Number(a.id)),
  );

  for (const row of existingList) {
    if (!keepIds.has(row.id)) {
      await apiRequest(`/employees/${employeeId}/bank-accounts/${row.id}`, {
        method: "DELETE",
      });
    }
  }

  for (const acc of accounts) {
    const body = buildPaymentAccountApiBody(acc, fullName);
    if (acc.id) {
      await apiRequest(`/employees/${employeeId}/bank-accounts/${acc.id}`, {
        method: "PUT",
        body,
      });
    } else {
      await apiRequest(`/employees/${employeeId}/bank-accounts`, {
        method: "POST",
        body,
      });
    }
  }
}

export async function syncEmployeeEmergencyContacts(employeeId, contacts) {
  const existing = await apiRequest(`/employees/${employeeId}/emergency-contacts`);
  const existingList = Array.isArray(existing) ? existing : [];
  const filled = (contacts ?? []).filter(
    (c) => c.full_name?.trim() && c.phone?.trim(),
  );
  const keepIds = new Set(filled.filter((c) => c.id).map((c) => Number(c.id)));

  for (const row of existingList) {
    if (!keepIds.has(row.id)) {
      await apiRequest(`/employees/${employeeId}/emergency-contacts/${row.id}`, {
        method: "DELETE",
      });
    }
  }

  for (const contact of filled) {
    const body = {
      full_name: contact.full_name.trim(),
      phone: contact.phone.trim(),
      relationship: contact.relationship?.trim() || null,
      email: contact.email?.trim() || null,
      address: contact.address?.trim() || null,
      is_primary: !!contact.is_primary,
    };
    if (contact.id) {
      await apiRequest(`/employees/${employeeId}/emergency-contacts/${contact.id}`, {
        method: "PUT",
        body,
      });
    } else {
      await apiRequest(`/employees/${employeeId}/emergency-contacts`, {
        method: "POST",
        body,
      });
    }
  }
}

export async function syncEmployeeNextOfKin(employeeId, nextOfKin) {
  const hasData = nextOfKin?.full_name?.trim() && nextOfKin?.phone?.trim();
  if (!hasData) {
    try {
      await apiRequest(`/employees/${employeeId}/next-of-kin`, { method: "DELETE" });
    } catch {
      // No record yet — ignore.
    }
    return;
  }

  await apiRequest(`/employees/${employeeId}/next-of-kin`, {
    method: "PUT",
    body: {
      full_name: nextOfKin.full_name.trim(),
      phone: nextOfKin.phone.trim(),
      relationship: nextOfKin.relationship?.trim() || null,
      national_id: nextOfKin.national_id?.trim() || null,
      address: nextOfKin.address?.trim() || null,
    },
  });
}

function LockedValue({ label, value, hint }) {
  return (
    <Field label={label}>
      <input
        type="text"
        readOnly
        disabled
        value={value}
        className={`${inputClassName()} cursor-not-allowed bg-slate-100 text-slate-600`}
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Field>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

export function EmployeeFormPageShell({ backHref, backLabel, title, subtitle, children }) {
  return (
    <div className="theme-workspace min-h-full">
      <div className="flex w-full min-h-[calc(100vh-8rem)] flex-col">
        <div className="mb-6 shrink-0">
          <Link href={backHref} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
            {backLabel}
          </Link>
          <h1 className="mt-2 text-xl font-medium text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function EmployeeFormWizard({
  mode = "create",
  employeeCode = null,
  form,
  setForm,
  onSubmit,
  saving = false,
  formError = null,
  cancelHref,
  submitLabel = "Save employee",
  departments,
  positions = [],
  shifts = [],
  branches,
  users,
  employees = [],
  showBranchSelect,
  onCreateDepartment,
  employeeId = null,
  photoPreview = null,
  onPhotoSelect,
  onPhotoRemove,
  removingPhoto = false,
}) {
  const [tabIndex, setTabIndex] = useState(0);
  const [tabErrors, setTabErrors] = useState({});
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [deptForm, setDeptForm] = useState(EMPTY_DEPARTMENT_FORM);
  const [deptSaving, setDeptSaving] = useState(false);
  const [deptError, setDeptError] = useState(null);
  const { user, capabilities } = useAuth();
  const fieldAttendanceEnabled = shouldShowMobileFieldAttendance(capabilities);

  const tabOptions = { showBranchSelect };
  const currentTab = EMPLOYEE_FORM_TABS[tabIndex];
  const isLastTab = tabIndex === EMPLOYEE_FORM_TABS.length - 1;

  const previewCode = useMemo(
    () => (mode === "create" ? previewNextEmployeeCode(employees) : employeeCode),
    [mode, employees, employeeCode],
  );

  function canNavigateToTab(targetIndex) {
    if (targetIndex <= tabIndex) return true;
    for (let i = tabIndex; i < targetIndex; i++) {
      if (!isEmployeeTabComplete(EMPLOYEE_FORM_TABS[i].id, form, tabOptions)) {
        return false;
      }
    }
    return true;
  }

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "employment_status") {
        next.is_active = value === "active";
      }
      return next;
    });
    setTabErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function updatePaymentAccount(index, patch) {
    setForm((prev) => {
      const accounts = [...(prev.payment_accounts ?? [])];
      accounts[index] = { ...accounts[index], ...patch };
      return { ...prev, payment_accounts: accounts };
    });
    setTabErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith("payment_")) delete next[k];
      });
      delete next.payment_accounts;
      delete next.payment_primary;
      return next;
    });
  }

  function addPaymentAccount() {
    setForm((prev) => {
      const accounts = [...(prev.payment_accounts ?? [])];
      accounts.push(createEmptyPaymentAccount({ isPrimary: accounts.length === 0 }));
      return { ...prev, payment_accounts: accounts };
    });
  }

  function removePaymentAccount(index) {
    setForm((prev) => {
      const accounts = (prev.payment_accounts ?? []).filter((_, i) => i !== index);
      if (accounts.length === 0) {
        accounts.push(createEmptyPaymentAccount({ isPrimary: true }));
      } else if (!accounts.some((a) => a.is_primary)) {
        accounts[0] = { ...accounts[0], is_primary: true };
      }
      return { ...prev, payment_accounts: accounts };
    });
  }

  function setPrimaryPayment(index) {
    setForm((prev) => ({
      ...prev,
      payment_accounts: (prev.payment_accounts ?? []).map((a, i) => ({
        ...a,
        is_primary: i === index,
      })),
    }));
  }

  function updateEmergencyContact(index, patch) {
    setForm((prev) => {
      const contacts = [...(prev.emergency_contacts ?? [])];
      contacts[index] = { ...contacts[index], ...patch };
      return { ...prev, emergency_contacts: contacts };
    });
    setTabErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith("emergency_") || k.startsWith("nok_")) delete next[k];
      });
      return next;
    });
  }

  function addEmergencyContact() {
    setForm((prev) => ({
      ...prev,
      emergency_contacts: [...(prev.emergency_contacts ?? []), createEmptyEmergencyContact()],
    }));
  }

  function removeEmergencyContact(index) {
    setForm((prev) => {
      const contacts = (prev.emergency_contacts ?? []).filter((_, i) => i !== index);
      if (contacts.length === 0) {
        contacts.push(createEmptyEmergencyContact({ isPrimary: true }));
      } else if (!contacts.some((c) => c.is_primary)) {
        contacts[0] = { ...contacts[0], is_primary: true };
      }
      return { ...prev, emergency_contacts: contacts };
    });
  }

  function setPrimaryEmergency(index) {
    setForm((prev) => ({
      ...prev,
      emergency_contacts: (prev.emergency_contacts ?? []).map((c, i) => ({
        ...c,
        is_primary: i === index,
      })),
    }));
  }

  function updateNextOfKin(patch) {
    setForm((prev) => ({
      ...prev,
      next_of_kin: { ...(prev.next_of_kin ?? {}), ...patch },
    }));
    setTabErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith("nok_")) delete next[k];
      });
      return next;
    });
  }

  function validateCurrentTab() {
    const errors = validateEmployeeTab(currentTab.id, form, tabOptions);
    setTabErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateAllTabs() {
    for (let i = 0; i < EMPLOYEE_FORM_TABS.length; i++) {
      const errors = validateEmployeeTab(EMPLOYEE_FORM_TABS[i].id, form, tabOptions);
      if (Object.keys(errors).length > 0) {
        setTabIndex(i);
        setTabErrors(errors);
        return false;
      }
    }
    return true;
  }

  function goNext() {
    if (!validateCurrentTab()) return;
    setTabIndex((i) => Math.min(i + 1, EMPLOYEE_FORM_TABS.length - 1));
    setTabErrors({});
  }

  function goBack() {
    setTabIndex((i) => Math.max(i - 1, 0));
    setTabErrors({});
  }

  function tryGoToTab(targetIndex) {
    if (!canNavigateToTab(targetIndex)) {
      for (let i = tabIndex; i < targetIndex; i++) {
        const errors = validateEmployeeTab(EMPLOYEE_FORM_TABS[i].id, form, tabOptions);
        if (Object.keys(errors).length > 0) {
          setTabIndex(i);
          setTabErrors(errors);
          return;
        }
      }
      return;
    }
    setTabIndex(targetIndex);
    setTabErrors({});
  }

  async function createDepartment(e) {
    e.preventDefault();
    if (!user?.organization_id) return;
    setDeptSaving(true);
    setDeptError(null);
    try {
      const created = await apiRequest("/departments", {
        method: "POST",
        body: buildDepartmentBody(deptForm, user.organization_id),
      });
      await onCreateDepartment?.(created);
      updateField("department_id", String(created.id));
      setDeptForm(EMPTY_DEPARTMENT_FORM);
      setDeptModalOpen(false);
    } catch (err) {
      setDeptError(err instanceof ApiError ? err.message : "Failed to create department");
    } finally {
      setDeptSaving(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validateAllTabs()) return;
    onSubmit(e);
  }

  return (
    <>
    <form
      onSubmit={handleSubmit}
      className="flex h-full min-h-[min(640px,calc(100vh-12rem))] w-full flex-col theme-panel rounded-xl border shadow-sm"
    >
      <div className="shrink-0 border-b border-slate-200 px-6 pt-6 md:px-8">
        <div className="mb-4 rounded-lg bg-[#E6F1FB]/60 px-3 py-2.5">
          <p className="text-xs font-medium text-slate-500">Employee code</p>
          <p className="font-mono text-sm font-semibold text-[#0C447C]">
            {previewCode ?? "—"}
          </p>
          {mode === "create" && (
            <p className="mt-0.5 text-xs text-slate-500">Auto-assigned when you save</p>
          )}
        </div>
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Employee form tabs">
          {EMPLOYEE_FORM_TABS.map((tab, i) => {
            const canClick = canNavigateToTab(i);
            const isActive = i === tabIndex;
            const done = i < tabIndex;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => canClick && tryGoToTab(i)}
                disabled={!canClick}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-[#185FA5] text-[#185FA5]"
                    : done
                      ? "border-transparent text-slate-700 hover:text-[#185FA5]"
                      : canClick
                        ? "border-transparent text-slate-600 hover:text-[#185FA5]"
                        : "cursor-not-allowed border-transparent text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 md:grid-cols-2 md:p-8 xl:grid-cols-3">
        {currentTab.id === "identity" && (
          <>
            {onPhotoSelect ? (
              <EntityPhotoField
                label="Employee photo"
                fileUrl={employeeId ? employeePhotoFileUrl(employeeId) : null}
                previewUrl={photoPreview ?? form.photo_url ?? null}
                onFileSelect={onPhotoSelect}
                onRemove={
                  form.photo_url || photoPreview ? onPhotoRemove : undefined
                }
                removing={removingPhoto}
              />
            ) : null}
            <Field label="First name" required>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => updateField("first_name", e.target.value)}
                required
                autoFocus
                className={inputClassName()}
                placeholder="John"
              />
              <FieldError message={tabErrors.first_name} />
            </Field>
            <Field label="Middle name">
              <input
                type="text"
                value={form.middle_name}
                onChange={(e) => updateField("middle_name", e.target.value)}
                className={inputClassName()}
                placeholder="Kamau"
              />
            </Field>
            <Field label="Last name" required>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => updateField("last_name", e.target.value)}
                required
                className={inputClassName()}
                placeholder="Mwangi"
              />
              <FieldError message={tabErrors.last_name} />
            </Field>
            <LockedValue label="Nationality" value={LOCKED_NATIONALITY} hint="Kenya only for now" />
            <Field label="National ID">
              <input
                type="text"
                value={form.national_id}
                onChange={(e) => updateField("national_id", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="ID type">
              <select
                value={form.id_document_type}
                onChange={(e) => updateField("id_document_type", e.target.value)}
                className={inputClassName()}
              >
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
              </select>
            </Field>
            <Field label="Gender">
              <select
                value={form.gender}
                onChange={(e) => updateField("gender", e.target.value)}
                className={inputClassName()}
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="undisclosed">Prefer not to say</option>
              </select>
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => updateField("date_of_birth", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="Marital status">
              <select
                value={form.marital_status}
                onChange={(e) => updateField("marital_status", e.target.value)}
                className={inputClassName()}
              >
                <option value="">—</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </>
        )}

        {currentTab.id === "contact" && (
          <>
            <Field label="Mobile number" required>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                required
                autoFocus
                className={inputClassName()}
              />
              <FieldError message={tabErrors.phone} />
            </Field>
            <Field label="Alt. phone">
              <input
                type="tel"
                value={form.alt_phone}
                onChange={(e) => updateField("alt_phone", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="Work email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="Personal email">
              <input
                type="email"
                value={form.personal_email}
                onChange={(e) => updateField("personal_email", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <div className="md:col-span-2 xl:col-span-3">
              <Field label="Physical address">
                <input
                  type="text"
                  value={form.physical_address}
                  onChange={(e) => updateField("physical_address", e.target.value)}
                  className={inputClassName()}
                />
              </Field>
            </div>
            <Field label="City">
              <input
                type="text"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="County">
              <input
                type="text"
                value={form.county}
                onChange={(e) => updateField("county", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <LockedValue label="Country" value={LOCKED_COUNTRY} hint="Kenya only for now" />
          </>
        )}

        {currentTab.id === "employment" && (
          <>
            {showBranchSelect ? (
              <Field label="Branch" required>
                <HrSearchableSelect
                  value={form.branch_id}
                  onChange={(v) => updateField("branch_id", v)}
                  options={branches.map((b) => ({
                    value: String(b.id),
                    label: b.branch_name,
                  }))}
                  placeholder="Search branch…"
                />
                <FieldError message={tabErrors.branch_id} />
              </Field>
            ) : null}
            <Field label="Department" required>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <HrSearchableSelect
                    value={form.department_id}
                    onChange={(v) => updateField("department_id", v)}
                    options={departments.map((d) => ({
                      value: String(d.id),
                      label: d.department_name,
                    }))}
                    placeholder="Search department…"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeptError(null);
                    setDeptForm(EMPTY_DEPARTMENT_FORM);
                    setDeptModalOpen(true);
                  }}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-lg font-medium text-[#185FA5] hover:bg-slate-50"
                  title="Create department"
                >
                  +
                </button>
              </div>
              <FieldError message={tabErrors.department_id} />
            </Field>
            <Field label="Position">
              <HrSearchableSelect
                value={form.position_id}
                onChange={(v) => updateField("position_id", v)}
                options={positions.map((p) => ({
                  value: String(p.id),
                  label: p.position_title,
                }))}
                placeholder="Search position…"
              />
            </Field>
            <Field
              label="Work shift"
              required={form.base_salary !== "" && Number(form.base_salary) > 0}
            >
              <HrSearchableSelect
                value={form.shift_id}
                onChange={(v) => updateField("shift_id", v)}
                options={shifts.map((s) => ({
                  value: String(s.id),
                  label: `${s.shift_name} (${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)})`,
                }))}
                placeholder="Search shift…"
              />
              <p className="mt-1 text-xs text-slate-500">
                {form.base_salary !== "" && Number(form.base_salary) > 0
                  ? "Required for payroll, attendance, and overtime. Controls weekends and holidays."
                  : "Optional for casual or unpaid roles. Add a shift when this employee is on payroll."}
              </p>
              <FieldError message={tabErrors.shift_id} />
            </Field>
            <Field label="Job title" required>
              <input
                type="text"
                value={form.job_title}
                onChange={(e) => updateField("job_title", e.target.value)}
                required
                className={inputClassName()}
                placeholder="e.g. Sales Manager"
              />
              <FieldError message={tabErrors.job_title} />
            </Field>
            <Field label="Employment type">
              <select
                value={form.employment_type}
                onChange={(e) => updateField("employment_type", e.target.value)}
                className={inputClassName()}
              >
                {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Employment status">
              <select
                value={form.employment_status}
                onChange={(e) => updateField("employment_status", e.target.value)}
                className={inputClassName()}
              >
                {EMPLOYMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {form.employment_status !== "active" ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Non-active status marks the employee inactive and automatically disables login for any linked system user (tokens are revoked).
                </p>
              ) : null}
            </Field>
            <Field label="Date hired" required>
              <input
                type="date"
                value={form.hire_date}
                onChange={(e) => updateField("hire_date", e.target.value)}
                required
                className={inputClassName()}
              />
              <FieldError message={tabErrors.hire_date} />
            </Field>
            <Field label="Reporting manager">
              <HrSearchableSelect
                value={form.reports_to_employee_id}
                onChange={(v) => updateField("reports_to_employee_id", v)}
                options={employees.map((e) => ({
                  value: String(e.id),
                  label: e.full_name ?? composeEmployeeDisplayName(e),
                }))}
                placeholder="Search employee…"
              />
            </Field>
            <Field label="Linked system user (optional)">
              <HrSearchableSelect
                value={form.user_id}
                onChange={(v) => updateField("user_id", v)}
                options={users.map((u) => ({
                  value: String(u.id),
                  label: u.full_name ?? u.username,
                }))}
                placeholder="No login linked"
              />
              <p className="mt-1 text-xs text-slate-500">
                Only link a user when this person signs in to Centrix (managers, field reps, etc.).
                Casual workers paid in cash or M-Pesa do not need a linked account.
              </p>
              {fieldAttendanceEnabled && form.user_id ? (
                <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                  Field attendance for this rep will count in HR and payroll through the linked login.
                </p>
              ) : null}
            </Field>
            <Field label="Confirmation date">
              <input
                type="date"
                value={form.confirmation_date}
                onChange={(e) => updateField("confirmation_date", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="Contract end">
              <input
                type="date"
                value={form.contract_end_date}
                onChange={(e) => updateField("contract_end_date", e.target.value)}
                className={inputClassName()}
              />
            </Field>
          </>
        )}

        {currentTab.id === "payment" && (
          <div className="space-y-4 md:col-span-2 xl:col-span-3">
            <p className="text-sm text-slate-600">
              How this employee is paid. Add multiple bank accounts if needed; mark one as
              primary. Casual staff often use M-Pesa or cash.
            </p>
            {form.employment_type === "casual" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Casual workers: choose M-Pesa or Cash if they are not paid by bank transfer.
              </p>
            )}
            <FieldError message={tabErrors.payment_accounts} />
            <FieldError message={tabErrors.payment_primary} />
            {(form.payment_accounts ?? []).map((acc, index) => (
              <PaymentAccountCard
                key={acc._key ?? index}
                index={index}
                account={acc}
                tabErrors={tabErrors}
                canRemove={(form.payment_accounts?.length ?? 0) > 1}
                onUpdate={(patch) => updatePaymentAccount(index, patch)}
                onRemove={() => removePaymentAccount(index)}
                onSetPrimary={() => setPrimaryPayment(index)}
                suggestAccountName={composeEmployeeDisplayName(form)}
              />
            ))}
            <button
              type="button"
              onClick={addPaymentAccount}
              className="text-sm font-medium text-[#185FA5] hover:text-[#144f8a]"
            >
              + Add another bank or payment method
            </button>
          </div>
        )}

        {currentTab.id === "emergency" && (
          <div className="space-y-6 md:col-span-2 xl:col-span-3">
            <div>
              <h3 className="text-sm font-medium text-slate-900">Emergency contacts</h3>
              <p className="mt-1 text-xs text-slate-500">
                People to call in an emergency. Mark one as primary for payroll and HR records.
              </p>
              <div className="mt-4 space-y-4">
                {(form.emergency_contacts ?? []).map((contact, index) => (
                  <EmergencyContactCard
                    key={contact._key ?? index}
                    index={index}
                    contact={contact}
                    tabErrors={tabErrors}
                    canRemove={(form.emergency_contacts?.length ?? 0) > 1}
                    onUpdate={(patch) => updateEmergencyContact(index, patch)}
                    onRemove={() => removeEmergencyContact(index)}
                    onSetPrimary={() => setPrimaryEmergency(index)}
                  />
                ))}
                <button
                  type="button"
                  onClick={addEmergencyContact}
                  className="text-sm font-medium text-[#185FA5] hover:text-[#144f8a]"
                >
                  + Add emergency contact
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-sm font-medium text-slate-900">Next of kin</h3>
              <p className="mt-1 text-xs text-slate-500">One beneficiary record per employee.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Full name">
                  <input
                    type="text"
                    value={form.next_of_kin?.full_name ?? ""}
                    onChange={(e) => updateNextOfKin({ full_name: e.target.value })}
                    className={inputClassName()}
                  />
                  <FieldError message={tabErrors.nok_full_name} />
                </Field>
                <Field label="Relationship">
                  <input
                    type="text"
                    value={form.next_of_kin?.relationship ?? ""}
                    onChange={(e) => updateNextOfKin({ relationship: e.target.value })}
                    className={inputClassName()}
                    placeholder="e.g. Spouse, Parent"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    type="tel"
                    value={form.next_of_kin?.phone ?? ""}
                    onChange={(e) => updateNextOfKin({ phone: e.target.value })}
                    className={inputClassName()}
                  />
                  <FieldError message={tabErrors.nok_phone} />
                </Field>
                <Field label="National ID">
                  <input
                    type="text"
                    value={form.next_of_kin?.national_id ?? ""}
                    onChange={(e) => updateNextOfKin({ national_id: e.target.value })}
                    className={inputClassName()}
                  />
                </Field>
                <div className="md:col-span-2 xl:col-span-3">
                  <Field label="Address">
                    <input
                      type="text"
                      value={form.next_of_kin?.address ?? ""}
                      onChange={(e) => updateNextOfKin({ address: e.target.value })}
                      className={inputClassName()}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentTab.id === "payroll" && (
          <>
            <Field label="Basic salary (KES / month)" required>
              <input
                type="number"
                value={form.base_salary}
                onChange={(e) => updateField("base_salary", e.target.value)}
                min="0"
                step="1"
                required
                autoFocus
                className={inputClassName()}
              />
              <FieldError message={tabErrors.base_salary} />
            </Field>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Add housing, transport, and other monthly allowances under{" "}
              <strong>HR → Allowances</strong>. Payroll sums active allowance lines per employee.
            </p>
            <Field label="Pay frequency">
              <select
                value={form.pay_frequency}
                onChange={(e) => updateField("pay_frequency", e.target.value)}
                className={inputClassName()}
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="weekly">Weekly</option>
              </select>
            </Field>
            <Field label="KRA PIN">
              <input
                type="text"
                value={form.kra_pin}
                onChange={(e) => updateField("kra_pin", e.target.value.toUpperCase())}
                className={`${inputClassName()} font-mono`}
              />
            </Field>
            <Field label="NSSF number">
              <input
                type="text"
                value={form.nssf_number}
                onChange={(e) => updateField("nssf_number", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="SHA / SHIF number">
              <input
                type="text"
                value={form.sha_number}
                onChange={(e) => updateField("sha_number", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="Housing levy number">
              <input
                type="text"
                value={form.housing_levy_number}
                onChange={(e) => updateField("housing_levy_number", e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <p className="text-xs text-slate-500 md:col-span-2 xl:col-span-3">
              PAYE, NSSF, SHIF, and Housing Levy are calculated automatically when payroll is
              processed.
            </p>
          </>
        )}
      </div>

      {formError && (
        <p className="mx-6 mb-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 md:mx-8">
          {formError}
        </p>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-6 py-5 md:px-8">
        <Link
          href={cancelHref}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <div className="flex gap-2">
          {tabIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
          )}
          {!isLastTab ? (
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
            >
              {saving ? "Saving…" : submitLabel}
            </button>
          )}
        </div>
      </div>
    </form>
    <EmployeeDepartmentModal
      open={deptModalOpen}
      onClose={() => {
        setDeptModalOpen(false);
        setDeptError(null);
      }}
      deptForm={deptForm}
      setDeptForm={setDeptForm}
      deptError={deptError}
      deptSaving={deptSaving}
      onSubmit={createDepartment}
    />
    </>
  );
}

function EmployeeDepartmentModal({
  open,
  onClose,
  deptForm,
  setDeptForm,
  deptError,
  deptSaving,
  onSubmit,
}) {
  return (
    <FormModal
      title="Create department"
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      saving={deptSaving}
      error={deptError}
      submitLabel="Create department"
    >
      <Field label="Department name" required>
        <input
          type="text"
          value={deptForm.department_name}
          onChange={(e) => setDeptForm((p) => ({ ...p, department_name: e.target.value }))}
          required
          autoFocus
          className={inputClassName()}
        />
      </Field>
      <Field label="Department code (optional)">
        <input
          type="text"
          value={deptForm.department_code}
          onChange={(e) =>
            setDeptForm((p) => ({ ...p, department_code: e.target.value.toUpperCase() }))
          }
          className={`${inputClassName()} font-mono`}
        />
      </Field>
    </FormModal>
  );
}

function PaymentAccountCard({
  index,
  account,
  tabErrors,
  canRemove,
  onUpdate,
  onRemove,
  onSetPrimary,
  suggestAccountName,
}) {
  const method = account.payment_method || "bank_transfer";
  const isBank = method === "bank_transfer" || method === "cheque";
  const bankListId = `kenya-banks-${index}`;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-5 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">
          Payment {index + 1}
          {account.is_primary ? (
            <span className="ml-2 rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[11px] font-medium text-[#0C447C]">
              Primary
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="radio"
              name="payment_primary"
              checked={!!account.is_primary}
              onChange={onSetPrimary}
            />
            Primary payroll
          </label>
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Payment method">
          <select
            value={method}
            onChange={(e) => onUpdate({ payment_method: e.target.value })}
            className={inputClassName()}
          >
            {PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {isBank ? (
          <>
            <Field label="Bank">
              <input
                type="text"
                list={bankListId}
                value={account.bank_name}
                onChange={(e) => onUpdate({ bank_name: e.target.value })}
                placeholder="Select or type bank name"
                className={inputClassName()}
              />
              <datalist id={bankListId}>
                {KENYA_BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <FieldError message={tabErrors[`payment_${index}_bank_name`]} />
            </Field>
            <Field label="Branch">
              <input
                type="text"
                value={account.bank_branch}
                onChange={(e) => onUpdate({ bank_branch: e.target.value })}
                className={inputClassName()}
                placeholder="e.g. Westlands"
              />
            </Field>
            <Field label="Account number">
              <input
                type="text"
                value={account.account_number}
                onChange={(e) => onUpdate({ account_number: e.target.value })}
                className={`${inputClassName()} font-mono`}
              />
              <FieldError message={tabErrors[`payment_${index}_account_number`]} />
            </Field>
            <Field label="Account name">
              <input
                type="text"
                value={account.account_name}
                onChange={(e) => onUpdate({ account_name: e.target.value })}
                placeholder={suggestAccountName || "As on bank account"}
                className={inputClassName()}
              />
              <FieldError message={tabErrors[`payment_${index}_account_name`]} />
            </Field>
          </>
        ) : null}
        {method === "mpesa" ? (
          <>
            <Field label="M-Pesa phone number">
              <input
                type="tel"
                value={account.account_number}
                onChange={(e) => onUpdate({ account_number: e.target.value })}
                placeholder="e.g. 0712345678"
                className={inputClassName()}
              />
              <FieldError message={tabErrors[`payment_${index}_account_number`]} />
            </Field>
            <Field label="Name on M-Pesa">
              <input
                type="text"
                value={account.account_name}
                onChange={(e) => onUpdate({ account_name: e.target.value })}
                placeholder={suggestAccountName || "Registered name"}
                className={inputClassName()}
              />
              <FieldError message={tabErrors[`payment_${index}_account_name`]} />
            </Field>
          </>
        ) : null}
        {method === "cash" ? (
          <div className="md:col-span-2 xl:col-span-3">
            <Field label="Payee name (for cash payroll)">
              <input
                type="text"
                value={account.account_name}
                onChange={(e) => onUpdate({ account_name: e.target.value })}
                placeholder={suggestAccountName || "Full name"}
                className={inputClassName()}
              />
              <FieldError message={tabErrors[`payment_${index}_account_name`]} />
            </Field>
            <p className="mt-1 text-xs text-slate-500">
              No bank details required. Payroll will be recorded as cash payment.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmergencyContactCard({
  index,
  contact,
  tabErrors,
  canRemove,
  onUpdate,
  onRemove,
  onSetPrimary,
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">
          Contact {index + 1}
          {contact.is_primary ? (
            <span className="ml-2 rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[11px] font-medium text-[#0C447C]">
              Primary
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="radio"
              name="emergency_primary"
              checked={!!contact.is_primary}
              onChange={onSetPrimary}
            />
            Primary
          </label>
          {canRemove ? (
            <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:text-red-800">
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Full name">
          <input
            type="text"
            value={contact.full_name}
            onChange={(e) => onUpdate({ full_name: e.target.value })}
            className={inputClassName()}
          />
          <FieldError message={tabErrors[`emergency_${index}_full_name`]} />
        </Field>
        <Field label="Relationship">
          <input
            type="text"
            value={contact.relationship}
            onChange={(e) => onUpdate({ relationship: e.target.value })}
            className={inputClassName()}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={contact.phone}
            onChange={(e) => onUpdate({ phone: e.target.value })}
            className={inputClassName()}
          />
          <FieldError message={tabErrors[`emergency_${index}_phone`]} />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={contact.email}
            onChange={(e) => onUpdate({ email: e.target.value })}
            className={inputClassName()}
          />
        </Field>
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Address">
            <input
              type="text"
              value={contact.address}
              onChange={(e) => onUpdate({ address: e.target.value })}
              className={inputClassName()}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
