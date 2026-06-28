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
import { printLoadingList } from "@/components/fulfillment/loading-list-print";
import { LoadingListDocumentPreview } from "@/components/fulfillment/loading-list-document-preview";
import { formatSaleKes } from "@/lib/sales";
import { shouldShowMobileLoadingSheets } from "@/lib/sales-settings";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { mergeGeneralSettings } from "@/lib/general-settings";

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

export default function MobileLoadingSheetsScreen() {
  const { capabilities, organization, generalSettings, user } = useAuth();
  const allowed = shouldShowMobileLoadingSheets(capabilities);
  const organizationName = organization?.name ?? capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME;
  const general = generalSettings();
  const distributionSettings = capabilities?.module_settings?.distribution ?? {};

  const [fromDate, setFromDate] = useState(daysAgoIso(7));
  const [toDate, setToDate] = useState(todayIso());
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
      setError(e instanceof ApiError ? e.message : "Failed to load loading sheets");
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
      const res = await apiRequest("/sales/mobile-loading-sheets/detail", {
        searchParams: { route_id: row.route_id, list_date: row.list_date },
      });
      setDetail(res);
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Failed to load sheet detail");
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
      const res = await apiRequest("/sales/mobile-loading-sheets/detail", {
        searchParams: { route_id: routeId, list_date: listDate },
      });
      setDetail(res);
      printLoadingList({
        organization,
        generalSettings: general,
        organizationName,
        loadingList: res.loading_list,
        printSettings: distributionSettings,
        documentFooterText: resolvePrintFooter(mergeGeneralSettings(capabilities?.module_settings), "loading_sheet"),
        printedBy: user?.full_name ?? user?.username ?? null,
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
        subtitle="Aggregated pick lists for mobile route orders"
      >
        <div className="theme-panel rounded-xl border p-6 text-sm">
          {capabilities?.modules?.distribution ? (
            <p>
              Loading lists are managed under{" "}
              <Link href="/fulfillment/trips" className="theme-link font-medium">
                Distribution → Trips
              </Link>{" "}
              when Distribution is enabled.
            </p>
          ) : (
            <p>Enable the mobile application for this organization to use the loading list.</p>
          )}
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
      title="Loading list"
      subtitle="Print aggregated pick lists from mobile orders by route and delivery date"
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
                    No mobile loading sheets for this period.
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
            <p className="theme-subtext text-sm">Select a route and date to preview and print the loading sheet.</p>
          ) : detailLoading ? (
            <p className="theme-subtext text-sm">Loading sheet detail…</p>
          ) : detailError ? (
            <p className="text-sm text-red-600">{detailError}</p>
          ) : loadingList ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="theme-text-muted text-xs">
                  {loadingList.order_count} order{loadingList.order_count === 1 ? "" : "s"} ·{" "}
                  {formatSaleKes(loadingList.total_amount)}
                </p>
                <PrimaryButton type="button" showIcon={false} onClick={handlePrint}>
                  Print loading sheet
                </PrimaryButton>
              </div>

              <LoadingListDocumentPreview
                loadingList={loadingList}
                organization={organization}
                generalSettings={general}
                organizationName={organizationName}
                printSettings={distributionSettings}
                documentFooterText={documentFooterText}
              />

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
