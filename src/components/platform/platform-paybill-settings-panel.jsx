"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
import { formatBillingMoney } from "@/lib/platform-billing";
import { notifyError, notifySuccess } from "@/lib/notify";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]";

const NOTES = {
  missing_account: "No account number",
  unknown_account: "Account did not match an organisation",
  ambiguous_phone: "Phone matches more than one organisation",
  no_plan: "Organisation has no plan yet",
  no_price: "Plan has no Paybill price",
  awaiting_price: "Waiting for the rest of a plan price",
  stacked: "More than one plan price was covered",
  tokens: "Shillings were added as tokens",
};

export function PlatformPaybillSettingsPanel() {
  const [form, setForm] = useState({ short_code: "", account_name_prefix: "" });
  const [payments, setPayments] = useState([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, rows] = await Promise.all([
        apiRequest("/admin/platform-paybill"),
        apiRequest(`/admin/platform-licence-payments${status === "all" ? "" : `?status=${status}`}`),
      ]);
      setForm({
        short_code: settings.data?.short_code ?? "",
        account_name_prefix: settings.data?.account_name_prefix ?? "",
      });
      setPayments(Array.isArray(rows.data) ? rows.data : []);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load Centrix Paybill.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest("/admin/platform-paybill", {
        method: "PUT",
        body: {
          short_code: form.short_code.trim(),
          account_name_prefix: form.account_name_prefix.trim(),
        },
      });
      notifySuccess("Centrix Paybill saved.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save Centrix Paybill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void save(e)} className="max-w-xl space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          This Paybill is only for Centrix licences. Shop paybills still match customer sales. The account number is the organisation code, for example MOON, or the organisation admin phone.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Paybill number</span>
          <input
            className={inputClass}
            value={form.short_code}
            onChange={(e) => setForm((f) => ({ ...f, short_code: e.target.value }))}
            placeholder="4036507"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Account name prefix (optional)</span>
          <input
            className={inputClass}
            value={form.account_name_prefix}
            onChange={(e) => setForm((f) => ({ ...f, account_name_prefix: e.target.value }))}
            placeholder="CENTRIX"
          />
        </label>
        <PrimaryButton type="submit" showIcon={false} disabled={saving || loading}>
          {saving ? "Saving…" : "Save Paybill"}
        </PrimaryButton>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Licence payments</h2>
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
          <p className="px-4 py-6 text-sm text-slate-500">Loading payments…</p>
        ) : payments.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No licence payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Organisation</th>
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 text-slate-600">
                      {row.created_at ? String(row.created_at).slice(0, 16).replace("T", " ") : "—"}
                      <span className="block font-mono text-xs text-slate-400">{row.mpesa_transaction_id}</span>
                    </td>
                    <td className="px-4 py-2">
                      {row.organization?.org_name || "—"}
                      {row.organization?.company_code ? (
                        <span className="block font-mono text-xs text-slate-500">{row.organization.company_code}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{row.account_reference || row.bill_ref_number || "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{formatBillingMoney(row.amount, "KES")}</td>
                    <td className="px-4 py-2">
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
    </div>
  );
}
