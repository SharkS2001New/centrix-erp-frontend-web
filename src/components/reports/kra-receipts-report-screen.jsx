"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  invalidateTabAwareDataLoad,
  markTabAwareDataLoaded,
  useTabAwareDataLoad,
  useTabPaneActive,
} from "@/contexts/tab-pane-activity-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import {
  PaginationBar,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";
import { usePageRowSelection, TABLE_ROW_CHECKBOX_CLASS, BatchActionBar } from "@/components/catalog/table-row-selection";
import { formatReportCell, formatReportKes, sumField } from "@/lib/reports/format";
import { normalizeReportMeta, normalizeReportRows, normalizeReportSummary } from "@/lib/reports/api-response";
import {
  ReportBadge,
  ReportFilterBar,
  ReportKpiGrid,
  ReportPageShell,
} from "@/components/reports/report-screen-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { defaultReportBranchId, defaultReportDateRange } from "@/lib/reports/report-filters";
import { KraResponseDetailDialog } from "@/components/reports/kra-invoice-preview-dialog";
import { salesChannelLabel } from "@/lib/user-facing-labels";
import { formatKraReportOrderNo } from "@/lib/sales";
import { useReportFilterOptions } from "@/lib/reports/use-report-filter-options";
import { kraReportRowId, printKraFiscalReceipts } from "@/lib/kra-fiscal-receipt-print";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isKraFiscalizationActive } from "@/lib/finance-settings";

const DEFAULT_PAGE_SIZE = 25;

function statusBadge(row) {
  const status = String(row.status ?? "").toLowerCase();
  if (status === "success") return { label: "Success", tone: "success" };
  if (status === "failed") return { label: "Failed", tone: "danger" };
  if (status === "pending") return { label: "Pending", tone: "warning" };
  return status ? { label: status, tone: "neutral" } : null;
}

function isPrintableKraRow(row) {
  return String(row?.status ?? "").toLowerCase() === "success";
}

export function KraReceiptsReportScreen({ definition }) {
  const isInvoicesView = definition.variant === "kra-invoices";
  const { user, isOrgWide, capabilities, organization } = useAuth();
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
  const [printing, setPrinting] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [applied, setApplied] = useState({
    fromDate: defaultRange.from,
    toDate: defaultRange.to,
    branchId: defaultBranch,
    queryFilters: { status: "", q: "" },
  });

  const {
    selectedIds,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  const kraFiscalizationActive = isKraFiscalizationActive(
    capabilities?.module_settings,
    capabilities,
  );

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
      clearSelection();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load KRA receipts");
      setRows([]);
      setReportMeta(null);
      setReportSummary(null);
    } finally {
      setLoading(false);
    }
  }, [applied, definition.apiPath, depsKey, page, pageSize, paneHref, clearSelection]);

  const hasData = rows.length > 0 || reportMeta != null;
  useTabAwareDataLoad(loadReport, { depsKey, hasData });

  function refreshReport() {
    invalidateTabAwareDataLoad(paneHref);
    void loadReport();
  }

  const pageRowIds = useMemo(
    () => rows.map((row) => kraReportRowId(row)).filter((id) => id != null),
    [rows],
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(String(kraReportRowId(row)))),
    [rows, selectedIds],
  );

  const selectedPrintableRows = useMemo(
    () => selectedRows.filter(isPrintableKraRow),
    [selectedRows],
  );

  async function handlePrintRows(targetRows, label) {
    const printable = targetRows.filter(isPrintableKraRow);
    if (!printable.length) {
      notifyError("No successful KRA receipts to print.");
      return;
    }
    setPrinting(true);
    try {
      await printKraFiscalReceipts(printable, {
        orgName: organization?.org_name,
        title: label,
      });
      notifySuccess(
        printable.length === 1
          ? "KRA receipt sent to printer."
          : `${printable.length} KRA receipts sent to printer.`,
      );
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to print KRA receipts");
    } finally {
      setPrinting(false);
    }
  }

  async function handleRetryRow(row) {
    const responseId = kraReportRowId(row);
    if (!responseId || !row?.sale_id) return;
    setRetryingId(responseId);
    try {
      const res = await apiRequest(`/kra-responses/${responseId}/retry`, { method: "POST" });
      notifySuccess(res.message ?? "Retry succeeded.");
      await loadReport();
      if (res.kra_response) setPreviewRow(res.kra_response);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  const exportColumns = useMemo(
    () => [
      { key: "receipt_date", label: "Date", accessor: (r) => r.receipt_date },
      { key: "order_no", label: "Order #", accessor: (r) => formatKraReportOrderNo(r) },
      ...(isInvoicesView
        ? [{ key: "customer_name", label: "Customer", accessor: (r) => r.customer_name ?? "—" }]
        : []),
      { key: "invoice_number", label: "CU number", accessor: (r) => r.invoice_number || "—" },
      { key: "serial_number", label: "SCU / serial", accessor: (r) => r.serial_number || "—" },
      { key: "status", label: "Status", accessor: (r) => r.status },
      ...(multiBranch ? [{ key: "branch_name", label: "Branch", accessor: (r) => r.branch_name }] : []),
      { key: "channel", label: "Channel", accessor: (r) => salesChannelLabel(r.channel) || r.channel },
      { key: "order_total", label: "Order total", accessor: (r) => r.order_total, align: "right", total: true },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
    ],
    [multiBranch, isInvoicesView],
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
        subtitle={isInvoicesView ? undefined : definition.subtitle}
        exportConfig={{
          filename: definition.key ?? "kra-receipts",
          columns: exportColumns.map((col) => ({
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

        {!loading && !isInvoicesView ? <ReportKpiGrid items={kpis} /> : null}

        {loading ? (
          <p className="text-sm text-slate-500">Loading report…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No rows for this filter.</p>
        ) : (
          <>
            <div className={TABLE_SHELL_CLASS}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr className={`${TABLE_HEAD_ROW_CLASS} font-semibold`}>
                      <th className="whitespace-nowrap px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          className={TABLE_ROW_CHECKBOX_CLASS}
                          checked={isAllOnPageSelected(pageRowIds)}
                          ref={(el) => {
                            if (el) el.indeterminate = isSomeOnPageSelected(pageRowIds);
                          }}
                          onChange={(e) => toggleAllOnPage(e.target.checked, pageRowIds)}
                          aria-label="Select all receipts on this page"
                        />
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left">Date</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left">Order #</th>
                      {isInvoicesView ? (
                        <th className="whitespace-nowrap px-4 py-3 text-left">Customer</th>
                      ) : null}
                      <th className="whitespace-nowrap px-4 py-3 text-left">CU number</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left">SCU / serial</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left">Status</th>
                      {multiBranch ? (
                        <th className="whitespace-nowrap px-4 py-3 text-left">Branch</th>
                      ) : null}
                      <th className="whitespace-nowrap px-4 py-3 text-left">Channel</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">Order total</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">VAT</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left">Error</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const rowId = kraReportRowId(row);
                      const badge = statusBadge(row);
                      const printable = isPrintableKraRow(row);
                      return (
                        <tr key={rowId ?? idx} className={`${TABLE_BODY_ROW_CLASS} theme-text-muted`}>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <input
                              type="checkbox"
                              className={TABLE_ROW_CHECKBOX_CLASS}
                              checked={selectedIds.has(String(rowId))}
                              onChange={() => toggleOne(rowId)}
                              aria-label={`Select receipt ${row.order_no ?? rowId}`}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            {formatReportCell("receipt_date", row.receipt_date)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            {formatReportCell("order_no", formatKraReportOrderNo(row))}
                          </td>
                          {isInvoicesView ? (
                            <td className="max-w-[12rem] truncate px-4 py-2.5" title={row.customer_name ?? ""}>
                              {row.customer_name || "—"}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                            {row.invoice_number || "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                            {row.serial_number || "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            {badge ? <ReportBadge label={badge.label} tone={badge.tone} /> : "—"}
                          </td>
                          {multiBranch ? (
                            <td className="whitespace-nowrap px-4 py-2.5">{row.branch_name || "—"}</td>
                          ) : null}
                          <td className="whitespace-nowrap px-4 py-2.5">
                            {salesChannelLabel(row.channel) || row.channel || "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            {formatReportCell("order_total", row.order_total)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            {formatReportCell("total_vat", row.total_vat)}
                          </td>
                          <td
                            className="max-w-xs truncate px-4 py-2.5 text-xs text-red-600"
                            title={row.error_message ?? ""}
                          >
                            {row.error_message || "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewRow(row)}
                                className="font-medium text-[#185FA5] hover:underline"
                              >
                                Details
                              </button>
                              {!printable && row.sale_id ? (
                                <button
                                  type="button"
                                  disabled={retryingId === rowId || !kraFiscalizationActive}
                                  onClick={() => void handleRetryRow(row)}
                                  className="font-medium text-amber-800 hover:underline disabled:opacity-50"
                                >
                                  {retryingId === rowId ? "Retrying…" : "Retry"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                      <td className="px-4 py-2.5" colSpan={(multiBranch ? 10 : 9) + (isInvoicesView ? 1 : 0)}>
                        Page total
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">{footerTotals.order_total}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">{footerTotals.total_vat}</td>
                      <td className="px-4 py-2.5" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
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

      <KraResponseDetailDialog
        open={Boolean(previewRow)}
        row={previewRow}
        onClose={() => setPreviewRow(null)}
      />

      <BatchActionBar count={selectedIds.size} onClear={clearSelection}>
        <button
          type="button"
          disabled={printing || selectedPrintableRows.length === 0}
          onClick={() =>
            void handlePrintRows(
              selectedPrintableRows,
              isInvoicesView
                ? `KRA invoices (${selectedPrintableRows.length})`
                : `KRA receipts (${selectedPrintableRows.length})`,
            )
          }
          className="theme-primary-btn rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {printing ? "Printing…" : "Print"}
        </button>
      </BatchActionBar>
    </>
  );
}
