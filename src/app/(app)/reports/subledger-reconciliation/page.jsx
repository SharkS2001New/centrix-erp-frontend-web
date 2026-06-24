"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useOrgFormat } from "@/lib/org-format";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";

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

  const exportColumns = useMemo(
    () => [
      { key: "account", label: "Account", accessor: (row) => row.account },
      { key: "control_code", label: "Control account", accessor: (row) => row.control_code },
      { key: "gl_balance", label: "GL balance", accessor: (row) => row.gl_balance, align: "right" },
      { key: "subledger_total", label: "Subledger total", accessor: (row) => row.subledger_total, align: "right" },
      { key: "variance", label: "Variance", accessor: (row) => row.variance, align: "right" },
      { key: "status", label: "Status", accessor: (row) => row.status },
    ],
    [],
  );

  const exportRows = useMemo(() => {
    if (!data) return [];
    const rows = [];
    for (const key of ["ar", "ap"]) {
      const entry = data[key];
      if (!entry) continue;
      rows.push({
        account: entry.label ?? key.toUpperCase(),
        control_code: entry.control_account_code ?? "—",
        gl_balance: currency(entry.gl_balance),
        subledger_total: currency(entry.subledger_total),
        variance: currency(entry.variance),
        status: entry.reconciled ? "Reconciled" : "Variance detected",
      });
    }
    return rows;
  }, [currency, data]);

  return (
    <CatalogPageShell
      title="Subledger reconciliation"
      subtitle="Compare GL control accounts to AR/AP subledgers"
      action={
        exportRows.length ? (
          <ReportExportToolbar
            filename="subledger-reconciliation"
            title="Subledger reconciliation"
            subtitle="GL control accounts vs AR/AP subledgers"
            columns={exportColumns}
            getRows={async () => exportRows}
            meta={{
              extraLines: data?.as_of ? [`As of ${data.as_of}`] : [],
            }}
            disabled={loading}
          />
        ) : null
      }
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
