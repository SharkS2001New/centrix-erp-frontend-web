"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  buildSupplierBody,
  SupplierFormCard,
  SupplierFormFields,
  SupplierFormPageShell,
  supplierToForm,
} from "@/components/suppliers/supplier-form";
import { formDraftKey } from "@/stores/form-drafts";
import { useFormDraft } from "@/hooks/use-form-draft";

export function SuppliersIdEditScreen() {
  const params = useParams();
  const router = useRouter();
  const supplierId = params.id;

  const [form, setForm] = useState(null);
  const [serverForm, setServerForm] = useState(null);
  const [supplierCode, setSupplierCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  const isBaseline = useCallback(
    (value) => {
      if (!serverForm || !value) return true;
      return JSON.stringify(value) === JSON.stringify(serverForm);
    },
    [serverForm],
  );

  const { clearDraft } = useFormDraft({
    draftKey: supplierId ? formDraftKey("supplier", supplierId) : null,
    value: form,
    setValue: setForm,
    enabled: !loading && form != null && serverForm != null,
    isBaseline,
  });

  const loadSupplier = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const supplier = await apiRequest(`/suppliers/${supplierId}`);
      const next = supplierToForm(supplier);
      setServerForm(next);
      setForm(next);
      setSupplierCode(supplier.supplier_code ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load supplier");
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    loadSupplier();
  }, [loadSupplier]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSupplier(e) {
    e.preventDefault();
    if (!form?.supplier_name?.trim()) {
      setFormError("Supplier name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}`, {
        method: "PUT",
        body: buildSupplierBody(form),
      });
      clearDraft();
      router.push(`/suppliers/${supplierId}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SupplierFormPageShell
      backHref={`/suppliers/${supplierId}`}
      backLabel="← Back to supplier"
      title="Edit supplier"
      subtitle="Update supplier details"
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : form ? (
        <SupplierFormCard
          onSubmit={saveSupplier}
          actions={
            <>
              {formError && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              )}
              <div className="mt-6 flex gap-2 border-t border-slate-200 pt-4">
                <Link
                  href={`/suppliers/${supplierId}`}
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
          <SupplierFormFields
            form={form}
            onChange={updateField}
            supplierCode={supplierCode}
          />
        </SupplierFormCard>
      ) : null}
    </SupplierFormPageShell>
  );
}
