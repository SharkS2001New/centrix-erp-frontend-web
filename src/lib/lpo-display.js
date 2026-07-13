/** Human-readable LPO / PO numbers (e.g. LPO-2026-0009). */

export function formatPoNumber(lpoNo, orderDate = null) {
  const n = Number(lpoNo);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const raw = orderDate ?? new Date();
  const d = new Date(String(raw).includes("T") ? raw : `${raw}T12:00:00`);
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  return `LPO-${year}-${String(n).padStart(4, "0")}`;
}

/** Best available LPO creation/sent date from API row. */
export function lpoOrderDate(lpo) {
  if (!lpo) return null;
  return lpo.order_date ?? lpo.created_at ?? lpo.sent_at ?? null;
}

/** Display number for list rows — custom reference overrides generated LPO-YYYY-####. */
export function lpoRowDisplayNumber(row) {
  if (!row) return "—";
  const ref = String(row?.reference_number ?? "").trim();
  if (ref) return ref;
  if (row?.po_number) return row.po_number;
  const seq = row?.lpo_seq ?? row?.lpo_no;
  return formatPoNumber(seq, lpoOrderDate(row));
}
