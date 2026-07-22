"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useOrgFormat } from "@/lib/org-format";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useAdminApi } from "@/contexts/admin-api-context";
import { isKraDeviceConfigured, isKraFiscalizationActive } from "@/lib/finance-settings";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
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
import { notifyError, notifySuccess } from "@/lib/notify";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { todayCalendarDate } from "@/lib/datetime";


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

  const kraConfigured = isKraDeviceConfigured(effectiveCapabilities?.module_settings, effectiveCapabilities);
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
  }, [adminPath, page, search, fromDate, toDate, statusFilter]);

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
          title="KRA responses"
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
        {kraConfigured ? (
          <p
            className={`rounded-lg border px-3 py-2 text-sm ${
              !kraFiscalizationActive
                ? "border-slate-200 bg-slate-50 text-slate-800"
                : deviceStatus?.reachable
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            KRA device is <strong>configured</strong>
            {deviceStatus?.device_ip ? ` (${deviceStatus.device_ip})` : ""}.
            {kraFiscalizationActive ? (
              <>
                {" "}
                Sales fiscalization is <strong>on</strong>.
              </>
            ) : (
              <>
                {" "}
                Sales fiscalization is <strong>off</strong> — new sales will not call the device.
              </>
            )}
            {deviceStatus?.bypass_above_amount ? (
              <>
                {" "}
                Orders at or above KES {Number(deviceStatus.bypass_above_amount).toLocaleString()} bypass KRA.
              </>
            ) : null}
            {deviceStatus?.message ? ` ${deviceStatus.message}` : ""}
            {deviceStatus?.test_mode ? " Test mode is on." : ""}
          </p>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            KRA device is <strong>not configured</strong>. Set it up under{" "}
            {settingsHref ? (
              <Link href={settingsHref} className="font-medium text-[#185FA5] hover:underline">
                Organization settings → Finance
              </Link>
            ) : (
              <OrgSettingsPlatformHint area="Organization settings → Finance" />
            )}{" "}
            (device IP, serial, PIN) before checkout can submit fiscal receipts.
          </p>
        )}
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
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {showingTodayOnly ? "No KRA device logs for today yet." : "No KRA device logs in this date range."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">{r.order_no ?? r.sale_id ?? "—"}</td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelected(null)}>
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-slate-900">KRA response #{selected.id}</h3>
                <p className="text-sm text-slate-500">
                  Order {selected.order_no ?? selected.sale_id} · {selected.status}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-800">
                Close
              </button>
            </div>
            {selected.signature_link ? (
              <p className="mt-3 text-sm">
                <a href={selected.signature_link} target="_blank" rel="noreferrer" className="text-[#185FA5] underline">
                  Open signature link
                </a>
              </p>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Request payload</p>
                <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                  {JSON.stringify(selected.request_payload ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Response payload</p>
                <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                  {JSON.stringify(selected.response_payload ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
