"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { CatalogPageShell, PrimaryLink } from "@/components/catalog/catalog-shared";
import { formatAccountingAmount } from "@/lib/accounting-shared";
import { normalizeCustomerInvoice } from "@/lib/customer-invoices";
import { currentMonthDateRange } from "@/lib/dashboard-dates";
import {
  DashboardErrorBanner,
  DashboardKpiGrid,
  DashboardLoading,
  DashboardPanel,
  DashboardQuickLinks,
  DashboardRefreshButton,
  DashboardSection,
  DashboardSummaryTable,
} from "@/components/dashboard/dashboard-shared";
import { DonutChart, CHART_COLORS } from "@/components/reports/report-charts";

const ACCOUNTING_LINKS = [
  { href: "/accounting/customer-invoices", title: "Customer invoices", desc: "AR invoices from customer orders" },
  { href: "/accounting/journal-entries", title: "Journal entries", desc: "Create and post entries" },
  { href: "/accounting/general-ledger", title: "General ledger", desc: "Posted journal activity" },
  { href: "/accounting/bank-reconciliation", title: "Bank reconciliation", desc: "Match bank statements to ledger" },
  { href: "/accounting/trial-balance", title: "Trial balance", desc: "Debit and credit balances" },
  { href: "/accounting/profit-loss", title: "Profit & loss", desc: "Revenue and expenses" },
  { href: "/accounting/balance-sheet", title: "Balance sheet", desc: "Assets, liabilities, equity" },
  { href: "/accounting/cash-flow", title: "Cash flow", desc: "Cash and bank movements" },
  { href: "/accounting/accounts-receivable", title: "Accounts receivable", desc: "Customer balances" },
  { href: "/accounting/accounts-payable", title: "Accounts payable", desc: "Supplier payables" },
  { href: "/expenses", title: "Expenses", desc: "Operational expenses" },
  { href: "/reports", title: "All reports", desc: "Financial and compliance reports" },
];

export function AccountingDashboardContent() {
  const range = useMemo(() => currentMonthDateRange(), []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [trialBalance, setTrialBalance] = useState(null);
  const [profitLoss, setProfitLoss] = useState(null);
  const [balanceSheet, setBalanceSheet] = useState(null);
  const [receivables, setReceivables] = useState([]);
  const [receivablesTotal, setReceivablesTotal] = useState(0);
  const [payables, setPayables] = useState([]);
  const [recentInvoices, setRecentInvoices] = useState([]);

  const loadDashboard = useCallback(async ({ soft = false } = {}) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [tb, pl, bs, ar, ap, invoicesRes] = await Promise.all([
        apiRequest("/reports/trial-balance"),
        apiRequest("/reports/profit-loss-gl", { searchParams: { from_date: range.from, to_date: range.to } }),
        apiRequest("/reports/balance-sheet"),
        apiRequest("/reports/accounts-receivable", { searchParams: { per_page: 5 } }),
        apiRequest("/reports/accounts-payable", { searchParams: { per_page: 5 } }),
        apiRequest("/customer-invoices", { searchParams: { per_page: 5, page: 1 } }),
      ]);
      setTrialBalance(tb.summary ?? null);
      setProfitLoss(pl.summary ?? null);
      setBalanceSheet(bs.summary ?? null);
      setReceivables(ar.data ?? []);
      setReceivablesTotal(Number(ar.summary?.total_outstanding ?? 0));
      setPayables(ap.data ?? []);
      setRecentInvoices(invoicesRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounting dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const kpiItems = useMemo(
    () => [
      {
        id: "revenue",
        label: "Revenue (MTD)",
        value: profitLoss?.total_revenue != null ? formatAccountingAmount(profitLoss.total_revenue) : "—",
        hint: `${range.from} – ${range.to}`,
      },
      {
        id: "net_income",
        label: "Net income (MTD)",
        value: profitLoss?.net_income != null ? formatAccountingAmount(profitLoss.net_income) : "—",
        hint: "Profit & loss",
      },
      {
        id: "assets",
        label: "Total assets",
        value: balanceSheet?.total_assets != null ? formatAccountingAmount(balanceSheet.total_assets) : "—",
        hint: "Balance sheet",
      },
      {
        id: "ar",
        label: "Receivables",
        value: formatAccountingAmount(receivablesTotal),
        hint: `${receivables.length} top accounts shown`,
      },
    ],
    [profitLoss, balanceSheet, receivables, receivablesTotal, range.from, range.to],
  );

  const plSegments = useMemo(() => {
    const revenue = Number(profitLoss?.total_revenue ?? 0);
    const expenses = Number(profitLoss?.total_expenses ?? 0);
    const net = Number(profitLoss?.net_income ?? 0);
    if (!revenue && !expenses) return [];
    return [
      { label: "Revenue", value: revenue, color: CHART_COLORS[1] },
      { label: "Expenses", value: expenses, color: CHART_COLORS[3] },
      { label: "Net income", value: Math.max(net, 0), color: CHART_COLORS[0] },
    ].filter((s) => s.value > 0);
  }, [profitLoss]);

  const balanceSegments = useMemo(() => {
    const assets = Number(balanceSheet?.total_assets ?? 0);
    const liabilities = Number(balanceSheet?.total_liabilities ?? 0);
    const equity = Number(balanceSheet?.total_equity ?? 0);
    if (!assets && !liabilities && !equity) return [];
    return [
      { label: "Assets", value: assets, color: CHART_COLORS[0] },
      { label: "Liabilities", value: liabilities, color: CHART_COLORS[3] },
      { label: "Equity", value: equity, color: CHART_COLORS[4] },
    ].filter((s) => s.value > 0);
  }, [balanceSheet]);

  return (
    <CatalogPageShell
      title="Accounting dashboard"
      subtitle="Financial position and month-to-date performance"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <DashboardRefreshButton onClick={() => void loadDashboard({ soft: true })} loading={loading || refreshing} />
          <PrimaryLink href="/accounting/journal-entries/new">New entry</PrimaryLink>
        </div>
      }
    >
      <DashboardErrorBanner message={error} />

      {loading ? (
        <DashboardLoading />
      ) : (
        <div className="space-y-8">
          <DashboardKpiGrid items={kpiItems} />

          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardPanel title="Profit & loss (MTD)" subtitle="Revenue vs expenses">
              <DonutChart segments={plSegments} loading={false} emptyMessage="No P&L data for this month." />
              {trialBalance ? (
                <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
                  Trial balance: {formatAccountingAmount(trialBalance.total_debit)} debits ·{" "}
                  {formatAccountingAmount(trialBalance.total_credit)} credits
                </p>
              ) : null}
            </DashboardPanel>
            <DashboardPanel title="Balance sheet" subtitle="Assets, liabilities, and equity">
              <DonutChart segments={balanceSegments} loading={false} emptyMessage="No balance sheet data." />
            </DashboardPanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <DashboardSection
              title="Recent customer invoices"
              action={
                <Link href="/accounting/customer-invoices" className="text-sm text-[#185FA5] hover:underline">
                  View all
                </Link>
              }
            >
              <DashboardSummaryTable
                columns={[
                  { key: "invoice_number", label: "Invoice" },
                  { key: "customer_name", label: "Customer" },
                  { key: "balance_due", label: "Balance", align: "right" },
                ]}
                rows={recentInvoices.map(normalizeCustomerInvoice)}
                formatValue={(key, value, row) => {
                  if (key === "balance_due") return formatAccountingAmount(value);
                  if (key === "customer_name") {
                    return value ? String(value) : row?.customer_num ? `#${row.customer_num}` : "—";
                  }
                  return value;
                }}
                viewAllHref="/accounting/customer-invoices"
                emptyMessage="No customer invoices yet. Invoices are created when orders are placed for registered customers."
              />
            </DashboardSection>

            <DashboardSection
              title="Top receivables"
              action={
                <Link href="/accounting/accounts-receivable" className="text-sm text-[#185FA5] hover:underline">
                  View all
                </Link>
              }
            >
              <DashboardSummaryTable
                columns={[
                  { key: "customer_name", label: "Customer" },
                  { key: "total_outstanding", label: "Outstanding", align: "right" },
                ]}
                rows={receivables}
                formatValue={(key, value) =>
                  key === "total_outstanding" ? formatAccountingAmount(value) : value
                }
                viewAllHref="/accounting/accounts-receivable"
              />
            </DashboardSection>

            <DashboardSection
              title="Top payables"
              action={
                <Link href="/accounting/accounts-payable" className="text-sm text-[#185FA5] hover:underline">
                  View all
                </Link>
              }
            >
              <DashboardSummaryTable
                columns={[
                  { key: "supplier_name", label: "Supplier" },
                  { key: "balance_due", label: "Balance due", align: "right" },
                ]}
                rows={payables}
                formatValue={(key, value) => (key === "balance_due" ? formatAccountingAmount(value) : value)}
                viewAllHref="/accounting/accounts-payable"
              />
            </DashboardSection>
          </div>

          <DashboardSection title="Accounting tools" subtitle="Ledgers, reports, and settings">
            <DashboardQuickLinks links={ACCOUNTING_LINKS} />
          </DashboardSection>
        </div>
      )}
    </CatalogPageShell>
  );
}
