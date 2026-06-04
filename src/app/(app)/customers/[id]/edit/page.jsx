"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  buildCustomerBody,
  CustomerFormCard,
  CustomerFormFields,
  CustomerFormPageShell,
  customerToForm,
  resolveFormBranchId,
  updateCustomerFormField,
  useCustomerFormResources,
} from "@/components/customers/customer-form";

export default function EditCustomerPage() {
  const params = useParams();
  const router = useRouter();
  const customerNum = params.id;

  const { user, routes, branches, loading: resourcesLoading, showBranchSelect } =
    useCustomerFormResources();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const loadCustomer = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const customer = await apiRequest(`/customers/${customerNum}`);
      setForm(customerToForm(customer));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  }, [customerNum]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  function updateField(key, value) {
    setForm((prev) => updateCustomerFormField(prev, key, value));
  }

  async function saveCustomer(e) {
    e.preventDefault();

    const branchId = resolveFormBranchId(form, user, branches, showBranchSelect);
    if (!branchId) {
      setFormError("Please select a branch.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await apiRequest(`/customers/${customerNum}`, {
        method: "PUT",
        body: {
          ...buildCustomerBody(form),
          branch_id: branchId,
        },
      });
      router.push(`/customers/${customerNum}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const pageLoading = loading || resourcesLoading;

  return (
    <CustomerFormPageShell
      backHref={`/customers/${customerNum}`}
      backLabel="← Back to profile"
      title="Edit customer"
      subtitle="Update customer details and save changes"
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {pageLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : form ? (
        <CustomerFormCard
          onSubmit={saveCustomer}
          actions={
            <>
              {formError && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              )}
              <div className="mt-6 flex gap-2 border-t border-slate-200 pt-4">
                <Link
                  href={`/customers/${customerNum}`}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#185FA5] px-6 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
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
            customerNum={customerNum}
          />
        </CustomerFormCard>
      ) : null}
    </CustomerFormPageShell>
  );
}
