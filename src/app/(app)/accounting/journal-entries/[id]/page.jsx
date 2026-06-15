"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { JournalStatusBadge } from "@/components/accounting/accounting-shared";
import { printJournalEntry } from "@/components/accounting/journal-entry-print";
import {
  accountOptionLabel,
  formatAccountingAmount,
  splitJournalDescription,
} from "@/lib/accounting-shared";

export default function JournalEntryDetailPage() {
  const params = useParams();
  const { capabilities } = useAuth();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest(`/journal-entries/${params.id}`);
      setEntry(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load journal entry");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost() {
    if (!window.confirm("Post Journal Entry?\n\nThis action cannot be edited once posted.")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiRequest(`/accounting/journal-entries/${entry.id}/post`, {
        method: "POST",
      });
      setEntry(updated);
      setSuccess("Journal entry posted.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Post failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReverse() {
    if (!window.confirm(`Reverse journal entry ${entry.entry_number}?`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiRequest(`/accounting/journal-entries/${entry.id}/reverse`, {
        method: "POST",
      });
      setEntry(res.original ?? entry);
      setSuccess(`Reversal created: ${res.reversal?.entry_number ?? "done"}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Reverse failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <CatalogPageShell title="Journal Entry" subtitle="Loading…">
        <p className="text-sm text-slate-500">Loading…</p>
      </CatalogPageShell>
    );
  }

  if (!entry) {
    return (
      <CatalogPageShell title="Journal Entry" subtitle="Not found">
        <p className="text-sm text-red-600">{error ?? "Journal entry not found."}</p>
      </CatalogPageShell>
    );
  }

  const split = splitJournalDescription(entry.description);
  const lines = entry.lines ?? [];
  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
  const isDraft = String(entry.status).toLowerCase() === "draft";
  const isPosted = String(entry.status).toLowerCase() === "posted";

  return (
    <CatalogPageShell
      title={`Journal Entry ${entry.entry_number}`}
      subtitle="Accounting > Journal Entries"
      actions={
        <Link href="/accounting/journal-entries" className="text-sm font-medium text-[#185FA5] hover:underline">
          Back to list
        </Link>
      }
    >
      {success ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Journal Entry</p>
            <h2 className="mt-1 font-mono text-xl font-semibold text-slate-900">{entry.entry_number}</h2>
          </div>
          <JournalStatusBadge status={entry.status} />
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Date</dt>
            <dd className="mt-0.5 text-slate-800">{formatShortDate(entry.entry_date)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</dt>
            <dd className="mt-0.5 text-slate-800">{split.description || "—"}</dd>
          </div>
          {split.memo ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Memo</dt>
              <dd className="mt-0.5 text-slate-800">{split.memo}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line) => (
              <tr key={line.id ?? `${line.account_id}-${line.debit}-${line.credit}`}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {accountOptionLabel(line.account ?? { account_code: line.account_id })}
                  </p>
                  {line.line_notes ? <p className="text-xs text-slate-500">{line.line_notes}</p> : null}
                </td>
                <td className="px-4 py-3 text-right">
                  {Number(line.debit ?? 0) > 0 ? formatAccountingAmount(line.debit) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {Number(line.credit ?? 0) > 0 ? formatAccountingAmount(line.credit) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr>
              <td className="px-4 py-3 font-semibold text-slate-900">TOTAL</td>
              <td className="px-4 py-3 text-right font-semibold">{formatAccountingAmount(totalDebit)}</td>
              <td className="px-4 py-3 text-right font-semibold">{formatAccountingAmount(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            printJournalEntry(entry, {
              organizationName: capabilities?.profile_label ?? "POS / ERP",
            })
          }
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Print
        </button>
        {isDraft ? (
          <button
            type="button"
            onClick={handlePost}
            disabled={busy}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#145089] disabled:opacity-50"
          >
            Post Entry
          </button>
        ) : null}
        {isPosted ? (
          <button
            type="button"
            onClick={handleReverse}
            disabled={busy}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reverse Entry
          </button>
        ) : null}
      </div>
    </CatalogPageShell>
  );
}
