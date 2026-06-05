"use client";

export function formatLpoKes(value) {
  const n = Number(value ?? 0);
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Cost per pack: whole numbers only (no decimals). */
export function sanitizeLpoWholeNumber(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return "";
  return String(Math.max(0, Math.trunc(n)));
}

/** Qty in packs — allows decimals (e.g. 1.5 cartons). Up to 3 decimal places while typing. */
export function sanitizeLpoOrderQty(raw) {
  let s = String(raw ?? "").trim().replace(/,/g, "");
  if (s === "") return "";
  if (s.startsWith(".")) s = `0${s}`;
  if (/^\d+\.$/.test(s) || /^\d+\.\d{0,3}$/.test(s) || /^\d+$/.test(s)) {
    return s;
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.round(n * 1000) / 1000);
}

/** Line amounts in order table — number only, no currency prefix. */
export function formatLpoAmount(value) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatPoNumber(lpoNo) {
  return lpoNo != null ? `PO-${lpoNo}` : "—";
}

export function isLpoHeaderComplete(form) {
  return Boolean(
    form?.supplier_id &&
      String(form.due_date ?? "").trim() &&
      String(form.delivery_address ?? "").trim(),
  );
}

export const LPO_STATUS = {
  AWAITING_CHECK: 0,
  AWAITING_APPROVAL: 1,
  AWAITING_SEND: 2,
  AWAITING_RECEIVE: 3,
  AWAITING_LAST_RECEIVE: 4,
  FULLY_RECEIVED: 5,
  CLEARED: 6,
  CANCELLED_RETURNED: 7,
};

export function lpoIsCancelledReturned(lpo) {
  return (
    Number(lpo?.lpo_status_code) === LPO_STATUS.CANCELLED_RETURNED ||
    Boolean(lpo?.items_fully_returned_to_supplier)
  );
}

export function lpoCanEdit(lpo) {
  return Boolean(lpo?.can_edit ?? (Number(lpo?.lpo_status_code) < LPO_STATUS.AWAITING_RECEIVE));
}

/** LPO lines that still have quantity available to return (ordered minus prior returns). */
export function lpoReturnableLines(lines = []) {
  return (lines ?? []).filter((l) => {
    const ordered = Number(l.ordered_qty ?? 0);
    const returned = Number(l.returned_qty ?? 0);
    const maxReturn = Number(
      l.max_return_qty ?? Math.max(0, ordered - returned),
    );
    return maxReturn > 0;
  });
}

/** Qty that will be deducted from branch stock for a return on this line. */
export function lpoStockDeductQty(line, returnQty) {
  const received = Number(line.received_qty ?? 0);
  const returned = Number(line.returned_qty ?? 0);
  const qty = Number(returnQty);
  if (!qty || qty <= 0) return 0;
  return Math.min(qty, Math.max(0, received - returned));
}

export function lpoLineReturnedLabel(line) {
  const ordered = Number(line?.ordered_qty ?? 0);
  const returned = Number(line?.returned_qty ?? line?.committed_return_qty ?? 0);
  if (returned <= 0) return "—";
  if (returned + 0.0001 >= ordered) return "Fully returned";
  return `${returned} returned`;
}

export function lpoLineStatusLabel(line) {
  const status = line?.receive_status;
  if (status === "fully_returned") return "Fully returned";
  if (status === "complete") return "Received";
  if (status === "partial") return "Partially received";
  return "Open";
}

export function lpoCanRecordReturn(lpo, lines = []) {
  if (Number(lpo?.lpo_status_code ?? 0) < LPO_STATUS.AWAITING_RECEIVE) {
    return false;
  }
  if (lpo?.can_create_return != null) {
    return Boolean(lpo.can_create_return);
  }
  return lpoReturnableLines(lines).length > 0;
}

export function LpoStatusBadge({ statusName, clearedFlag, statusCode, paymentStatus }) {
  const name = (statusName ?? "").toLowerCase();
  let className = "bg-slate-100 text-slate-700";
  const label = statusName ?? "—";
  const code = Number(statusCode);
  const pay = paymentStatus ?? "";

  if (code === LPO_STATUS.CLEARED || name.includes("lpo cleared")) {
    className =
      pay === "partial" || name.includes("partially paid")
        ? "bg-amber-50 text-amber-900"
        : "bg-emerald-50 text-emerald-800";
  } else if (clearedFlag === 1 || name.includes("cleared")) {
    className = "bg-emerald-50 text-emerald-800";
  } else if (code === LPO_STATUS.FULLY_RECEIVED || name.includes("fully received")) {
    className = "bg-emerald-50 text-emerald-800";
  } else if (
    code === LPO_STATUS.AWAITING_LAST_RECEIVE ||
    name.includes("last items")
  ) {
    className = "bg-amber-50 text-amber-800";
  } else if (code === LPO_STATUS.AWAITING_RECEIVE || name.includes("items to be received")) {
    className = "bg-blue-50 text-blue-800";
  } else if (code === LPO_STATUS.AWAITING_SEND || name.includes("sent to supplier")) {
    className = "bg-indigo-50 text-indigo-800";
  } else if (code === LPO_STATUS.AWAITING_APPROVAL || name.includes("approval")) {
    className = "bg-violet-50 text-violet-800";
  } else if (code === LPO_STATUS.AWAITING_CHECK || name.includes("checked")) {
    className = "bg-slate-100 text-slate-600";
  } else if (
    code === LPO_STATUS.CANCELLED_RETURNED ||
    name.includes("returned to supplier")
  ) {
    className = "bg-orange-50 text-orange-900";
  }

  return (
    <span
      className={`inline-flex max-w-[min(100%,20rem)] rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-snug ${className}`}
      title={label}
    >
      {label}
    </span>
  );
}

export const EMPTY_LPO_LINE = {
  product_code: "",
  product_name: "",
  packaging_label: "",
  conversion_factor: 1,
  package_name: "",
  measure_unit: "",
  uom: "",
  unit_id: null,
  vat_rate: 0,
  ordered_qty: "",
  cost_price: "",
};

export const EMPTY_LPO_FORM = {
  supplier_id: "",
  reference_number: "",
  due_date: "",
  delivery_address: "",
  terms: "Net 30 Days",
  instructions: "",
  lpo_status_code: "0",
  lines: [],
};

export function lpoHeaderToForm(lpo, lines = []) {
  return {
    supplier_id: String(lpo.supplier_id ?? ""),
    reference_number: lpo.reference_number ?? "",
    due_date: lpo.due_date ?? "",
    delivery_address: lpo.delivery_address ?? "",
    terms: lpo.terms ?? "",
    instructions: lpo.instructions ?? "",
    lpo_status_code: String(lpo.lpo_status_code ?? 1),
    lines:
      lines.length > 0
        ? lines.map((l) => ({
            product_code: l.product_code,
            product_name: l.product_name ?? l.product_code,
            packaging_label: l.packaging_label ?? l.uom ?? "",
            conversion_factor: Number(l.conversion_factor ?? 1),
            package_name: l.package_name ?? l.uom ?? "",
            measure_unit: l.measure_unit ?? "",
            uom: l.uom ?? "",
            unit_id: l.unit_id ?? null,
            vat_rate: Number(l.vat_rate ?? 0),
            ordered_qty: String(l.ordered_qty ?? ""),
            cost_price:
              l.cost_price != null && l.cost_price !== ""
                ? sanitizeLpoWholeNumber(l.cost_price)
                : "",
          }))
        : [],
  };
}

/** Totals use each line's product VAT rate (from catalog). */
export function computeLpoTotals(lines) {
  let subtotal = 0;
  let vat = 0;
  for (const line of lines) {
    const qty = Number(line.ordered_qty) || 0;
    const cost = Number(line.cost_price) || 0;
    const lineNet = qty * cost;
    subtotal += lineNet;
    const rate = Number(line.vat_rate ?? 0);
    vat += lineNet * (rate / 100);
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    total: Math.round((subtotal + vat) * 100) / 100,
  };
}

export function buildLpoFullBody(form, statusCode) {
  return {
    supplier_id: Number(form.supplier_id),
    reference_number: form.reference_number.trim() || null,
    due_date: form.due_date || null,
    delivery_address: form.delivery_address.trim() || null,
    lpo_status_code:
      statusCode != null ? Number(statusCode) : Number(form.lpo_status_code) || LPO_STATUS.AWAITING_CHECK,
    terms: form.terms.trim() || null,
    instructions: form.instructions.trim() || null,
    lines: form.lines
      .filter((l) => l.product_code && Number(l.ordered_qty) > 0)
      .map((l) => ({
        product_code: l.product_code,
        ordered_qty: Math.round((Number(l.ordered_qty) || 0) * 1000) / 1000,
        cost_price: Math.trunc(Number(l.cost_price) || 0),
        uom: (l.package_name || l.uom || "").trim() || null,
      })),
  };
}
