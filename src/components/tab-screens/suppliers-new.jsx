"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  buildSupplierBody,
  EMPTY_SUPPLIER_FORM,
  SupplierFormCard,
  SupplierFormFields,
  SupplierFormPageShell,
} from "@/components/suppliers/supplier-form";
import { formDraftKey } from "@/stores/form-drafts";
import { useFormDraft } from "@/hooks/use-form-draft";

export function SuppliersNewScreen() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const isBaseline = useCallback(
    (value) => JSON.stringify(value) === JSON.stringify(EMPTY_SUPPLIER_FORM),
    [],
  );

  const { clearDraft } = useFormDraft({
    draftKey: formDraftKey("supplier", "new"),
    value: form,
    setValue: setForm,
    isBaseline,
  });

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSupplier(e) {
    e.preventDefault();
    if (!form.supplier_name.trim()) {
      setFormError("Supplier name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await apiRequest("/suppliers", {
        method: "POST",
        body: buildSupplierBody(form),
      });
      clearDraft();
      router.push(`/suppliers/${created.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SupplierFormPageShell
      backHref="/suppliers"
      backLabel="← Back to suppliers"
      title="Add supplier"
      subtitle="Create a new supplier for purchases and accounts payable"
    >
      <SupplierFormCard
        onSubmit={saveSupplier}
        actions={
          <>
            {formError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            )}
            <div className="mt-6 flex gap-2 border-t border-slate-200 pt-4">
              <Link
                href="/suppliers"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#185FA5] px-6 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add supplier"}
              </button>
            </div>
          </>
        }
      >
        <SupplierFormFields form={form} onChange={updateField} />
      </SupplierFormCard>
    </SupplierFormPageShell>
  );
}
