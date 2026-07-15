"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { fetchProductsByCodesCached } from "@/lib/catalog-cache";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { buildGrnFromStockReceiptGroup } from "@/lib/grn-document";
import { printGoodsReceivedNote } from "@/components/lpo/grn-print";
import { useAuth } from "@/contexts/auth-context";
import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  formatReceiptDate,
  formatStockQty,
  buildUomByProductCode,
  buildUomById,
  uomForInventoryRow,
  InventoryPageShell,
  InventoryTableShell,
  productDisplayName,
} from "@/components/inventory/inventory-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";

export default function StockReceiptDetailPage() {
  const params = useParams();
  const ref = decodeURIComponent(params.ref);
  const { user, organization, capabilities } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const isSingleId = ref.startsWith("RCPT-");
      const [receiptRes, uomRows] = await Promise.all([
        isSingleId
          ? apiRequest(`/stock-receipts/${ref.replace("RCPT-", "")}`)
          : apiRequest("/stock-receipts", {
              searchParams: {
                per_page: 200,
                "filter[branch_id]": branchId,
                "filter[invoice_number]": ref,
              },
            }),
        fetchUomsCached(user?.organization_id),
      ]);
      const filtered = isSingleId
        ? [receiptRes]
        : (receiptRes.data ?? []).filter(
            (row) => (row.invoice_number ?? "").trim() === ref,
          );
      setRows(filtered);
      setUoms(uomRows ?? []);
      const codes = filtered.map((row) => row.product_code).filter(Boolean);
      const catalogProducts = await fetchProductsByCodesCached(user?.organization_id, codes, {
        status: "all",
      });
      setProducts(catalogProducts ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load receipt");
    } finally {
      setLoading(false);
    }
  }, [branchId, ref, user?.organization_id]);

  useEffect(() => {
    load();
  }, [load]);

  const uomById = useMemo(() => buildUomById(uoms), [uoms]);
  const uomByProduct = useMemo(() => buildUomByProductCode(products, uoms), [products, uoms]);

  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );

  const header = rows[0];
  const receiptDate = header?.created_at ?? header?.receipt_date;
  const receiptGroup = useMemo(
    () =>
      rows.length
        ? {
            ref,
            date: receiptDate,
            received_by:
              header?.received_by_name ??
              (typeof header?.received_by === "string" ? header.received_by : null) ??
              null,
            stock_location: header?.stock_location,
            lines: rows,
          }
        : null,
    [rows, ref, receiptDate, header],
  );

  async function printGrn() {
    if (!receiptGroup) return;
    setPrinting(true);
    try {
      const grn = buildGrnFromStockReceiptGroup(receiptGroup, {
        productByCode,
        uomByProduct,
      });
      await printGoodsReceivedNote(grn, {
        organization,
        generalSettings: mergeGeneralSettings(capabilities?.module_settings),
        user,
      });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Could not print goods received note");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <InventoryPageShell
      title={ref}
      subtitle="Stock receipt details"
      action={
        rows.length ? (
          <button
            type="button"
            disabled={printing}
            onClick={printGrn}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {printing ? "Preparing…" : "Print GRN"}
          </button>
        ) : null
      }
    >
      <AppBreadcrumb
        items={[
          { label: "Stock receipts", href: "/inventory/receipts" },
          { label: ref },
        ]}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading receipt…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Receipt not found.</p>
      ) : (
        <div className="space-y-4">
          <div className="theme-panel rounded-xl border p-5 shadow-sm">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Date</dt>
                <dd className="font-medium">{formatReceiptDate(receiptDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Items</dt>
                <dd className="font-medium">{rows.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Location</dt>
                <dd className="font-medium capitalize">{header.stock_location}</dd>
              </div>
            </dl>
          </div>

          <InventoryTableShell>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Qty received</th>
                    <th className="px-4 py-3 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    return (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-900">
                            {productDisplayName(row, productByCode)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatStockQty(
                            row.units_received,
                            uomForInventoryRow(row, uomById, uomByProduct),
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {row.cost_price != null ? (
                            <div>
                              <p>{`KES ${Number(row.cost_price).toLocaleString("en-KE")}`}</p>
                              {row.original_cost_price != null &&
                              Math.abs(Number(row.original_cost_price) - Number(row.cost_price)) >
                                0.00005 ? (
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  Original cost: KES{" "}
                                  {Number(row.original_cost_price).toLocaleString("en-KE")}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </InventoryTableShell>
        </div>
      )}
    </InventoryPageShell>
  );
}
