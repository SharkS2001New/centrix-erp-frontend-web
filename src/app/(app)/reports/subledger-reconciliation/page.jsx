"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useOrgFormat } from "@/lib/org-format";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

function ReconcileCard({ title, data, currency }) {
  if (!data) return null;
  const reconciled = Boolean(data.reconciled);
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-medium text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">Control account {data.control_account_code}</p>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">GL balance</dt>
          <dd>{currency(data.gl_balance)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Subledger total</dt>
          <dd>{currency(data.subledger_total)}</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt className="text-slate-500">Variance</dt>
          <dd className={reconciled ? "text-emerald-700" : "text-amber-700"}>{currency(data.variance)}</dd>
        </div>
      </dl>
      <p className={`mt-3 text-xs font-medium ${reconciled ? "text-emerald-700" : "text-amber-700"}`}>
        {reconciled ? "Reconciled" : "Variance detected — investigate open items"}
      </p>
    </div>
  );
}

export default function SubledgerReconciliationPage() {
  const { currency } = useOrgFormat();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/reports/subledger-reconciliation");
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load reconciliation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <CatalogPageShell
      title="Subledger reconciliation"
      subtitle="Compare GL control accounts to AR/AP subledgers"
    >
      <Link href="/reports" className="text-sm text-[#185FA5] hover:underline">
        ← Reports hub
      </Link>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : data ? (
        <>
          <p className="mt-4 text-sm text-slate-600">As of {data.as_of}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ReconcileCard title={data.ar?.label ?? "Accounts receivable"} data={data.ar} currency={currency} />
            <ReconcileCard title={data.ap?.label ?? "Accounts payable"} data={data.ap} currency={currency} />
          </div>
        </>
      ) : null}
    </CatalogPageShell>
  );
}
