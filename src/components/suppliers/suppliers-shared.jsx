"use client";

export {
  EMPTY_SUPPLIER_FORM,
  buildSupplierBody,
  supplierToForm,
} from "./supplier-form";

export function formatSupplierKes(value) {
  const n = Number(value ?? 0);
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function SupplierStatusBadge({ active }) {
  const on = active !== false;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
        on ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-slate-400"}`} />
      {on ? "Active" : "Inactive"}
    </span>
  );
}

export function PaymentStatusBadge({ status }) {
  const map = {
    paid: "bg-emerald-50 text-emerald-800",
    partial: "bg-amber-50 text-amber-800",
    unpaid: "bg-red-50 text-red-700",
    no_amount: "bg-slate-100 text-slate-600",
  };
  const labels = {
    paid: "Paid",
    partial: "Partial",
    unpaid: "Unpaid",
    no_amount: "—",
  };
  const key = status ?? "unpaid";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${map[key] ?? map.unpaid}`}>
      {labels[key] ?? status}
    </span>
  );
}

export const EMPTY_SUPPLIER_PAYMENT_FORM = {
  lpo_no: "",
  payment_method_id: "",
  amount_paid: "",
  manual_amount: false,
  declared_payable: "",
  reference_number: "",
  cheque_number: "",
  date_paid: new Date().toISOString().slice(0, 10),
  notes: "",
};

/** @typedef {'cheque'|'mpesa'|'cash'|'bank'|'other'} SupplierPaymentMethodKind */

/**
 * @param {{ method_name?: string, method_code?: string } | null | undefined} method
 * @returns {SupplierPaymentMethodKind}
 */
export function getSupplierPaymentMethodKind(method) {
  if (!method) return "other";
  const code = String(method.method_code ?? "").toLowerCase().trim();
  const name = String(method.method_name ?? "").toLowerCase().trim();
  const hay = `${code} ${name}`;

  if (code === "cheque" || code === "chq" || /\bcheque\b|\bcheck\b/.test(hay)) {
    return "cheque";
  }
  if (code === "mpesa" || /mpesa|m-pesa|m pesa/.test(hay)) {
    return "mpesa";
  }
  if (code === "cash" || /\bcash\b/.test(hay)) {
    return "cash";
  }
  if (
    code === "bank" ||
    code === "bank_transfer" ||
    /bank|transfer|rtgs|eft|wire/.test(hay)
  ) {
    return "bank";
  }
  return "other";
}

/**
 * @param {SupplierPaymentMethodKind} kind
 */
export function supplierPaymentReferenceMeta(kind) {
  switch (kind) {
    case "cheque":
      return {
        field: "cheque_number",
        label: "Cheque number",
        placeholder: "e.g. 001234",
        required: true,
      };
    case "mpesa":
      return {
        field: "reference_number",
        label: "M-Pesa ref code",
        placeholder: "e.g. QHK7X9Y2Z1",
        required: true,
      };
    case "bank":
      return {
        field: "reference_number",
        label: "Bank transaction ref",
        placeholder: "e.g. FT26053…",
        required: true,
      };
    case "cash":
      return null;
    default:
      return {
        field: "reference_number",
        label: "Reference (optional)",
        placeholder: "",
        required: false,
      };
  }
}

/** @param {{ reference_number?: string|null, cheque_number?: string|null }} row */
export function formatSupplierPaymentReference(row) {
  if (!row) return "—";
  const cheque = (row.cheque_number ?? "").trim();
  if (cheque) return `Chq ${cheque}`;
  const ref = (row.reference_number ?? "").trim();
  return ref || "—";
}

/**
 * @param {typeof EMPTY_SUPPLIER_PAYMENT_FORM} form
 * @param {SupplierPaymentMethodKind} kind
 */
export function buildSupplierPaymentReferencePayload(form, kind) {
  const ref = form.reference_number.trim();
  const cheque = form.cheque_number.trim();

  if (kind === "cheque") {
    return { reference_number: null, cheque_number: cheque || null };
  }
  if (kind === "cash") {
    return { reference_number: null, cheque_number: null };
  }
  return { reference_number: ref || null, cheque_number: null };
}

/**
 * @param {typeof EMPTY_SUPPLIER_PAYMENT_FORM} form
 * @param {SupplierPaymentMethodKind} kind
 * @returns {string|null}
 */
export function validateSupplierPaymentReference(form, kind) {
  const meta = supplierPaymentReferenceMeta(kind);
  if (!meta?.required) return null;
  const value = (form[meta.field] ?? "").trim();
  if (!value) return `${meta.label} is required for this payment method.`;
  return null;
}

export function PurchaseVolumeChart({ items }) {
  if (!items?.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">No purchase data yet.</p>
    );
  }

  const max = Math.max(...items.map((i) => Number(i.purchase_total ?? 0)), 1);

  return (
    <div className="space-y-3">
      {items.map((row) => {
        const pct = Math.round((Number(row.purchase_total ?? 0) / max) * 100);
        return (
          <div key={row.supplier_id}>
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span className="truncate font-medium text-slate-800">{row.supplier_name}</span>
              <span className="shrink-0 text-slate-600">
                {formatSupplierKes(row.purchase_total)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#185FA5] transition-all"
                style={{ width: `${Math.max(pct, 4)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
