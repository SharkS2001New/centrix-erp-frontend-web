"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { CatalogPageShell, formatShortDate } from "@/components/catalog/catalog-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { formatAccountingAmount } from "@/lib/accounting-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { readTextFile } from "@/lib/read-text-file";

function DifferenceBanner({ reconciliation, varianceOk }) {
  const variance = Number(reconciliation?.variance ?? 0);

  return (
    <div
      className={`sticky top-0 z-10 mb-6 rounded-xl border px-4 py-4 shadow-sm ${
        varianceOk
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Statement ending balance
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatAccountingAmount(reconciliation?.statement_balance)}
          </p>
          <p className="text-xs text-slate-500">
            As of {formatShortDate(reconciliation?.period_end)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Cleared balance
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatAccountingAmount(reconciliation?.adjusted_book_balance)}
          </p>
          <p className="text-xs text-slate-500">
            GL {formatAccountingAmount(reconciliation?.book_balance)} ± uncleared
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Difference
          </p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              varianceOk ? "text-emerald-800" : "text-amber-800"
            }`}
          >
            {formatAccountingAmount(variance)}
          </p>
          <p className="text-xs text-slate-500">
            {varianceOk ? "Ready to finish reconciliation" : "Match or adjust to reach zero"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function BankReconciliationWorkspace({ reconciliationId }) {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedStatementId, setSelectedStatementId] = useState(null);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [importCsv, setImportCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [activePanel, setActivePanel] = useState(
    searchParams.get("tab") === "statement" ? "statement" : "reconcile",
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/accounting/bank-reconciliations/${reconciliationId}`);
      setData(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load reconciliation");
    } finally {
      setLoading(false);
    }
  }, [reconciliationId]);

  useEffect(() => {
    load();
  }, [load]);

  const reconciliation = data?.reconciliation;
  const statementLines = data?.statement_lines ?? [];
  const bookItems = data?.book_items ?? [];
  const suggestions = data?.suggestions ?? [];
  const matches = data?.matches ?? [];

  const unmatchedStatements = useMemo(
    () => statementLines.filter((line) => line.match_status === "unmatched"),
    [statementLines],
  );

  const varianceOk = Math.abs(Number(reconciliation?.variance ?? 0)) < 0.02;
  const editable = reconciliation?.status === "in_progress";

  async function applyMatch(statementLineId, journalEntryLineId, matchType = "manual") {
    setBusy(true);
    try {
      await apiRequest(`/accounting/bank-reconciliations/${reconciliationId}/matches`, {
        method: "POST",
        body: {
          bank_statement_line_id: statementLineId,
          journal_entry_line_id: journalEntryLineId,
          match_type: matchType,
        },
      });
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

  async function removeMatch(matchId) {
    const ok = await confirm({
      title: "Remove match",
      message: "Remove this reconciliation match?",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiRequest(
        `/accounting/bank-reconciliations/${reconciliationId}/matches/${matchId}`,
        { method: "DELETE" },
      );
      notifySuccess("Match removed.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to remove match");
    } finally {
      setBusy(false);
    }
  }

  async function excludeLine(lineId) {
    const ok = await confirm({
      title: "Exclude statement line",
      message: "Exclude this bank statement line from reconciliation?",
      confirmLabel: "Exclude",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiRequest(
        `/accounting/bank-reconciliations/${reconciliationId}/statement-lines/${lineId}/exclude`,
        { method: "POST", body: {} },
      );
      notifySuccess("Statement line excluded.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to exclude line");
    } finally {
      setBusy(false);
    }
  }

  async function createAdjustment() {
    const ok = await confirm({
      title: "Create adjustment",
      message: `Post a journal entry for ${formatAccountingAmount(reconciliation?.variance)} to clear the remaining difference?`,
      confirmLabel: "Post adjustment",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await apiRequest(
        `/accounting/bank-reconciliations/${reconciliationId}/adjustment`,
        { method: "POST", body: { description: "Bank reconciliation adjustment" } },
      );
      setData(res);
      notifySuccess("Adjustment posted.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to post adjustment");
    } finally {
      setBusy(false);
    }
  }

  async function importStatementLines() {
    if (!importCsv.trim()) {
      notifyError("Paste CSV statement data to import.");
      return;
    }

    setImporting(true);
    try {
      const res = await apiRequest(
        `/accounting/bank-reconciliations/${reconciliationId}/statement-lines`,
        { method: "POST", body: { csv: importCsv.trim() } },
      );
      setData(res);
      setImportCsv("");
      setActivePanel("statement");
      notifySuccess(`Imported ${res.statement_lines?.length ?? 0} statement line(s).`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to import statement lines");
    } finally {
      setImporting(false);
    }
  }

  async function completeReconciliation() {
    const ok = await confirm({
      title: "Finish reconciliation",
      message: "Mark this bank reconciliation as complete? You cannot edit it afterwards.",
      confirmLabel: "Finish",
    });
    if (!ok) return;

    setBusy(true);
    try {
      await apiRequest(`/accounting/bank-reconciliations/${reconciliationId}/complete`, {
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
        <Link
          href="/accounting/bank-reconciliation"
          className="mt-4 inline-block text-[#185FA5] hover:underline"
        >
          Back to list
        </Link>
      </CatalogPageShell>
    );
  }

  const title =
    reconciliation.title ||
    `${reconciliation.account_code} — ${formatShortDate(reconciliation.period_end)}`;

  const panels = [
    { id: "reconcile", label: "Reconcile" },
    { id: "statement", label: `Bank statement (${statementLines.length})` },
    { id: "matched", label: `Matched (${matches.length})` },
  ];

  return (
    <CatalogPageShell
      title={title}
      subtitle={`${reconciliation.account_code} ${reconciliation.account_name ?? ""}`.trim()}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {editable && !varianceOk ? (
            <button
              type="button"
              disabled={busy}
              onClick={createAdjustment}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Add adjustment
            </button>
          ) : null}
          {editable && varianceOk ? (
            <button
              type="button"
              disabled={busy}
              onClick={completeReconciliation}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              Finish now
            </button>
          ) : null}
        </div>
      }
    >
      <AppBreadcrumb
        items={[
          { label: "Bank reconciliation", href: "/accounting/bank-reconciliation" },
          { label: title },
        ]}
      />
      <DifferenceBanner reconciliation={reconciliation} varianceOk={varianceOk} />

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            onClick={() => setActivePanel(panel.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              activePanel === panel.id
                ? "bg-[#185FA5] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {panel.label}
          </button>
        ))}
      </div>

      {editable && suggestions.length > 0 && activePanel === "reconcile" ? (
        <div className="theme-panel mb-6 rounded-xl border p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Suggested matches</h2>
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => (
              <div
                key={`${suggestion.bank_statement_line_id}-${suggestion.journal_entry_line_id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {formatAccountingAmount(suggestion.statement_amount)} ↔{" "}
                    {formatAccountingAmount(suggestion.book_amount)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    applyMatch(
                      suggestion.bank_statement_line_id,
                      suggestion.journal_entry_line_id,
                      "auto",
                    )
                  }
                  className="rounded-lg bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#134a84] disabled:opacity-60"
                >
                  Match
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activePanel === "reconcile" ? (
        <>
          {editable ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || !selectedStatementId || !selectedBookId}
                onClick={() => applyMatch(selectedStatementId, selectedBookId, "manual")}
                className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134a84] disabled:opacity-60"
              >
                Match selected
              </button>
              <p className="text-xs text-slate-500">
                Select one bank line and one book transaction below, then match.
              </p>
            </div>
          ) : null}

          <section className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Uncleared book transactions</h2>
              <p className="text-xs text-slate-500">
                Check items that appear on your bank statement — match them to bank lines on the Statement tab.
              </p>
            </div>
            <table className="min-w-full text-sm">
              <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  {editable ? <th className="w-10 px-4 py-2" /> : null}
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Payment</th>
                  <th className="px-4 py-2 text-right">Deposit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookItems.length === 0 ? (
                  <tr>
                    <td colSpan={editable ? 5 : 4} className="px-4 py-6 text-center text-slate-500">
                      All book transactions are cleared for this period.
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
                      <td className="px-4 py-2 text-right text-slate-800">
                        {item.direction === "payment"
                          ? formatAccountingAmount(item.amount)
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-800">
                        {item.direction === "receipt"
                          ? formatAccountingAmount(item.amount)
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {activePanel === "statement" ? (
        <>
          {editable ? (
            <div className="theme-panel mb-6 rounded-xl border p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Import bank statement</h2>
              <input
                type="file"
                accept=".csv,.txt,text/csv"
                className="mt-3 block w-full text-sm text-slate-600"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await readTextFile(file);
                    setImportCsv(text);
                  } catch {
                    notifyError("Could not read the CSV file.");
                  }
                  e.target.value = "";
                }}
              />
              <textarea
                value={importCsv}
                onChange={(e) => setImportCsv(e.target.value)}
                rows={5}
                placeholder={"date,description,reference,amount\n2026-06-01,Deposit,DEP-1,1500"}
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
              <p className="mt-2 text-xs text-slate-500">
                Upload a .csv file or paste rows here. Bank exports with headers like &quot;Transaction Date&quot; and debit/credit columns are supported.
              </p>
              <button
                type="button"
                disabled={importing || busy || !importCsv.trim()}
                onClick={importStatementLines}
                className="mt-3 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134a84] disabled:opacity-60"
              >
                {importing ? "Importing…" : "Import CSV"}
              </button>
            </div>
          ) : null}

          <section className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Bank statement lines</h2>
              <p className="text-xs text-slate-500">
                {unmatchedStatements.length} unmatched of {statementLines.length}
              </p>
            </div>
            <table className="min-w-full text-sm">
              <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  {editable ? <th className="w-10 px-4 py-2" /> : null}
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Status</th>
                  {editable ? <th className="px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statementLines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={editable ? 6 : 4}
                      className="px-4 py-6 text-center text-slate-500"
                    >
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
                              : line.match_status === "excluded"
                                ? "border-slate-200 bg-slate-50 text-slate-600"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                          }`}
                        >
                          {line.match_status}
                        </span>
                      </td>
                      {editable && line.match_status === "unmatched" ? (
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => excludeLine(line.id)}
                            className="text-xs text-slate-500 hover:text-slate-800"
                          >
                            Exclude
                          </button>
                        </td>
                      ) : editable ? (
                        <td className="px-4 py-2" />
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {activePanel === "matched" ? (
        <section className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Matched & cleared</h2>
          </div>
          <table className="min-w-full text-sm">
            <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Bank line</th>
                <th className="px-4 py-2">Book transaction</th>
                <th className="px-4 py-2 text-right">Amount</th>
                {editable ? <th className="px-4 py-2" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 4 : 3} className="px-4 py-6 text-center text-slate-500">
                    No matches yet.
                  </td>
                </tr>
              ) : (
                matches.map((match) => (
                  <tr key={match.id} className="theme-table-body-row">
                    <td className="px-4 py-2">
                      {match.statement ? (
                        <>
                          <p className="text-slate-900">
                            {match.statement.description || "Bank line"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatShortDate(match.statement.line_date)}
                          </p>
                        </>
                      ) : (
                        <span className="text-slate-500 italic">Book adjustment</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <p className="text-slate-900">{match.book?.description || "—"}</p>
                      <p className="text-xs text-slate-500">{match.book?.entry_number}</p>
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatAccountingAmount(match.matched_amount)}
                    </td>
                    {editable ? (
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeMatch(match.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Unmatch
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </CatalogPageShell>
  );
}
