"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  defaultDateRange,
  formatMovementDate,
  formatMovementDateTime,
  formatStockQty,
  movementLocationLabel,
  netChangeClass,
  summarizeStockMovements,
  transactionTypeLabel,
  uomForInventoryRow,
} from "@/components/inventory/inventory-shared";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import { fullPackageLabel, uomConversionSummary } from "@/lib/uom-packaging";

function movementHref(row) {
  const refType = String(row.reference_type ?? "").toLowerCase();
  if (refType === "customer_return" && row.reference_id) {
    return `/sales/returns?return_id=${row.reference_id}`;
  }
  return null;
}

function resolveRowUom(row, fallbackUom, uomById) {
  return uomForInventoryRow(row, uomById) ?? fallbackUom ?? null;
}

export function ProductStockHistoryPanel({
  productCode,
  productName,
  uom,
  uomById,
  shopStock = 0,
  storeStock = 0,
  userById,
  emptyMessage = "No stock movements recorded yet.",
}) {
  const { user } = useAuth();
  const initialRange = defaultDateRange(30);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = {
        per_page: 200,
        product_code: productCode,
        from_date: fromDate,
        to_date: toDate,
      };
      if (user?.branch_id) searchParams.branch_id = user.branch_id;

      const res = await apiRequest("/reports/stock-movement", { searchParams });
      setRows(parsePaginator(res).items);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [productCode, fromDate, toDate, user?.branch_id]);

  useEffect(() => {
    if (!productCode) return;
    void loadMovements();
  }, [productCode, loadMovements]);

  const summary = useMemo(() => summarizeStockMovements(rows), [rows]);
  const displayUom = uom ?? null;
  const netLabel = formatStockQty(Math.abs(summary.netChange), displayUom);
  const displayName = productName?.trim() || productCode;
  const packageLabel = fullPackageLabel(displayUom, "pack");

  const shopStockText = formatMixedStockDisplay(Number(shopStock ?? 0), displayUom).text;
  const storeStockText = formatMixedStockDisplay(Number(storeStock ?? 0), displayUom).text;

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="theme-panel rounded-lg border px-4 py-3">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Shop stock</p>
          <p className="theme-heading mt-1 text-sm font-semibold tabular-nums">{shopStockText}</p>
        </div>
        <div className="theme-panel rounded-lg border px-4 py-3">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Store stock</p>
          <p className="theme-heading mt-1 text-sm font-semibold tabular-nums">{storeStockText}</p>
        </div>
        <div className="theme-panel rounded-lg border px-4 py-3 sm:col-span-2 lg:col-span-2">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Package</p>
          <p className="theme-heading mt-1 text-sm font-semibold">{packageLabel}</p>
          {displayUom ? (
            <p className="theme-subtext mt-0.5 text-xs">{uomConversionSummary(displayUom)}</p>
          ) : null}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-[var(--theme-border)] pb-4">
        <Field label="From">
          <input
            type="date"
            className={inputClassName()}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            className={inputClassName()}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </Field>
      </div>

      {loading ? (
        <p className="theme-subtext py-8 text-center text-sm">Loading movements…</p>
      ) : rows.length === 0 ? (
        <p className="theme-subtext py-12 text-center text-sm">{emptyMessage}</p>
      ) : (
        <div className="theme-table-shell overflow-hidden rounded-lg border border-[var(--theme-border)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--theme-border)] px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="theme-heading text-sm font-semibold">{displayName}</span>
                {displayName !== productCode ? (
                  <span className="theme-subtext font-mono text-xs">{productCode}</span>
                ) : null}
              </div>
              <p className="theme-subtext mt-0.5 text-xs">
                {rows.length} movement{rows.length === 1 ? "" : "s"}
                {summary.typeSummary ? ` · ${summary.typeSummary}` : ""}
                {summary.latestAt ? ` · last ${formatMovementDate(summary.latestAt)}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 text-sm font-medium tabular-nums ${netChangeClass(summary.netChange)}`}
            >
              {summary.netChange > 0 ? "+" : summary.netChange < 0 ? "−" : ""}
              {netLabel}
              <span className="theme-subtext ml-1 text-xs font-normal">net</span>
            </span>
          </div>

          <div className="overflow-x-auto bg-[var(--theme-surface-muted)]/40 px-4 pb-3">
            <table className="w-full min-w-[880px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-[var(--theme-text-muted)]">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3 text-right">Quantity</th>
                  <th className="py-2 pr-3 text-right">Stock before</th>
                  <th className="py-2 pr-3 text-right">Stock after</th>
                  <th className="py-2 pl-2 text-right">User</th>
                </tr>
              </thead>
              <tbody>
                {summary.sorted.map((row) => {
                  const rowUom = resolveRowUom(row, displayUom, uomById);
                  const actor = userById.get(row.created_by);
                  const qty = Number(row.quantity_change ?? 0);
                  const qtyLabel = formatStockQty(Math.abs(qty), rowUom);
                  const href = movementHref(row);
                  const typeLabel = transactionTypeLabel(row.transaction_type);
                  const hasBefore = row.quantity_before != null && row.quantity_before !== "";
                  const hasAfter = row.quantity_after != null && row.quantity_after !== "";

                  return (
                    <tr key={row.id} className="border-t border-[var(--theme-border)] first:border-t-0">
                      <td className="theme-text-muted py-2.5 pr-3 whitespace-nowrap">
                        {formatMovementDateTime(row.created_at)}
                      </td>
                      <td className="theme-heading py-2.5 pr-3 whitespace-nowrap text-sm">
                        {movementLocationLabel(row)}
                      </td>
                      <td className="theme-heading py-2.5 pr-3 text-sm">
                        {href ? (
                          <Link href={href} className="theme-link hover:underline">
                            {typeLabel}
                          </Link>
                        ) : (
                          typeLabel
                        )}
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right tabular-nums font-medium ${netChangeClass(qty)}`}
                      >
                        {qty > 0 ? "+" : qty < 0 ? "−" : ""}
                        {qtyLabel}
                      </td>
                      <td className="theme-text-muted py-2.5 pr-3 text-right tabular-nums text-sm">
                        {hasBefore ? formatStockQty(row.quantity_before, rowUom) : "—"}
                      </td>
                      <td className="theme-heading py-2.5 pr-3 text-right tabular-nums text-sm font-medium">
                        {hasAfter ? formatStockQty(row.quantity_after, rowUom) : "—"}
                      </td>
                      <td className="theme-text-muted py-2.5 pl-2 text-right text-sm">
                        {actor?.full_name ?? actor?.username ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
