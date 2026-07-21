"use client";

import { lpoSupplierInvoiceFilePath } from "@/components/lpo/lpo-supplier-invoice-doc";
import { ProtectedFileLink } from "@/components/media/protected-file-preview";

export function LpoSupplierInvoicePicker({
  invoices,
  selectedInvoiceId,
  onSelect,
  onAttachAnother,
  attachLabel = "Attach invoice",
}) {
  if (!invoices?.length) {
    return (
      <p className="text-sm text-amber-800">
        No supplier invoice attached yet. Upload the supplier invoice before posting the receipt.
      </p>
    );
  }

  const selected = invoices.find((inv) => String(inv.id) === String(selectedInvoiceId));

  return (
    <div className="space-y-2">
      {selected?.has_document ? (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <ProtectedFileLink
            filePath={lpoSupplierInvoiceFilePath(selected.id)}
            label="View invoice"
            title={`Supplier invoice ${selected.supplier_invoice_number ?? ""}`}
            className="rounded-lg border border-[var(--theme-primary)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--theme-primary-muted)]"
          />
        </div>
      ) : null}
      {invoices.map((inv) => {
        const isSelected = String(selectedInvoiceId) === String(inv.id);
        return (
          <label
            key={inv.id}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${
              isSelected
                ? "border-[var(--theme-primary)] bg-[var(--theme-primary-muted)]"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="lpo_supplier_invoice"
              className="mt-1"
              checked={isSelected}
              onChange={() => onSelect(inv.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{inv.supplier_invoice_number}</span>
                {inv.invoice_amount != null && inv.invoice_amount !== "" ? (
                  <span className="text-xs font-medium text-slate-600">
                    {Number(inv.invoice_amount).toLocaleString("en-KE", {
                      style: "currency",
                      currency: "KES",
                      minimumFractionDigits: 2,
                    })}
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-slate-500">
                {inv.invoice_date ? `Dated ${inv.invoice_date}` : "No invoice date"}
              </span>
              {inv.has_document ? (
                <ProtectedFileLink
                  filePath={lpoSupplierInvoiceFilePath(inv.id)}
                  label="Open attachment"
                  title={`Supplier invoice ${inv.supplier_invoice_number ?? ""}`}
                  className="mt-1 inline-block text-xs"
                />
              ) : (
                <span className="mt-1 block text-xs text-amber-700">
                  Document missing — re-attach recommended
                </span>
              )}
            </span>
          </label>
        );
      })}
      {onAttachAnother ? (
        <button
          type="button"
          onClick={onAttachAnother}
          className="text-sm font-medium text-[#185FA5] hover:underline"
        >
          {attachLabel}
        </button>
      ) : null}
    </div>
  );
}
