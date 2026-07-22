"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import {
  buildUomByProductCode,
  collectFulfillmentProductCodes,
  fetchCatalogForProductCodes,
} from "@/lib/fulfillment-quantity";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import {
  CatalogPageShell,
  Field,
  FilterToolbar,
  PaginationBar,
  PrimaryButton,
  SearchInput,
} from "@/components/catalog/catalog-shared";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";
import { printLoadingList } from "@/components/fulfillment/loading-list-print";
import { printPickingList } from "@/components/fulfillment/picking-list-print";
import { printTripChartList } from "@/components/fulfillment/trip-chart-list-print";
import { LoadingListDocumentPreview } from "@/components/fulfillment/loading-list-document-preview";
import { isDistributionOpsEnabled, isProductShelfLocationEnabled } from "@/lib/distribution-settings";
import { formatSaleKes } from "@/lib/sales";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { resolveLoadingSheetPrintSettings } from "@/lib/loading-sheet-print-settings";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useDebouncedValue } from "@/lib/use-debounced-value";

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
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("en-KE", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusLabel(status) {
  return String(status ?? "").replace(/_/g, " ");
}

export function DistributionLoadingListsScreen() {
  const { capabilities, organization, generalSettings, user } = useAuth();
  const allowed = isDistributionOpsEnabled(capabilities);
  const includeShelfLocation = isProductShelfLocationEnabled(capabilities);
  const organizationName = organization?.organization_name ?? organization?.company_name ?? organization?.name ?? capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME;
  const general = generalSettings();
  const loadingListPrintSettings = resolveLoadingSheetPrintSettings(
    capabilities?.module_settings?.distribution,
  );

  const [fromDate, setFromDate] = useState(daysAgoIso(5));
  const [toDate, setToDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);
  const [trips, setTrips] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [uoms, setUoms] = useState([]);

  const uomByProductCode = useMemo(
    () => buildUomByProductCode(catalogProducts, uoms),
    [catalogProducts, uoms],
  );

  const loadTrips = useCallback(async () => {
    if (!allowed) return;
    setListLoading(true);
    setError(null);
    try {
      const searchParamsApi = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra: {
          from_date: fromDate,
          to_date: toDate,
          has_orders: 1,
        },
      });
      const res = await apiRequest("/dispatch-trips", { searchParams: searchParamsApi });
      const parsed = parsePaginator(res);
      setTrips(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setTrips([]);
      setTotal(0);
      setTotalPages(1);
      setError(e instanceof ApiError ? e.message : "Failed to load trips");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [allowed, page, pageSize, debouncedSearch, fromDate, toDate]);

  useTabAwareDataLoad(loadTrips);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, fromDate, toDate]);

  const safePage = Math.min(page, totalPages);
  const tableLoading = loading || (listLoading && trips.length === 0);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? detail?.trip ?? null,
    [trips, selectedTripId, detail?.trip],
  );

  async function openTrip(trip) {
    setSelectedTripId(trip.id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const [tripRes, listRes, pickRes] = await Promise.all([
        apiRequest(`/dispatch-trips/${trip.id}`),
        apiRequest(`/dispatch-trips/${trip.id}/loading-list`),
        apiRequest(`/dispatch-trips/${trip.id}/picking-list`),
      ]);
      const loading_list = listRes.loading_list ?? listRes;
      const picking_list = pickRes.picking_list ?? pickRes;
      const { products, uoms: uomRows } = await fetchCatalogForProductCodes(
        apiRequest,
        collectFulfillmentProductCodes(loading_list, picking_list),
        organization?.id,
      );
      setCatalogProducts(products ?? []);
      setUoms(uomRows ?? []);
      setDetail({
        trip: tripRes,
        loading_list,
        picking_list,
        financial_summary: listRes.financial_summary ?? tripRes.financial_summary ?? null,
      });
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Failed to load loading list");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePrintTripChart() {
    if (!selectedTripId) return;

    setDetailError(null);
    setDetailLoading(true);
    try {
      const [tripRes, listRes] = await Promise.all([
        apiRequest(`/dispatch-trips/${selectedTripId}`),
        apiRequest(`/dispatch-trips/${selectedTripId}/loading-list`),
      ]);
      const freshTrip = tripRes;
      const freshList = listRes.loading_list ?? listRes;
      const financialSummary =
        listRes.financial_summary ?? freshTrip.financial_summary ?? detail?.financial_summary ?? null;
      setDetail((current) => ({
        ...current,
        trip: freshTrip,
        loading_list: freshList,
        financial_summary: financialSummary,
      }));
      printTripChartList({
        organization,
        generalSettings: general,
        organizationName,
        trip: freshTrip,
        loadingList: freshList,
        sales: freshTrip.sales,
        orders: freshList.orders,
        financialSummary,
        documentFooterText: resolvePrintFooter(
          mergeGeneralSettings(capabilities?.module_settings),
          "trip_chart",
        ),
        printedBy: user?.full_name ?? user?.username ?? null,
      });
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not refresh trip chart for print");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePrintPicking() {
    if (!selectedTripId) return;

    setDetailError(null);
    setDetailLoading(true);
    try {
      const pickRes = await apiRequest(`/dispatch-trips/${selectedTripId}/picking-list`);
      const freshPick = pickRes.picking_list ?? pickRes;
      const trip = detail?.trip ?? selectedTrip;
      setDetail((current) => ({ ...current, picking_list: freshPick }));
      printPickingList({
        organization,
        generalSettings: general,
        organizationName,
        pickingList: freshPick,
        trip,
        uomByProductCode,
        documentFooterText: resolvePrintFooter(
          mergeGeneralSettings(capabilities?.module_settings),
          "picking_list",
        ),
        printedBy: user?.full_name ?? user?.username ?? null,
        includeShelfLocation,
      });
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not refresh picking list for print");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePrint() {
    if (!selectedTripId || !detail?.loading_list) return;

    setDetailError(null);
    setDetailLoading(true);
    try {
      const listRes = await apiRequest(`/dispatch-trips/${selectedTripId}/loading-list`);
      const freshList = listRes.loading_list ?? listRes;
      const trip = detail.trip ?? selectedTrip;
      setDetail((current) => ({
        ...current,
        loading_list: freshList,
        financial_summary: listRes.financial_summary ?? current?.financial_summary ?? trip?.financial_summary ?? null,
      }));
      printLoadingList({
        organization,
        generalSettings: general,
        organizationName,
        loadingList: freshList,
        trip,
        financialSummary:
          listRes.financial_summary ?? detail?.financial_summary ?? trip?.financial_summary ?? null,
        printSettings: loadingListPrintSettings,
        documentFooterText: resolvePrintFooter(
          mergeGeneralSettings(capabilities?.module_settings),
          "loading_sheet",
        ),
        printedBy: user?.full_name ?? user?.username ?? null,
        distributionEnabled: allowed,
        uomByProductCode,
      });
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not refresh loading list for print");
    } finally {
      setDetailLoading(false);
    }
  }

  if (!allowed) {
    return (
      <CatalogPageShell
        title="Loading list"
        subtitle="Aggregated pick lists for dispatch trips"
      >
        <div className="theme-panel rounded-xl border p-6 text-sm">
          <p>Enable distribution operations in Organization settings → Distribution to use loading lists.</p>
        </div>
      </CatalogPageShell>
    );
  }

  const loadingList = detail?.loading_list;
  const documentFooterText = resolvePrintFooter(
    mergeGeneralSettings(capabilities?.module_settings),
    "loading_sheet",
  );

  return (
    <CatalogPageShell
      title="Loading lists"
      subtitle="Preview and print trip chart lists (by customer totals), picking lists, and loading lists"
    >
      {error ? <DashboardErrorBanner message={error} className="mb-4" /> : null}

      <FilterToolbar>
        <Field label="From">
          <input
            type="date"
            className="theme-input theme-input-focus h-[38px] min-w-[10rem] rounded-lg border px-3 py-2 text-sm outline-none"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            className="theme-input theme-input-focus h-[38px] min-w-[10rem] rounded-lg border px-3 py-2 text-sm outline-none"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </Field>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search trip, route, or date…"
        />
      </FilterToolbar>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <div className="theme-table-shell overflow-x-auto">
            <table className="theme-table w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="theme-table-head-row">
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Trip</th>
                  <th className="px-4 py-2.5 text-left">Route</th>
                  <th className="px-4 py-2.5 text-right">Orders</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={5} className="theme-subtext px-4 py-8 text-center">
                      Loading…
                    </td>
                  </tr>
                ) : trips.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="theme-subtext px-4 py-8 text-center">
                      No trips with orders for this period. Create a trip from Dispatch or Trips first.
                    </td>
                  </tr>
                ) : (
                  trips.map((trip) => {
                    const active = selectedTripId === trip.id;
                    return (
                      <tr
                        key={trip.id}
                        className={`theme-table-body-row cursor-pointer ${active ? "bg-[var(--theme-primary-subtle)]" : ""}`}
                        onClick={() => void openTrip(trip)}
                      >
                        <td className="px-4 py-2.5">{formatDisplayDate(trip.scheduled_date)}</td>
                        <td className="px-4 py-2.5 font-medium">{trip.trip_code}</td>
                        <td className="px-4 py-2.5">{trip.route?.route_name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {trip.sales_count ?? trip.sales?.length ?? 0}
                        </td>
                        <td className="px-4 py-2.5 capitalize">{statusLabel(trip.status)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>

        <div className="theme-panel rounded-xl border p-4">
          {!selectedTripId ? (
            <p className="theme-subtext text-sm">Select a trip to preview and print its loading list.</p>
          ) : detailLoading ? (
            <p className="theme-subtext text-sm">Loading list…</p>
          ) : detailError ? (
            <p className="text-sm text-red-600">{detailError}</p>
          ) : loadingList ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium theme-heading">
                    {selectedTrip?.trip_code ?? "Trip"}
                  </p>
                  <p className="theme-text-muted text-xs">
                    {loadingList.order_count ?? loadingList.orders?.length ?? 0} order
                    {(loadingList.order_count ?? loadingList.orders?.length ?? 0) === 1 ? "" : "s"} ·{" "}
                    {loadingList.line_count ??
                      loadingList.orders?.reduce((sum, order) => sum + (order.lines?.length ?? 0), 0) ??
                      0}{" "}
                    line
                    {(loadingList.line_count ??
                      loadingList.orders?.reduce((sum, order) => sum + (order.lines?.length ?? 0), 0) ??
                      0) === 1
                      ? ""
                      : "s"}{" "}
                    · {formatSaleKes(loadingList.total_amount)}
                    {loadingList.status ? (
                      <>
                        {" "}
                        · <span className="capitalize">{loadingList.status}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/fulfillment/trips/${selectedTripId}`}
                    className="theme-secondary-btn rounded-lg border px-3 py-1.5 text-xs font-medium"
                  >
                    Open trip
                  </Link>
                  <PrimaryButton type="button" showIcon={false} onClick={handlePrintTripChart}>
                    Print trip chart list
                  </PrimaryButton>
                  <PrimaryButton type="button" showIcon={false} onClick={handlePrintPicking}>
                    Print picking list
                  </PrimaryButton>
                  <PrimaryButton type="button" showIcon={false} onClick={handlePrint}>
                    Print loading list
                  </PrimaryButton>
                </div>
              </div>

              <LoadingListDocumentPreview
                loadingList={loadingList}
                trip={selectedTrip}
                financialSummary={detail?.financial_summary ?? selectedTrip?.financial_summary ?? null}
                organization={organization}
                generalSettings={general}
                organizationName={organizationName}
                printSettings={loadingListPrintSettings}
                documentFooterText={documentFooterText}
              />
            </>
          ) : null}
        </div>
      </div>
    </CatalogPageShell>
  );
}
