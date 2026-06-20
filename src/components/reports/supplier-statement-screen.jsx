"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { formatReportKes } from "@/lib/reports/format";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  ReportKpiGrid,
  ReportPageShell,
  ReportTable,
} from "@/components/reports/report-screen-shared";
import { formatShortDate } from "@/components/catalog/catalog-shared";

export function SupplierStatementScreen() {
  const searchParams = useSearchParams();
  const initialSupplier = searchParams.get("supplier_id") ?? searchParams.get("supplier") ?? "";

  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState(initialSupplier);
  const [appliedSupplierId, setAppliedSupplierId] = useState(initialSupplier);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiRequest("/suppliers", { searchParams: { per_page: 200 } })
      .then((res) => setSuppliers(res.data ?? []))
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get("supplier_id") ?? searchParams.get("supplier");
    if (fromUrl) {
      setSupplierId(fromUrl);
      setAppliedSupplierId(fromUrl);
    }
  }, [searchParams]);

  const loadStatement = useCallback(async () => {
    if (!appliedSupplierId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(`/suppliers/${appliedSupplierId}/summary`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load supplier statement");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [appliedSupplierId]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  const supplier = data?.supplier ?? null;
  const stats = data?.stats ?? null;
  const purchases = data?.purchases ?? [];
  const payments = data?.payments ?? [];

  const kpis = useMemo(
    () => [
      { id: "purchases", label: "Total purchases", value: formatReportKes(stats?.total_purchases ?? 0) },
      { id: "paid", label: "Total paid", value: formatReportKes(stats?.total_paid ?? 0) },
      { id: "balance", label: "Balance due", value: formatReportKes(supplier?.current_balance ?? 0) },
      { id: "open-lpos", label: "Open LPOs", value: String(stats?.open_lpo_count ?? 0) },
    ],
    [stats, supplier],
  );

  const purchaseColumns = [
    { key: "lpo_no", label: "LPO", accessor: (r) => r.lpo_no },
    { key: "order_date", label: "Date", accessor: (r) => formatShortDate(r.order_date) },
    { key: "status_name", label: "Status", accessor: (r) => r.status_name ?? "—" },
    { key: "total_amount", label: "Amount", accessor: (r) => formatReportKes(r.total_amount), align: "right" },
    { key: "balance_due", label: "Balance", accessor: (r) => formatReportKes(r.balance_due), align: "right" },
  ];

  const paymentColumns = [
    { key: "date_paid", label: "Date", accessor: (r) => formatShortDate(r.date_paid) },
    { key: "payment_method", label: "Method", accessor: (r) => r.payment_method ?? "—" },
    { key: "reference_number", label: "Reference", accessor: (r) => r.reference_number ?? "—" },
    { key: "amount_paid", label: "Amount", accessor: (r) => formatReportKes(r.amount_paid), align: "right" },
  ];

  return (
    <ReportPageShell
      section="Purchasing"
      title="Supplier Statement"
      subtitle="Purchases, payments, and balance for a supplier"
    >
      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedSupplierId(supplierId);
        }}
      >
        <Field label="Supplier" className="min-w-[240px]">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className={inputClassName()}
            required
          >
            <option value="" disabled>
              Select supplier
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.supplier_name}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#0C447C]"
        >
          View statement
        </button>
      </form>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading statement…</p> : null}

      {supplier ? (
        <>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <p className="font-semibold text-slate-900">{supplier.supplier_name}</p>
            <p className="mt-1 text-slate-500">
              {supplier.phone_number ? `Phone: ${supplier.phone_number}` : null}
              {supplier.email ? ` · ${supplier.email}` : null}
            </p>
            <Link href={`/suppliers/${supplier.id}`} className="mt-2 inline-block text-[#185FA5] hover:underline">
              Open supplier profile
            </Link>
          </div>

          <ReportKpiGrid items={kpis} />

          <div className="mt-6 space-y-6">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Purchases (LPO)</h2>
              <ReportTable columns={purchaseColumns} rows={purchases} emptyLabel="No purchases on record" />
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Payments</h2>
              <ReportTable columns={paymentColumns} rows={payments} emptyLabel="No payments on record" />
            </div>
          </div>
        </>
      ) : null}
    </ReportPageShell>
  );
}
