"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { CatalogPageShell, formatShortDate } from "@/components/catalog/catalog-shared";
import { accountOptionLabel, formatAccountingAmount } from "@/lib/accounting-shared";
import { notifyError } from "@/lib/notify";

export default function BankRegisterPage() {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [register, setRegister] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("/accounting/bank-accounts")
      .then((res) => {
        const accounts = res.data ?? [];
        setBankAccounts(accounts);
        if (accounts[0]?.id) {
          setAccountId(String(accounts[0].id));
        }
      })
      .catch((e) =>
        notifyError(e instanceof ApiError ? e.message : "Failed to load bank accounts"),
      )
      .finally(() => setLoading(false));
  }, []);

  const loadRegister = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      const query = params.toString();
      const res = await apiRequest(
        `/accounting/bank-accounts/${accountId}/register${query ? `?${query}` : ""}`,
      );
      setRegister(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load bank register");
    } finally {
      setLoading(false);
    }
  }, [accountId, fromDate, toDate]);

  useEffect(() => {
    if (accountId) {
      loadRegister();
    }
  }, [accountId, loadRegister]);

  const account = register?.account;

  return (
    <CatalogPageShell
      title="Bank register"
      subtitle="Checkbook-style running balance for bank and cash accounts"
      action={
        <Link
          href="/accounting/bank-reconciliation"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Reconcile
        </Link>
      }
    >
      <div className="theme-panel mb-6 grid gap-4 rounded-xl border p-4 shadow-sm md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {bankAccounts.map((item) => (
              <option key={item.id} value={item.id}>
                {accountOptionLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={loadRegister}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134a84]"
          >
            Refresh
          </button>
        </div>
      </div>

      {register ? (
        <div className="mb-4 grid gap-4 md:grid-cols-3">
          <div className="theme-panel rounded-xl border p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">Opening balance</p>
            <p className="mt-1 text-xl font-semibold">
              {formatAccountingAmount(register.opening_balance)}
            </p>
          </div>
          <div className="theme-panel rounded-xl border p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">Closing balance</p>
            <p className="mt-1 text-xl font-semibold">
              {formatAccountingAmount(register.closing_balance)}
            </p>
          </div>
          <div className="theme-panel rounded-xl border p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-slate-500">Account</p>
            <p className="mt-1 text-lg font-semibold">
              {account?.account_code} {account?.account_name}
            </p>
          </div>
        </div>
      ) : null}

      <section className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Payment</th>
              <th className="px-4 py-2 text-right">Deposit</th>
              <th className="px-4 py-2 text-right">Balance</th>
              <th className="px-4 py-2">Cleared</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Loading register…
                </td>
              </tr>
            ) : (register?.lines ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No transactions in this period.
                </td>
              </tr>
            ) : (
              register.lines.map((line) => (
                <tr key={line.journal_entry_line_id} className="theme-table-body-row">
                  <td className="px-4 py-2 text-slate-600">{formatShortDate(line.entry_date)}</td>
                  <td className="px-4 py-2">
                    <p className="text-slate-900">{line.description || "—"}</p>
                    <p className="text-xs text-slate-500">{line.entry_number}</p>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {line.signed_amount < 0 ? formatAccountingAmount(Math.abs(line.signed_amount)) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {line.signed_amount > 0 ? formatAccountingAmount(line.signed_amount) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatAccountingAmount(line.running_balance)}
                  </td>
                  <td className="px-4 py-2">
                    {line.cleared ? (
                      <span className="text-xs text-emerald-700">Yes</span>
                    ) : (
                      <span className="text-xs text-amber-700">No</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </CatalogPageShell>
  );
}
