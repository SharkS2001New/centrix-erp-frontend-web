"use client";

import { useMemo, useState } from "react";
import {
  Field,
  FormModal,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { HrSelectField } from "@/components/hr/hr-crud-page";
import {
  accountOptionLabel,
  formatAccountingAmount,
  joinJournalDescription,
  lineTotals,
  splitJournalDescription,
} from "@/lib/accounting-shared";

const EMPTY_LINE = {
  account_id: "",
  description: "",
  debit: "",
  credit: "",
};

export function JournalEntryForm({
  initial,
  accounts = [],
  onSubmitDraft,
  onSubmitPost,
  busy = false,
  error = null,
}) {
  const split = splitJournalDescription(initial?.description);
  const [entryNumber, setEntryNumber] = useState(initial?.entry_number ?? "");
  const [entryDate, setEntryDate] = useState(
    initial?.entry_date ?? new Date().toISOString().slice(0, 10),
  );
  const [description, setDescription] = useState(split.description);
  const [memo, setMemo] = useState(split.memo);
  const [lines, setLines] = useState(() => {
    if (initial?.lines?.length) {
      return initial.lines.map((line) => ({
        account_id: String(line.account_id ?? line.account?.id ?? ""),
        description: line.line_notes ?? "",
        debit: line.debit ? String(line.debit) : "",
        credit: line.credit ? String(line.credit) : "",
      }));
    }
    return [{ ...EMPTY_LINE }, { ...EMPTY_LINE }];
  });
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [lineDraft, setLineDraft] = useState({ ...EMPTY_LINE });
  const [lineEditIndex, setLineEditIndex] = useState(null);
  const [formError, setFormError] = useState(null);

  const accountOptions = useMemo(
    () =>
      accounts
        .filter((a) => a.is_active !== false)
        .map((a) => ({ value: String(a.id), label: accountOptionLabel(a) })),
    [accounts],
  );

  const totals = useMemo(() => lineTotals(lines), [lines]);

  function openAddLine() {
    setLineDraft({ ...EMPTY_LINE });
    setLineEditIndex(null);
    setLineModalOpen(true);
  }

  function openEditLine(index) {
    setLineDraft({ ...lines[index] });
    setLineEditIndex(index);
    setLineModalOpen(true);
  }

  function removeLine(index) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function saveLine(e) {
    e.preventDefault();
    if (!lineDraft.account_id) {
      setFormError("Account is required for each line.");
      return;
    }
    const debit = Number(lineDraft.debit || 0);
    const credit = Number(lineDraft.credit || 0);
    if (debit <= 0 && credit <= 0) {
      setFormError("Enter a debit or credit amount.");
      return;
    }
    if (debit > 0 && credit > 0) {
      setFormError("A line cannot have both debit and credit.");
      return;
    }
    setFormError(null);
    if (lineEditIndex == null) {
      setLines((prev) => [...prev, { ...lineDraft }]);
    } else {
      setLines((prev) => prev.map((line, i) => (i === lineEditIndex ? { ...lineDraft } : line)));
    }
    setLineModalOpen(false);
  }

  function buildPayload() {
    if (!entryNumber.trim()) throw new Error("Reference is required.");
    if (lines.length < 2) throw new Error("Add at least two journal lines.");
    const payloadLines = lines.map((line) => ({
      account_id: Number(line.account_id),
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      line_notes: line.description?.trim() || null,
    }));
    const totalsCheck = lineTotals(payloadLines);
    if (!totalsCheck.balanced) {
      throw new Error("Debit total must equal credit total.");
    }
    return {
      entry_number: entryNumber.trim(),
      entry_date: entryDate,
      description: joinJournalDescription(description, memo),
      lines: payloadLines,
    };
  }

  async function handleDraft(e) {
    e.preventDefault();
    setFormError(null);
    try {
      await onSubmitDraft?.(buildPayload());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handlePost(e) {
    e.preventDefault();
    setFormError(null);
    try {
      await onSubmitPost?.(buildPayload());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Post failed");
    }
  }

  function accountLabel(accountId) {
    const account = accounts.find((a) => String(a.id) === String(accountId));
    return account ? accountOptionLabel(account) : "—";
  }

  return (
    <form className="space-y-6">
      {(formError || error) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError || error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reference">
          <input
            type="text"
            value={entryNumber}
            onChange={(e) => setEntryNumber(e.target.value)}
            className={`${inputClassName()} font-mono`}
            placeholder="JE0004"
            required
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className={inputClassName()}
            required
          />
        </Field>
        <Field label="Description">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClassName()}
            placeholder="Cash sale"
          />
        </Field>
        <Field label="Memo">
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className={inputClassName()}
          />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900">Journal entry lines</p>
          <button
            type="button"
            onClick={openAddLine}
            className="text-sm font-medium text-[#185FA5] hover:underline"
          >
            + Add Line
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, index) => (
                <tr key={index}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{accountLabel(line.account_id)}</p>
                    {line.description ? (
                      <p className="text-xs text-slate-500">{line.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">{formatAccountingAmount(line.debit || 0)}</td>
                  <td className="px-4 py-3 text-right">{formatAccountingAmount(line.credit || 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEditLine(index)}
                      className="text-[#185FA5] hover:underline"
                    >
                      Edit
                    </button>
                    {lines.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className="ml-3 text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td className="px-4 py-3 font-semibold text-slate-900">TOTAL</td>
                <td className="px-4 py-3 text-right font-semibold">
                  {formatAccountingAmount(totals.debit)}
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {formatAccountingAmount(totals.credit)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {!totals.balanced ? (
          <p className="mt-2 text-sm text-amber-700">Debit total must equal credit total before posting.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDraft}
          disabled={busy}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Save Draft
        </button>
        <button
          type="button"
          onClick={handlePost}
          disabled={busy || !totals.balanced}
          className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#145089] disabled:opacity-50"
        >
          Post Entry
        </button>
      </div>

      <FormModal
        title={lineEditIndex == null ? "Add Journal Line" : "Edit Journal Line"}
        open={lineModalOpen}
        onClose={() => setLineModalOpen(false)}
        onSubmit={saveLine}
        submitLabel={lineEditIndex == null ? "Add" : "Save"}
      >
        <HrSelectField
          label="Account *"
          value={lineDraft.account_id}
          onChange={(value) => setLineDraft((p) => ({ ...p, account_id: value }))}
          options={accountOptions}
          required
        />
        <Field label="Description">
          <input
            type="text"
            value={lineDraft.description}
            onChange={(e) => setLineDraft((p) => ({ ...p, description: e.target.value }))}
            className={inputClassName()}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Debit">
            <input
              type="number"
              min="0"
              step="0.01"
              value={lineDraft.debit}
              onChange={(e) =>
                setLineDraft((p) => ({ ...p, debit: e.target.value, credit: e.target.value ? "" : p.credit }))
              }
              className={inputClassName()}
            />
          </Field>
          <Field label="Credit">
            <input
              type="number"
              min="0"
              step="0.01"
              value={lineDraft.credit}
              onChange={(e) =>
                setLineDraft((p) => ({ ...p, credit: e.target.value, debit: e.target.value ? "" : p.debit }))
              }
              className={inputClassName()}
            />
          </Field>
        </div>
      </FormModal>
    </form>
  );
}
