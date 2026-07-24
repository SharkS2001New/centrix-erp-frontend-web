"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError, uploadEmployeePhoto } from "@/lib/api";
import { invalidateReferenceResource } from "@/lib/reference-data-cache";
import {
  EMPTY_EMPLOYEE_FORM,
  EmployeeFormPageShell,
  EmployeeFormWizard,
  buildEmployeeBody,
  resolveEmployeeBranchId,
  syncEmployeePaymentAccounts,
  syncEmployeeEmergencyContacts,
  syncEmployeeNextOfKin,
  useEmployeeFormResources,
} from "@/components/hr/employee-form";
import { composeEmployeeDisplayName } from "@/components/hr/hr-shared";

export function HrEmployeesNewScreen() {
  const router = useRouter();
  const {
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
    reload,
  } = useEmployeeFormResources();

  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!loading && defaultBranch) {
      setForm((prev) => (prev.branch_id ? prev : { ...prev, branch_id: defaultBranch }));
    }
  }, [loading, defaultBranch]);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  function onPhotoSelect(file) {
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

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
      invalidateReferenceResource("employees-lean", user.organization_id);
      await syncEmployeePaymentAccounts(
        created.id,
        form.payment_accounts ?? [],
        composeEmployeeDisplayName(form),
      );
      await syncEmployeeEmergencyContacts(created.id, form.emergency_contacts ?? []);
      await syncEmployeeNextOfKin(created.id, form.next_of_kin);
      if (photoFile) {
        await uploadEmployeePhoto(created.id, photoFile);
      }
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
            positions={positions}
            shifts={shifts}
            branches={branches}
          users={users}
          employees={employees}
          showBranchSelect={showBranchSelect}
          onCreateDepartment={async () => reload()}
          photoPreview={photoPreview}
          onPhotoSelect={onPhotoSelect}
        />
      )}
    </EmployeeFormPageShell>
  );
}
