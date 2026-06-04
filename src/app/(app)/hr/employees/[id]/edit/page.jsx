"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  EmployeeFormPageShell,
  EmployeeFormWizard,
  buildEmployeeBody,
  employeeToForm,
  resolveEmployeeBranchId,
  syncEmployeePaymentAccounts,
  useEmployeeFormResources,
} from "@/components/hr/employee-form";

export default function EditEmployeePage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.id;

  const {
    user,
    departments,
    branches,
    users,
    employees,
    loading: resourcesLoading,
    showBranchSelect,
    reload,
  } = useEmployeeFormResources();

  const [form, setForm] = useState(null);
  const [employeeCode, setEmployeeCode] = useState(null);
  const [organizationId, setOrganizationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const loadEmployee = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const employee = await apiRequest(`/employees/${employeeId}`);
      setOrganizationId(employee.organization_id);
      setEmployeeCode(employee.employee_code);
      setForm(employeeToForm(employee));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  async function saveEmployee(e) {
    e.preventDefault();
    const branchId = resolveEmployeeBranchId(form, user, branches, showBranchSelect);
    setSaving(true);
    setFormError(null);
    try {
      await apiRequest(`/employees/${employeeId}`, {
        method: "PUT",
        body: buildEmployeeBody(form, organizationId ?? user.organization_id, branchId, {
          isEdit: true,
          employeeCode,
        }),
      });
      await syncEmployeePaymentAccounts(
        employeeId,
        form.payment_accounts ?? [],
        form.full_name,
      );
      router.push(`/hr/employees/${employeeId}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const pageLoading = loading || resourcesLoading;

  return (
    <EmployeeFormPageShell
      backHref={`/hr/employees/${employeeId}`}
      backLabel="← Back to profile"
      title="Edit employee"
      subtitle="Update details tab by tab"
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {pageLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : form ? (
        <EmployeeFormWizard
          mode="edit"
          employeeCode={employeeCode}
          form={form}
          setForm={setForm}
          onSubmit={saveEmployee}
          saving={saving}
          formError={formError}
          cancelHref={`/hr/employees/${employeeId}`}
          submitLabel="Save changes"
          departments={departments}
          branches={branches}
          users={users}
          employees={employees.filter((e) => String(e.id) !== String(employeeId))}
          showBranchSelect={showBranchSelect}
          onCreateDepartment={async () => reload()}
        />
      ) : null}
    </EmployeeFormPageShell>
  );
}
