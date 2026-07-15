"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError, uploadEmployeePhoto } from "@/lib/api";
import {
  EmployeeFormPageShell,
  EmployeeFormWizard,
  buildEmployeeBody,
  employeeToForm,
  resolveEmployeeBranchId,
  syncEmployeePaymentAccounts,
  syncEmployeeEmergencyContacts,
  syncEmployeeNextOfKin,
  useEmployeeFormResources,
} from "@/components/hr/employee-form";
import { composeEmployeeDisplayName } from "@/components/hr/hr-shared";
import { confirmRemoveOptions, useConfirm } from "@/lib/use-confirm";

export function HrEmployeesIdEditScreen() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const employeeId = params.id;

  const {
    user,
    departments,
    positions,
    shifts,
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
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    try {
      const employee = await apiRequest(`/employees/${employeeId}`);
      setOrganizationId(employee.organization_id);
      setEmployeeCode(employee.employee_code);
      setForm(employeeToForm(employee));
      setPhotoPreview(null);
      setPhotoFile(null);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

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

  async function removePhoto() {
    const ok = await confirm(confirmRemoveOptions("the employee photo"));
    if (!ok) return;
    setRemovingPhoto(true);
    setFormError(null);
    try {
      const updated = await apiRequest(`/employees/${employeeId}/photo`, { method: "DELETE" });
      setForm((prev) => ({ ...prev, photo_url: updated.photo_url ?? "" }));
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
      setPhotoFile(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to remove photo");
    } finally {
      setRemovingPhoto(false);
    }
  }

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
        composeEmployeeDisplayName(form),
      );
      await syncEmployeeEmergencyContacts(employeeId, form.emergency_contacts ?? []);
      await syncEmployeeNextOfKin(employeeId, form.next_of_kin);
      if (photoFile) {
        await uploadEmployeePhoto(employeeId, photoFile);
      }
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
      {pageLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : form ? (
        <EmployeeFormWizard
          mode="edit"
          employeeCode={employeeCode}
          employeeId={employeeId}
          form={form}
          setForm={setForm}
          onSubmit={saveEmployee}
          saving={saving}
          formError={formError}
          cancelHref={`/hr/employees/${employeeId}`}
          submitLabel="Save changes"
            departments={departments}
            positions={positions}
            shifts={shifts}
            branches={branches}
          users={users}
          employees={employees.filter((e) => String(e.id) !== String(employeeId))}
          showBranchSelect={showBranchSelect}
          onCreateDepartment={async () => reload()}
          photoPreview={photoPreview}
          onPhotoSelect={onPhotoSelect}
          onPhotoRemove={removePhoto}
          removingPhoto={removingPhoto}
        />
      ) : null}
    </EmployeeFormPageShell>
  );
}
