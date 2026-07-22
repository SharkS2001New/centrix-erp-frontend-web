"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { PodAttachmentLink } from "@/components/fulfillment/pod-attachment-preview";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  PaginationBar,
  PrimaryButton,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { POD_RECORD_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";
import { formatOrderNumber, saleCustomerLabel } from "@/lib/sales";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useListUrlSearch } from "@/lib/use-list-url-search";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "complete", label: "Complete" },
  { value: "partial", label: "Partial" },
  { value: "refused", label: "Refused" },
];

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function FulfillmentPodRecordsScreen() {
  const { capabilities } = useAuth();
  const distributionEnabled = isDistributionOpsEnabled(capabilities);

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState(() => isoDate(new Date(Date.now() - 7 * 86400000)));
  const [toDate, setToDate] = useState(() => isoDate());
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);

  const loadData = useCallback(async () => {
    setError(null);
    setListLoading(true);
    try {
      const searchParamsApi = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        filters: statusFilter !== "all" ? { status: statusFilter } : {},
        extra: {
          from_date: fromDate,
          to_date: toDate,
        },
      });
      const res = await apiRequest("/pod-records", { searchParams: searchParamsApi });
      const parsed = parsePaginator(res);
      setRecords(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load POD records");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, fromDate, toDate, statusFilter]);

  useTabAwareDataLoad(loadData);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, fromDate, toDate, statusFilter]);

  const safePage = Math.min(page, totalPages);
  const tableLoading = loading || (listLoading && records.length === 0);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  const buildExportSearchParams = useCallback(
    () =>
      buildPageParams({
        page: 1,
        perPage: 200,
        q: debouncedSearch,
        filters: statusFilter !== "all" ? { status: statusFilter } : {},
        extra: {
          from_date: fromDate,
          to_date: toDate,
        },
      }),
    [debouncedSearch, statusFilter, fromDate, toDate],
  );

  if (!distributionEnabled) {
    return (
      <CatalogPageShell title="Proof of delivery" subtitle="Delivery confirmations and signatures">
        <p className="text-sm text-slate-500">
          Enable distribution operations in Admin → Settings → Distribution.
        </p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="Proof of delivery"
      subtitle="Review delivery confirmations, photos, and signatures"
      action={
        <CatalogListExport
          title="Proof of delivery"
          filename="pod-records"
          apiPath="/pod-records"
          columns={POD_RECORD_EXPORT_COLUMNS}
          totalCount={total}
          getSearchParams={buildExportSearchParams}
          disabled={loading || listLoading}
        />
      }
    >
      <DashboardErrorBanner message={error} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipient or order…" />
        <Field label="From">
          <input type="date" className={inputClassName()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputClassName()} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <Field label="Status">
          <FilterSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUS_OPTIONS} />
        </Field>
        <PrimaryButton type="button" showIcon={false} onClick={() => loadData()}>
          Refresh
        </PrimaryButton>
      </div>

      {tableLoading ? (
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span
            className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[#185FA5]"
            aria-hidden
          />
          Loading POD records…
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-slate-500">No proof-of-delivery records in this period.</p>
      ) : (
        <>
          <div className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Captured</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Received by</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Attachments</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{new Date(record.captured_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Link href={`/sales/orders/${record.sale_id}`} className="font-mono text-[#185FA5] hover:underline">
                        {formatOrderNumber(record.sale ?? record.sale_id)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{record.sale ? saleCustomerLabel(record.sale) : "—"}</td>
                    <td className="px-4 py-3">{record.recipient_name}</td>
                    <td className="px-4 py-3 capitalize">{record.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {record.photo_path ? (
                          <PodAttachmentLink recordId={record.id} kind="photo" label="Photo" />
                        ) : null}
                        {record.signature_path ? (
                          <PodAttachmentLink recordId={record.id} kind="signature" label="Signature" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
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
        </>
      )}
    </CatalogPageShell>
  );
}
