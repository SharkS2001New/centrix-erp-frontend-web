"use client";

import Link from "next/link";
import { workspaceCardClassName } from "@/components/catalog/catalog-shared";
import { formatOrgCurrency, formatOrgCurrencyCompact } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";
import {
  baseToDisplayQty,
  displayToBaseQty,
  formatDisplayQty,
  formatMixedStockDisplay,
  uomLabelFrom,
} from "@/lib/stock-uom";
import {
  APP_TIMEZONE,
  calendarDateInTimezone,
  defaultDateRange,
  formatAppDateTime,
  formatInTimezone,
  todayCalendarDate,
} from "@/lib/datetime";

export {
  APP_TIMEZONE as NAIROBI_TZ,
  calendarDateInTimezone as nairobiCalendarDate,
  defaultDateRange,
  formatAppDateTime as formatMovementDateTime,
  todayCalendarDate,
};

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

/** Map UOM id → record (string-normalized keys for API id type mismatches). */
export function buildUomById(uoms = []) {
  const map = new Map();
  for (const uom of uoms) {
    if (uom?.id == null) continue;
    map.set(String(uom.id), uom);
  }
  return map;
}

export function resolveUom(uomById, unitId) {
  if (!uomById || unitId == null || unitId === "") return null;
  return uomById.get(String(unitId)) ?? null;
}

/** product_code → UOM for catalog rows. */
export function buildUomByProductCode(products = [], uoms = []) {
  const uomById = buildUomById(uoms);
  const map = new Map();
  for (const product of products) {
    const code = product?.product_code;
    if (!code) continue;
    map.set(code, resolveUom(uomById, product.unit_id));
  }
  return map;
}

/** Resolve UOM for an inventory ledger / damage / receipt row. */
export function uomForInventoryRow(row, uomById, uomByProductCode) {
  const embedded = row?.product?.uom;
  if (embedded && typeof embedded === "object") return embedded;

  const fromUnit = resolveUom(uomById, row?.product?.unit_id ?? row?.unit_id);
  if (fromUnit) return fromUnit;

  const code = row?.product_code;
  if (code && uomByProductCode) {
    return uomByProductCode.get(code) ?? null;
  }
  return null;
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

import { inventoryTransactionTypeLabel } from "@/lib/user-facing-labels";

export function transactionTypeLabel(type) {
  return inventoryTransactionTypeLabel(type);
}

export function netChangeClass(value) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-slate-500";
}

/** Sort movements newest-first and compute net qty + type summary for group headers. */
export function summarizeStockMovements(movements = []) {
  const sorted = [...movements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const netChange = movements.reduce((sum, row) => sum + Number(row.quantity_change ?? 0), 0);
  const types = new Set(movements.map((m) => m.transaction_type));
  const typeSummary = [...types].map((t) => transactionTypeLabel(t)).join(", ");
  const latestAt = sorted[0]?.created_at ?? null;

  return { sorted, netChange, typeSummary, latestAt };
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
    <div className="theme-workspace min-h-full">
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
  return <div className={`${workspaceCardClassName} overflow-hidden`}>{children}</div>;
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

/** Resolve a human-readable product label from an API row and optional catalog map. */
export function productDisplayName(row, productByCode) {
  const fromRow = row?.product?.product_name?.trim();
  if (fromRow) return fromRow;

  const code = row?.product_code;
  const fromMap = code ? productByCode?.get?.(code)?.product_name?.trim() : "";
  if (fromMap) return fromMap;

  const legacy = row?.product_name?.trim();
  if (legacy) return legacy;

  return code ?? "—";
}

export function formatReceiptDate(value) {
  if (!value) return "—";
  return formatMovementDate(value);
}

export function formatMovementDate(value) {
  if (!value) return "—";
  return (
    formatInTimezone(value, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) ?? "—"
  );
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

/** Human-readable product scope for a stock take session. */
export function stockTakeProductScopeLabel(
  session,
  { categories = [], subCategories = [], suppliers = [] } = {},
) {
  if (!session) return "All products";

  const parts = [];
  if (session.filter_subcategory_id) {
    const sub = subCategories.find((row) => Number(row.id) === Number(session.filter_subcategory_id));
    parts.push(sub?.subcategory_name ? `Subcategory: ${sub.subcategory_name}` : "Subcategory filter");
  } else if (session.filter_category_id) {
    const category = categories.find((row) => Number(row.id) === Number(session.filter_category_id));
    parts.push(category?.category_name ? `Category: ${category.category_name}` : "Category filter");
  }

  if (session.filter_supplier_id) {
    const supplier = suppliers.find((row) => Number(row.id) === Number(session.filter_supplier_id));
    parts.push(supplier?.supplier_name ? `Supplier: ${supplier.supplier_name}` : "Supplier filter");
  }

  return parts.length ? parts.join(" · ") : "All products";
}

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
        received_by: row.received_by_name ?? row.received_by,
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
  return calendarDateInTimezone(value) ?? "";
}

export function rowInDateRange(row, from, to, dateKeys = ["created_at", "damage_date", "receipt_date"]) {
  for (const key of dateKeys) {
    const raw = row[key];
    if (!raw) continue;
    const day = calendarDateInTimezone(raw);
    if (!day) continue;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }
  return !from && !to;
}
