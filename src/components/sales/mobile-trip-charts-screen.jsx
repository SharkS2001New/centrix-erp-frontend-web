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
import { printTripChartList } from "@/components/fulfillment/trip-chart-list-print";
import { formatSaleKes } from "@/lib/sales";
import {
  getMobileSheetsDefaultDateRange,
  shouldShowMobileTripCharts,
} from "@/lib/sales-settings";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { formatTonnage, loadTonnageFromDocuments } from "@/lib/load-weight";

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-KE", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

export default function MobileTripChartsScreen() {
  const { capabilities, organization, generalSettings, user } = useAuth();
  const allowed = shouldShowMobileTripCharts(capabilities);
  const organizationName = organization?.name ?? capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME;
  const general = generalSettings();
  const tripChartPrintSettings = resolveLoadingSheetPrintSettings(
    capabilities?.module_settings?.distribution,
  );
  const defaultRange = getMobileSheetsDefaultDateRange(capabilities?.module_settings);

  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [search, setSearch] = useState("");
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const loadSheets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/sales/mobile-loading-sheets", {
        searchParams: { from_date: fromDate, to_date: toDate },
      });
      setSheets(res.data ?? []);
    } catch (e) {
      setSheets([]);
      setError(e instanceof ApiError ? e.message : "Failed to load trip charts");
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
    return sheets.filter(
      (row) =>
        String(row.route_name ?? "").toLowerCase().includes(q) ||
        String(row.list_date ?? "").includes(q),
    );
  }, [sheets, search]);

  async function openSheet(row) {
    const key = `${row.route_id}:${row.list_date}`;
    setSelectedKey(key);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const [loadingRes, pickRes] = await Promise.all([
        apiRequest("/sales/mobile-loading-sheets/detail", {
          searchParams: { route_id: row.route_id, list_date: row.list_date },
        }),
        apiRequest("/sales/mobile-picking-sheets/detail", {
          searchParams: { route_id: row.route_id, list_date: row.list_date },
        }).catch(() => null),
      ]);
      setDetail({
        ...loadingRes,
        picking_list: pickRes?.picking_list ?? null,
      });
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Failed to load trip chart");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePrint() {
    if (!detail?.loading_list) return;
    const routeId = detail.loading_list.route_id ?? detail.loading_list.route?.id;
    const listDate = detail.loading_list.list_date;
    if (!routeId || !listDate) return;

    setDetailError(null);
    setDetailLoading(true);
    try {
      const [loadingRes, pickRes] = await Promise.all([
        apiRequest("/sales/mobile-loading-sheets/detail", {
          searchParams: { route_id: routeId, list_date: listDate },
        }),
        apiRequest("/sales/mobile-picking-sheets/detail", {
          searchParams: { route_id: routeId, list_date: listDate },
        }).catch(() => null),
      ]);
      const pickingList = pickRes?.picking_list ?? null;
      setDetail({
        ...loadingRes,
        picking_list: pickingList,
      });
      const loadingList = loadingRes.loading_list;
      printTripChartList({
        organization,
        generalSettings: general,
        organizationName,
        trip: {
          scheduled_date: loadingList.list_date,
          route: loadingList.route,
          route_names: loadingList.route?.route_name ? [loadingList.route.route_name] : [],
          vehicle: loadingList.vehicle ?? pickingList?.vehicle ?? null,
          driver: loadingList.driver ?? pickingList?.driver ?? null,
        },
        loadingList,
        pickingList,
        sales: loadingRes.orders,
        orders: loadingList.orders,
        financialSummary: {
          order_count: loadingList.order_count,
          total_amount: loadingList.total_amount,
        },
        documentFooterText: resolvePrintFooter(
          mergeGeneralSettings(capabilities?.module_settings),
          "trip_chart",
        ),
        printedBy: user?.full_name ?? user?.username ?? null,
        printSettings: tripChartPrintSettings,
      });
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not refresh trip chart for print");
    } finally {
      setDetailLoading(false);
    }
  }

  if (!allowed) {
    return (
      <CatalogPageShell
        title="Trip Chart"
        subtitle="Customer stop list for mobile route orders"
      >
        <div className="theme-panel rounded-xl border p-6 text-sm">
          {isDistributionOpsEnabled(capabilities) ? (
            <p>
              Trip charts are managed under{" "}
              <Link href="/fulfillment/trips" className="theme-link font-medium">
                Distribution → Trips
              </Link>{" "}
              when Distribution is enabled.
            </p>
          ) : (
            <p>Enable mobile field sales for this organization to use trip charts.</p>
          )}
        </div>
      </CatalogPageShell>
    );
  }

  const loadingList = detail?.loading_list;
  const pickingList = detail?.picking_list;
  const stopRows = loadingList?.orders ?? [];
  const tonnage = loadTonnageFromDocuments({ pickingList, loadingList });

  return (
    <CatalogPageShell
      title="Trip Chart"
      subtitle="Print the customer stop list from mobile orders by route and delivery date"
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
                    No mobile trip charts for this period.
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
            <p className="theme-subtext text-sm">Select a route and date to preview and print the trip chart.</p>
          ) : detailLoading ? (
            <p className="theme-subtext text-sm">Loading trip chart…</p>
          ) : detailError ? (
            <p className="text-sm text-red-600">{detailError}</p>
          ) : loadingList ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="theme-text-muted text-xs">
                  {loadingList.route?.route_name ?? "Route"} · {formatDisplayDate(loadingList.list_date)} ·{" "}
                  {loadingList.order_count} order{loadingList.order_count === 1 ? "" : "s"} ·{" "}
                  {formatSaleKes(loadingList.total_amount)}
                </p>
                <PrimaryButton type="button" showIcon={false} onClick={handlePrint}>
                  Print trip chart
                </PrimaryButton>
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--theme-border)] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vehicle tonnage</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">
                    {tonnage.vehicleMaxKg ? formatTonnage(tonnage.vehicleMaxKg) : "Not set"}
                  </p>
                  <p className="theme-text-muted text-xs">
                    {loadingList.vehicle?.plate_number || loadingList.vehicle?.vehicle_name || pickingList?.vehicle?.plate_number || "Assign a default vehicle on the driver"}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--theme-border)] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Picking list tonnage</p>
                  <p className={`mt-0.5 text-sm font-semibold tabular-nums ${tonnage.overCapacity ? "text-amber-700" : ""}`}>
                    {formatTonnage(tonnage.totalKg)}
                    {tonnage.overCapacity ? " · over capacity" : ""}
                  </p>
                  {tonnage.missingCount > 0 ? (
                    <p className="text-xs text-amber-700">
                      {tonnage.missingCount} product{tonnage.missingCount === 1 ? "" : "s"} missing product weight
                    </p>
                  ) : (
                    <p className="theme-text-muted text-xs">From product weight × quantity</p>
                  )}
                </div>
              </div>
              {stopRows.length ? (
                <table className="theme-table w-full text-sm">
                  <thead>
                    <tr className="theme-table-head-row">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stopRows.map((order, index) => (
                      <tr key={order.sale_id ?? order.order_num ?? index} className="theme-table-body-row">
                        <td className="px-3 py-2 tabular-nums">{order.stop_no ?? index + 1}</td>
                        <td className="px-3 py-2">{order.customer_name || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatSaleKes(order.order_total ?? order.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="theme-subtext text-sm">No delivery stops on this trip chart.</p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </CatalogPageShell>
  );
}
