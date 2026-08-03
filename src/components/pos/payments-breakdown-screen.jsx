"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  Field,
  FILTER_CONTROL_CLASS,
  FilterToolbar,
  PaginationBar,
  SearchInput,
} from "@/components/catalog/catalog-shared";
import { useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";
import { formatAccountingAmount, defaultAccountingDateRange } from "@/lib/accounting-shared";
import { notifyError } from "@/lib/notify";
import { fetchBranchesCached, fetchUsersCached } from "@/lib/reference-data-cache";
import { filterByOrganization } from "@/lib/admin";
import { useAuth } from "@/contexts/auth-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { loadFullReportDataset } from "@/lib/paginated-fetch";

const TENDER_LABELS = {
  CASH: "Cash",
  MPESA: "M-Pesa",
  EQUITY: "Equity",
  KCB: "KCB",
  CARD: "Card",
  BANK: "Bank",
  CREDIT: "Debtors",
};

const EXPORT_COLUMNS = [
  { key: "order", label: "Order" },
  { key: "customer_name", label: "Customer name" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "return_amount", label: "Return amount", align: "right" },
  { key: "topup_amount", label: "Top-up amount", align: "right" },
  { key: "paid_at", label: "Paid at" },
  { key: "cashier", label: "Cashier" },
  { key: "session", label: "Session" },
  { key: "payment_method", label: "Payment method" },
];

function formatAdjustmentCell(value) {
  const amount = Number(value ?? 0);
  if (!(amount > 0)) return "—";
  return formatAccountingAmount(amount);
}

function formatPaidAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sessionLabel(session) {
  if (!session) return "—";
  const till = session.till_number || session.till_name || "Till";
  const status = String(session.status || "").trim();
  const cashier = session.cashier_name ? ` · ${session.cashier_name}` : "";
  const date = session.session_date ? ` · ${session.session_date}` : "";
  return `${till}${cashier}${date}${status ? ` (${status})` : ""}`;
}

function rowSessionText(row) {
  const till = row.till_number || row.till_name || "—";
  const status = row.session_status ? ` (${row.session_status})` : "";
  return `${till}${status}`;
}

function tenderDisplayName(code, methods = []) {
  const fromCatalog = methods.find((m) => m.method_code === code);
  if (fromCatalog?.method_name) {
    return String(fromCatalog.method_name).replace(/\s+alone$/i, "");
  }
  return TENDER_LABELS[code] ?? code;
}

function mixedBadgeText(row, methods = []) {
  if (!row?.is_mixed) return null;
  const others = Array.isArray(row.other_methods) ? row.other_methods : [];
  if (others.length === 0) return "Mixed payment order";
  const names = others
    .map((m) => m.method_name || tenderDisplayName(m.method_code, methods))
    .filter(Boolean);
  return names.length ? `Mixed payment · ${names.join(", ")}` : "Mixed payment order";
}

function paymentMethodLabel(row, methodName, methods = []) {
  const mixed = mixedBadgeText(row, methods);
  if (mixed) return mixed;
  return methodName || "—";
}

function mapPaymentExportRow(row, methodName, methods = []) {
  return {
    order: row.order_num != null ? `Order #${row.order_num}` : "—",
    customer_name: row.customer_name || "Walk-in",
    amount: formatAccountingAmount(row.amount),
    return_amount: formatAdjustmentCell(row.return_amount),
    topup_amount: formatAdjustmentCell(row.topup_amount),
    paid_at: formatPaidAt(row.paid_at),
    cashier: row.cashier_name || "—",
    session: rowSessionText(row),
    payment_method: paymentMethodLabel(row, methodName, methods),
  };
}

function printSectionTitle(methodName, pageNumber) {
  const label = String(methodName || "Payment").replace(/\s+alone$/i, "").trim();
  return `Print ${label} Payments, Page ${pageNumber}`;
}

function PaymentsMethodTabs({ methods, activeCode, onChange }) {
  if (!methods.length) return null;

  return (
    <div
      className="theme-panel flex gap-2 overflow-x-auto rounded-xl border p-2"
      role="tablist"
      aria-label="Payment method tabs"
    >
      {methods.map((method) => {
        const active = activeCode === method.method_code;
        return (
          <button
            key={method.method_code}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(method.method_code)}
            className={[
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-page-bg)]",
              active
                ? "bg-[var(--theme-primary)] text-white shadow-sm"
                : "text-[var(--theme-text-muted)] hover:bg-[var(--theme-primary-muted)] hover:text-[var(--theme-text)]",
            ].join(" ")}
          >
            <span>{method.method_name}</span>
            <span
              className={[
                "rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                active
                  ? "bg-white/20 text-white"
                  : "bg-[var(--theme-page-bg)] text-[var(--theme-text-muted)]",
              ].join(" ")}
            >
              {formatAccountingAmount(method.total_amount)}
            </span>
            <span
              className={[
                "text-xs tabular-nums",
                active ? "text-white/80" : "text-[var(--theme-text-muted)]",
              ].join(" ")}
            >
              {method.order_count ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function PaymentsBreakdownScreen() {
  const { user, capabilities } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const initialRange = defaultAccountingDateRange();
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [cashierId, setCashierId] = useState("");
  const [floatSessionId, setFloatSessionId] = useState("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [methodCode, setMethodCode] = useState("CASH");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const showBranchFilter = isMultiBranchCatalog(user);

  useEffect(() => {
    if (!organizationId) return;
    const tasks = [fetchUsersCached(organizationId)];
    if (showBranchFilter) tasks.push(fetchBranchesCached(organizationId));
    Promise.all(tasks)
      .then(([usersData, branchesData]) => {
        setCashiers(filterByOrganization(usersData ?? [], organizationId));
        if (showBranchFilter) {
          setBranches(filterByOrganization(branchesData ?? [], organizationId));
        }
      })
      .catch(() => {
        setCashiers([]);
        setBranches([]);
      });
  }, [organizationId, showBranchFilter]);

  const cashierOptions = useMemo(() => {
    const active = cashiers.filter((u) => u.is_active !== false);
    const scoped = branchId
      ? active.filter((u) => !u.branch_id || String(u.branch_id) === branchId)
      : active;
    return scoped
      .map((u) => ({
        value: String(u.id),
        label: u.full_name?.trim() || u.username || `User #${u.id}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cashiers, branchId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/reports/payments-breakdown", {
        searchParams: {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          branch_id: branchId || undefined,
          cashier_id: cashierId || undefined,
          float_session_id: floatSessionId || undefined,
          method_code: methodCode || undefined,
          q: debouncedQ.trim() || undefined,
          page,
          per_page: pageSize,
        },
      });
      setData(res);
      const nextMethods = Array.isArray(res?.methods) ? res.methods : [];
      if (nextMethods.length > 0 && !nextMethods.some((m) => m.method_code === methodCode)) {
        setMethodCode(nextMethods[0].method_code);
      } else if (res?.method_code && res.method_code !== methodCode) {
        setMethodCode(res.method_code);
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load payments breakdown");
    } finally {
      setLoading(false);
    }
  }, [
    fromDate,
    toDate,
    branchId,
    cashierId,
    floatSessionId,
    methodCode,
    debouncedQ,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const methods = useMemo(
    () =>
      (data?.methods ?? []).filter(
        (m) =>
          Number(m.total_amount ?? 0) > 0 ||
          Number(m.order_count ?? 0) > 0 ||
          Number(m.return_amount ?? 0) > 0 ||
          Number(m.topup_amount ?? 0) > 0,
      ),
    [data?.methods],
  );
  const rows = data?.data ?? [];
  const summary = data?.summary ?? {};
  const sessions = data?.sessions ?? [];

  const sessionOptions = useMemo(() => {
    if (!cashierId) return sessions;
    return sessions.filter((s) => String(s.cashier_id) === cashierId);
  }, [sessions, cashierId]);

  useEffect(() => {
    if (!floatSessionId) return;
    if (!sessionOptions.some((s) => String(s.id) === floatSessionId)) {
      setFloatSessionId("");
    }
  }, [sessionOptions, floatSessionId]);

  const tabs = useMemo(
    () =>
      methods.map((method) => ({
        id: method.method_code,
        label: method.method_name,
      })),
    [methods],
  );

  useSettingsSubTab(methodCode, setMethodCode, tabs);

  const onTabChange = (nextCode) => {
    setMethodCode(nextCode);
    setPage(1);
  };

  const emptyMethodLabel = summary.method_name || methodCode || "payment";
  const activeIsMpesa = String(methodCode ?? "").toUpperCase() === "MPESA";
  const methodName = summary.method_name || tenderDisplayName(methodCode, methods);
  const activeMethodStats = useMemo(
    () => methods.find((m) => m.method_code === methodCode) ?? {},
    [methods, methodCode],
  );

  const exportBaseParams = useMemo(
    () => ({
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      branch_id: branchId || undefined,
      cashier_id: cashierId || undefined,
      float_session_id: floatSessionId || undefined,
      q: debouncedQ.trim() || undefined,
    }),
    [fromDate, toDate, branchId, cashierId, floatSessionId, debouncedQ],
  );

  const branchName = useMemo(() => {
    if (!branchId) return "All branches";
    const match = branches.find((b) => String(b.id) === String(branchId));
    return match?.branch_name ?? match?.name ?? `Branch ${branchId}`;
  }, [branchId, branches]);

  const cashierName = useMemo(() => {
    if (!cashierId) return "All cashiers";
    const match = cashierOptions.find((c) => c.value === cashierId);
    return match?.label ?? `Cashier ${cashierId}`;
  }, [cashierId, cashierOptions]);

  const getExportRows = useCallback(async () => {
    const exportTabs = methods.length
      ? methods
      : [{
          method_code: methodCode,
          method_name: methodName,
          total_amount: summary.total_amount,
          order_count: summary.order_count,
        }];

    const allRows = [];
    for (let i = 0; i < exportTabs.length; i += 1) {
      const method = exportTabs[i];
      const label = method.method_name || tenderDisplayName(method.method_code, methods);
      allRows.push({
        __section_title: printSectionTitle(label, i + 1),
      });

      const rawRows = await loadFullReportDataset(
        "/reports/payments-breakdown",
        {
          ...exportBaseParams,
          method_code: method.method_code || undefined,
        },
        { message: `Loading ${label} payments for export…` },
      );

      const mapped = (rawRows ?? []).map((row) =>
        mapPaymentExportRow(row, label, methods),
      );
      allRows.push(...mapped);

      allRows.push({
        order: `${label} total`,
        customer_name: "",
        amount: formatAccountingAmount(method.total_amount ?? 0),
        return_amount: formatAdjustmentCell(method.return_amount),
        topup_amount: formatAdjustmentCell(method.topup_amount),
        paid_at: "",
        cashier: "",
        session: "",
        payment_method: `${method.order_count ?? mapped.length} orders`,
      });
    }

    return allRows;
  }, [
    methods,
    methodCode,
    methodName,
    summary.total_amount,
    summary.order_count,
    exportBaseParams,
  ]);

  const exportEstimatedRows = useMemo(
    () =>
      methods.reduce(
        (sum, method) => sum + Number(method.order_count ?? 0),
        0,
      ) || Number(data?.total ?? summary.order_count ?? 0),
    [methods, data?.total, summary.order_count],
  );

  const exportExtraLines = useMemo(() => {
    const lines = [`Cashier: ${cashierName}`];
    if (floatSessionId) {
      const session = sessions.find((s) => String(s.id) === String(floatSessionId));
      lines.push(`Session: ${sessionLabel(session)}`);
    }
    if (debouncedQ.trim()) {
      lines.push(`Search: ${debouncedQ.trim()}`);
    }
    lines.push(`Methods: ${methods.map((m) => m.method_name).filter(Boolean).join(", ") || methodName}`);
    return lines;
  }, [cashierName, floatSessionId, sessions, debouncedQ, methods, methodName]);

  return (
    <CatalogPageShell
      title="Payments breakdown"
      subtitle="Paid orders by tender — edit refunds and top-ups show per payment method"
      action={
        <ReportExportToolbar
          filename={`payments-breakdown-${fromDate || "from"}-${toDate || "to"}`}
          title="Payments breakdown"
          subtitle={branchName}
          columns={EXPORT_COLUMNS}
          getRows={getExportRows}
          footerRow={null}
          estimatedRowCount={exportEstimatedRows}
          meta={{
            fromDate,
            toDate,
            branchName,
            extraLines: exportExtraLines,
          }}
          disabled={loading || methods.length === 0}
        />
      }
    >
      <FilterToolbar className="theme-panel mb-6 rounded-xl border p-4 shadow-sm">
        <Field label="From">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className={FILTER_CONTROL_CLASS}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className={FILTER_CONTROL_CLASS}
          />
        </Field>
        {showBranchFilter ? (
          <Field label="Branch">
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setCashierId("");
                setFloatSessionId("");
                setPage(1);
              }}
              className={FILTER_CONTROL_CLASS}
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.branch_name ?? branch.name ?? `Branch ${branch.id}`}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Cashier">
          <select
            value={cashierId}
            onChange={(e) => {
              setCashierId(e.target.value);
              setFloatSessionId("");
              setPage(1);
            }}
            className={FILTER_CONTROL_CLASS}
          >
            <option value="">All cashiers</option>
            {cashierOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Till session">
          <select
            value={floatSessionId}
            onChange={(e) => {
              setFloatSessionId(e.target.value);
              setPage(1);
            }}
            className={`${FILTER_CONTROL_CLASS} min-w-[14rem]`}
          >
            <option value="">All sessions in range</option>
            {sessionOptions.map((session) => (
              <option key={session.id} value={session.id}>
                {sessionLabel(session)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search">
          <SearchInput
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={activeIsMpesa ? "Order # or M-Pesa code…" : "Order # or reference…"}
            className="w-56 shrink-0 sm:w-64"
          />
        </Field>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg bg-[var(--theme-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--theme-primary-hover)]"
        >
          Refresh
        </button>
      </FilterToolbar>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <div className="theme-panel rounded-xl border px-4 py-4 shadow-sm">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Tab total</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAccountingAmount(summary.total_amount ?? 0)}
          </p>
        </div>
        <div className="theme-panel rounded-xl border px-4 py-4 shadow-sm">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Return amount</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAdjustmentCell(activeMethodStats.return_amount)}
          </p>
        </div>
        <div className="theme-panel rounded-xl border px-4 py-4 shadow-sm">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Top-up amount</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAdjustmentCell(activeMethodStats.topup_amount)}
          </p>
        </div>
        <div className="theme-panel rounded-xl border px-4 py-4 shadow-sm">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Orders on tab</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--theme-text)]">{summary.order_count ?? 0}</p>
        </div>
        <div className="theme-panel rounded-xl border px-4 py-4 shadow-sm">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Visible tabs total</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAccountingAmount(summary.grand_total ?? 0)}
          </p>
        </div>
        <div className="theme-panel rounded-xl border px-4 py-4 shadow-sm">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Visible tabs orders</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--theme-text)]">
            {summary.grand_order_count ?? 0}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <PaymentsMethodTabs methods={methods} activeCode={methodCode} onChange={onTabChange} />
      </div>

      {loading ? (
        <p className="theme-subtext text-sm">Loading payments…</p>
      ) : methods.length === 0 ? (
        <div className="theme-panel rounded-xl border border-dashed px-6 py-10 text-center text-sm text-[var(--theme-text-muted)]">
          No paid orders for this filter.
        </div>
      ) : rows.length === 0 ? (
        <div className="theme-panel rounded-xl border border-dashed px-6 py-10 text-center text-sm text-[var(--theme-text-muted)]">
          No {emptyMethodLabel} paid orders in this filter.
        </div>
      ) : (
        <>
          <div className="theme-panel theme-table-shell overflow-hidden rounded-xl border shadow-sm">
            <table className="min-w-full divide-y divide-[var(--theme-border)] text-sm">
              <thead className="bg-[var(--theme-page-bg)] text-left text-xs font-medium uppercase tracking-wide text-[var(--theme-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer name</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Return amount</th>
                  <th className="px-4 py-3 text-right">Top-up amount</th>
                  <th className="px-4 py-3">Paid at</th>
                  <th className="px-4 py-3">Cashier</th>
                  <th className="px-4 py-3">Session</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--theme-border)]">
                {rows.map((row) => {
                  const mixedText = mixedBadgeText(row, methods);
                  return (
                  <tr key={`${row.sale_id}-${row.method_code ?? methodCode}`}>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                      {row.sale_id && row.order_num != null ? (
                        <Link
                          href={`/sales/orders/${row.sale_id}`}
                            className="font-medium text-[var(--theme-primary)] hover:underline"
                        >
                          Order #{row.order_num}
                        </Link>
                      ) : (
                          <span className="text-[var(--theme-text-muted)]">—</span>
                        )}
                        {mixedText ? (
                          <span className="inline-flex w-fit max-w-full items-center rounded-md border border-[var(--theme-border)] bg-[var(--theme-page-bg)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--theme-text-muted)]">
                            {mixedText}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--theme-text)]">
                      {row.customer_name || "Walk-in"}
                      </td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--theme-text)]">
                      {formatAccountingAmount(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--theme-text-muted)]">
                      {formatAdjustmentCell(row.return_amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--theme-text-muted)]">
                      {formatAdjustmentCell(row.topup_amount)}
                    </td>
                    <td className="px-4 py-3 text-[var(--theme-text-muted)]">
                      {formatPaidAt(row.paid_at)}
                    </td>
                    <td className="px-4 py-3 text-[var(--theme-text-muted)]">{row.cashier_name || "—"}</td>
                    <td className="px-4 py-3 text-[var(--theme-text-muted)]">
                      {row.till_number || row.till_name || "—"}
                      {row.session_status ? (
                        <span className="ml-1 text-xs uppercase opacity-70">
                          ({row.session_status})
                        </span>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <PaginationBar
              page={data?.current_page ?? page}
              totalPages={data?.last_page ?? 1}
              total={data?.total ?? 0}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        </>
      )}
    </CatalogPageShell>
  );
}
