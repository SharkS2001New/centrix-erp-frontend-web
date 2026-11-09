"use client";

import { useCallback, useEffect, useState } from "react";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, apiUploadForm, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  SearchableSelect,
  formatShortDate,
  inputClassName,
  parseDecimalInput,
} from "@/components/catalog/catalog-shared";
import { accountOptionLabel, formatAccountingAmount } from "@/lib/accounting-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { readTextFile } from "@/lib/read-text-file";
import { useConfirm, confirmDeleteOptions } from "@/lib/use-confirm";

function statusBadge(status) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "void") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export function AccountingBankReconciliationScreen() {
  const router = useRouter();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    chart_of_account_id: "",
    title: "",
    period_start: "",
    period_end: new Date().toISOString().slice(0, 10),
    statement_balance: "",
    notes: "",
    csv: "",
  });
  const [statementPreview, setStatementPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recons, accounts] = await Promise.all([
        apiRequest("/accounting/bank-reconciliations"),
        apiRequest("/accounting/bank-accounts"),
      ]);
      setRows(recons.data ?? []);
      setBankAccounts(accounts.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load bank reconciliations");
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(load);

  async function previewStatementUpload(file) {
    setPreviewing(true);
    try {
      const preview = await apiUploadForm("/accounting/bank-statement-preview", { file });
      setStatementPreview(preview);
      setForm((prev) => ({
        ...prev,
        csv: "",
        statement_balance:
          preview.closing_balance != null
            ? String(preview.closing_balance)
            : prev.statement_balance,
        period_end: preview.period_end || prev.period_end,
        period_start: preview.period_start || prev.period_start,
      }));
      notifySuccess(`Parsed ${preview.line_count ?? 0} statement line(s).`);
    } catch (e) {
      setStatementPreview(null);
      notifyError(e instanceof ApiError ? e.message : "Failed to parse statement");
    } finally {
      setPreviewing(false);
    }
  }

  async function previewCsvPaste() {
    if (!form.csv.trim()) {
      notifyError("Paste CSV text or upload a file first.");
      return;
    }
    setPreviewing(true);
    try {
      const preview = await apiUploadForm("/accounting/bank-statement-preview", {
        csv: form.csv.trim(),
        format: "csv",
      });
      setStatementPreview(preview);
      notifySuccess(`Parsed ${preview.line_count ?? 0} statement line(s).`);
    } catch (e) {
      setStatementPreview(null);
      notifyError(e instanceof ApiError ? e.message : "Failed to parse CSV");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!form.chart_of_account_id) {
      notifyError("Select a bank account.");
      return;
    }

    if (statementPreview?.ties_out === false) {
      const ok = await confirm({
        title: "Statement does not tie out",
        message: `Opening + activity does not equal closing (difference ${formatAccountingAmount(statementPreview.difference)}). Create with these lines anyway?`,
        confirmLabel: "Create unbalanced",
        destructive: true,
      });
      if (!ok) return;
    }

    setCreating(true);
    try {
      const body = {
        chart_of_account_id: Number(form.chart_of_account_id),
        title: form.title || null,
        period_start: form.period_start || form.period_end,
        period_end: form.period_end,
        statement_balance: parseDecimalInput(form.statement_balance),
        notes: form.notes || null,
        imported_filename: statementPreview?.filename || undefined,
        confirm_unbalanced: statementPreview?.ties_out === false,
      };
      if (statementPreview?.lines?.length) {
        body.statement_lines = statementPreview.lines;
        if (statementPreview.opening_balance != null) {
          body.opening_balance = statementPreview.opening_balance;
        }
      } else if (form.csv.trim()) {
        body.csv = form.csv.trim();
      }

      const created = await apiRequest("/accounting/bank-reconciliations", {
        method: "POST",
        body,
      });
      notifySuccess("Bank reconciliation started.");
      const tab = statementPreview?.lines?.length || form.csv.trim() ? "?tab=reconcile" : "";
      router.push(`/accounting/bank-reconciliation/${created.id}${tab}`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to create reconciliation");
    } finally {
      setCreating(false);
    }
  }

  async function deleteReconciliation(row) {
    const ok = await confirm(
      confirmDeleteOptions(
        row.title || `reconciliation for ${row.account_code}`,
        "Delete this open bank reconciliation? Statement lines and matches will be removed. This cannot be undone.",
      ),
    );
    if (!ok) return;

    setDeletingId(row.id);
    try {
      await apiRequest(`/accounting/bank-reconciliations/${row.id}`, { method: "DELETE" });
      notifySuccess("Bank reconciliation deleted.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to delete reconciliation");
    } finally {
      setDeletingId(null);
    }
  }

  const inProgress = rows.filter((row) => row.status === "in_progress").length;
  const completed = rows.filter((row) => row.status === "completed").length;

  return (
    <CatalogPageShell
      title="Bank reconciliation"
      subtitle="Accounting > Match bank statements to the general ledger"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/accounting/bank-register"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Bank register
          </Link>
          <button
            type="button"
            onClick={() => setShowForm((open) => !open)}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134a84]"
          >
            {showForm ? "Cancel" : "New reconciliation"}
          </button>
        </div>
      }
    >
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="theme-panel rounded-xl border p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">In progress</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{inProgress}</p>
        </div>
        <div className="theme-panel rounded-xl border p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Completed</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{completed}</p>
        </div>
        <div className="theme-panel rounded-xl border p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bank accounts</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{bankAccounts.length}</p>
        </div>
      </div>

      {showForm ? (
        <form
          onSubmit={handleCreate}
          className="theme-panel mb-6 space-y-4 rounded-xl border p-5 shadow-sm"
        >
          <h2 className="text-base font-semibold text-slate-900">Start reconciliation</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Bank account</span>
              <SearchableSelect
                value={form.chart_of_account_id}
                onChange={(v) => setForm((prev) => ({ ...prev, chart_of_account_id: v }))}
                className={inputClassName()}
                required
                placeholder="Select account…"
                options={bankAccounts.map((account) => ({
                  value: String(account.id),
                  label: accountOptionLabel(account),
                }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="June 2026 — Main account"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Period start</span>
              <input
                type="date"
                value={form.period_start}
                onChange={(e) => setForm((prev) => ({ ...prev, period_start: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Statement date</span>
              <input
                type="date"
                value={form.period_end}
                onChange={(e) => setForm((prev) => ({ ...prev, period_end: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">Statement ending balance</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.statement_balance}
                onChange={(e) => setForm((prev) => ({ ...prev, statement_balance: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">Notes</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">
                Import bank statement (optional)
              </span>
              <input
                type="file"
                accept=".pdf,.csv,.txt,.ofx,.qfx,application/pdf,text/csv"
                className="mb-2 block w-full text-sm text-slate-600"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const name = file.name.toLowerCase();
                  if (name.endsWith(".csv") || name.endsWith(".txt")) {
                    try {
                      const text = await readTextFile(file);
                      setForm((prev) => ({ ...prev, csv: text }));
                      setStatementPreview(null);
                    } catch {
                      notifyError("Could not read the file.");
                    }
                  } else {
                    await previewStatementUpload(file);
                  }
                  e.target.value = "";
                }}
              />
              <textarea
                value={form.csv}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, csv: e.target.value }));
                  setStatementPreview(null);
                }}
                rows={5}
                placeholder={"date,description,reference,amount\n2026-06-01,Deposit,DEP-1,1500"}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-slate-500">
                PDF (digital text), OFX/QFX, or CSV. Preview first so opening + activity can tie to closing.
              </p>
              <button
                type="button"
                disabled={previewing || !form.csv.trim()}
                onClick={() => void previewCsvPaste()}
                className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {previewing ? "Parsing…" : "Preview CSV"}
              </button>
            </label>
            {statementPreview ? (
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      statementPreview.ties_out
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : statementPreview.ties_out === false
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {statementPreview.ties_out
                      ? "Ties out"
                      : statementPreview.ties_out === false
                        ? `Difference ${formatAccountingAmount(statementPreview.difference)}`
                        : "Tie-out unknown"}
                  </span>
                  {statementPreview.bank ? (
                    <span className="text-xs text-slate-600">{statementPreview.bank}</span>
                  ) : null}
                  <span className="text-xs text-slate-600">
                    {statementPreview.line_count} lines
                  </span>
                </div>
                <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100 text-left text-slate-500">
                      <tr>
                        <th className="px-2 py-1">Date</th>
                        <th className="px-2 py-1">Description</th>
                        <th className="px-2 py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(statementPreview.lines ?? []).slice(0, 30).map((line, idx) => (
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
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating || previewing}
              className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134a84] disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create & open"}
            </button>
          </div>
        </form>
      ) : null}

      <div className={`theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm ${loading ? "opacity-60" : ""}`}>
        <table className="min-w-full text-sm">
          <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Statement</th>
              <th className="px-4 py-3 text-right">Variance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No reconciliations yet. Start one to import a bank statement and match transactions.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="theme-table-body-row">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {row.title || `${row.account_code} — ${row.account_name}`}
                    </p>
                    <p className="text-xs text-slate-500">{row.account_code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatShortDate(row.period_start)} – {formatShortDate(row.period_end)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatAccountingAmount(row.statement_balance)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        Math.abs(Number(row.variance ?? 0)) < 0.02
                          ? "text-emerald-700"
                          : "font-medium text-amber-700"
                      }
                    >
                      {formatAccountingAmount(row.variance)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(row.status)}`}
                    >
                      {row.status === "completed" ? "Completed" : row.status === "void" ? "Void" : "In progress"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/accounting/bank-reconciliation/${row.id}`}
                        className="text-sm font-medium text-[#185FA5] hover:underline"
                      >
                        Open
                      </Link>
                      {row.status === "in_progress" ? (
                        <button
                          type="button"
                          disabled={deletingId === row.id}
                          onClick={() => void deleteReconciliation(row)}
                          className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          {deletingId === row.id ? "Deleting…" : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CatalogPageShell>
  );
}
