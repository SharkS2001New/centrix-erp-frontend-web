"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { isOrgAdministrator } from "@/lib/admin-scope";
import {
  PaginationBar,
  SECONDARY_BTN_CLASS,
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
import { defaultReportBranchId } from "@/lib/reports/report-filters";
import { KraResponseDetailDialog } from "@/components/reports/kra-invoice-preview-dialog";
import { KraFailureReasonDialog } from "@/components/reports/kra-failure-reason-dialog";
import { salesChannelLabel } from "@/lib/user-facing-labels";
import { formatKraReportOrderNo } from "@/lib/sales";
import { useReportFilterOptions } from "@/lib/reports/use-report-filter-options";
import {
  isKraOriginalInvoiceSaleRow,
  kraDocumentTypeLabel,
  kraReportRowId,
  printKraFiscalReceipts,
  resolveKraDocumentType,
} from "@/lib/kra-fiscal-receipt-print";
import { KRA_REFUND_REASON_OPTIONS } from "@/lib/reports/report-filter-config";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isKraDeviceConfigured } from "@/lib/finance-settings";
import { getReportsDefaultDateRange } from "@/lib/sales-settings";
import { P } from "@/lib/permission-codes";

const DEFAULT_PAGE_SIZE = 25;
const KRA_INVOICE_COLUMNS_STORAGE_KEY = "centrix-erp-kra-invoices-visible-columns";

/** Optional columns for KRA invoices — hidden by default; enable via Columns picker. */
const KRA_INVOICE_OPTIONAL_COLUMNS = [
  { id: "customer_name", label: "Customer" },
  { id: "serial_number", label: "SCU / serial" },
  { id: "channel", label: "Channel" },
];

function defaultOptionalColumnIds() {
  return [];
}

function normalizeOptionalColumnIds(ids) {
  const valid = new Set(KRA_INVOICE_OPTIONAL_COLUMNS.map((c) => c.id));
  const normalized = (Array.isArray(ids) ? ids : []).filter((id) => valid.has(id));
  return KRA_INVOICE_OPTIONAL_COLUMNS.filter((c) => normalized.includes(c.id)).map((c) => c.id);
}

function readStoredOptionalColumnIds() {
  if (typeof window === "undefined") return defaultOptionalColumnIds();
  try {
    const raw = localStorage.getItem(KRA_INVOICE_COLUMNS_STORAGE_KEY);
    if (!raw) return defaultOptionalColumnIds();
    return normalizeOptionalColumnIds(JSON.parse(raw));
  } catch {
    return defaultOptionalColumnIds();
  }
}

function CreditSaleIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

function statusBadge(row) {
  const status = String(row.status ?? "").toLowerCase();
  if (status === "success") return { label: "Success", tone: "success" };
  if (status === "failed") return { label: "Failed", tone: "danger" };
  if (status === "skipped") return { label: "Skipped", tone: "warning" };
  if (status === "pending") return { label: "Pending", tone: "warning" };
  return status ? { label: status, tone: "neutral" } : null;
}

function documentTypeBadge(row) {
  const type = resolveKraDocumentType(row);
  if (type === "credit_note") return { label: "Credit note", tone: "warning" };
  return { label: "Invoice sale", tone: "neutral" };
}

function isPrintableKraRow(row) {
  return String(row?.status ?? "").toLowerCase() === "success";
}

export function KraReceiptsReportScreen({ definition }) {
  const isInvoicesView = definition.variant === "kra-invoices";
  const { user, isOrgWide, capabilities, organization, hasPermission } = useAuth();
  const { paneHref } = useTabPaneActive();
  const multiBranch = isMultiBranchCatalog(capabilities);
  const queryFilterOptions = useReportFilterOptions(definition.key);
  const defaultRange = useMemo(
    () => getReportsDefaultDateRange(capabilities?.module_settings),
    [capabilities?.module_settings],
  );
  const defaultBranch = useMemo(() => defaultReportBranchId(user, isOrgWide), [user, isOrgWide]);
  const canCreditKraSale =
    isInvoicesView &&
    (hasPermission?.(P.pricing_tax.kra_invoices.credit) ||
      hasPermission?.("admin.manage") ||
      isOrgAdministrator(user, capabilities));

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
  const [queryFilters, setQueryFilters] = useState({
    status: "",
    channel: "",
    document_type: "",
    q: "",
  });
  const [branches, setBranches] = useState([]);
  const [previewRow, setPreviewRow] = useState(null);
  const [failureReasonRow, setFailureReasonRow] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [creditRow, setCreditRow] = useState(null);
  const [creditReasonCode, setCreditReasonCode] = useState("06");
  const [crediting, setCrediting] = useState(false);
  const [creditProgress, setCreditProgress] = useState(0);
  const [optionalColumnIds, setOptionalColumnIds] = useState(defaultOptionalColumnIds);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [applied, setApplied] = useState({
    fromDate: defaultRange.from,
    toDate: defaultRange.to,
    branchId: defaultBranch,
    queryFilters: { status: "", channel: "", document_type: "", q: "" },
  });

  const {
    selectedIds,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  const kraDeviceReady = isKraDeviceConfigured(
    capabilities?.module_settings,
    capabilities,
  );

  useEffect(() => {
    if (!isInvoicesView) return;
    setOptionalColumnIds(readStoredOptionalColumnIds());
  }, [isInvoicesView]);

  useEffect(() => {
    if (!isInvoicesView) return;
    localStorage.setItem(KRA_INVOICE_COLUMNS_STORAGE_KEY, JSON.stringify(optionalColumnIds));
  }, [isInvoicesView, optionalColumnIds]);

  const showOptionalColumn = useCallback(
    (id) => {
      if (!isInvoicesView) {
        return id !== "customer_name";
      }
      return optionalColumnIds.includes(id);
    },
    [isInvoicesView, optionalColumnIds],
  );

  function toggleOptionalColumn(id) {
    setOptionalColumnIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return normalizeOptionalColumnIds([...prev, id]);
    });
  }

  function resetOptionalColumns() {
    setOptionalColumnIds(defaultOptionalColumnIds());
  }

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
      if (applied.queryFilters?.channel) searchParams.channel = applied.queryFilters.channel;
      if (applied.queryFilters?.status) searchParams.status = applied.queryFilters.status;
      if (applied.queryFilters?.document_type) {
        searchParams.document_type = applied.queryFilters.document_type;
      }
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
    if (!kraDeviceReady) {
      notifyError("Enable the KRA device in Finance settings before retrying.");
      return;
    }
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

  function openCreditSaleDialog(row) {
    if (!isKraOriginalInvoiceSaleRow(row)) {
      notifyError("Only successful original KRA invoice sales can be credited.");
      return;
    }
    if (!row?.sale_id || !kraReportRowId(row)) {
      notifyError("This invoice is missing a linked sale or KRA response id.");
      return;
    }
    if (!kraDeviceReady) {
      notifyError("Enable the KRA device in Finance settings before crediting a sale.");
      return;
    }
    setCreditReasonCode("06");
    setCreditProgress(0);
    setCreditRow(row);
  }

  async function handleCreditSale() {
    const responseId = kraReportRowId(creditRow);
    if (!responseId || !creditRow?.sale_id) {
      notifyError("This invoice is missing a linked sale or KRA response id.");
      return;
    }
    if (!kraDeviceReady) {
      notifyError("Enable the KRA device in Finance settings before crediting a sale.");
      return;
    }

    setCrediting(true);
    setCreditProgress(12);
    let progressTimer = null;
    try {
      progressTimer = window.setInterval(() => {
        setCreditProgress((prev) => (prev >= 88 ? prev : prev + 8));
      }, 400);

      const res = await apiRequest(`/kra-responses/${responseId}/credit`, {
        method: "POST",
        body: { refund_reason_code: creditReasonCode || "06" },
        loading: false,
      });
      setCreditProgress(100);
      notifySuccess(res.message ?? "KRA credit note submitted. Centrix sale was not changed.");
      setCreditRow(null);
      await loadReport();
      if (res.kra_response) setPreviewRow(res.kra_response);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "KRA credit failed");
    } finally {
      if (progressTimer != null) window.clearInterval(progressTimer);
      setCrediting(false);
      setCreditProgress(0);
    }
  }

  const exportColumns = useMemo(
    () => [
      { key: "receipt_date", label: "Date", accessor: (r) => r.receipt_date },
      { key: "order_no", label: "Order #", accessor: (r) => formatKraReportOrderNo(r) },
      ...(showOptionalColumn("customer_name")
        ? [{ key: "customer_name", label: "Customer", accessor: (r) => r.customer_name ?? "—" }]
        : []),
      { key: "invoice_number", label: "CU number", accessor: (r) => r.invoice_number || "—" },
      ...(showOptionalColumn("serial_number")
        ? [{ key: "serial_number", label: "SCU / serial", accessor: (r) => r.serial_number || "—" }]
        : []),
      {
        key: "document_type",
        label: "Type",
        accessor: (r) => kraDocumentTypeLabel(r),
      },
      { key: "status", label: "Status", accessor: (r) => r.status },
      ...(multiBranch ? [{ key: "branch_name", label: "Branch", accessor: (r) => r.branch_name }] : []),
      ...(showOptionalColumn("channel")
        ? [
            {
              key: "channel",
              label: "Channel",
              accessor: (r) => salesChannelLabel(r.channel) || r.channel,
            },
          ]
        : []),
      { key: "order_total", label: "Order total", accessor: (r) => r.order_total, align: "right", total: true },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
    ],
    [multiBranch, showOptionalColumn],
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

  const typeColSpan =
    1 + // checkbox
    1 + // date
    1 + // order #
    (showOptionalColumn("customer_name") ? 1 : 0) +
    1 + // CU
    (showOptionalColumn("serial_number") ? 1 : 0) +
    1 + // type
    1 + // status
    (multiBranch ? 1 : 0) +
    (showOptionalColumn("channel") ? 1 : 0);

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
              ...(applied.queryFilters?.channel ? { channel: applied.queryFilters.channel } : {}),
              ...(applied.queryFilters?.status ? { status: applied.queryFilters.status } : {}),
              ...(applied.queryFilters?.document_type
                ? { document_type: applied.queryFilters.document_type }
                : {}),
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
                channel: queryFilters.channel ?? "",
                document_type: queryFilters.document_type ?? "",
                q: String(queryFilters.q ?? "").trim(),
              },
            });
          }}
          onRefresh={() => void refreshReport()}
          onReset={() => {
            const range = getReportsDefaultDateRange(capabilities?.module_settings);
            const bid = defaultReportBranchId(user, isOrgWide);
            setFromDate(range.from);
            setToDate(range.to);
            setBranchId(bid);
            setQueryFilters({ status: "", channel: "", document_type: "", q: "" });
            setPage(1);
            setApplied({
              fromDate: range.from,
              toDate: range.to,
              branchId: bid,
              queryFilters: { status: "", channel: "", document_type: "", q: "" },
            });
          }}
          loading={loading}
          showBranchFilter={multiBranch}
        />

        {!loading && !isInvoicesView ? <ReportKpiGrid items={kpis} /> : null}

        {isInvoicesView ? (
          <div className="mb-3 flex justify-end">
            <ColumnPicker
              open={columnsOpen}
              onToggle={() => setColumnsOpen((v) => !v)}
              onClose={() => setColumnsOpen(false)}
              visibleColumnIds={optionalColumnIds}
              onToggleColumn={toggleOptionalColumn}
              onReset={resetOptionalColumns}
            />
          </div>
        ) : null}

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
                      {showOptionalColumn("customer_name") ? (
                        <th className="whitespace-nowrap px-4 py-3 text-left">Customer</th>
                      ) : null}
                      <th className="whitespace-nowrap px-4 py-3 text-left">CU number</th>
                      {showOptionalColumn("serial_number") ? (
                        <th className="whitespace-nowrap px-4 py-3 text-left">SCU / serial</th>
                      ) : null}
                      <th className="whitespace-nowrap px-4 py-3 text-left">Type</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left">Status</th>
                      {multiBranch ? (
                        <th className="whitespace-nowrap px-4 py-3 text-left">Branch</th>
                      ) : null}
                      {showOptionalColumn("channel") ? (
                        <th className="whitespace-nowrap px-4 py-3 text-left">Channel</th>
                      ) : null}
                      <th className="whitespace-nowrap px-4 py-3 text-right">Order total</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">VAT</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const rowId = kraReportRowId(row);
                      const badge = statusBadge(row);
                      const typeBadge = documentTypeBadge(row);
                      const printable = isPrintableKraRow(row);
                      const isFailed = String(row?.status ?? "").toLowerCase() === "failed";
                      const canCreditRow = canCreditKraSale && isKraOriginalInvoiceSaleRow(row);
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
                          {showOptionalColumn("customer_name") ? (
                            <td className="max-w-[12rem] truncate px-4 py-2.5" title={row.customer_name ?? ""}>
                              {row.customer_name || "—"}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                            {row.invoice_number || "—"}
                          </td>
                          {showOptionalColumn("serial_number") ? (
                            <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                              {row.serial_number || "—"}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <ReportBadge label={typeBadge.label} tone={typeBadge.tone} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            {badge ? <ReportBadge label={badge.label} tone={badge.tone} /> : "—"}
                          </td>
                          {multiBranch ? (
                            <td className="whitespace-nowrap px-4 py-2.5">{row.branch_name || "—"}</td>
                          ) : null}
                          {showOptionalColumn("channel") ? (
                            <td className="whitespace-nowrap px-4 py-2.5">
                              {salesChannelLabel(row.channel) || row.channel || "—"}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            {formatReportCell("order_total", row.order_total)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            {formatReportCell("total_vat", row.total_vat)}
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
                              {!printable && isFailed ? (
                                <button
                                  type="button"
                                  onClick={() => setFailureReasonRow(row)}
                                  className="font-medium text-red-700 hover:underline"
                                >
                                  View reason
                                </button>
                              ) : null}
                              {!printable && row.sale_id ? (
                                <button
                                  type="button"
                                  disabled={retryingId === rowId}
                                  onClick={() => void handleRetryRow(row)}
                                  className="font-medium text-amber-800 hover:underline disabled:opacity-50"
                                >
                                  {retryingId === rowId ? "Retrying…" : "Retry"}
                                </button>
                              ) : null}
                              {canCreditRow ? (
                                <button
                                  type="button"
                                  disabled={crediting}
                                  onClick={() => openCreditSaleDialog(row)}
                                  className="theme-secondary-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                                  title="Credits this sale on the KRA device only. Centrix order is unchanged."
                                >
                                  <CreditSaleIcon />
                                  Credit This Sale
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
                      <td className="px-4 py-2.5" colSpan={typeColSpan}>
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

      <KraFailureReasonDialog
        open={Boolean(failureReasonRow)}
        row={failureReasonRow}
        onClose={() => setFailureReasonRow(null)}
      />

      {creditRow ? (
        <div
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kra-credit-sale-title"
          onClick={() => {
            if (!crediting) setCreditRow(null);
          }}
        >
          <div
            className="theme-modal w-full max-w-md rounded-xl border p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="kra-credit-sale-title" className="theme-heading text-base font-semibold">
              Credit This Sale on KRA?
            </h2>
            <p className="theme-subtext mt-2 text-sm">
              This submits a KRA credit note for order {formatKraReportOrderNo(creditRow)} (CU{" "}
              {creditRow.invoice_number || "—"}). The Centrix sale stays unchanged — this is not a
              return.
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Refund reason
              <select
                className="theme-input mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={creditReasonCode}
                disabled={crediting}
                onChange={(e) => setCreditReasonCode(e.target.value)}
              >
                {KRA_REFUND_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {crediting ? (
              <div className="mt-4 space-y-2" aria-live="polite">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Submitting credit to KRA device…</span>
                  <span>{Math.min(100, Math.round(creditProgress))}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[#185FA5] transition-[width] duration-300 ease-out"
                    style={{ width: `${Math.min(100, Math.max(8, creditProgress))}%` }}
                  />
                </div>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={crediting}
                onClick={() => setCreditRow(null)}
                className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={crediting}
                onClick={() => void handleCreditSale()}
                className="theme-primary-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                <CreditSaleIcon />
                {crediting ? "Crediting…" : "Credit This Sale"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

function ColumnPicker({ open, onToggle, onClose, visibleColumnIds, onToggleColumn, onReset }) {
  const buttonRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  useEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuStyle(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
      zIndex: 80,
    });
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className={`${SECONDARY_BTN_CLASS} gap-2 px-3 py-2.5`}
      >
        <ColumnsIcon />
        Columns
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[70] cursor-default"
                aria-label="Close column picker"
                onClick={onClose}
              />
              <div
                style={menuStyle ?? undefined}
                className="theme-panel fixed z-[80] w-56 rounded-xl border p-3 shadow-lg"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="theme-subtext text-xs font-semibold uppercase tracking-wide">
                    Show columns
                  </p>
                  <button
                    type="button"
                    onClick={onReset}
                    className="text-xs font-medium text-blue-600 hover:text-blue-500"
                  >
                    Reset
                  </button>
                </div>
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {KRA_INVOICE_OPTIONAL_COLUMNS.map((col) => {
                    const checked = visibleColumnIds.includes(col.id);
                    return (
                      <li key={col.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--theme-text-muted)] hover:bg-[var(--theme-hover)]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleColumn(col.id)}
                            className="rounded border-slate-300"
                          />
                          {col.label}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

function ColumnsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  );
}
