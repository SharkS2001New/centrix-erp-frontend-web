"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, apiUploadForm, ApiError } from "@/lib/api";
import { CatalogPageShell, formatShortDate } from "@/components/catalog/catalog-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { formatAccountingAmount } from "@/lib/accounting-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm, confirmDeleteOptions } from "@/lib/use-confirm";
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

function TieOutBadge({ preview }) {
  if (!preview || preview.ties_out == null) {
    return (
      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
        Tie-out unknown
      </span>
    );
  }
  if (preview.ties_out) {
    return (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
        Ties out
      </span>
    );
  }
  return (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
      Difference {formatAccountingAmount(preview.difference)}
    </span>
  );
}

export function BankReconciliationWorkspace({ reconciliationId }) {
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedStatementId, setSelectedStatementId] = useState(null);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [importCsv, setImportCsv] = useState("");
  const [importPreview, setImportPreview] = useState(null);
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
  const statementLines = useMemo(() => data?.statement_lines ?? [], [data?.statement_lines]);
  const bookItems = useMemo(() => data?.book_items ?? [], [data?.book_items]);
  const suggestions = useMemo(() => data?.suggestions ?? [], [data?.suggestions]);
  const matches = useMemo(() => data?.matches ?? [], [data?.matches]);

  const unmatchedStatements = useMemo(
    () => statementLines.filter((line) => line.match_status === "unmatched"),
    [statementLines],
  );

  const highConfidenceSuggestions = useMemo(
    () => suggestions.filter((s) => Number(s.confidence ?? 0) >= 70),
    [suggestions],
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

  async function applyAllSuggestions() {
    if (!highConfidenceSuggestions.length) return;
    setBusy(true);
    try {
      const res = await apiRequest(
        `/accounting/bank-reconciliations/${reconciliationId}/matches/apply-suggestions`,
        { method: "POST", body: { min_confidence: 70 } },
      );
      setData(res);
      notifySuccess(
        `Matched ${res.applied ?? 0} suggestion(s)${res.skipped ? `, skipped ${res.skipped}` : ""}.`,
      );
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to apply suggestions");
    } finally {
      setBusy(false);
    }
  }

  async function clearBookItem(journalEntryLineId) {
    const ok = await confirm({
      title: "Clear book item",
      message:
        "Mark this book transaction as cleared without a bank statement line? Use for outstanding cheques that have not cleared yet or items already on a prior statement.",
      confirmLabel: "Clear without bank line",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiRequest(`/accounting/bank-reconciliations/${reconciliationId}/clear-book-item`, {
        method: "POST",
        body: { journal_entry_line_id: journalEntryLineId },
      });
      setSelectedBookId(null);
      notifySuccess("Book item cleared.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to clear book item");
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

  async function previewStatementFile(file) {
    setImporting(true);
    try {
      const preview = await apiUploadForm("/accounting/bank-statement-preview", { file });
      setImportPreview(preview);
      setImportCsv("");
      notifySuccess(`Parsed ${preview.line_count ?? preview.lines?.length ?? 0} line(s).`);
    } catch (e) {
      setImportPreview(null);
      notifyError(e instanceof ApiError ? e.message : "Failed to parse statement");
    } finally {
      setImporting(false);
    }
  }

  async function previewCsvText() {
    if (!importCsv.trim()) {
      notifyError("Paste CSV statement data to preview.");
      return;
    }
    setImporting(true);
    try {
      const preview = await apiUploadForm("/accounting/bank-statement-preview", {
        csv: importCsv.trim(),
        format: "csv",
      });
      setImportPreview(preview);
      notifySuccess(`Parsed ${preview.line_count ?? preview.lines?.length ?? 0} line(s).`);
    } catch (e) {
      setImportPreview(null);
      notifyError(e instanceof ApiError ? e.message : "Failed to parse CSV");
    } finally {
      setImporting(false);
    }
  }

  async function confirmImportPreview() {
    if (!importPreview?.lines?.length) {
      notifyError("Nothing to import — preview the statement first.");
      return;
    }
    if (importPreview.ties_out === false) {
      const ok = await confirm({
        title: "Statement does not tie out",
        message: `Opening + activity does not equal closing (difference ${formatAccountingAmount(importPreview.difference)}). Import anyway?`,
        confirmLabel: "Import unbalanced",
        destructive: true,
      });
      if (!ok) return;
    }

    setImporting(true);
    try {
      const res = await apiRequest(
        `/accounting/bank-reconciliations/${reconciliationId}/statement-lines`,
        {
          method: "POST",
          body: {
            statement_lines: importPreview.lines,
            imported_filename: importPreview.filename || undefined,
            confirm_unbalanced: importPreview.ties_out === false,
          },
        },
      );
      setData(res);
      setImportPreview(null);
      setImportCsv("");
      setActivePanel("reconcile");
      notifySuccess(`Imported ${importPreview.lines.length} statement line(s).`);
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

  async function deleteReconciliation() {
    const ok = await confirm(
      confirmDeleteOptions(
        reconciliation?.title || "this bank reconciliation",
        "Delete this open reconciliation? Statement lines and matches will be removed. This cannot be undone.",
      ),
    );
    if (!ok) return;

    setBusy(true);
    try {
      await apiRequest(`/accounting/bank-reconciliations/${reconciliationId}`, { method: "DELETE" });
      notifySuccess("Bank reconciliation deleted.");
      router.push("/accounting/bank-reconciliation");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to delete reconciliation");
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
    { id: "statement", label: `Import (${statementLines.length})` },
    { id: "matched", label: `Matched (${matches.length})` },
  ];

  return (
    <CatalogPageShell
      title={title}
      subtitle={`${reconciliation.account_code} ${reconciliation.account_name ?? ""}`.trim()}
      backHref="/accounting/bank-reconciliation"
      backLabel="Back to bank reconciliation"
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
          {editable ? (
            <button
              type="button"
              disabled={busy}
              onClick={deleteReconciliation}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Delete
            </button>
          ) : null}
        </div>
      }
    >
      <AppBreadcrumb
        showBack={false}
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

      {activePanel === "reconcile" ? (
        <>
          {editable && suggestions.length > 0 ? (
            <div className="theme-panel mb-6 rounded-xl border p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Suggested matches</h2>
                  <p className="text-xs text-slate-500">
                    {highConfidenceSuggestions.length} of {suggestions.length} at ≥70% confidence
                  </p>
                </div>
                {highConfidenceSuggestions.length > 0 ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={applyAllSuggestions}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    Match all ≥70%
                  </button>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {suggestions.map((suggestion) => (
                  <div
                    key={`${suggestion.bank_statement_line_id}-${suggestion.journal_entry_line_id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {formatAccountingAmount(suggestion.statement_amount)} ↔{" "}
                        {formatAccountingAmount(suggestion.book_amount)}
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          {suggestion.confidence}% confidence
                        </span>
                      </p>
                      <p className="truncate text-xs text-slate-600">
                        Bank: {suggestion.statement_description || "—"}
                        {suggestion.statement_reference
                          ? ` · ${suggestion.statement_reference}`
                          : ""}
                      </p>
                      <p className="truncate text-xs text-slate-600">
                        Books: {suggestion.book_description || "—"} ·{" "}
                        {formatShortDate(suggestion.book_entry_date)}
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
              <button
                type="button"
                disabled={busy || !selectedBookId}
                onClick={() => clearBookItem(selectedBookId)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Clear book item (no bank line)
              </button>
              <p className="text-xs text-slate-500">
                Select one bank line and one book transaction, then match — or clear a book item alone.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Bank statement</h2>
                <p className="text-xs text-slate-500">
                  {unmatchedStatements.length} unmatched of {statementLines.length}
                </p>
              </div>
              <table className="min-w-full text-sm">
                <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    {editable ? <th className="w-10 px-3 py-2" /> : null}
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmatchedStatements.length === 0 ? (
                    <tr>
                      <td colSpan={editable ? 4 : 3} className="px-4 py-6 text-center text-slate-500">
                        {statementLines.length === 0
                          ? "Import a statement on the Import tab."
                          : "All bank lines are matched or excluded."}
                      </td>
                    </tr>
                  ) : (
                    unmatchedStatements.map((line) => (
                      <tr
                        key={line.id}
                        className={`theme-table-body-row ${
                          selectedStatementId === line.id ? "bg-sky-50" : ""
                        }`}
                      >
                        {editable ? (
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              name="statement-line"
                              checked={selectedStatementId === line.id}
                              onChange={() => setSelectedStatementId(line.id)}
                            />
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-slate-600">
                          {formatShortDate(line.line_date)}
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-slate-900">{line.description || "—"}</p>
                          {line.reference ? (
                            <p className="text-xs text-slate-500">{line.reference}</p>
                          ) : null}
                          {editable ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => excludeLine(line.id)}
                              className="mt-1 text-xs text-slate-500 hover:text-slate-800"
                            >
                              Exclude
                            </button>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">
                          {formatAccountingAmount(line.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Uncleared books</h2>
                <p className="text-xs text-slate-500">GL lines not yet cleared on this account</p>
              </div>
              <table className="min-w-full text-sm">
                <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    {editable ? <th className="w-10 px-3 py-2" /> : null}
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Payment</th>
                    <th className="px-3 py-2 text-right">Deposit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={editable ? 5 : 4}
                        className="px-4 py-6 text-center text-slate-500"
                      >
                        All book transactions are cleared for this period.
                      </td>
                    </tr>
                  ) : (
                    bookItems.map((item) => (
                      <tr
                        key={item.journal_entry_line_id}
                        className={`theme-table-body-row ${
                          selectedBookId === item.journal_entry_line_id ? "bg-sky-50" : ""
                        }`}
                      >
                        {editable ? (
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              name="book-line"
                              checked={selectedBookId === item.journal_entry_line_id}
                              onChange={() => setSelectedBookId(item.journal_entry_line_id)}
                            />
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-slate-600">
                          {formatShortDate(item.entry_date)}
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-slate-900">{item.description || "—"}</p>
                          <p className="text-xs text-slate-500">{item.entry_number}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-800">
                          {item.direction === "payment"
                            ? formatAccountingAmount(item.amount)
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-800">
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
          </div>
        </>
      ) : null}

      {activePanel === "statement" ? (
        <>
          {editable ? (
            <div className="theme-panel mb-6 space-y-4 rounded-xl border p-4 shadow-sm">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Import bank statement</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Upload a digital PDF, OFX/QFX, or CSV. Preview and confirm before lines are saved.
                  Scanned image PDFs are not supported yet — ask your bank for CSV/OFX or a text PDF.
                </p>
              </div>
              <input
                type="file"
                accept=".pdf,.csv,.txt,.ofx,.qfx,application/pdf,text/csv,application/x-ofx"
                className="block w-full text-sm text-slate-600"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const name = file.name.toLowerCase();
                  if (name.endsWith(".csv") || name.endsWith(".txt")) {
                    try {
                      const text = await readTextFile(file);
                      setImportCsv(text);
                      setImportPreview(null);
                    } catch {
                      notifyError("Could not read the file.");
                    }
                  } else {
                    await previewStatementFile(file);
                  }
                  e.target.value = "";
                }}
              />
              <textarea
                value={importCsv}
                onChange={(e) => {
                  setImportCsv(e.target.value);
                  setImportPreview(null);
                }}
                rows={5}
                placeholder={"date,description,reference,amount\n2026-06-01,Deposit,DEP-1,1500"}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={importing || busy || !importCsv.trim()}
                  onClick={previewCsvText}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {importing ? "Parsing…" : "Preview CSV"}
                </button>
                <button
                  type="button"
                  disabled={importing || busy || !importPreview?.lines?.length}
                  onClick={confirmImportPreview}
                  className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134a84] disabled:opacity-60"
                >
                  Confirm import
                </button>
              </div>

              {importPreview ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <TieOutBadge preview={importPreview} />
                    {importPreview.bank ? (
                      <span className="text-xs text-slate-600">Bank: {importPreview.bank}</span>
                    ) : null}
                    <span className="text-xs text-slate-600">
                      {importPreview.line_count} lines · activity{" "}
                      {formatAccountingAmount(importPreview.activity_sum)}
                    </span>
                    {importPreview.closing_balance != null ? (
                      <span className="text-xs text-slate-600">
                        Closing {formatAccountingAmount(importPreview.closing_balance)}
                      </span>
                    ) : null}
                  </div>
                  {(importPreview.warnings ?? []).length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
                      {importPreview.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 max-h-56 overflow-auto rounded border border-slate-200 bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-100 text-left text-slate-500">
                        <tr>
                          <th className="px-2 py-1">Date</th>
                          <th className="px-2 py-1">Description</th>
                          <th className="px-2 py-1 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(importPreview.lines ?? []).slice(0, 50).map((line, idx) => (
                          <tr key={`${line.line_date}-${idx}`} className="border-t border-slate-100">
                            <td className="px-2 py-1">{line.line_date}</td>
                            <td className="px-2 py-1">{line.description}</td>
                            <td className="px-2 py-1 text-right">
                              {formatAccountingAmount(line.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <section className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Imported statement lines</h2>
              {reconciliation.imported_filename ? (
                <p className="text-xs text-slate-500">File: {reconciliation.imported_filename}</p>
              ) : null}
            </div>
            <table className="min-w-full text-sm">
              <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statementLines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No statement lines imported.
                    </td>
                  </tr>
                ) : (
                  statementLines.map((line) => (
                    <tr key={line.id} className="theme-table-body-row">
                      <td className="px-4 py-2 text-slate-600">
                        {formatShortDate(line.line_date)}
                      </td>
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
                        <span className="italic text-slate-500">Cleared without bank line</span>
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
