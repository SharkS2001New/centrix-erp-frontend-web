"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError, uploadCustomerShopImage } from "@/lib/api";
import {
  buildCustomerBody,
  CustomerFormCard,
  CustomerFormFields,
  CustomerFormPageShell,
  EMPTY_CUSTOMER_FORM,
  resolveFormBranchId,
  updateCustomerFormField,
  useCustomerFormResources,
  validateCustomerLocationFields,
} from "@/components/customers/customer-form";

export default function NewCustomerPage() {
  const router = useRouter();
  const { user, routes, branches, loading, showBranchSelect, defaultBranch } =
    useCustomerFormResources();

  const [form, setForm] = useState(EMPTY_CUSTOMER_FORM);
  const [shopImageFile, setShopImageFile] = useState(null);
  const [shopImagePreview, setShopImagePreview] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!loading && defaultBranch) {
      setForm((prev) => (prev.branch_id ? prev : { ...prev, branch_id: defaultBranch }));
    }
  }, [loading, defaultBranch]);

  useEffect(() => {
    return () => {
      if (shopImagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(shopImagePreview);
      }
    };
  }, [shopImagePreview]);

  function updateField(key, value) {
    setLocationError(null);
    setForm((prev) => updateCustomerFormField(prev, key, value));
  }

  function onShopImageSelect(file) {
    if (shopImagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(shopImagePreview);
    }
    setShopImageFile(file);
    setShopImagePreview(URL.createObjectURL(file));
  }

  async function saveCustomer(e) {
    e.preventDefault();
    if (!user?.organization_id) {
      setFormError("Your user profile is missing organization.");
      return;
    }

    const locErr = validateCustomerLocationFields(form);
    if (locErr) {
      setLocationError(locErr);
      return;
    }

    const branchId = resolveFormBranchId(form, user, branches, showBranchSelect);
    if (!branchId) {
      setFormError("Please select a branch.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setLocationError(null);
    try {
      const created = await apiRequest("/customers", {
        method: "POST",
        body: {
          ...buildCustomerBody(form),
          branch_id: branchId,
          organization_id: user.organization_id,
          created_by: user.id,
        },
      });
      if (shopImageFile) {
        await uploadCustomerShopImage(created.customer_num, shopImageFile);
      }
      router.push(`/customers/${created.customer_num}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CustomerFormPageShell
      backHref="/customers"
      backLabel="← Back to customers"
      title="Add customer"
      subtitle="Create a new debtor or route customer"
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <CustomerFormCard
          onSubmit={saveCustomer}
          actions={
            <>
              {formError && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              )}
              <div className="mt-6 flex gap-2 border-t border-slate-200 pt-4">
                <Link
                  href="/customers"
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#185FA5] px-6 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Add customer"}
                </button>
              </div>
            </>
          }
        >
          <CustomerFormFields
            form={form}
            routes={routes}
            branches={branches}
            showBranchSelect={showBranchSelect}
            onChange={updateField}
            shopImagePreview={shopImagePreview}
            onShopImageSelect={onShopImageSelect}
            locationError={locationError}
          />
        </CustomerFormCard>
      )}
    </CustomerFormPageShell>
  );
}
