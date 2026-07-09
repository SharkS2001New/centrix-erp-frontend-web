"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError, apiUploadForm } from "@/lib/api";
import { Field, FormModal, inputClassName } from "@/components/catalog/catalog-shared";
import { lpoSupplierInvoiceFilePath } from "./lpo-supplier-invoice-doc";
import { ProtectedFileLink } from "@/components/media/protected-file-preview";

const EMPTY = {
  supplier_invoice_number: "",
  invoice_date: new Date().toISOString().slice(0, 10),
};

export function SupplierInvoiceModal({
  open,
  onClose,
  onSaved,
  lpoNo,
  supplierId,
  invoice = null,
}) {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFile(null);
    if (invoice) {
      setForm({
        supplier_invoice_number: invoice.supplier_invoice_number ?? "",
        invoice_date: invoice.invoice_date ?? EMPTY.invoice_date,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, invoice]);

  async function submit(e) {
    e.preventDefault();
    if (!form.supplier_invoice_number.trim()) {
      setError("Supplier invoice number is required.");
      return;
    }
    if (!invoice?.id && !file) {
      setError("Attach the supplier invoice document (PDF or image).");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const fields = {
        lpo_no: Number(lpoNo),
        supplier_id: Number(supplierId),
        supplier_invoice_number: form.supplier_invoice_number.trim(),
        invoice_date: form.invoice_date || null,
      };

      if (invoice?.id) {
        if (file) {
          await apiUploadForm(`/lpo-supplier-invoices/${invoice.id}/document`, { file });
        }
        await apiRequest(`/lpo-supplier-invoices/${invoice.id}`, {
          method: "PATCH",
          body: {
            supplier_invoice_number: fields.supplier_invoice_number,
            invoice_date: fields.invoice_date,
          },
        });
      } else {
        await apiUploadForm("/lpo-supplier-invoices", { ...fields, file });
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={invoice ? "Edit supplier invoice" : "Add supplier invoice"}
      open={open}
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={error}
      submitLabel={invoice ? "Save changes" : "Attach document"}
    >
      <Field label="Supplier invoice #">
        <input
          className={inputClassName()}
          value={form.supplier_invoice_number}
          onChange={(e) => setForm((p) => ({ ...p, supplier_invoice_number: e.target.value }))}
          required
        />
      </Field>
      <Field label="Invoice date">
        <input
          type="date"
          className={inputClassName()}
          value={form.invoice_date}
          onChange={(e) => setForm((p) => ({ ...p, invoice_date: e.target.value }))}
        />
      </Field>
      <Field label="Supplier invoice document (PDF or image)">
        <input
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          className={inputClassName()}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {invoice?.has_document ? (
          <ProtectedFileLink
            filePath={lpoSupplierInvoiceFilePath(invoice.id)}
            label={`View current document (${invoice.file_name || "attached"})`}
            title="Supplier invoice document"
            className="mt-2 text-xs"
          />
        ) : null}
      </Field>
      <p className="text-xs text-slate-500">
        Attach the supplier&apos;s invoice for audit and three-way match. This does not change the
        LPO total — the order value stays as computed when the PO was created, adjusted only by
        supplier returns.
      </p>
    </FormModal>
  );
}
