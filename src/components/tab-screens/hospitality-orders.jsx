"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError } from "@/lib/notify";
import { OrderExpandButton } from "@/components/sales/sales-orders-shared";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FILTER_CONTROL_CLASS,
  FilterToolbar,
  PaginationBar,
  SearchInput,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";
import { useReportRefreshUi } from "@/lib/list-refresh-ui";

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

export function HospitalityOrdersScreen() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [status, setStatus] = useState("open");
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/hospitality/checks", {
        searchParams: {
          status: status || undefined,
          outlet_id: outletId || undefined,
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
      notifyError(e instanceof ApiError ? e.message : "Failed to load F&B orders");
      setRows([]);
      setTotal(0);
      setLastPage(1);
    } finally {
      setLoading(false);
    }
  }, [status, outletId, debouncedSearch, appliedFrom, appliedTo, page, pageSize]);

  useTabAwareDataLoad(load);

  useEffect(() => {
    setPage(1);
  }, [status, outletId, debouncedSearch, appliedFrom, appliedTo, pageSize]);

  const allExpanded = useMemo(
    () => rows.length > 0 && rows.every((row) => expandedIds.has(row.id)),
    [rows, expandedIds],
  );
  const listRefresh = useReportRefreshUi({ loading, hasRows: rows.length > 0 });

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

  return (
    <CatalogPageShell
      title="F&B orders"
      subtitle="Hotel POS checks — search by order #, guest, product, table, or amount. Expand a row to see what was ordered."
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
                  { value: "open", label: "Open / unpaid" },
                  { value: "unpaid", label: "Awaiting payment" },
                  { value: "paid", label: "Paid" },
                  { value: "void", label: "Voided" },
                  { value: "", label: "All" },
                ]}
              />
            </Field>
            <Field label="Outlet">
              <FilterSelect
                className={FILTER_CONTROL_CLASS}
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                options={[
                  { value: "", label: "All outlets" },
                  ...outlets.map((outlet) => ({
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
                placeholder="Search order #, guest, product, table, amount…"
                className="w-full min-w-0 shrink"
              />
            </div>
          </div>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="theme-subtext text-xs">
          {loading ? "Loading…" : `${total.toLocaleString()} order${total === 1 ? "" : "s"}`}
        </p>
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
                <th className="w-10 px-2 py-2" aria-label="Expand" />
                <th className="px-3 py-2 font-semibold">Order #</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Guest</th>
                <th className="px-3 py-2 font-semibold">Table</th>
                <th className="px-3 py-2 font-semibold">Outlet</th>
                <th className="px-3 py-2 font-semibold text-right">Total</th>
                <th className="px-3 py-2 font-semibold text-right">Paid</th>
                <th className="px-3 py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className={TABLE_BODY_ROW_CLASS}>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    No orders for this filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const expanded = expandedIds.has(row.id);
                  const lines = Array.isArray(row.lines) ? row.lines : [];
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
                        <td className="px-3 py-2 font-mono font-semibold">{row.check_number}</td>
                        <td className="px-3 py-2 capitalize">{row.status}</td>
                        <td className="px-3 py-2">{row.guest_name || "—"}</td>
                        <td className="px-3 py-2">
                          {row.floor_table?.label || row.floor_table?.code || "—"}
                        </td>
                        <td className="px-3 py-2">{row.outlet?.name || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.total)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.amount_paid)}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {formatWhen(row.updated_at || row.opened_at)}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className={TABLE_BODY_ROW_CLASS}>
                          <td colSpan={9} className="bg-[var(--theme-surface-muted,rgba(15,23,42,0.03))] px-0 py-0">
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
