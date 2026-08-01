"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  Field,
  PaginationBar,
  SearchInput,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import { formatAccountingAmount, defaultAccountingDateRange } from "@/lib/accounting-shared";
import { notifyError } from "@/lib/notify";
import { fetchBranchesCached, fetchUsersCached } from "@/lib/reference-data-cache";
import { filterByOrganization } from "@/lib/admin";
import { useAuth } from "@/contexts/auth-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const TENDER_LABELS = {
  CASH: "Cash",
  MPESA: "M-Pesa",
  EQUITY: "Equity",
  KCB: "KCB",
  CARD: "Card",
  BANK: "Bank",
  CREDIT: "Debtors",
  MIXED: "Mixed",
};

function isMpesaMethod(code) {
  return String(code ?? "").toUpperCase() === "MPESA";
}

function isMixedMethod(code) {
  return String(code ?? "").toUpperCase() === "MIXED";
}

function sessionLabel(session) {
  if (!session) return "—";
  const till = session.till_number || session.till_name || "Till";
  const status = String(session.status || "").trim();
  const cashier = session.cashier_name ? ` · ${session.cashier_name}` : "";
  const date = session.session_date ? ` · ${session.session_date}` : "";
  return `${till}${cashier}${date}${status ? ` (${status})` : ""}`;
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
  const [sessionStatus, setSessionStatus] = useState("all");
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
          session_status: sessionStatus !== "all" ? sessionStatus : undefined,
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
    sessionStatus,
    methodCode,
    debouncedQ,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const methods = useMemo(
    () => (data?.methods ?? []).filter((m) => Number(m.total_amount ?? 0) > 0 || Number(m.order_count ?? 0) > 0),
    [data?.methods],
  );
  const rows = data?.data ?? [];
  const summary = data?.summary ?? {};
  const sessions = data?.sessions ?? [];

  const sessionOptions = useMemo(() => {
    let list = sessions;
    if (cashierId) {
      list = list.filter((s) => String(s.cashier_id) === cashierId);
    }
    if (sessionStatus !== "all") {
      list = list.filter((s) => String(s.status).toLowerCase() === sessionStatus);
    }
    return list;
  }, [sessions, cashierId, sessionStatus]);

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

  const activeIsMpesa = isMpesaMethod(methodCode);
  const activeIsMixed = isMixedMethod(methodCode);
  const activeMethod = methods.find((m) => m.method_code === methodCode);
  const showReferenceColumn =
    activeIsMpesa
    || activeIsMixed
    || Boolean(activeMethod?.requires_reference);
  const showTendersColumn = activeIsMixed;
  const refLabel = activeIsMpesa ? "M-Pesa code" : "Reference";
  const emptyMethodLabel = summary.method_name || methodCode || "payment";

  const tenderLabel = (code) => {
    const fromCatalog = methods.find((m) => m.method_code === code);
    if (fromCatalog?.method_name) {
      return String(fromCatalog.method_name).replace(/\s+alone$/i, "");
    }
    return TENDER_LABELS[code] ?? code;
  };

  function formatTendersDynamic(tenders) {
    if (!tenders || typeof tenders !== "object") return "—";
    const parts = Object.entries(tenders)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([code, amount]) => `${tenderLabel(code)} ${formatAccountingAmount(amount)}`);
    return parts.length ? parts.join(" · ") : "—";
  }

  return (
    <CatalogPageShell
      title="Payments breakdown"
      subtitle="Paid orders by tender — cash, M-Pesa, banks, debtors, and mixed payments"
    >
      <div className="theme-panel mb-6 grid gap-4 rounded-xl border p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <Field label="From">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className={inputClassName}
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
            className={inputClassName}
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
              className={inputClassName}
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
            className={inputClassName}
          >
            <option value="">All cashiers</option>
            {cashierOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Session status">
          <select
            value={sessionStatus}
            onChange={(e) => {
              setSessionStatus(e.target.value);
              setFloatSessionId("");
              setPage(1);
            }}
            className={inputClassName}
          >
            <option value="all">All sessions</option>
            <option value="open">Open (active)</option>
            <option value="closed">Closed</option>
            <option value="suspended">Suspended</option>
          </select>
        </Field>
        <Field label="Till session">
          <select
            value={floatSessionId}
            onChange={(e) => {
              setFloatSessionId(e.target.value);
              setPage(1);
            }}
            className={inputClassName}
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
          />
        </Field>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--theme-primary-hover)]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="theme-panel rounded-xl border px-4 py-4 shadow-sm">
          <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Tab total</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAccountingAmount(summary.total_amount ?? 0)}
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
                  {showReferenceColumn ? <th className="px-4 py-3">{refLabel}</th> : null}
                  {showTendersColumn ? <th className="px-4 py-3">Tenders</th> : null}
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Cashier</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Paid at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--theme-border)]">
                {rows.map((row) => (
                  <tr key={`${row.sale_id}-${row.alone_method ?? methodCode}`}>
                    <td className="px-4 py-3">
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
                    </td>
                    {showReferenceColumn ? (
                      <td className="px-4 py-3 font-mono text-[var(--theme-text)]">
                        {row.reference_number || row.mpesa_code || "—"}
                      </td>
                    ) : null}
                    {showTendersColumn ? (
                      <td className="px-4 py-3 text-[var(--theme-text)]">{formatTendersDynamic(row.tenders)}</td>
                    ) : null}
                    <td className="px-4 py-3 font-medium text-[var(--theme-text)]">
                      {formatAccountingAmount(row.amount)}
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
                    <td className="px-4 py-3 text-[var(--theme-text-muted)]">{row.customer_name || "Walk-in"}</td>
                    <td className="px-4 py-3 text-[var(--theme-text-muted)]">
                      {row.paid_at ? formatShortDate(row.paid_at) : "—"}
                    </td>
                  </tr>
                ))}
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
