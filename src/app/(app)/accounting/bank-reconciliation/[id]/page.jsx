"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { CatalogPageShell, formatShortDate } from "@/components/catalog/catalog-shared";
import { formatAccountingAmount } from "@/lib/accounting-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

function SummaryCard({ label, value, highlight }) {
  return (
    <div className="theme-panel rounded-xl border p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${
          highlight === "ok"
            ? "text-emerald-700"
            : highlight === "warn"
              ? "text-amber-700"
              : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function BankReconciliationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedStatementId, setSelectedStatementId] = useState(null);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [importCsv, setImportCsv] = useState("");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/accounting/bank-reconciliations/${params.id}`);
      setData(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load reconciliation");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const reconciliation = data?.reconciliation;
  const statementLines = data?.statement_lines ?? [];
  const bookItems = data?.book_items ?? [];
  const suggestions = data?.suggestions ?? [];

  const unmatchedStatements = useMemo(
    () => statementLines.filter((line) => line.match_status === "unmatched"),
    [statementLines],
  );

  const varianceOk = Math.abs(Number(reconciliation?.variance ?? 0)) < 0.02;
  const editable = reconciliation?.status === "in_progress";

  async function applyMatch(statementLineId, journalEntryLineId, matchType = "manual") {
    setBusy(true);
    try {
      const updated = await apiRequest(`/accounting/bank-reconciliations/${params.id}/matches`, {
        method: "POST",
        body: {
          bank_statement_line_id: statementLineId,
          journal_entry_line_id: journalEntryLineId,
          match_type: matchType,
        },
      });
      setData((prev) => ({ ...prev, reconciliation: updated }));
      setSelectedStatementId(null);
      setSelectedBookId(null);
      notifySuccess("Transaction matched.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to match transaction");
    } finally {
      setBusy(false);
    }
  }

  async function applySelectedMatch() {
    if (!selectedStatementId || !selectedBookId) {
      notifyError("Select one bank line and one book transaction.");
      return;
    }
    await applyMatch(selectedStatementId, selectedBookId, "manual");
  }

  async function importStatementLines() {
    if (!importCsv.trim()) {
      notifyError("Paste CSV statement data to import.");
      return;
    }

    setImporting(true);
    try {
      const res = await apiRequest(`/accounting/bank-reconciliations/${params.id}/statement-lines`, {
        method: "POST",
        body: { csv: importCsv.trim() },
      });
      setData(res);
      setImportCsv("");
      notifySuccess("Bank statement lines imported.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to import statement lines");
    } finally {
      setImporting(false);
    }
  }

  async function applySuggestion(suggestion) {
    await applyMatch(
      suggestion.bank_statement_line_id,
      suggestion.journal_entry_line_id,
      "auto",
    );
  }

  async function completeReconciliation() {
    const ok = await confirm({
      title: "Complete reconciliation",
      message: "Mark this bank reconciliation as complete? You cannot edit it afterwards.",
      confirmLabel: "Complete",
    });
    if (!ok) return;

    setBusy(true);
    try {
      await apiRequest(`/accounting/bank-reconciliations/${params.id}/complete`, {
        method: "POST",
        body: {},
      });
      notifySuccess("Bank reconciliation completed.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to complete reconciliation");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !reconciliation) {
    return (
      <CatalogPageShell title="Bank reconciliation" subtitle="Loading…">
        <p className="text-slate-500">Loading reconciliation…</p>
      </CatalogPageShell>
    );
  }

  if (!reconciliation) {
    return (
      <CatalogPageShell title="Bank reconciliation" subtitle="Not found">
        <p className="text-slate-500">Reconciliation not found.</p>
        <Link href="/accounting/bank-reconciliation" className="mt-4 inline-block text-[#185FA5] hover:underline">
          Back to list
        </Link>
      </CatalogPageShell>
    );
  }

  const title =
    reconciliation.title ||
    `${reconciliation.account_code} — ${formatShortDate(reconciliation.period_end)}`;

  return (
    <CatalogPageShell
      title={title}
      subtitle={`${reconciliation.account_code} ${reconciliation.account_name ?? ""}`.trim()}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/accounting/bank-reconciliation"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back
          </Link>
          {editable && varianceOk ? (
            <button
              type="button"
              disabled={busy}
              onClick={completeReconciliation}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              Complete
            </button>
          ) : null}
        </div>
      }
    >
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Statement balance"
          value={formatAccountingAmount(reconciliation.statement_balance)}
        />
        <SummaryCard
          label="Book balance (GL)"
          value={formatAccountingAmount(reconciliation.book_balance)}
        />
        <SummaryCard
          label="Adjusted book balance"
          value={formatAccountingAmount(reconciliation.adjusted_book_balance)}
        />
        <SummaryCard
          label="Variance"
          value={formatAccountingAmount(reconciliation.variance)}
          highlight={varianceOk ? "ok" : "warn"}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="theme-panel rounded-xl border p-4 text-sm shadow-sm">
          <p className="font-medium text-slate-900">Outstanding receipts</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {formatAccountingAmount(reconciliation.outstanding_receipts)}
          </p>
        </div>
        <div className="theme-panel rounded-xl border p-4 text-sm shadow-sm">
          <p className="font-medium text-slate-900">Outstanding payments</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {formatAccountingAmount(reconciliation.outstanding_payments)}
          </p>
        </div>
      </div>

      {editable && suggestions.length > 0 ? (
        <div className="theme-panel mb-6 rounded-xl border p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Suggested matches</h2>
          <p className="mt-1 text-xs text-slate-500">
            Amount and date are close — review and apply in one click.
          </p>
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => {
              const statement = statementLines.find(
                (line) => line.id === suggestion.bank_statement_line_id,
              );
              const book = bookItems.find(
                (item) => item.journal_entry_line_id === suggestion.journal_entry_line_id,
              );
              return (
                <div
                  key={`${suggestion.bank_statement_line_id}-${suggestion.journal_entry_line_id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {formatAccountingAmount(suggestion.statement_amount)} ↔{" "}
                      {formatAccountingAmount(suggestion.book_amount)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {statement?.description || "Bank line"} · {book?.description || "Book entry"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => applySuggestion(suggestion)}
                    className="rounded-lg bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#134a84] disabled:opacity-60"
                  >
                    Apply
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {editable ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !selectedStatementId || !selectedBookId}
            onClick={applySelectedMatch}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134a84] disabled:opacity-60"
          >
            Match selected
          </button>
          <p className="text-xs text-slate-500">
            Select one bank line and one book transaction, then match.
          </p>
        </div>
      ) : null}

      {editable ? (
        <div className="theme-panel mb-6 rounded-xl border p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Import bank statement</h2>
          <p className="mt-1 text-xs text-slate-500">
            Paste CSV from your bank export. Columns: date, description, reference, amount (or debit/credit).
          </p>
          <textarea
            value={importCsv}
            onChange={(e) => setImportCsv(e.target.value)}
            rows={5}
            placeholder={"date,description,reference,amount\n2026-06-01,Deposit,DEP-1,1500"}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={importing || busy || !importCsv.trim()}
              onClick={importStatementLines}
              className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134a84] disabled:opacity-60"
            >
              {importing ? "Importing…" : statementLines.length === 0 ? "Import statement" : "Add more lines"}
            </button>
            {statementLines.length === 0 ? (
              <p className="text-xs text-amber-700">
                No statement lines yet — import your bank CSV to start matching.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={`theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm ${loading ? "opacity-60" : ""}`}>
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Bank statement</h2>
            <p className="text-xs text-slate-500">
              {unmatchedStatements.length} unmatched of {statementLines.length}
            </p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                {editable ? <th className="px-4 py-2 w-10" /> : null}
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statementLines.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 5 : 4} className="px-4 py-6 text-center text-slate-500">
                    No statement lines imported.
                  </td>
                </tr>
              ) : (
                statementLines.map((line) => (
                  <tr key={line.id} className="theme-table-body-row">
                    {editable ? (
                      <td className="px-4 py-2">
                        {line.match_status === "unmatched" ? (
                          <input
                            type="radio"
                            name="statement-line"
                            checked={selectedStatementId === line.id}
                            onChange={() => setSelectedStatementId(line.id)}
                          />
                        ) : null}
                      </td>
                    ) : null}
                    <td className="px-4 py-2 text-slate-600">{formatShortDate(line.line_date)}</td>
                    <td className="px-4 py-2">
                      <p className="text-slate-900">{line.description || "—"}</p>
                      {line.reference ? (
                        <p className="text-xs text-slate-500">{line.reference}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-slate-800">
                      {formatAccountingAmount(line.amount)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                          line.match_status === "matched"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {line.match_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className={`theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm ${loading ? "opacity-60" : ""}`}>
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Book transactions (uncleared)</h2>
            <p className="text-xs text-slate-500">{bookItems.length} open items</p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                {editable ? <th className="px-4 py-2 w-10" /> : null}
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Entry</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookItems.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 4 : 3} className="px-4 py-6 text-center text-slate-500">
                    No uncleared book transactions for this account.
                  </td>
                </tr>
              ) : (
                bookItems.map((item) => (
                  <tr key={item.journal_entry_line_id} className="theme-table-body-row">
                    {editable ? (
                      <td className="px-4 py-2">
                        <input
                          type="radio"
                          name="book-line"
                          checked={selectedBookId === item.journal_entry_line_id}
                          onChange={() => setSelectedBookId(item.journal_entry_line_id)}
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-2 text-slate-600">{formatShortDate(item.entry_date)}</td>
                    <td className="px-4 py-2">
                      <p className="text-slate-900">{item.description || "—"}</p>
                      <p className="text-xs text-slate-500">{item.entry_number}</p>
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-slate-800">
                      {formatAccountingAmount(item.signed_amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>

      {!editable ? (
        <p className="mt-6 text-sm text-slate-500">
          This reconciliation is {reconciliation.status}.{" "}
          <button
            type="button"
            onClick={() => router.push("/accounting/bank-reconciliation")}
            className="font-medium text-[#185FA5] hover:underline"
          >
            Start a new one
          </button>
        </p>
      ) : !varianceOk ? (
        <p className="mt-6 text-sm text-amber-700">
          Variance must be zero before completing. Match remaining items or adjust the statement balance.
        </p>
      ) : null}
    </CatalogPageShell>
  );
}
