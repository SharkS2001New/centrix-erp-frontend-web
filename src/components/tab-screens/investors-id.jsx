"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabDetailTitle } from "@/hooks/use-tab-form-exit";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { notifyError, notifySuccess } from "@/lib/notify";
import { P } from "@/lib/permission-codes";
import { isPlatformInvestorsEnabled } from "@/lib/platform-org-features";
import {
  Field,
  FormDrawer,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  StatCard,
  formatKesCompact,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "contributions", label: "Contributions" },
  { id: "batches", label: "Product batches" },
  { id: "spends", label: "Spends" },
  { id: "reports", label: "Reports" },
];

const REPORT_KINDS = [
  { id: "sales", label: "Sales & profit" },
  { id: "stock", label: "Stock balance" },
  { id: "money-flow", label: "Money flow" },
];

const EMPTY_CONTRIBUTION = {
  contribution_type: "cash",
  contribution_date: new Date().toISOString().slice(0, 10),
  amount: "",
  payment_code: "",
  reference_number: "",
  supplier_id: "",
  lpo_no: "",
  notes: "",
};

const EMPTY_LINK = {
  payment_code: "",
  supplier_payment_id: "",
  lpo_no: "",
};

const EMPTY_ALLOCATE = {
  from_lpo: false,
  lpo_no: "",
  product_code: "",
  product_name: "",
  packaging: "",
  qty_purchased: "",
  unit_cost: "",
};

const EMPTY_SPEND = {
  spend_type: "expense",
  amount: "",
  spend_date: new Date().toISOString().slice(0, 10),
  reference_label: "",
  notes: "",
};

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function paymentBadge(status) {
  const s = String(status || "unpaid").toLowerCase();
  const cls =
    s === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : s === "partial"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {s}
    </span>
  );
}

export function InvestorsIdScreen() {
  const params = useParams();
  const searchParams = useSearchParams();
  const investorId = params.id;
  const { capabilities, hasPermission } = useAuth();
  const enabled = isPlatformInvestorsEnabled(capabilities);
  const canEdit = enabled && hasPermission?.(P.investors.investors.edit);
  const canCreate = enabled && hasPermission?.(P.investors.investors.create);
  const canReport =
    enabled &&
    (hasPermission?.(P.investors.reports.view) || hasPermission?.(P.investors.investors.view));

  const [tab, setTab] = useState(() => {
    const fromUrl = searchParams.get("tab");
    return TABS.some((t) => t.id === fromUrl) ? fromUrl : "overview";
  });
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  const [contribDrawer, setContribDrawer] = useState(false);
  const [contribForm, setContribForm] = useState(EMPTY_CONTRIBUTION);
  const [linkDrawer, setLinkDrawer] = useState(null);
  const [linkForm, setLinkForm] = useState(EMPTY_LINK);
  const [allocDrawer, setAllocDrawer] = useState(null);
  const [allocForm, setAllocForm] = useState(EMPTY_ALLOCATE);
  const [spendDrawer, setSpendDrawer] = useState(false);
  const [spendForm, setSpendForm] = useState(EMPTY_SPEND);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [reportKind, setReportKind] = useState("sales");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!enabled) {
      setPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest(`/investors/${investorId}`);
      setPayload(data);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load investor");
    } finally {
      setLoading(false);
    }
  }, [enabled, investorId]);

  useTabAwareDataLoad(loadData);

  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    if (fromUrl && TABS.some((t) => t.id === fromUrl)) setTab(fromUrl);
  }, [searchParams]);

  const investor = payload?.data;
  const summary = payload?.summary ?? {};

  useTabTitle(
    investor
      ? tabDetailTitle("Investor", investor.investor_name || investor.investor_code || investorId)
      : null,
  );

  const contributions = investor?.contributions ?? [];
  const batches = investor?.batches ?? [];
  const spends = investor?.spend_links ?? investor?.spendLinks ?? [];

  async function saveContribution(e) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await apiRequest(`/investors/${investorId}/contributions`, {
        method: "POST",
        body: {
          contribution_type: contribForm.contribution_type,
          contribution_date: contribForm.contribution_date,
          amount: Number(contribForm.amount) || 0,
          payment_code: contribForm.payment_code.trim() || null,
          reference_number: contribForm.reference_number.trim() || null,
          supplier_id: contribForm.supplier_id ? Number(contribForm.supplier_id) : null,
          lpo_no: contribForm.lpo_no ? Number(contribForm.lpo_no) : null,
          notes: contribForm.notes.trim() || null,
        },
      });
      setContribDrawer(false);
      notifySuccess("Contribution recorded");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveLink(e) {
    e.preventDefault();
    if (!linkDrawer) return;
    setFormError(null);
    setSaving(true);
    try {
      await apiRequest(`/investors/${investorId}/contributions/${linkDrawer.id}/link`, {
        method: "POST",
        body: {
          payment_code: linkForm.payment_code.trim() || null,
          supplier_payment_id: linkForm.supplier_payment_id
            ? Number(linkForm.supplier_payment_id)
            : null,
          lpo_no: linkForm.lpo_no ? Number(linkForm.lpo_no) : null,
        },
      });
      setLinkDrawer(null);
      notifySuccess("Payment / LPO linked");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Link failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveAllocate(e) {
    e.preventDefault();
    if (!allocDrawer) return;
    setFormError(null);
    setSaving(true);
    try {
      const body = allocForm.from_lpo
        ? {
            from_lpo: true,
            lpo_no: Number(allocForm.lpo_no || allocDrawer.lpo_no),
            lines: [
              {
                product_code: "_",
                qty_purchased: 1,
              },
            ],
          }
        : {
            lines: [
              {
                product_code: allocForm.product_code.trim(),
                product_name: allocForm.product_name.trim() || null,
                packaging: allocForm.packaging.trim() || null,
                qty_purchased: Number(allocForm.qty_purchased),
                unit_cost: Number(allocForm.unit_cost) || 0,
                lpo_no: allocForm.lpo_no ? Number(allocForm.lpo_no) : allocDrawer.lpo_no,
              },
            ],
          };
      await apiRequest(`/investors/${investorId}/contributions/${allocDrawer.id}/allocate`, {
        method: "POST",
        body,
      });
      setAllocDrawer(null);
      notifySuccess("Products allocated to investor batch");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Allocate failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveSpend(e) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await apiRequest(`/investors/${investorId}/spends`, {
        method: "POST",
        body: {
          spend_type: spendForm.spend_type,
          amount: Number(spendForm.amount) || null,
          spend_date: spendForm.spend_date,
          reference_label: spendForm.reference_label.trim() || null,
          notes: spendForm.notes.trim() || null,
        },
      });
      setSpendDrawer(false);
      notifySuccess("Spend linked");
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const loadReport = useCallback(async () => {
    if (!canReport) return;
    setReportLoading(true);
    try {
      const search = {};
      if (fromDate) search.from_date = fromDate;
      if (toDate) search.to_date = toDate;
      const path =
        reportKind === "stock"
          ? `/investors/${investorId}/reports/stock`
          : reportKind === "money-flow"
            ? `/investors/${investorId}/reports/money-flow`
            : `/investors/${investorId}/reports/sales`;
      const data = await apiRequest(path, { searchParams: search });
      setReport(data);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load report");
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [canReport, fromDate, toDate, investorId, reportKind]);

  useEffect(() => {
    if (tab === "reports" && canReport) {
      void loadReport();
    }
  }, [tab, canReport, loadReport]);

  const reportTotals = useMemo(() => report?.totals ?? {}, [report]);

  if (!enabled) {
    return (
      <div className="theme-workspace p-6">
        <p className="text-sm text-slate-600">Investors module is disabled for this organization.</p>
      </div>
    );
  }

  if (loading && !investor) {
    return (
      <div className="theme-workspace p-6">
        <p className="text-sm text-slate-500">Loading investor…</p>
      </div>
    );
  }

  if (!investor) {
    return (
      <div className="theme-workspace p-6">
        <p className="text-sm text-slate-600">Investor not found.</p>
        <Link href="/investors" className="mt-2 inline-block text-sm text-[var(--brand-primary)]">
          Back to investors
        </Link>
      </div>
    );
  }

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Investors", href: "/investors" },
          { label: investor.investor_name || investor.investor_code || "Investor" },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-medium text-slate-900">{investor.investor_name}</h1>
            <StatusBadge active={investor.is_active !== false} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {investor.investor_code}
            {investor.contact_person ? ` · ${investor.contact_person}` : ""}
            {investor.phone ? ` · ${investor.phone}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(canCreate || canEdit) && (
            <PrimaryButton
              onClick={() => {
                setContribForm({ ...EMPTY_CONTRIBUTION });
                setFormError(null);
                setContribDrawer(true);
              }}
            >
              Add contribution
            </PrimaryButton>
          )}
          {canEdit && (
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              onClick={() => {
                setSpendForm({ ...EMPTY_SPEND });
                setFormError(null);
                setSpendDrawer(true);
              }}
            >
              Link spend
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total contributed" value={formatKesCompact(summary.total_contributed ?? 0)} />
        <StatCard label="Stock value" value={formatKesCompact(summary.stock_value ?? 0)} />
        <StatCard label="Cash pool" value={formatKesCompact(summary.cash_pool_balance ?? 0)} />
        <StatCard label="Open batches" value={summary.open_batches ?? 0} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-b-2 border-[var(--brand-primary)] text-slate-900"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="theme-panel space-y-3 rounded-xl p-4 text-sm text-slate-700 shadow-sm">
          <p>
            <span className="font-medium text-slate-900">Cash in:</span>{" "}
            {formatKesCompact(summary.cash_contributed ?? 0)}
          </p>
          <p>
            <span className="font-medium text-slate-900">Stock in:</span>{" "}
            {formatKesCompact(summary.stock_contributed ?? 0)}
          </p>
          <p>
            <span className="font-medium text-slate-900">Cash spent:</span>{" "}
            {formatKesCompact(summary.cash_spent ?? 0)}
          </p>
          {investor.notes ? (
            <p className="border-t border-slate-100 pt-3 text-slate-600">{investor.notes}</p>
          ) : null}
        </div>
      )}

      {tab === "contributions" && (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Payment code</th>
                  <th className="px-4 py-2.5">LPO</th>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contributions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      No contributions yet.
                    </td>
                  </tr>
                ) : (
                  contributions.map((c) => (
                    <tr key={c.id} className="theme-table-row border-t border-slate-100">
                      <td className="px-4 py-2.5">{formatShortDate(c.contribution_date)}</td>
                      <td className="px-4 py-2.5 capitalize">{c.contribution_type}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatKesCompact(c.amount ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{c.payment_code || "—"}</td>
                      <td className="px-4 py-2.5">{c.lpo_no || "—"}</td>
                      <td className="px-4 py-2.5">
                        {c.supplier?.supplier_name || c.supplier_id || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {canEdit && c.contribution_type === "stock" ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                              onClick={() => {
                                setLinkForm({
                                  payment_code: c.payment_code || "",
                                  supplier_payment_id: c.supplier_payment_id
                                    ? String(c.supplier_payment_id)
                                    : "",
                                  lpo_no: c.lpo_no ? String(c.lpo_no) : "",
                                });
                                setFormError(null);
                                setLinkDrawer(c);
                              }}
                            >
                              Link payment/LPO
                            </button>
                            <button
                              type="button"
                              className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                              onClick={() => {
                                setAllocForm({
                                  ...EMPTY_ALLOCATE,
                                  lpo_no: c.lpo_no ? String(c.lpo_no) : "",
                                  from_lpo: Boolean(c.lpo_no),
                                });
                                setFormError(null);
                                setAllocDrawer(c);
                              }}
                            >
                              Allocate products
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "batches" && (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5 text-right">Purchased</th>
                  <th className="px-4 py-2.5 text-right">Remaining</th>
                  <th className="px-4 py-2.5 text-right">Unit cost</th>
                  <th className="px-4 py-2.5 text-right">Stock value</th>
                  <th className="px-4 py-2.5">Received</th>
                  <th className="px-4 py-2.5">LPO</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      No funded product batches. Allocate from a stock contribution.
                    </td>
                  </tr>
                ) : (
                  batches.map((b) => (
                    <tr key={b.id} className="theme-table-row border-t border-slate-100">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">
                          {b.product_name || b.product_code}
                        </div>
                        <div className="font-mono text-xs text-slate-500">{b.product_code}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{b.qty_purchased}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{b.qty_remaining}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatKesCompact(b.unit_cost ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatKesCompact(
                          Number(b.qty_remaining ?? 0) * Number(b.unit_cost ?? 0),
                        )}
                      </td>
                      <td className="px-4 py-2.5">{formatShortDate(b.received_at) || "—"}</td>
                      <td className="px-4 py-2.5">{b.lpo_no || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "spends" && (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Label</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Notes</th>
                </tr>
              </thead>
              <tbody>
                {spends.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      No spends linked to this investor&apos;s cash pool.
                    </td>
                  </tr>
                ) : (
                  spends.map((s) => (
                    <tr key={s.id} className="theme-table-row border-t border-slate-100">
                      <td className="px-4 py-2.5">{formatShortDate(s.spend_date)}</td>
                      <td className="px-4 py-2.5 capitalize">
                        {String(s.spend_type || "").replaceAll("_", " ")}
                      </td>
                      <td className="px-4 py-2.5">{s.reference_label || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatKesCompact(s.amount ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{s.notes || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "reports" && (
        <div className="space-y-4">
          {!canReport ? (
            <p className="text-sm text-slate-600">You do not have permission to view investor reports.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-wrap gap-1">
                  {REPORT_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setReportKind(k.id)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                        reportKind === k.id
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                {reportKind !== "stock" ? (
                  <>
                    <Field label="From">
                      <input
                        type="date"
                        className={inputClassName()}
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                      />
                    </Field>
                    <Field label="To">
                      <input
                        type="date"
                        className={inputClassName()}
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                      />
                    </Field>
                  </>
                ) : null}
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  onClick={() => void loadReport()}
                  disabled={reportLoading}
                >
                  {reportLoading ? "Loading…" : "Refresh"}
                </button>
              </div>

              {reportKind === "sales" && report && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <StatCard label="Sales" value={formatKesCompact(reportTotals.sales_value ?? 0)} />
                    <StatCard label="Cost" value={formatKesCompact(reportTotals.cost_value ?? 0)} />
                    <StatCard
                      label="Gross profit"
                      value={formatKesCompact(reportTotals.gross_profit ?? 0)}
                    />
                    <StatCard label="Expenses" value={formatKesCompact(reportTotals.expenses ?? 0)} />
                    <StatCard
                      label="Net profit"
                      value={formatKesCompact(reportTotals.net_profit ?? 0)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard label="Paid sales" value={formatKesCompact(reportTotals.paid_sales ?? 0)} />
                    <StatCard
                      label="Partial sales"
                      value={formatKesCompact(reportTotals.partial_sales ?? 0)}
                    />
                    <StatCard
                      label="Unpaid sales"
                      value={formatKesCompact(reportTotals.unpaid_sales ?? 0)}
                    />
                  </div>
                  <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1000px] border-collapse text-sm">
                        <thead>
                          <tr className="theme-table-head-row text-left text-xs font-medium">
                            <th className="px-3 py-2">Invoice</th>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Product</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Sales</th>
                            <th className="px-3 py-2 text-right">Cost</th>
                            <th className="px-3 py-2 text-right">Profit</th>
                            <th className="px-3 py-2">Payment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(report.lines ?? []).length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                                No attributed sales in this period.
                              </td>
                            </tr>
                          ) : (
                            (report.lines ?? []).map((line, idx) => (
                              <tr
                                key={`${line.sale_id}-${line.product_code}-${idx}`}
                                className="theme-table-row border-t border-slate-100"
                              >
                                <td className="px-3 py-2 font-mono text-xs">{line.invoice_label}</td>
                                <td className="px-3 py-2">{formatShortDate(line.sale_date)}</td>
                                <td className="px-3 py-2">{line.product_name}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {line.quantity_sold}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatKesCompact(line.sales_value)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatKesCompact(line.cost_value)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatKesCompact(line.profit)}
                                </td>
                                <td className="px-3 py-2">{paymentBadge(line.payment_status)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {reportKind === "stock" && report && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard label="Qty purchased" value={reportTotals.qty_purchased ?? 0} />
                    <StatCard label="Qty remaining" value={reportTotals.qty_remaining ?? 0} />
                    <StatCard
                      label="Stock value"
                      value={formatKesCompact(reportTotals.stock_value ?? 0)}
                    />
                  </div>
                  <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[880px] border-collapse text-sm">
                        <thead>
                          <tr className="theme-table-head-row text-left text-xs font-medium">
                            <th className="px-3 py-2">Product</th>
                            <th className="px-3 py-2 text-right">Purchased</th>
                            <th className="px-3 py-2 text-right">Sold</th>
                            <th className="px-3 py-2 text-right">Remaining</th>
                            <th className="px-3 py-2 text-right">Unit cost</th>
                            <th className="px-3 py-2 text-right">Stock value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(report.rows ?? []).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                                No batches.
                              </td>
                            </tr>
                          ) : (
                            (report.rows ?? []).map((row) => (
                              <tr key={row.batch_id} className="theme-table-row border-t border-slate-100">
                                <td className="px-3 py-2">
                                  <div className="font-medium">{row.product_name || row.product_code}</div>
                                  <div className="font-mono text-xs text-slate-500">
                                    {row.product_code}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{row.qty_purchased}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{row.qty_sold}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{row.qty_remaining}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatKesCompact(row.unit_cost)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatKesCompact(row.stock_value)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {reportKind === "money-flow" && report && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                      label="Net profit"
                      value={formatKesCompact(report.summary?.net_profit ?? 0)}
                    />
                    <StatCard
                      label="Cash pool"
                      value={formatKesCompact(report.summary?.cash_pool_balance ?? 0)}
                    />
                    <StatCard
                      label="Stock value"
                      value={formatKesCompact(report.summary?.stock_value ?? 0)}
                    />
                    <StatCard
                      label="Sales value"
                      value={formatKesCompact(report.summary?.sales_value ?? 0)}
                    />
                  </div>
                  <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[800px] border-collapse text-sm">
                        <thead>
                          <tr className="theme-table-head-row text-left text-xs font-medium">
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Event</th>
                            <th className="px-3 py-2 text-right">In</th>
                            <th className="px-3 py-2 text-right">Out</th>
                            <th className="px-3 py-2 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(report.events ?? []).length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                                No money-flow events.
                              </td>
                            </tr>
                          ) : (
                            (report.events ?? []).map((ev, idx) => (
                              <tr key={`${ev.type}-${ev.reference_id}-${idx}`} className="theme-table-row border-t border-slate-100">
                                <td className="px-3 py-2">{formatShortDate(ev.date)}</td>
                                <td className="px-3 py-2">{ev.label}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                                  {ev.in ? formatKesCompact(ev.in) : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-rose-700">
                                  {ev.out ? formatKesCompact(ev.out) : "—"}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">
                                  {formatKesCompact(ev.balance)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      <FormDrawer
        open={contribDrawer}
        onClose={() => setContribDrawer(false)}
        title="Add contribution"
      >
        <form onSubmit={(e) => void saveContribution(e)} className="space-y-4">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <Field label="Type" required>
            <select
              className={inputClassName()}
              value={contribForm.contribution_type}
              onChange={(e) =>
                setContribForm((p) => ({ ...p, contribution_type: e.target.value }))
              }
            >
              <option value="cash">Cash (deposit to org)</option>
              <option value="stock">Stock (paid supplier for goods)</option>
            </select>
          </Field>
          <Field label="Date" required>
            <input
              type="date"
              className={inputClassName()}
              value={contribForm.contribution_date}
              onChange={(e) =>
                setContribForm((p) => ({ ...p, contribution_date: e.target.value }))
              }
              required
            />
          </Field>
          <Field label="Amount">
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClassName()}
              value={contribForm.amount}
              onChange={(e) => setContribForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </Field>
          <Field label="Payment code">
            <input
              className={inputClassName()}
              value={contribForm.payment_code}
              onChange={(e) => setContribForm((p) => ({ ...p, payment_code: e.target.value }))}
              placeholder="Supplier payment / bank ref"
            />
          </Field>
          {contribForm.contribution_type === "stock" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="LPO no">
                <input
                  className={inputClassName()}
                  value={contribForm.lpo_no}
                  onChange={(e) => setContribForm((p) => ({ ...p, lpo_no: e.target.value }))}
                />
              </Field>
              <Field label="Supplier ID">
                <input
                  className={inputClassName()}
                  value={contribForm.supplier_id}
                  onChange={(e) =>
                    setContribForm((p) => ({ ...p, supplier_id: e.target.value }))
                  }
                />
              </Field>
            </div>
          ) : null}
          <Field label="Notes">
            <textarea
              className={inputClassName()}
              rows={2}
              value={contribForm.notes}
              onChange={(e) => setContribForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => setContribDrawer(false)}>
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        </form>
      </FormDrawer>

      <FormDrawer
        open={Boolean(linkDrawer)}
        onClose={() => setLinkDrawer(null)}
        title="Link payment / LPO"
      >
        <form onSubmit={(e) => void saveLink(e)} className="space-y-4">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <Field label="Payment code">
            <input
              className={inputClassName()}
              value={linkForm.payment_code}
              onChange={(e) => setLinkForm((p) => ({ ...p, payment_code: e.target.value }))}
            />
          </Field>
          <Field label="Supplier payment ID">
            <input
              className={inputClassName()}
              value={linkForm.supplier_payment_id}
              onChange={(e) =>
                setLinkForm((p) => ({ ...p, supplier_payment_id: e.target.value }))
              }
            />
          </Field>
          <Field label="LPO no">
            <input
              className={inputClassName()}
              value={linkForm.lpo_no}
              onChange={(e) => setLinkForm((p) => ({ ...p, lpo_no: e.target.value }))}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => setLinkDrawer(null)}>
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Linking…" : "Link"}
            </PrimaryButton>
          </div>
        </form>
      </FormDrawer>

      <FormDrawer
        open={Boolean(allocDrawer)}
        onClose={() => setAllocDrawer(null)}
        title="Allocate products"
      >
        <form onSubmit={(e) => void saveAllocate(e)} className="space-y-4">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allocForm.from_lpo}
              onChange={(e) => setAllocForm((p) => ({ ...p, from_lpo: e.target.checked }))}
            />
            Allocate all lines from LPO
          </label>
          {allocForm.from_lpo ? (
            <Field label="LPO no" required>
              <input
                className={inputClassName()}
                value={allocForm.lpo_no}
                onChange={(e) => setAllocForm((p) => ({ ...p, lpo_no: e.target.value }))}
                required
              />
            </Field>
          ) : (
            <>
              <Field label="Product code" required>
                <input
                  className={inputClassName()}
                  value={allocForm.product_code}
                  onChange={(e) =>
                    setAllocForm((p) => ({ ...p, product_code: e.target.value }))
                  }
                  required
                />
              </Field>
              <Field label="Product name">
                <input
                  className={inputClassName()}
                  value={allocForm.product_name}
                  onChange={(e) =>
                    setAllocForm((p) => ({ ...p, product_name: e.target.value }))
                  }
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Qty purchased" required>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    className={inputClassName()}
                    value={allocForm.qty_purchased}
                    onChange={(e) =>
                      setAllocForm((p) => ({ ...p, qty_purchased: e.target.value }))
                    }
                    required
                  />
                </Field>
                <Field label="Unit cost">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputClassName()}
                    value={allocForm.unit_cost}
                    onChange={(e) =>
                      setAllocForm((p) => ({ ...p, unit_cost: e.target.value }))
                    }
                  />
                </Field>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => setAllocDrawer(null)}>
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Allocate"}
            </PrimaryButton>
          </div>
        </form>
      </FormDrawer>

      <FormDrawer open={spendDrawer} onClose={() => setSpendDrawer(false)} title="Link spend">
        <form onSubmit={(e) => void saveSpend(e)} className="space-y-4">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <Field label="Spend type" required>
            <select
              className={inputClassName()}
              value={spendForm.spend_type}
              onChange={(e) => setSpendForm((p) => ({ ...p, spend_type: e.target.value }))}
            >
              <option value="expense">Expense</option>
              <option value="supplier_payment">Supplier payment</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Date" required>
            <input
              type="date"
              className={inputClassName()}
              value={spendForm.spend_date}
              onChange={(e) => setSpendForm((p) => ({ ...p, spend_date: e.target.value }))}
              required
            />
          </Field>
          <Field label="Amount">
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClassName()}
              value={spendForm.amount}
              onChange={(e) => setSpendForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </Field>
          <Field label="Label">
            <input
              className={inputClassName()}
              value={spendForm.reference_label}
              onChange={(e) =>
                setSpendForm((p) => ({ ...p, reference_label: e.target.value }))
              }
            />
          </Field>
          <Field label="Notes">
            <textarea
              className={inputClassName()}
              rows={2}
              value={spendForm.notes}
              onChange={(e) => setSpendForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => setSpendDrawer(false)}>
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        </form>
      </FormDrawer>
    </div>
  );
}
