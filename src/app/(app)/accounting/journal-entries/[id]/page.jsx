"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
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
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { isJournalEntryApprovalEnabled } from "@/lib/sales-settings";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { ApprovalPendingNotice } from "@/components/approval-reminder-button";

export default function JournalEntryDetailPage() {
  const params = useParams();
  const confirm = useConfirm();
  const { capabilities, hasPermission } = useAuth();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await apiRequest(`/journal-entries/${params.id}`);
      setEntry(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load journal entry");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost() {
    const ok = await confirm({
      title: "Post journal entry",
      message: "Post Journal Entry?\n\nThis action cannot be edited once posted.",
      confirmLabel: "Post",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const needsApproval =
        isJournalEntryApprovalEnabled(capabilities?.module_settings) &&
        !hasPermission("accounting.manage") &&
        !hasPermission("accounting.journal_entries.approve");
      if (needsApproval) {
        await apiRequest(`/accounting/journal-entries/${entry.id}/request-post`, {
          method: "POST",
        });
        notifySuccess("Journal entry submitted for posting approval.");
        await load();
        return;
      }
      const updated = await apiRequest(`/accounting/journal-entries/${entry.id}/post`, {
        method: "POST",
      });
      setEntry(updated);
      notifySuccess("Journal entry posted.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Post failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReverse() {
    const ok = await confirm({
      title: "Reverse journal entry",
      message: `Reverse journal entry ${entry.entry_number}?`,
      confirmLabel: "Reverse",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiRequest(`/accounting/journal-entries/${entry.id}/reverse`, {
        method: "POST",
      });
      setEntry(res.original ?? entry);
      notifySuccess(`Reversal created: ${res.reversal?.entry_number ?? "done"}`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Reverse failed");
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
        <p className="text-sm text-red-600">Journal entry not found.</p>
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
    >
      <AppBreadcrumb
        items={[
          { label: "Journal entries", href: "/accounting/journal-entries" },
          { label: entry.entry_number },
        ]}
      />
      {entry.action_request?.status === "pending" ? (
        <ApprovalPendingNotice
          className="mb-4"
          message="Waiting for manager approval before this journal entry can be posted."
          actionRequest={entry.action_request}
          onReminded={load}
        />
      ) : null}
      <div className="theme-panel rounded-xl border p-5 shadow-sm">
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

      <div className="mt-6 theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
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
              organizationName: capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME,
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
