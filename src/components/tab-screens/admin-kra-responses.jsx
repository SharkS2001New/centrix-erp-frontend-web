"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useOrgFormat } from "@/lib/org-format";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useAdminApi } from "@/contexts/admin-api-context";
import { isKraFiscalizationActive } from "@/lib/finance-settings";
import { platformOrgSettingsHref } from "@/lib/platform-admin-nav";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FilterToolbar,
  PaginationBar,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { KRA_RESPONSE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { KraResponseDetailDialog } from "@/components/reports/kra-invoice-preview-dialog";
import { KraDeviceStatusBanner } from "@/components/reports/kra-device-status-banner";
import { notifyError, notifySuccess } from "@/lib/notify";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { todayCalendarDate } from "@/lib/datetime";
import { salesChannelLabel } from "@/lib/user-facing-labels";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
];

export function AdminKraResponsesScreen() {
  const { dateTime } = useOrgFormat();
  const { capabilities } = useAuth();
  const { adminPath, isPlatformManaged, organizationId: platformOrgId, tenantCapabilities } = useAdminApi();
  const params = useParams();
  const today = useMemo(() => todayCalendarDate(), []);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const effectiveCapabilities = isPlatformManaged ? tenantCapabilities ?? capabilities : capabilities;

  const kraFiscalizationActive = isKraFiscalizationActive(
    effectiveCapabilities?.module_settings,
    effectiveCapabilities,
  );
  const settingsHref = isPlatformManaged ? platformOrgSettingsHref(platformOrgId ?? params?.id) : null;
  const showingTodayOnly = fromDate === today && toDate === today;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: search,
        extra: {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
        },
      });

      const [res, statusRes] = await Promise.all([
        apiRequest(adminPath("/kra-responses"), { searchParams }),
        apiRequest(adminPath("/kra/device-status")).catch(() => null),
      ]);

      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setMeta({
        current_page: parsed.page,
        last_page: parsed.totalPages,
        total: parsed.total,
        per_page: parsed.perPage,
      });
      setDeviceStatus(statusRes);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load KRA responses");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [adminPath, page, pageSize, search, fromDate, toDate, statusFilter]);

  useTabAwareDataLoad(load);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, statusFilter, search]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  async function retryReceipt(row) {
    setRetryingId(row.id);
    try {
      const res = await apiRequest(adminPath(`/kra-responses/${row.id}/retry`), { method: "POST" });
      notifySuccess(res.message ?? "Retry succeeded.");
      await load();
      if (res.kra_response) setSelected(res.kra_response);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setFromDate(today);
    setToDate(today);
  }

  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? 0;

  return (
    <CatalogPageShell
      title="KRA device log"
      subtitle={
        showingTodayOnly
          ? "Today's fiscal receipt submissions from checkout and credit notes"
          : "Fiscal receipt submissions from checkout and credit notes"
      }
      action={
        <CatalogListExport
          title="KRA device log"
          filename="kra-responses"
          apiPath={adminPath("/kra-responses")}
          columns={KRA_RESPONSE_EXPORT_COLUMNS}
          totalCount={total}
          getSearchParams={() =>
            buildPageParams({
              page: 1,
              perPage: 200,
              q: search,
              extra: {
                from_date: fromDate || undefined,
                to_date: toDate || undefined,
                status: statusFilter !== "all" ? statusFilter : undefined,
              },
            })
          }
          disabled={loading}
        />
      }
    >
      {!isPlatformManaged ? (
        <AdminBreadcrumb items={[{ label: "Administration", href: "/admin" }, { label: "KRA device log" }]} />
      ) : null}

      <div className="mb-4 space-y-2">
        <KraDeviceStatusBanner
          capabilities={effectiveCapabilities}
          deviceStatus={deviceStatus}
          settingsHref={settingsHref}
        />
      </div>

      <FilterToolbar className="mb-4">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order #, invoice, sale id…"
        />
        <Field label="From">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={inputClassName()}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={inputClassName()}
          />
        </Field>
        <Field label="Status">
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </Field>
        <button
          type="button"
          onClick={resetFilters}
          className="theme-secondary-btn self-end rounded-lg px-3 py-2 text-sm font-medium"
        >
          Today only
        </button>
      </FilterToolbar>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Serial</th>
              <th className="px-4 py-3">Logged at</th>
              <th className="px-4 py-3">Error</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  {showingTodayOnly ? "No KRA device logs for today yet." : "No KRA device logs in this date range."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">{r.order_no ?? r.sale_id ?? "—"}</td>
                  <td className="px-4 py-3">
                    {salesChannelLabel(r.channel) || r.channel || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.invoice_number ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{r.status ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.serial_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.created_at ? dateTime(r.created_at) : r.kra_timestamp ? dateTime(r.kra_timestamp) : "—"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-red-600" title={r.error_message ?? ""}>
                    {r.error_message ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="text-[#185FA5] hover:underline"
                    >
                      Details
                    </button>
                    {r.status !== "success" && r.sale_id ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          disabled={retryingId === r.id || !kraFiscalizationActive}
                          onClick={() => void retryReceipt(r)}
                          className="text-amber-800 hover:underline disabled:opacity-50"
                        >
                          {retryingId === r.id ? "Retrying…" : "Retry"}
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && total > 0 ? (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        ) : null}
      </div>

      {selected ? (
        <KraResponseDetailDialog
          open={Boolean(selected)}
          row={selected}
          apiBasePath={adminPath("/kra-responses")}
          showDevicePayload
          onClose={() => setSelected(null)}
        />
      ) : null}
    </CatalogPageShell>
  );
}
