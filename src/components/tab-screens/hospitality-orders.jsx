"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { OrderExpandButton } from "@/components/sales/sales-orders-shared";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FILTER_CONTROL_CLASS,
  FilterToolbar,
  IconButton,
  PaginationBar,
  PencilIcon,
  SearchInput,
  StatCard,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";
import { useReportRefreshUi } from "@/lib/list-refresh-ui";
import { fetchHotelPosSettings, voidHotelCheck } from "@/lib/hospitality-pos-api";
import { printHospitalityCheckReceipt } from "@/components/hospitality/hospitality-check-receipt-print";
import { HOTEL_VOID_ORDER_NAME } from "@/lib/hotel-pos-offline";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import {
  buildHospitalityCheckPrintOptions,
  normalizeHospitalityCheckPrintSettings,
} from "@/lib/hospitality-check-print-options";

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sourceLabel(row) {
  const src = String(row?.order_source || row?.channel || "hotel_pos");
  if (src === "hotel_pos_offline") return "Hotel POS (offline)";
  return "Hotel POS";
}

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return "bg-emerald-100 text-emerald-900";
  if (s === "void") return "bg-rose-100 text-rose-900";
  if (s === "partially_paid") return "bg-amber-100 text-amber-950";
  if (s === "unpaid" || s === "open") return "bg-sky-100 text-sky-900";
  return "bg-slate-100 text-slate-800";
}

function CheckLinesPanel({ lines }) {
  if (!lines?.length) {
    return <p className="px-4 py-3 text-xs text-slate-500">No line items on this order.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className={`${TABLE_HEAD_ROW_CLASS} text-[10px] font-semibold`}>
          <th className="px-4 py-2">Item</th>
          <th className="px-4 py-2 text-center">Qty</th>
          <th className="px-4 py-2 text-right">Price</th>
          <th className="px-4 py-2 text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr
            key={line.id ?? `${line.product_code}-${line.sort_order}`}
            className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
          >
            <td className="px-4 py-2.5 text-slate-800 dark:text-slate-100">
              {line.description || line.product_code || "Item"}
            </td>
            <td className="px-4 py-2.5 text-center tabular-nums text-slate-700 dark:text-slate-200">
              {Number(line.qty ?? 0)}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
              {formatMoney(line.unit_price)}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">
              {formatMoney(line.line_total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function canEditHotelOrder(row) {
  const status = String(row?.status || "").toLowerCase();
  return status === "open" || status === "unpaid" || status === "partially_paid";
}

function isVoidedHotelOrder(row) {
  return String(row?.status || "").toLowerCase() === "void";
}

const ORDER_CHANNELS = {
  all: {
    title: "All orders",
    subtitle: "Hotel restaurant and bar POS tickets — same list layout as retail and wholesale backoffice.",
    empty: "No orders for this filter.",
  },
  hotel: {
    title: "Hotel orders",
    subtitle: "Restaurant and hotel POS tickets.",
    empty: "No hotel orders for this filter.",
  },
  bar: {
    title: "Bar orders",
    subtitle: "Bar POS tickets.",
    empty: "No bar orders for this filter.",
  },
};

function outletMatchesChannel(outlet, channel) {
  const type = String(outlet?.outlet_type ?? "").toLowerCase();
  if (channel === "bar") return type === "bar";
  if (channel === "hotel") return type !== "bar";
  return true;
}

export function HospitalityHotelOrdersScreen() {
  return <HospitalityOrdersScreen channel="hotel" />;
}

export function HospitalityBarOrdersScreen() {
  return <HospitalityOrdersScreen channel="bar" />;
}

export function HospitalityOrdersScreen({ channel = "all" } = {}) {
  const router = useRouter();
  const { capabilities, organization, user } = useAuth();
  const confirm = useConfirm();
  const copy = ORDER_CHANNELS[channel] ?? ORDER_CHANNELS.all;
  const [rows, setRows] = useState([]);
  const [outlets, setOutlets] = useState([]);
  // Default All so settled Hotel POS tickets appear like backoffice completed orders.
  const [status, setStatus] = useState("");
  const [outletId, setOutletId] = useState("");
  const [fromDate, setFromDate] = useState(() => daysAgoIso(30));
  const [toDate, setToDate] = useState(() => todayIso());
  const [appliedFrom, setAppliedFrom] = useState(() => daysAgoIso(30));
  const [appliedTo, setAppliedTo] = useState(() => todayIso());
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [guestNameEnabled, setGuestNameEnabled] = useState(false);
  const [printSettings, setPrintSettings] = useState(null);
  const [actionBusyId, setActionBusyId] = useState(null);
  const [tablesEnabled, setTablesEnabled] = useState(
    () =>
      isHospitalityServiceEnabled(capabilities, "table_pos") ||
      isHospitalityServiceEnabled(capabilities, "floor_tables"),
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("/hospitality/outlets", { loading: false });
        if (!cancelled) {
          setOutlets(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
        }
      } catch {
        if (!cancelled) setOutlets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchHotelPosSettings()
      .then((settings) => {
        if (cancelled || !settings) return;
        const print = normalizeHospitalityCheckPrintSettings(settings);
        setPrintSettings(print);
        setGuestNameEnabled(Boolean(print.enable_check_guest_name));
        setTablesEnabled(
          Boolean(settings.table_pos_enabled || settings.floor_tables_enabled) ||
            isHospitalityServiceEnabled(capabilities, "table_pos") ||
            isHospitalityServiceEnabled(capabilities, "floor_tables"),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setGuestNameEnabled(false);
        setTablesEnabled(
          isHospitalityServiceEnabled(capabilities, "table_pos") ||
            isHospitalityServiceEnabled(capabilities, "floor_tables"),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [capabilities]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/hospitality/checks", {
        searchParams: {
          status: status || undefined,
          outlet_id: outletId || undefined,
          channel: channel === "all" ? undefined : channel,
          q: debouncedSearch || undefined,
          from_date: appliedFrom || undefined,
          to_date: appliedTo || undefined,
          per_page: pageSize,
          page,
        },
      });
      setRows(res?.checks ?? []);
      setTotal(Number(res?.total ?? 0));
      setLastPage(Math.max(1, Number(res?.last_page ?? 1)));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : `Failed to load ${copy.title.toLowerCase()}`);
      setRows([]);
      setTotal(0);
      setLastPage(1);
    } finally {
      setLoading(false);
    }
  }, [status, outletId, debouncedSearch, appliedFrom, appliedTo, page, pageSize, channel, copy.title]);

  useTabAwareDataLoad(load);

  useEffect(() => {
    setPage(1);
  }, [status, outletId, debouncedSearch, appliedFrom, appliedTo, pageSize, channel]);

  const visibleOutlets = useMemo(
    () => outlets.filter((outlet) => outletMatchesChannel(outlet, channel)),
    [outlets, channel],
  );

  useEffect(() => {
    if (!outletId) return;
    const stillValid = visibleOutlets.some((outlet) => String(outlet.id) === String(outletId));
    if (!stillValid) setOutletId("");
  }, [outletId, visibleOutlets]);

  const allExpanded = useMemo(
    () => rows.length > 0 && rows.every((row) => expandedIds.has(row.id)),
    [rows, expandedIds],
  );
  const listRefresh = useReportRefreshUi({ loading, hasRows: rows.length > 0 });

  const summary = useMemo(() => {
    let amount = 0;
    let paid = 0;
    let openCount = 0;
    let paidCount = 0;
    for (const row of rows) {
      amount += Number(row.total ?? 0);
      paid += Number(row.amount_paid ?? 0);
      const s = String(row.status || "");
      if (s === "paid") paidCount += 1;
      else if (s !== "void") openCount += 1;
    }
    return { amount, paid, balance: Math.max(0, amount - paid), openCount, paidCount };
  }, [rows]);

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpandAll() {
    if (allExpanded) {
      setExpandedIds(new Set());
      return;
    }
    setExpandedIds(new Set(rows.map((row) => row.id)));
  }

  function applyDateFilter() {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  }

  async function handlePrint(row) {
    if (!row?.id || actionBusyId) return;
    setActionBusyId(row.id);
    try {
      let check = row;
      if (!Array.isArray(row.lines) || row.lines.length === 0) {
        const res = await apiRequest(`/hospitality/checks/${row.id}`);
        check = res?.check ?? row;
      }
      const result = await printHospitalityCheckReceipt(
        check,
        buildHospitalityCheckPrintOptions({
          checkPrintSettings: printSettings,
          organization,
          capabilities,
          user,
          title: "Order receipt",
        }),
      );
      if (result?.ok) notifySuccess("Receipt sent to printer");
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleVoid(row) {
    if (!row?.id || actionBusyId || isVoidedHotelOrder(row)) return;
    const label = row.check_number || row.order_num || "this order";
    const sold =
      ["paid", "settled"].includes(String(row.status ?? "").toLowerCase()) ||
      Number(row.amount_paid) > 0;
    const ok = await confirm({
      title: sold ? "Void sold order" : "Void order",
      message: sold
        ? `Void sold order ${label}? This cancels the sale and names it ${HOTEL_VOID_ORDER_NAME}.`
        : `Void order ${label}? This cannot be undone.`,
      confirmLabel: "Void",
      destructive: true,
    });
    if (!ok) return;
    setActionBusyId(row.id);
    try {
      const res = await voidHotelCheck(row.id);
      const voided = res?.check ?? { ...row, status: "void", guest_name: HOTEL_VOID_ORDER_NAME };
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, ...voided } : item)));
      notifySuccess(`${voided.check_number ?? label} voided.`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to void order");
    } finally {
      setActionBusyId(null);
    }
  }

  const dataColCount = 11 + (guestNameEnabled ? 1 : 0) + (tablesEnabled ? 1 : 0);
  const tableColSpan = dataColCount + 1;
  const summaryHint = lastPage > 1 ? `This page · ${rows.length} of ${total.toLocaleString()}` : "Filtered period";
  const searchPlaceholder = [
    "Search order #",
    guestNameEnabled ? "guest" : null,
    "product",
    tablesEnabled ? "table" : null,
    "amount…",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <CatalogPageShell
      title={copy.title}
      subtitle={copy.subtitle}
      toolbar={
        <div className="space-y-3">
          <FilterToolbar>
            <Field label="From">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={FILTER_CONTROL_CLASS}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={FILTER_CONTROL_CLASS}
              />
            </Field>
            <Field label="Status">
              <FilterSelect
                className={FILTER_CONTROL_CLASS}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={[
                  { value: "", label: "All" },
                  { value: "open", label: "Open / unpaid" },
                  { value: "unpaid", label: "Awaiting payment" },
                  { value: "paid", label: "Paid" },
                  { value: "void", label: "Voided" },
                ]}
              />
            </Field>
            <Field label="Outlet">
              <FilterSelect
                className={FILTER_CONTROL_CLASS}
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                options={[
                  { value: "", label: channel === "bar" ? "All bar outlets" : channel === "hotel" ? "All hotel outlets" : "All outlets" },
                  ...visibleOutlets.map((outlet) => ({
                    value: String(outlet.id),
                    label: outlet.name || outlet.code,
                  })),
                ]}
              />
            </Field>
            <button
              type="button"
              onClick={applyDateFilter}
              className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-[var(--theme-primary)]/30 bg-[var(--theme-primary-muted)] px-3 text-sm font-medium text-[var(--theme-primary)] hover:bg-[#d4e8f9]"
            >
              Filter
            </button>
          </FilterToolbar>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-8 lg:col-span-6">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full min-w-0 shrink"
              />
            </div>
          </div>
        </div>
      }
    >
      {!loading ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Orders"
            value={total.toLocaleString()}
            hint={`${summary.openCount} open · ${summary.paidCount} paid`}
          />
          <StatCard label="Amount" value={formatMoney(summary.amount)} hint={summaryHint} />
          <StatCard label="Paid" value={formatMoney(summary.paid)} hint={summaryHint} />
          <StatCard label="Balance" value={formatMoney(summary.balance)} hint={summaryHint} />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={toggleExpandAll}
          disabled={!rows.length}
          className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {listRefresh.showInitialLoading ? (
        <p className="theme-subtext text-sm">Loading orders…</p>
      ) : (
        <div className={`${TABLE_SHELL_CLASS} ${listRefresh.contentClassName}`.trim()}>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className="w-12 px-2 py-2.5" aria-label="Expand" />
                <th className="px-3 py-2.5 font-semibold">Order no</th>
                {guestNameEnabled ? <th className="px-3 py-2.5 font-semibold">Guest</th> : null}
                <th className="px-3 py-2.5 font-semibold">Outlet</th>
                {tablesEnabled ? <th className="px-3 py-2.5 font-semibold">Table</th> : null}
                <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
                <th className="px-3 py-2.5 font-semibold text-right">Amount paid</th>
                <th className="px-3 py-2.5 font-semibold text-right">Balance</th>
                <th className="px-3 py-2.5 font-semibold text-right">VAT</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Method</th>
                <th className="px-3 py-2.5 font-semibold">Source</th>
                <th className="px-3 py-2.5 font-semibold">Placed by</th>
                <th className="w-36 px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className={TABLE_BODY_ROW_CLASS}>
                  <td colSpan={tableColSpan} className="px-3 py-8 text-center text-slate-500">
                    {copy.empty}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const expanded = expandedIds.has(row.id);
                  const lines = Array.isArray(row.lines) ? row.lines : [];
                  const balance =
                    row.balance_due != null
                      ? Number(row.balance_due)
                      : Math.max(0, Number(row.total ?? 0) - Number(row.amount_paid ?? 0));
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`${TABLE_BODY_ROW_CLASS} cursor-pointer hover:bg-[var(--theme-hover)]`}
                        onClick={() => router.push(`/hospitality/orders/${row.id}`)}
                      >
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <OrderExpandButton
                            expanded={expanded}
                            onClick={() => toggleExpanded(row.id)}
                            label={expanded ? "Hide ordered items" : "Show ordered items"}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold">
                          {row.check_number || row.order_num}
                          <p className="theme-subtext text-[10px] font-normal">
                            {formatWhen(row.opened_at || row.created_at)}
                          </p>
                        </td>
                        {guestNameEnabled ? (
                          <td className="px-3 py-2">{row.guest_name || row.customer_name || "—"}</td>
                        ) : null}
                        <td className="px-3 py-2">{row.outlet?.name || "—"}</td>
                        {tablesEnabled ? (
                          <td className="px-3 py-2">
                            {row.floor_table?.label || row.floor_table?.code || "—"}
                            {row.folio?.room_number ? (
                              <span className="theme-subtext block text-[10px]">
                                Rm {row.folio.room_number}
                              </span>
                            ) : null}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.total ?? row.order_total)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.amount_paid)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(balance)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.vat_total)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(row.status)}`}
                          >
                            {String(row.status || "").replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2">{row.payment_method_label || "—"}</td>
                        <td className="px-3 py-2">{sourceLabel(row)}</td>
                        <td className="px-3 py-2">{row.opened_by_name || "—"}</td>
                        <td
                          className="px-3 py-2 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <HotelOrderRowActions
                            row={row}
                            busy={actionBusyId === row.id}
                            onView={() => router.push(`/hospitality/orders/${row.id}`)}
                            onEdit={() => router.push(`/hotel-bar-pos?resume=${row.id}`)}
                            onPrint={() => void handlePrint(row)}
                            onVoid={() => void handleVoid(row)}
                          />
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className={TABLE_BODY_ROW_CLASS}>
                          <td
                            colSpan={tableColSpan}
                            className="bg-[var(--theme-surface-muted,rgba(15,23,42,0.03))] px-0 py-0"
                          >
                            <CheckLinesPanel lines={lines} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          {total > 0 ? (
            <PaginationBar
              page={page}
              totalPages={lastPage}
              total={total}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          ) : null}
        </div>
      )}
    </CatalogPageShell>
  );
}

function HotelOrderRowActions({ row, busy, onView, onEdit, onPrint, onVoid }) {
  const voided = isVoidedHotelOrder(row);
  const editable = canEditHotelOrder(row);
  const editLabel = editable
    ? "Edit"
    : voided
      ? "Voided orders cannot be edited"
      : "Paid orders cannot be edited";

  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton label="View" onClick={onView} disabled={busy}>
        <EyeIcon />
      </IconButton>
      <IconButton label={editLabel} onClick={onEdit} disabled={busy || !editable}>
        <PencilIcon />
      </IconButton>
      <IconButton label="Print" onClick={onPrint} disabled={busy}>
        <PrinterIcon />
      </IconButton>
      <IconButton
        label={voided ? "Already voided" : "Void"}
        danger
        onClick={onVoid}
        disabled={busy || voided}
      >
        <VoidIcon />
      </IconButton>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

function VoidIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" />
    </svg>
  );
}
