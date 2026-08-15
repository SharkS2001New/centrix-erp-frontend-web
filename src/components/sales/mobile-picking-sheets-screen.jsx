"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FilterToolbar,
  PrimaryButton,
  SearchInput,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";
import {
  formatPickingPriceLabel,
  cleanPickingQuantityLabel,
  cleanRetailBreakdown,
  printPickingList,
  isSalesPickingLayout,
  sortPickingLinesByPackageCount,
  formatRouteNamesPhrase,
} from "@/components/fulfillment/picking-list-print";
import { formatSaleKes } from "@/lib/sales";
import { formatTonnage, pickingLineWeightKg, summarizePickingTonnage } from "@/lib/load-weight";
import {
  getMobileSheetsDefaultDateRange,
  shouldShowMobilePickingLists,
} from "@/lib/sales-settings";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { resolveLoadingSheetPrintSettings } from "@/lib/loading-sheet-print-settings";
import {
  buildUomByProductCode,
  fetchCatalogForProductCodes,
} from "@/lib/fulfillment-quantity";
import { fetchRoutesCached } from "@/lib/reference-data-cache";
import { useReportRefreshUi } from "@/lib/list-refresh-ui";
import {
  BatchActionBar,
  TABLE_ROW_CHECKBOX_CLASS,
  TableSelectAllHeader,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-KE", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function sheetKey(row) {
  return `${row.route_id}:${row.list_date}`;
}

const FILTER_APPLY_BTN_CLASS =
  "inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-[var(--theme-primary)]/30 bg-[var(--theme-primary-muted)] px-3 text-sm font-medium text-[var(--theme-primary)] hover:bg-[#d4e8f9] disabled:opacity-50";

export default function MobilePickingSheetsScreen() {
  const { capabilities, organization, generalSettings, user } = useAuth();
  const allowed = shouldShowMobilePickingLists(capabilities);
  const organizationName = organization?.name ?? capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME;
  const general = generalSettings();
  const pickingPrintSettings = resolveLoadingSheetPrintSettings(
    capabilities?.module_settings?.distribution,
  );
  const defaultRange = getMobileSheetsDefaultDateRange(capabilities?.module_settings);

  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [appliedFrom, setAppliedFrom] = useState(defaultRange.from);
  const [appliedTo, setAppliedTo] = useState(defaultRange.to);
  const [routeFilter, setRouteFilter] = useState("all");
  const [routes, setRoutes] = useState([]);
  const [search, setSearch] = useState("");
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [uomByProductCode, setUomByProductCode] = useState(new Map());
  const [combinedPrinting, setCombinedPrinting] = useState(false);
  const [combinedError, setCombinedError] = useState(null);

  const selection = usePageRowSelection();
  const {
    selectedIds,
    selectedCount,
    hasSelection,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = selection;
  const listRefresh = useReportRefreshUi({ loading, hasRows: sheets.length > 0 });

  const routeFilterOptions = useMemo(() => {
    const sorted = [...routes].sort((a, b) =>
      String(a.route_name ?? "").localeCompare(String(b.route_name ?? "")),
    );
    return [
      { value: "all", label: "All routes" },
      ...sorted.map((route) => ({
        value: String(route.id),
        label: route.route_name || `Route #${route.id}`,
      })),
    ];
  }, [routes]);

  const loadSheets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/sales/mobile-picking-sheets", {
        searchParams: { from_date: appliedFrom, to_date: appliedTo },
      });
      setSheets(res.data ?? []);
      clearSelection();
    } catch (e) {
      setSheets([]);
      setError(e instanceof ApiError ? e.message : "Failed to load picking lists");
    } finally {
      setLoading(false);
    }
  }, [appliedFrom, appliedTo, clearSelection]);

  useEffect(() => {
    if (!allowed) return;
    void loadSheets();
  }, [allowed, loadSheets]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void fetchRoutesCached(organization?.id)
      .then((rows) => {
        if (!cancelled) setRoutes(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setRoutes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, organization?.id]);

  function applyFilters() {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  }

  const filteredSheets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sheets.filter((row) => {
      if (routeFilter !== "all" && String(row.route_id) !== String(routeFilter)) {
        return false;
      }
      if (!q) return true;
      const route = String(row.route_name ?? "").toLowerCase();
      const date = String(row.list_date ?? "").toLowerCase();
      return route.includes(q) || date.includes(q);
    });
  }, [sheets, search, routeFilter]);

  const pageKeys = useMemo(() => filteredSheets.map(sheetKey), [filteredSheets]);

  const selectedRows = useMemo(
    () => sheets.filter((row) => selectedIds.has(sheetKey(row))),
    [sheets, selectedIds],
  );

  const combinedSelection = useMemo(() => {
    if (selectedRows.length < 2) {
      return { ok: false, reason: null, listDate: null, routeIds: [], routeNames: [] };
    }
    const dates = [...new Set(selectedRows.map((row) => row.list_date))];
    if (dates.length !== 1) {
      return {
        ok: false,
        reason: "Select routes from the same date to print a combined picking list.",
        listDate: null,
        routeIds: [],
        routeNames: [],
      };
    }
    return {
      ok: true,
      reason: null,
      listDate: dates[0],
      routeIds: selectedRows.map((row) => Number(row.route_id)),
      routeNames: selectedRows.map((row) => row.route_name || `Route #${row.route_id}`),
    };
  }, [selectedRows]);

  const openSheet = useCallback(async (row) => {
    const key = sheetKey(row);
    setSelectedKey(key);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiRequest("/sales/mobile-picking-sheets/detail", {
        searchParams: { route_id: row.route_id, list_date: row.list_date },
      });
      setDetail(res);
      const productCodes = (res.picking_list?.lines ?? []).map((line) => line.product_code);
      const { products, uoms } = await fetchCatalogForProductCodes(
        apiRequest,
        productCodes,
        organization?.id,
      );
      setUomByProductCode(buildUomByProductCode(products, uoms));
    } catch (e) {
      setDetail(null);
      setDetailError(e instanceof ApiError ? e.message : "Failed to load picking list");
    } finally {
      setDetailLoading(false);
    }
  }, [organization?.id]);

  const pickingList = detail?.picking_list;
  const pickLines = useMemo(
    () => sortPickingLinesByPackageCount(pickingList?.lines ?? []),
    [pickingList?.lines],
  );
  const salesLayout = isSalesPickingLayout(pickingList, "sales");
  const orderTotalValue =
    pickingList?.order_total_value != null
      ? Number(pickingList.order_total_value)
      : (detail?.orders ?? []).reduce((sum, order) => sum + Number(order.order_total || 0), 0);
  const pickTonnage = summarizePickingTonnage(pickingList, pickLines);

  function printFromDetail(freshPick, routeNames) {
    printPickingList({
      organization,
      generalSettings: general,
      organizationName,
      pickingList: freshPick,
      trip: {
        trip_code: freshPick.combined ? null : freshPick.list_number,
        scheduled_date: freshPick.list_date,
        route_names: routeNames,
      },
      uomByProductCode,
      layout: "sales",
      printSettings: pickingPrintSettings,
      documentFooterText: resolvePrintFooter(
        mergeGeneralSettings(capabilities?.module_settings),
        "picking_list",
      ),
      printedBy: user?.full_name ?? user?.username ?? null,
      includeShelfLocation: false,
    });
  }

  async function handlePrint() {
    const list = detail?.picking_list;
    if (!list) return;
    setDetailLoading(true);
    try {
      const res = await apiRequest("/sales/mobile-picking-sheets/detail", {
        searchParams: {
          route_id: list.route_id,
          list_date: list.list_date,
        },
      });
      const freshPick = res.picking_list ?? res;
      setDetail(res);
      printFromDetail(freshPick, [
        ...(freshPick.route_names ?? []),
        freshPick.route?.route_name,
      ].filter(Boolean));
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not refresh picking list for print");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePrintCombined() {
    if (!combinedSelection.ok) {
      setCombinedError(combinedSelection.reason);
      return;
    }
    setCombinedError(null);
    setCombinedPrinting(true);
    try {
      const res = await apiRequest("/sales/mobile-picking-sheets/detail", {
        searchParams: {
          route_ids: combinedSelection.routeIds.join(","),
          list_date: combinedSelection.listDate,
        },
      });
      const freshPick = res.picking_list ?? res;
      const productCodes = (freshPick.lines ?? []).map((line) => line.product_code);
      const { products, uoms } = await fetchCatalogForProductCodes(
        apiRequest,
        productCodes,
        organization?.id,
      );
      const uomMap = buildUomByProductCode(products, uoms);
      setUomByProductCode(uomMap);
      setDetail(res);
      setSelectedKey(`combined:${combinedSelection.listDate}:${combinedSelection.routeIds.join("-")}`);
      printPickingList({
        organization,
        generalSettings: general,
        organizationName,
        pickingList: freshPick,
        trip: {
          scheduled_date: freshPick.list_date,
          route_names: freshPick.route_names ?? combinedSelection.routeNames,
        },
        uomByProductCode: uomMap,
        layout: "sales",
        printSettings: pickingPrintSettings,
        documentFooterText: resolvePrintFooter(
          mergeGeneralSettings(capabilities?.module_settings),
          "picking_list",
        ),
        printedBy: user?.full_name ?? user?.username ?? null,
        includeShelfLocation: false,
      });
    } catch (e) {
      setCombinedError(
        e instanceof ApiError ? e.message : "Could not build combined picking list",
      );
    } finally {
      setCombinedPrinting(false);
    }
  }

  if (!allowed) {
    return (
      <CatalogPageShell
        title="Picking list"
        subtitle="Product pick lists for mobile route orders"
      >
        <div className="theme-panel rounded-xl border p-6 text-sm">
          {isDistributionOpsEnabled(capabilities) ? (
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

  return (
    <CatalogPageShell
      title="Picking list"
      subtitle="Print product pick lists aggregated from mobile orders by route and delivery date"
      action={
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadSheets()}
          className={`${SECONDARY_BTN_CLASS} gap-2 px-3 py-2.5`}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      {error ? <DashboardErrorBanner message={error} className="mb-4" /> : null}
      {combinedError ? <DashboardErrorBanner message={combinedError} className="mb-4" /> : null}

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
        <Field label="Route">
          <FilterSelect
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            options={routeFilterOptions}
          />
        </Field>
        <button
          type="button"
          disabled={loading}
          onClick={applyFilters}
          className={FILTER_APPLY_BTN_CLASS}
        >
          Filter
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadSheets()}
          className={SECONDARY_BTN_CLASS}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search route or date…" />
      </FilterToolbar>

      {hasSelection ? (
        <BatchActionBar count={selectedCount} onClear={clearSelection}>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={combinedPrinting || !combinedSelection.ok}
            onClick={() => void handlePrintCombined()}
            title={
              combinedSelection.ok
                ? `Print combined list for ${formatRouteNamesPhrase(combinedSelection.routeNames)}`
                : combinedSelection.reason || "Select two or more routes on the same date"
            }
          >
            {combinedPrinting ? "Preparing…" : "Print combined picking list"}
          </PrimaryButton>
          {!combinedSelection.ok && combinedSelection.reason ? (
            <span className="theme-subtext text-xs">{combinedSelection.reason}</span>
          ) : combinedSelection.ok ? (
            <span className="theme-subtext text-xs">
              {formatDisplayDate(combinedSelection.listDate)} ·{" "}
              {formatRouteNamesPhrase(combinedSelection.routeNames)}
            </span>
          ) : null}
        </BatchActionBar>
      ) : null}

      <div className={`grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] ${listRefresh.contentClassName}`.trim()}>
        <div className="theme-table-shell overflow-x-auto">
          <table className="theme-table w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="theme-table-head-row">
                <TableSelectAllHeader
                  checked={isAllOnPageSelected(pageKeys)}
                  indeterminate={isSomeOnPageSelected(pageKeys)}
                  onChange={(checked) => toggleAllOnPage(checked, pageKeys)}
                  label="Select routes for combined print"
                />
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">Route</th>
                <th className="px-4 py-2.5 text-right">Orders</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {listRefresh.showInitialLoading ? (
                <tr>
                  <td colSpan={5} className="theme-subtext px-4 py-8 text-center">
                    Loading…
                  </td>
                </tr>
              ) : filteredSheets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="theme-subtext px-4 py-8 text-center">
                    No mobile picking lists for this period.
                  </td>
                </tr>
              ) : (
                filteredSheets.map((row) => {
                  const key = sheetKey(row);
                  const active = selectedKey === key;
                  return (
                    <tr
                      key={key}
                      className={`theme-table-body-row cursor-pointer ${active ? "bg-[var(--theme-primary-subtle)]" : ""}`}
                      onClick={() => void openSheet(row)}
                    >
                      <td
                        className="w-10 px-3 py-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(key)}
                          onChange={() => toggleOne(key)}
                          className={TABLE_ROW_CHECKBOX_CLASS}
                          aria-label={`Select ${row.route_name}`}
                        />
                      </td>
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
            <p className="theme-subtext text-sm">
              Select a route and date to preview and print, or check two or more routes on the same
              date for a combined picking list.
            </p>
          ) : detailLoading ? (
            <p className="theme-subtext text-sm">Loading picking list…</p>
          ) : detailError ? (
            <p className="text-sm text-red-600">{detailError}</p>
          ) : pickingList ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="theme-heading text-sm font-semibold">
                    {pickingList.combined
                      ? `Picking list for ${
                          pickingList.route_names_phrase ||
                          formatRouteNamesPhrase(pickingList.route_names ?? [])
                        }`
                      : pickingList.route?.route_name || "Picking list"}
                  </p>
                  <p className="theme-text-muted text-xs">
                    {pickingList.order_count} order{pickingList.order_count === 1 ? "" : "s"} ·{" "}
                    {pickLines.length} product{pickLines.length === 1 ? "" : "s"}
                    {" · "}
                    {formatTonnage(pickTonnage.totalKg)} load
                    {pickTonnage.vehicleMaxKg ? ` / ${formatTonnage(pickTonnage.vehicleMaxKg)} vehicle` : ""}
                  </p>
                </div>
                {!pickingList.combined ? (
                  <PrimaryButton type="button" showIcon={false} onClick={handlePrint}>
                    Print picking list
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    type="button"
                    showIcon={false}
                    onClick={() =>
                      printFromDetail(pickingList, pickingList.route_names ?? [])
                    }
                  >
                    Print combined picking list
                  </PrimaryButton>
                )}
              </div>

              <div className="theme-table-shell overflow-x-auto">
                <table className="theme-table w-full text-sm">
                  <thead>
                    <tr className="theme-table-head-row">
                      <th className="px-3 py-2 text-left">Product Name</th>
                      <th className="px-3 py-2 text-left">Quantity</th>
                      <th className="px-3 py-2 text-left">Price</th>
                      <th className="px-3 py-2 text-right">Weight</th>
                      <th className="px-3 py-2 text-right">Line amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickLines.map((line) => (
                      <tr key={`${line.product_code}-${line.line_no}`} className="theme-table-body-row">
                        <td className="px-3 py-2 font-medium">{line.product_name}</td>
                        <td className="px-3 py-2">
                          <div className="tabular-nums">
                            {cleanPickingQuantityLabel(line.quantity_label)}
                          </div>
                          {line.retail_breakdown ? (
                            <div className="theme-subtext text-xs">
                              ({cleanRetailBreakdown(line.retail_breakdown)})
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {formatPickingPriceLabel(line) || "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.weight_missing ? "—" : formatTonnage(pickingLineWeightKg(line))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatSaleKes(line.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {salesLayout ? (
                <div className="mt-3 flex items-center justify-between border-t border-[var(--theme-border)] pt-3 text-sm font-semibold">
                  <span>Totals Value of Order</span>
                  <span className="tabular-nums">{formatSaleKes(orderTotalValue)}</span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </CatalogPageShell>
  );
}
