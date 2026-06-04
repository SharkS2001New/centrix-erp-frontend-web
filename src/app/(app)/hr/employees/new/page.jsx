"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  EMPTY_EMPLOYEE_FORM,
  EmployeeFormPageShell,
  EmployeeFormWizard,
  buildEmployeeBody,
  resolveEmployeeBranchId,
  syncEmployeePaymentAccounts,
  useEmployeeFormResources,
} from "@/components/hr/employee-form";

export default function NewEmployeePage() {
  const router = useRouter();
  const {
    user,
    departments,
    branches,
    users,
    employees,
    loading,
    showBranchSelect,
    defaultBranch,
    reload,
  } = useEmployeeFormResources();

  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!loading && defaultBranch) {
      setForm((prev) => (prev.branch_id ? prev : { ...prev, branch_id: defaultBranch }));
    }
  }, [loading, defaultBranch]);

  async function saveEmployee(e) {
    e.preventDefault();
    if (!user?.organization_id) {
      setFormError("Your user profile is missing an organization.");
      return;
    }
    const branchId = resolveEmployeeBranchId(form, user, branches, showBranchSelect);
    setSaving(true);
    setFormError(null);
    try {
      const created = await apiRequest("/employees", {
        method: "POST",
        body: buildEmployeeBody(form, user.organization_id, branchId),
      });
      await syncEmployeePaymentAccounts(
        created.id,
        form.payment_accounts ?? [],
        form.full_name,
      );
      router.push(`/hr/employees/${created.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <EmployeeFormPageShell
      backHref="/hr/employees"
      backLabel="← Back to employees"
      title="Add employee"
      subtitle="Complete each tab in order — employee code is assigned automatically"
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <EmployeeFormWizard
          mode="create"
          form={form}
          setForm={setForm}
          onSubmit={saveEmployee}
          saving={saving}
          formError={formError}
          cancelHref="/hr/employees"
          submitLabel="Save employee"
          departments={departments}
          branches={branches}
          users={users}
          employees={employees}
          showBranchSelect={showBranchSelect}
          onCreateDepartment={async () => reload()}
        />
      )}
    </EmployeeFormPageShell>
  );
}
