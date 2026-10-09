"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { formatBillingMoney } from "@/lib/platform-billing";

const NOTES = {
  missing_account: "No account number",
  unknown_account: "Account did not match an organisation",
  ambiguous_phone: "Phone matches more than one organisation",
  no_plan: "Organisation has no plan yet",
  no_price: "Plan has no Paybill price",
  awaiting_price: "Waiting for the rest of a plan price",
  stacked: "More than one plan price was covered",
  tokens: "Shillings were added as tokens",
  plan_checkout: "Matched a plan the organisation chose",
};

export default function PlatformLicencePaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiRequest(
        `/admin/platform-licence-payments${status === "all" ? "" : `?status=${status}`}`,
      );
      setPayments(Array.isArray(rows.data) ? rows.data : []);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load licence payments.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <CatalogPageShell
      title="Licence payments"
      subtitle="M-Pesa payments received on the Centrix Paybill, and whether each one extended an organisation’s licence."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Licence payments" }]} />

      <div className="theme-panel rounded-xl border shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Payments</h2>
          <select
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All</option>
            <option value="applied">Applied</option>
            <option value="unmatched">Unmatched</option>
          </select>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading payments…</p>
        ) : payments.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No licence payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Organisation</th>
                  <th className="px-5 py-3">Account</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 text-slate-600">
                      {row.created_at ? String(row.created_at).slice(0, 16).replace("T", " ") : "—"}
                      <span className="block font-mono text-xs text-slate-400">{row.mpesa_transaction_id}</span>
                    </td>
                    <td className="px-5 py-3">
                      {row.organization?.org_name || "—"}
                      {row.organization?.company_code ? (
                        <span className="block font-mono text-xs text-slate-500">{row.organization.company_code}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{row.account_reference || row.bill_ref_number || "—"}</td>
                    <td className="px-5 py-3 tabular-nums">{formatBillingMoney(row.amount, "KES")}</td>
                    <td className="px-5 py-3">
                      <span className={row.status === "applied" ? "text-emerald-700" : "text-amber-700"}>
                        {row.status === "applied" ? `Applied ${row.product || ""}` : "Unmatched"}
                      </span>
                      {row.note ? (
                        <span className="block text-xs text-slate-500">{NOTES[row.note] || row.note}</span>
                      ) : null}
                      {row.period_end_after ? (
                        <span className="block text-xs text-slate-500">Licence until {String(row.period_end_after).slice(0, 10)}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CatalogPageShell>
  );
}
