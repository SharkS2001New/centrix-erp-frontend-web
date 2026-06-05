import { apiFetchBlob } from "@/lib/api";

export function lpoSupplierInvoiceFilePath(invoiceId) {
  return `/lpo-supplier-invoices/${invoiceId}/file`;
}

export async function openLpoSupplierInvoiceDocument(invoiceId) {
  const blob = await apiFetchBlob(lpoSupplierInvoiceFilePath(invoiceId));
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
