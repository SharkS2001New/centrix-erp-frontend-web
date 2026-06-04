"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, FormModal, inputClassName } from "@/components/catalog/catalog-shared";
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
  createEmptyPaymentAccount,
  employeeToForm,
  isEmployeeTabComplete,
  previewNextEmployeeCode,
  validateEmployeeTab,
} from "@/components/hr/hr-shared";
import {
  defaultBranchId,
  shouldShowBranchSelect,
} from "@/components/customers/customer-form";

export {
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  buildEmployeeBody,
  buildPaymentAccountApiBody,
  useEmployeeFormResources,
  resolveEmployeeBranchId,
  syncEmployeePaymentAccounts,
};

export function useEmployeeFormResources() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deptRes, branchRes, userRes, empRes] = await Promise.all([
        apiRequest("/departments", { searchParams: { per_page: 200 } }),
        apiRequest("/branches", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
        apiRequest("/employees", { searchParams: { per_page: 200 } }),
      ]);
      const orgId = user?.organization_id;
      setDepartments(deptRes.data ?? []);
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
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
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
  branches,
  users,
  employees = [],
  showBranchSelect,
  onCreateDepartment,
}) {
  const [tabIndex, setTabIndex] = useState(0);
  const [tabErrors, setTabErrors] = useState({});
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [deptForm, setDeptForm] = useState(EMPTY_DEPARTMENT_FORM);
  const [deptSaving, setDeptSaving] = useState(false);
  const [deptError, setDeptError] = useState(null);
  const { user } = useAuth();

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
    <form
      onSubmit={handleSubmit}
      className="flex h-full min-h-[min(640px,calc(100vh-12rem))] w-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm"
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
            <div className="md:col-span-2 xl:col-span-3">
              <Field label="Full name">
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  required
                  autoFocus
                  className={inputClassName()}
                  placeholder="e.g. John Kamau Mwangi"
                />
                <FieldError message={tabErrors.full_name} />
              </Field>
            </div>
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
            <Field label="Mobile number">
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
              <Field label="Branch">
                <select
                  value={form.branch_id}
                  onChange={(e) => updateField("branch_id", e.target.value)}
                  className={inputClassName()}
                >
                  <option value="">Select branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.branch_name}
                    </option>
                  ))}
                </select>
                <FieldError message={tabErrors.branch_id} />
              </Field>
            ) : null}
            <Field label="Department">
              <div className="flex gap-2">
                <select
                  value={form.department_id}
                  onChange={(e) => updateField("department_id", e.target.value)}
                  className={`${inputClassName()} min-w-0 flex-1`}
                >
                  <option value="">Select department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.department_name}
                    </option>
                  ))}
                </select>
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
            <Field label="Job title">
              <input
                type="text"
                value={form.job_title}
                onChange={(e) => updateField("job_title", e.target.value)}
                required
                className={inputClassName()}
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
            </Field>
            <Field label="Date hired">
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
              <select
                value={form.reports_to_employee_id}
                onChange={(e) => updateField("reports_to_employee_id", e.target.value)}
                className={inputClassName()}
              >
                <option value="">None</option>
                {employees.map((e) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Linked system user">
              <select
                value={form.user_id}
                onChange={(e) => updateField("user_id", e.target.value)}
                className={inputClassName()}
              >
                <option value="">None</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.full_name ?? u.username}
                  </option>
                ))}
              </select>
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
                suggestAccountName={form.full_name?.trim()}
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

        {currentTab.id === "payroll" && (
          <>
            <Field label="Basic salary (KES / month)">
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

      <FormModal
        title="Create department"
        open={deptModalOpen}
        onClose={() => {
          setDeptModalOpen(false);
          setDeptError(null);
        }}
        onSubmit={createDepartment}
        saving={deptSaving}
        error={deptError}
        submitLabel="Create department"
      >
        <Field label="Department name">
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
    </form>
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
