"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  invalidateTabAwareDataLoad,
  markTabAwareDataLoaded,
  useTabAwareDataLoad,
  useTabPaneActive,
} from "@/contexts/tab-pane-activity-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { PaginationBar } from "@/components/catalog/catalog-shared";
import { formatReportCell, formatReportKes, sumField } from "@/lib/reports/format";
import { normalizeReportMeta, normalizeReportRows, normalizeReportSummary } from "@/lib/reports/api-response";
import {
  ReportFilterBar,
  ReportKpiGrid,
  ReportPageShell,
  ReportTable,
} from "@/components/reports/report-screen-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { defaultReportBranchId, defaultReportDateRange } from "@/lib/reports/report-filters";
import { KraInvoicePreviewDialog } from "@/components/reports/kra-invoice-preview-dialog";
import { salesChannelLabel } from "@/lib/user-facing-labels";
import { useReportFilterOptions } from "@/lib/reports/use-report-filter-options";

const DEFAULT_PAGE_SIZE = 25;

function statusBadge(row) {
  const status = String(row.status ?? "").toLowerCase();
  if (status === "success") return { label: "Success", tone: "success" };
  if (status === "failed") return { label: "Failed", tone: "danger" };
  if (status === "pending") return { label: "Pending", tone: "warning" };
  return status ? { label: status, tone: "neutral" } : null;
}

export function KraReceiptsReportScreen({ definition }) {
  const { user, isOrgWide, capabilities } = useAuth();
  const { paneHref } = useTabPaneActive();
  const multiBranch = isMultiBranchCatalog(capabilities);
  const queryFilterOptions = useReportFilterOptions(definition.key);
  const defaultRange = useMemo(() => defaultReportDateRange(29), []);
  const defaultBranch = useMemo(() => defaultReportBranchId(user, isOrgWide), [user, isOrgWide]);

  const [rows, setRows] = useState([]);
  const [reportMeta, setReportMeta] = useState(null);
  const [reportSummary, setReportSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(DEFAULT_PAGE_SIZE);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [branchId, setBranchId] = useState(defaultBranch);
  const [queryFilters, setQueryFilters] = useState({ status: "", q: "" });
  const [branches, setBranches] = useState([]);
  const [previewRow, setPreviewRow] = useState(null);
  const [applied, setApplied] = useState({
    fromDate: defaultRange.from,
    toDate: defaultRange.to,
    branchId: defaultBranch,
    queryFilters: { status: "", q: "" },
  });

  useEffect(() => {
    fetchBranchesCached()
      .then((list) => setBranches(list ?? []))
      .catch(() => setBranches([]));
  }, []);

  const appliedKey = useMemo(() => JSON.stringify(applied), [applied]);
  const depsKey = `${definition.apiPath}|${page}|${pageSize}|${appliedKey}`;

  function handlePageSizeChange(next) {
    setPageSize(next);
    setPage(1);
  }

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = {
        per_page: pageSize,
        page,
        date_column: "receipt_date",
      };
      if (applied.fromDate) searchParams.from_date = applied.fromDate;
      if (applied.toDate) searchParams.to_date = applied.toDate;
      if (applied.branchId) searchParams.branch_id = applied.branchId;
      if (applied.queryFilters?.status) searchParams.status = applied.queryFilters.status;
      if (applied.queryFilters?.q) searchParams.q = applied.queryFilters.q;
      const res = await apiRequest(definition.apiPath, { searchParams, loading: false });
      setRows(normalizeReportRows(res));
      setReportMeta(normalizeReportMeta(res, page, pageSize));
      setReportSummary(normalizeReportSummary(res));
      markTabAwareDataLoaded(paneHref, depsKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load KRA receipts");
      setRows([]);
      setReportMeta(null);
      setReportSummary(null);
    } finally {
      setLoading(false);
    }
  }, [applied, definition.apiPath, depsKey, page, pageSize, paneHref]);

  const hasData = rows.length > 0 || reportMeta != null;
  useTabAwareDataLoad(loadReport, { depsKey, hasData });

  function refreshReport() {
    invalidateTabAwareDataLoad(paneHref);
    void loadReport();
  }

  const columns = useMemo(
    () => [
      { key: "receipt_date", label: "Date", accessor: (r) => r.receipt_date },
      {
        key: "order_no",
        label: "Order #",
        accessor: (r) => r.order_no ?? r.sale_order_num ?? r.sale_id,
      },
      {
        key: "invoice_number",
        label: "CU number",
        accessor: (r) => r.invoice_number || "—",
      },
      {
        key: "serial_number",
        label: "SCU / serial",
        accessor: (r) => r.serial_number || "—",
      },
      {
        key: "status",
        label: "Status",
        accessor: (r) => r.status,
        badge: statusBadge,
      },
      ...(multiBranch
        ? [{ key: "branch_name", label: "Branch", accessor: (r) => r.branch_name }]
        : []),
      {
        key: "channel",
        label: "Channel",
        accessor: (r) => salesChannelLabel(r.channel) || r.channel,
      },
      {
        key: "order_total",
        label: "Order total",
        accessor: (r) => r.order_total,
        align: "right",
        total: true,
      },
      {
        key: "total_vat",
        label: "VAT",
        accessor: (r) => r.total_vat,
        align: "right",
        total: true,
      },
      {
        key: "preview",
        label: "KRA invoice",
        accessor: (r) => (
          <button
            type="button"
            onClick={() => setPreviewRow(r)}
            className="font-medium text-[#185FA5] hover:underline"
          >
            Preview
          </button>
        ),
      },
    ],
    [multiBranch],
  );

  const kpis = useMemo(() => {
    const totalRows = reportMeta?.total ?? reportSummary?.row_count ?? rows.length;
    return [
      {
        id: "receipts",
        label: "Receipts",
        value: String(Math.round(Number(totalRows) || 0)),
      },
      {
        id: "total",
        label: "Order total",
        value: formatReportKes(reportSummary?.order_total ?? sumField(rows, "order_total")),
      },
      {
        id: "vat",
        label: "VAT",
        value: formatReportKes(reportSummary?.total_vat ?? sumField(rows, "total_vat")),
      },
    ];
  }, [reportMeta, reportSummary, rows]);

  const footerTotals = useMemo(() => {
    const orderTotal = reportSummary?.order_total ?? sumField(rows, "order_total");
    const vatTotal = reportSummary?.total_vat ?? sumField(rows, "total_vat");
    return {
      order_total: formatReportCell("order_total", orderTotal),
      total_vat: formatReportCell("total_vat", vatTotal),
    };
  }, [reportSummary, rows]);

  const branchLabel =
    branches.find((b) => String(b.id) === applied.branchId)?.branch_name ??
    (applied.branchId ? "" : "All branches");

  return (
    <>
      <ReportPageShell
        section={definition.section}
        title={definition.title}
        subtitle={definition.subtitle}
        exportConfig={{
          filename: definition.key ?? "kra-receipts",
          columns: columns
            .filter((c) => c.key !== "preview")
            .map((col) => ({
              ...col,
              accessor: (row) => formatReportCell(col.key, col.accessor(row)),
            })),
          exportSource: {
            path: definition.apiPath,
            searchParams: {
              date_column: "receipt_date",
              ...(applied.fromDate ? { from_date: applied.fromDate } : {}),
              ...(applied.toDate ? { to_date: applied.toDate } : {}),
              ...(applied.branchId ? { branch_id: applied.branchId } : {}),
              ...(applied.queryFilters?.status ? { status: applied.queryFilters.status } : {}),
              ...(applied.queryFilters?.q ? { q: applied.queryFilters.q } : {}),
            },
          },
          meta: {
            fromDate: applied.fromDate,
            toDate: applied.toDate,
            branchName: branchLabel,
          },
          footerRow: footerTotals,
          disabled: loading,
        }}
      >
        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <ReportFilterBar
          reportKey={definition.key}
          fromDate={fromDate}
          toDate={toDate}
          branchId={branchId}
          branches={branches}
          queryFilterValues={queryFilters}
          queryFilterOptions={queryFilterOptions}
          onQueryFilterChange={(id, value) =>
            setQueryFilters((prev) => ({ ...prev, [id]: value }))
          }
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onBranchChange={setBranchId}
          onExtraChange={() => {}}
          onFilter={() => {
            setPage(1);
            setApplied({
              fromDate,
              toDate,
              branchId,
              queryFilters: {
                status: queryFilters.status ?? "",
                q: String(queryFilters.q ?? "").trim(),
              },
            });
          }}
          onRefresh={() => void refreshReport()}
          onReset={() => {
            const range = defaultReportDateRange(29);
            const bid = defaultReportBranchId(user, isOrgWide);
            setFromDate(range.from);
            setToDate(range.to);
            setBranchId(bid);
            setQueryFilters({ status: "", q: "" });
            setPage(1);
            setApplied({
              fromDate: range.from,
              toDate: range.to,
              branchId: bid,
              queryFilters: { status: "", q: "" },
            });
          }}
          loading={loading}
          showBranchFilter={multiBranch}
        />

        {!loading ? <ReportKpiGrid items={kpis} /> : null}

        {loading ? (
          <p className="text-sm text-slate-500">Loading report…</p>
        ) : (
          <>
            <ReportTable columns={columns} rows={rows} footerTotals={footerTotals} />
            <PaginationBar
              page={page}
              totalPages={reportMeta?.last_page ?? 1}
              total={reportMeta?.total ?? rows.length}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )}
      </ReportPageShell>

      <KraInvoicePreviewDialog
        open={Boolean(previewRow)}
        row={previewRow}
        onClose={() => setPreviewRow(null)}
      />
    </>
  );
}
