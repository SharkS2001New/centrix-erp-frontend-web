"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  FilterToolbar,
  PrimaryButton,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";
import { printPickingList } from "@/components/fulfillment/picking-list-print";
import { formatSaleKes } from "@/lib/sales";
import { shouldShowMobilePickingLists } from "@/lib/sales-settings";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  buildUomByProductCode,
  fetchCatalogForProductCodes,
  formatFulfillmentQty,
} from "@/lib/fulfillment-quantity";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-KE", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

export default function MobilePickingSheetsScreen() {
  const { capabilities, organization, generalSettings, user } = useAuth();
  const allowed = shouldShowMobilePickingLists(capabilities);
  const organizationName = organization?.name ?? capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME;
  const general = generalSettings();

  const [fromDate, setFromDate] = useState(daysAgoIso(5));
  const [toDate, setToDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [uomByProductCode, setUomByProductCode] = useState(new Map());

  const loadSheets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/sales/mobile-picking-sheets", {
        searchParams: { from_date: fromDate, to_date: toDate },
      });
      setSheets(res.data ?? []);
    } catch (e) {
      setSheets([]);
      setError(e instanceof ApiError ? e.message : "Failed to load picking lists");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    if (!allowed) return;
    void loadSheets();
  }, [allowed, loadSheets]);

  const filteredSheets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sheets;
    return sheets.filter((row) => {
      const route = String(row.route_name ?? "").toLowerCase();
      const date = String(row.list_date ?? "").toLowerCase();
      return route.includes(q) || date.includes(q);
    });
  }, [sheets, search]);

  const openSheet = useCallback(async (row) => {
    const key = `${row.route_id}:${row.list_date}`;
    setSelectedKey(key);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiRequest("/sales/mobile-picking-sheets/detail", {
        searchParams: { route_id: row.route_id, list_date: row.list_date },
      });
      setDetail(res);
      const productCodes = (res.picking_list?.lines ?? []).map((line) => line.product_code);
      const { products, uoms } = await fetchCatalogForProductCodes(apiRequest, productCodes);
      setUomByProductCode(buildUomByProductCode(products, uoms));
    } catch (e) {
      setDetail(null);
      setDetailError(e instanceof ApiError ? e.message : "Failed to load picking list");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function handlePrint() {
    const pickingList = detail?.picking_list;
    if (!pickingList) return;
    setDetailLoading(true);
    try {
      const res = await apiRequest("/sales/mobile-picking-sheets/detail", {
        searchParams: {
          route_id: pickingList.route_id,
          list_date: pickingList.list_date,
        },
      });
      const freshPick = res.picking_list ?? res;
      setDetail(res);
      printPickingList({
        organization,
        generalSettings: general,
        organizationName,
        pickingList: freshPick,
        trip: {
          trip_code: pickingList.list_number,
          scheduled_date: pickingList.list_date,
          route_names: [pickingList.route?.route_name].filter(Boolean),
        },
        uomByProductCode,
        documentFooterText: resolvePrintFooter(
          mergeGeneralSettings(capabilities?.module_settings),
          "loading_sheet",
        ),
        printedBy: user?.full_name ?? user?.username ?? null,
        includeShelfLocation: false,
      });
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not refresh picking list for print");
    } finally {
      setDetailLoading(false);
    }
  }

  if (!allowed) {
    return (
      <CatalogPageShell
        title="Picking list"
        subtitle="Product pick lists for mobile route orders"
      >
        <div className="theme-panel rounded-xl border p-6 text-sm">
          {capabilities?.modules?.distribution ? (
            <p>
              Picking lists are managed under{" "}
              <Link href="/fulfillment/picking" className="theme-link font-medium">
                Distribution → Warehouse picking
              </Link>{" "}
              when Distribution is enabled.
            </p>
          ) : (
            <p>Enable mobile orders for this organization to use the picking list.</p>
          )}
        </div>
      </CatalogPageShell>
    );
  }

  const pickingList = detail?.picking_list;
  const pickLines = pickingList?.lines ?? [];

  return (
    <CatalogPageShell
      title="Picking list"
      subtitle="Print product pick lists aggregated from mobile orders by route and delivery date"
    >
      {error ? <DashboardErrorBanner message={error} className="mb-4" /> : null}

      <FilterToolbar>
        <Field label="From">
          <input
            type="date"
            className={`${inputClassName()} min-w-[10rem]`}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            className={`${inputClassName()} min-w-[10rem]`}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </Field>
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search route or date…" />
      </FilterToolbar>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="theme-table-shell overflow-x-auto">
          <table className="theme-table w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="theme-table-head-row">
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Route</th>
                <th className="px-4 py-2.5 text-right">Orders</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="theme-subtext px-4 py-8 text-center">
                    Loading…
                  </td>
                </tr>
              ) : filteredSheets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="theme-subtext px-4 py-8 text-center">
                    No mobile picking lists for this period.
                  </td>
                </tr>
              ) : (
                filteredSheets.map((row) => {
                  const key = `${row.route_id}:${row.list_date}`;
                  const active = selectedKey === key;
                  return (
                    <tr
                      key={key}
                      className={`theme-table-body-row cursor-pointer ${active ? "bg-[var(--theme-primary-subtle)]" : ""}`}
                      onClick={() => void openSheet(row)}
                    >
                      <td className="px-4 py-2.5">{formatDisplayDate(row.list_date)}</td>
                      <td className="px-4 py-2.5 font-medium">{row.route_name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.order_count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatSaleKes(row.order_total)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="theme-panel rounded-xl border p-4">
          {!selectedKey ? (
            <p className="theme-subtext text-sm">Select a route and date to preview and print the picking list.</p>
          ) : detailLoading ? (
            <p className="theme-subtext text-sm">Loading picking list…</p>
          ) : detailError ? (
            <p className="text-sm text-red-600">{detailError}</p>
          ) : pickingList ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="theme-text-muted text-xs">
                  {pickingList.order_count} order{pickingList.order_count === 1 ? "" : "s"} ·{" "}
                  {pickLines.length} product{pickLines.length === 1 ? "" : "s"}
                </p>
                <PrimaryButton type="button" showIcon={false} onClick={handlePrint}>
                  Print picking list
                </PrimaryButton>
              </div>

              <div className="theme-table-shell overflow-x-auto">
                <table className="theme-table w-full text-sm">
                  <thead>
                    <tr className="theme-table-head-row">
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickLines.map((line) => (
                      <tr key={`${line.product_code}-${line.line_no}`} className="theme-table-body-row">
                        <td className="px-3 py-2">
                          <div className="font-medium">{line.product_name}</div>
                          {line.pack_breakdown ? (
                            <div className="theme-subtext text-xs">{line.pack_breakdown}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatFulfillmentQty(line.required_qty, line, uomByProductCode)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detail?.orders?.length ? (
                <div className="mt-4 border-t border-[var(--theme-border)] pt-3">
                  <p className="theme-accent-label mb-2 text-[11px] font-bold uppercase tracking-wide">
                    Included orders
                  </p>
                  <ul className="theme-text-muted max-h-32 space-y-1 overflow-auto text-xs">
                    {detail.orders.map((order) => (
                      <li key={order.id}>
                        <Link href={`/sales/orders/${order.id}`} className="theme-link">
                          #{order.order_num}
                        </Link>
                        {order.customer_name ? ` — ${order.customer_name}` : ""}
                        {" · "}
                        {formatSaleKes(order.order_total)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </CatalogPageShell>
  );
}
