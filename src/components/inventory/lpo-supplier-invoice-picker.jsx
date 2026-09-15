"use client";

import { lpoSupplierInvoiceFilePath } from "@/components/lpo/lpo-supplier-invoice-doc";
import { ProtectedFileLink } from "@/components/media/protected-file-preview";

function formatKes(amount) {
  return Number(amount).toLocaleString("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  });
}

function hasInvoiceAmount(inv) {
  return inv?.invoice_amount != null && inv.invoice_amount !== "" && Number(inv.invoice_amount) > 0;
}

export function LpoSupplierInvoicePicker({
  invoices,
  selectedInvoiceId,
  onSelect,
  onAttachAnother,
  onEdit,
  attachLabel = "Attach invoice",
}) {
  if (!invoices?.length) {
    return (
      <p className="text-sm text-amber-800">
        No supplier invoice attached yet. Upload the supplier invoice before posting the receipt.
      </p>
    );
  }

  const multiInvoice = invoices.length > 1;
  const selected = invoices.find((inv) => String(inv.id) === String(selectedInvoiceId));
  const missingAmounts = multiInvoice
    ? invoices.filter((inv) => !hasInvoiceAmount(inv))
    : [];

  return (
    <div className="space-y-2">
      {multiInvoice && missingAmounts.length > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This LPO has more than one invoice. Enter each invoice amount so accounts can search the
          invoice number and pay the correct balance.
        </p>
      ) : null}
      {selected?.has_document ? (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <ProtectedFileLink
            filePath={lpoSupplierInvoiceFilePath(selected.id)}
            label="View invoice"
            title={`Supplier invoice ${selected.supplier_invoice_number ?? ""}`}
            className="rounded-lg border border-[var(--theme-primary)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--theme-primary-muted)]"
            panelClassName="max-w-6xl"
            viewportClassName="p-2"
          />
        </div>
      ) : null}
      {invoices.map((inv) => {
        const isSelected = String(selectedInvoiceId) === String(inv.id);
        const amountMissing = multiInvoice && !hasInvoiceAmount(inv);
        return (
          <label
            key={inv.id}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${
              isSelected
                ? "border-[var(--theme-primary)] bg-[var(--theme-primary-muted)]"
                : amountMissing
                  ? "border-amber-300 bg-amber-50/60"
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
                {hasInvoiceAmount(inv) ? (
                  <span className="text-xs font-medium text-slate-600">
                    {formatKes(inv.invoice_amount)}
                  </span>
                ) : multiInvoice ? (
                  <span className="text-xs font-medium text-amber-800">Amount required</span>
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
                  panelClassName="max-w-6xl"
                  viewportClassName="p-2"
                />
              ) : (
                <span className="mt-1 block text-xs text-amber-700">
                  Document missing — re-attach recommended
                </span>
              )}
              {onEdit ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(inv);
                  }}
                  className="mt-1 block text-xs font-medium text-[#185FA5] hover:underline"
                >
                  {hasInvoiceAmount(inv) ? "Edit invoice / amount" : "Set invoice amount"}
                </button>
              ) : null}
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
