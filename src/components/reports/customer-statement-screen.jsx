"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { formatReportKes, formatReportCell } from "@/lib/reports/format";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  ReportKpiGrid,
  ReportPageShell,
  ReportTable,
} from "@/components/reports/report-screen-shared";

export function CustomerStatementScreen() {
  const searchParams = useSearchParams();
  const initialCustomer = searchParams.get("customer") ?? "";

  const [customers, setCustomers] = useState([]);
  const [customerNum, setCustomerNum] = useState(initialCustomer);
  const [appliedCustomer, setAppliedCustomer] = useState(initialCustomer);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiRequest("/customers", { searchParams: { per_page: 200 } })
      .then((res) => setCustomers(res.data ?? []))
      .catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get("customer");
    if (fromUrl) {
      setCustomerNum(fromUrl);
      setAppliedCustomer(fromUrl);
    }
  }, [searchParams]);

  const loadStatement = useCallback(async () => {
    if (!appliedCustomer) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(`/reports/customers/${appliedCustomer}/statement`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load statement");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [appliedCustomer]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  const customer = data?.customer ?? null;
  const summary = data?.summary ?? null;

  const lines = useMemo(() => {
    if (!data) return [];
    const rows = [];
    for (const inv of data.invoices ?? []) {
      rows.push({
        id: `inv-${inv.id}`,
        date: inv.invoice_date,
        document: inv.invoice_number,
        description: "Invoice",
        debit: Number(inv.invoice_total) || 0,
        credit: 0,
      });
    }
    for (const pay of data.payments ?? []) {
      rows.push({
        id: `pay-${pay.id}`,
        date: pay.date_paid,
        document: pay.reference_number ?? `PAY-${pay.id}`,
        description: "Payment",
        debit: 0,
        credit: Number(pay.amount_paid) || 0,
      });
    }
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let balance = 0;
    return rows.map((row) => {
      balance += row.debit - row.credit;
      return { ...row, balance };
    });
  }, [data]);

  const outstanding = summary?.outstanding_balance ?? customer?.current_balance ?? 0;
  const creditLimit = summary?.credit_limit ?? customer?.credit_limit ?? 0;

  const columns = [
    { key: "date", label: "Date", accessor: (r) => formatReportCell("date", r.date) },
    { key: "document", label: "Document No", accessor: (r) => r.document },
    { key: "description", label: "Description", accessor: (r) => r.description },
    { key: "debit", label: "Debit", accessor: (r) => formatReportKes(r.debit), align: "right" },
    { key: "credit", label: "Credit", accessor: (r) => formatReportKes(r.credit), align: "right" },
    { key: "balance", label: "Balance", accessor: (r) => formatReportKes(r.balance), align: "right" },
  ];

  return (
    <ReportPageShell
      section="Finance"
      title="Customer Statement"
      subtitle="Running balance from invoices and payments"
    >
      <div className="mb-6 theme-panel rounded-xl border p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Customer">
            <select
              className={`${inputClassName()} min-w-[240px]`}
              value={customerNum}
              onChange={(e) => setCustomerNum(e.target.value)}
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.customer_num} value={c.customer_num}>
                  {c.customer_name} ({c.customer_num})
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            onClick={() => setAppliedCustomer(customerNum)}
            disabled={!customerNum || loading}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134d88] disabled:opacity-50"
          >
            {loading ? "Loading…" : "View statement"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {customer ? (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="theme-panel rounded-xl border p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer</p>
              <p className="mt-1 font-semibold text-slate-900">{customer.customer_name}</p>
              <p className="text-sm text-slate-500">#{customer.customer_num}</p>
              <Link
                href={`/customers/${customer.customer_num}`}
                className="mt-2 inline-block text-sm text-[#185FA5] hover:text-[#144f8a]"
              >
                View profile →
              </Link>
            </div>
            <div className="theme-panel rounded-xl border p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Contact</p>
              <p className="mt-1 text-sm text-slate-700">{customer.phone_number ?? "—"}</p>
              {customer.additional_phone ? (
                <p className="text-sm text-slate-500">{customer.additional_phone}</p>
              ) : null}
              {customer.town ? <p className="text-sm text-slate-500">{customer.town}</p> : null}
            </div>
            <div className="theme-panel rounded-xl border p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Branch & route</p>
              <p className="mt-1 text-sm text-slate-700">{customer.branch_name ?? "—"}</p>
              {customer.route_name ? (
                <p className="text-sm text-slate-500">Route: {customer.route_name}</p>
              ) : null}
            </div>
            <div className="theme-panel rounded-xl border p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Credit terms</p>
              <p className="mt-1 text-sm text-slate-700">{customer.terms_of_payment ?? "—"}</p>
              {customer.kra_pin ? <p className="text-sm text-slate-500">KRA PIN: {customer.kra_pin}</p> : null}
            </div>
          </div>
          <ReportKpiGrid
            items={[
              { id: "outstanding", label: "Outstanding Balance", value: formatReportKes(outstanding) },
              { id: "credit", label: "Credit Limit", value: formatReportKes(creditLimit) },
              {
                id: "invoiced",
                label: "Total Invoiced",
                value: formatReportKes(summary?.total_invoiced ?? 0),
              },
              { id: "paid", label: "Total Paid", value: formatReportKes(summary?.total_paid ?? 0) },
            ]}
          />
        </>
      ) : null}

      {appliedCustomer && !loading ? (
        <ReportTable columns={columns} rows={lines} emptyLabel="No transactions for this customer." />
      ) : null}
    </ReportPageShell>
  );
}
