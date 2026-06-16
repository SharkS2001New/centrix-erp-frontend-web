"use client";

import Link from "next/link";
import { formatOrgCurrency, formatOrgCurrencyCompact } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";
import {
  baseToDisplayQty,
  displayToBaseQty,
  formatDisplayQty,
  formatMixedStockDisplay,
  uomLabelFrom,
} from "@/lib/stock-uom";

export function formatInventoryKes(value, settings = GENERAL_DEFAULTS) {
  if (value == null || value === "") return "—";
  return formatOrgCurrency(value, settings);
}

export function formatInventoryKesCompact(value, settings = GENERAL_DEFAULTS) {
  return formatOrgCurrencyCompact(value, settings);
}

export function formatQty(value) {
  if (value == null || value === "") return "—";
  return formatDisplayQty(value);
}

/** Format a base-piece quantity in product UOM for display. */
export function formatStockQty(baseQty, uomOrFactor, label) {
  const packLabel =
    label ??
    (uomOrFactor && typeof uomOrFactor === "object" ? uomLabelFrom(uomOrFactor) : undefined);
  return formatMixedStockDisplay(baseQty, uomOrFactor, packLabel).text;
}

export function formatStockQtyParts(baseQty, uomOrFactor, label) {
  const packLabel =
    label ??
    (uomOrFactor && typeof uomOrFactor === "object" ? uomLabelFrom(uomOrFactor) : undefined);
  return formatMixedStockDisplay(baseQty, uomOrFactor, packLabel);
}

export { baseToDisplayQty, displayToBaseQty, uomLabelFrom };

export function stockHealthStatus(totalQty, productAlert) {
  const qty = Number(totalQty ?? 0);
  if (qty <= 0) return { label: "Out", tone: "out" };
  if (productAlert === "REORDER") return { label: "Low", tone: "low" };
  return { label: "Healthy", tone: "healthy" };
}

export function StockHealthBadge({ totalQty, productAlert }) {
  const status = stockHealthStatus(totalQty, productAlert);
  const styles = {
    healthy: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    low: "bg-amber-50 text-amber-700 ring-amber-600/20",
    out: "bg-slate-100 text-slate-600 ring-slate-300/50",
  };
  const dots = {
    healthy: "bg-emerald-500",
    low: "bg-amber-500",
    out: "bg-slate-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${styles[status.tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dots[status.tone]}`} />
      {status.label}
    </span>
  );
}

export function transactionTypeLabel(type) {
  const map = {
    PURCHASE: "Purchase",
    POS_SALE: "Sale",
    MOBILE_SALE: "Sale",
    BACKEND_SALE: "Sale",
    RETURN: "Return",
    DAMAGE: "Damage",
    ADJUSTMENT: "Adjustment",
    STOCK_TAKE: "Stock take",
    TRANSFER: "Transfer",
    WRITE_OFF: "Write-off",
    SUPPLIER_RETURN: "Supplier return",
  };
  return map[String(type ?? "").toUpperCase()] ?? type ?? "—";
}

export function InventoryTrendChart({ points }) {
  if (!points?.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        No movement data for the chart period.
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="flex h-40 items-end gap-2 px-2">
      {points.map((p) => (
        <div key={p.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-[#185FA5]/80"
            style={{ height: `${Math.max(8, (p.value / max) * 100)}%` }}
            title={`${p.label}: ${p.value}`}
          />
          <span className="truncate text-[10px] text-slate-500">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

export function InventoryPageShell({ title, subtitle, action, toolbar, children }) {
  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {toolbar}
      {children}
    </div>
  );
}

export function InventoryTableShell({ children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {children}
    </div>
  );
}

export function ProductCodeLink({ code }) {
  if (!code) return "—";
  return (
    <Link
      href={`/products/${encodeURIComponent(code)}`}
      className="font-mono text-[#185FA5] hover:underline"
    >
      {code}
    </Link>
  );
}

export function formatReceiptDate(value) {
  if (!value) return "—";
  return formatMovementDate(value);
}

export const NAIROBI_TZ = "Africa/Nairobi";

/** Calendar date (YYYY-MM-DD) in Africa/Nairobi for a timestamp. */
export function nairobiCalendarDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: NAIROBI_TZ }).format(date);
}

function addDaysToCalendarDate(isoDate, deltaDays) {
  const ms = Date.parse(`${isoDate}T12:00:00+03:00`) + deltaDays * 86_400_000;
  return nairobiCalendarDate(new Date(ms));
}

export function formatMovementDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-KE", {
    timeZone: NAIROBI_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatMovementDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-KE", {
    timeZone: NAIROBI_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const LOCATION_OPTIONS = [
  { value: "all", label: "All locations" },
  { value: "shop", label: "Shop" },
  { value: "store", label: "Store / warehouse" },
];

export function stockLocationLabel(location) {
  if (!location) return "—";
  const v = String(location).toLowerCase();
  if (v === "shop") return "Shop";
  if (v === "store") return "Store";
  return String(location)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human-readable from/to location for a ledger movement row. */
export function movementLocationLabel(row) {
  const type = String(row?.transaction_type ?? "").toUpperCase();
  const loc = stockLocationLabel(row?.stock_location);
  const notes = String(row?.notes ?? "");

  if (type === "TRANSFER") {
    const outMatch = notes.match(/^Transfer out to ([^\s·—]+)/i);
    if (outMatch) {
      return `${loc} → ${stockLocationLabel(outMatch[1])}`;
    }
    const inMatch = notes.match(/^Transfer in from ([^\s·—]+)/i);
    if (inMatch) {
      return `${stockLocationLabel(inMatch[1])} → ${loc}`;
    }
  }

  const qty = Number(row?.quantity_change ?? 0);
  if (qty > 0) return `To ${loc}`;
  if (qty < 0) return `From ${loc}`;
  return loc;
}

export const SESSION_STATUS_LABELS = {
  draft: "Draft",
  in_progress: "Open",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Group line-level stock_receipts rows into receipt documents. */
export function groupStockReceipts(rows) {
  const map = new Map();
  for (const row of rows) {
    const ref = row.invoice_number?.trim()
      ? row.invoice_number.trim()
      : `RCPT-${row.id}`;
    const existing = map.get(ref);
    const line = { ...row, receipt_ref: ref };
    if (!existing) {
      map.set(ref, {
        ref,
        receipt_no: ref,
        date: row.created_at ?? row.receipt_date,
        received_by: row.received_by,
        stock_location: row.stock_location,
        line_count: 1,
        total_units: Number(row.units_received ?? 0),
        lines: [line],
      });
    } else {
      existing.lines.push(line);
      existing.line_count += 1;
      existing.total_units += Number(row.units_received ?? 0);
      if (
        existing.stock_location &&
        row.stock_location &&
        existing.stock_location !== row.stock_location
      ) {
        existing.stock_location = "mixed";
      }
      if (String(row.created_at ?? "") > String(existing.date ?? "")) {
        existing.date = row.created_at ?? row.receipt_date;
      }
    }
  }
  return [...map.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function receiptDetailHref(ref) {
  return `/inventory/receipts/${encodeURIComponent(ref)}`;
}

export function isoDate(value = new Date()) {
  return nairobiCalendarDate(value) ?? "";
}

export function defaultDateRange(days = 7) {
  const to = isoDate();
  const from = addDaysToCalendarDate(to, -(days - 1));
  return { from, to };
}

export function rowInDateRange(row, from, to, dateKeys = ["created_at", "damage_date", "receipt_date"]) {
  for (const key of dateKeys) {
    const raw = row[key];
    if (!raw) continue;
    const day = nairobiCalendarDate(raw);
    if (!day) continue;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }
  return !from && !to;
}
