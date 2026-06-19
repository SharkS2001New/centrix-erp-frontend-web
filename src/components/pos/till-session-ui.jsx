"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import {
  FLOAT_PAYMENT_TYPES,
  formatFloatEntryDate,
  formatSessionDateTime,
  formatTillKes,
  isDuplicateTillCode,
  normalizeFloatEntries,
  suggestNextTillDefaults,
  sumFloatEntries,
  tillDisplayName,
} from "@/lib/pos-till";
import {
  Field,
  FormDrawer,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";

const EMPTY = {
  till_number: "",
  till_name: "",
  branch_id: "",
  description: "",
  ip_address: "",
  is_active: true,
};

export function TillFormDrawer({
  open,
  onClose,
  onSaved,
  editing,
  branches,
  existingTills = [],
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setForm({
        till_number: editing.till_number ?? "",
        till_name: editing.till_name ?? "",
        branch_id: String(editing.branch_id ?? ""),
        description: editing.description ?? "",
        ip_address: editing.ip_address ?? "",
        is_active: editing.is_active !== false,
      });
    } else {
      const branchId = branches[0] ? String(branches[0].id) : "";
      const branchTills = branchId
        ? existingTills.filter((t) => String(t.branch_id) === branchId)
        : existingTills;
      const suggested = suggestNextTillDefaults(branchTills);
      setForm({
        ...EMPTY,
        till_number: suggested.till_number,
        till_name: suggested.till_name,
        branch_id: branchId,
      });
    }
  }, [open, editing, existingTills, branches]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tillNumber = form.till_number.trim();
      const branchId = Number(form.branch_id) || null;

      if (!tillNumber) {
        setError("Till code is required.");
        return;
      }
      if (!branchId) {
        setError("Branch is required.");
        return;
      }
      if (
        isDuplicateTillCode(existingTills, branchId, tillNumber, editing?.id ?? null)
      ) {
        setError("A till with this code already exists at the selected branch.");
        return;
      }

      const body = {
        till_number: tillNumber,
        till_name: form.till_name.trim() || null,
        branch_id: branchId,
        description: form.description.trim() || null,
        ip_address: form.ip_address.trim() || null,
        is_active: Boolean(form.is_active),
      };
      if (editing?.id) {
        await apiRequest(`/tills/${editing.id}`, { method: "PATCH", body });
      } else {
        await apiRequest("/tills", { method: "POST", body });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save till");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDrawer
      title={editing ? "Edit till" : "Add till"}
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      error={error}
      submitLabel={editing ? "Save changes" : "Create till"}
    >
      <p className="-mt-2 mb-4 text-xs text-slate-500">
        Cashiers declare and adjust operating float in Point of sale — not here.
      </p>
      <Field label="Till code">
        <input
          className={inputClassName()}
          value={form.till_number}
          onChange={(e) => setForm((f) => ({ ...f, till_number: e.target.value }))}
          placeholder="Till01"
          required
        />
      </Field>
      <Field label="Till name">
        <input
          className={inputClassName()}
          value={form.till_name}
          onChange={(e) => setForm((f) => ({ ...f, till_name: e.target.value }))}
          placeholder="Till01"
        />
      </Field>
      <Field label="Branch">
        <select
          className={inputClassName()}
          value={form.branch_id}
          onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}
          required
        >
          <option value="">Select branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.branch_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="IP address (optional)">
        <input
          className={inputClassName()}
          value={form.ip_address}
          onChange={(e) => setForm((f) => ({ ...f, ip_address: e.target.value }))}
          placeholder="192.168.1.10"
        />
      </Field>
      <Field label="Description">
        <textarea
          className={`${inputClassName()} min-h-[80px]`}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Optional notes about this till"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        Till is active
      </label>
    </FormDrawer>
  );
}

export function OpenSessionModal({
  open,
  onClose,
  tills,
  branches,
  user,
  onOpen,
  busy,
  error,
  openByTill,
  preferredTillId,
  pendingTillLabel = null,
  autoAssignTill = false,
  requireTillFloat = true,
  title = "Open POS session",
  subtitle = "Start your shift before taking sales on the till.",
}) {
  const [tillId, setTillId] = useState("");
  const [floatAmount, setFloatAmount] = useState("");
  const [paymentType, setPaymentType] = useState("CASH");

  useEffect(() => {
    if (!open) return;
    const branchTills = tills.filter((t) => t.branch_id === user?.branch_id && t.is_active !== false);
    const preferred = preferredTillId
      ? tills.find((t) => String(t.id) === String(preferredTillId))
      : null;
    const first = preferred ?? branchTills[0] ?? tills[0];
    if (first) {
      setTillId(String(first.id));
    } else {
      setTillId("");
    }
    setFloatAmount("");
    setPaymentType("CASH");
  }, [open, tills, user?.branch_id, preferredTillId]);

  const selectedTill = tills.find((t) => String(t.id) === tillId);
  const existingOpen = selectedTill && openByTill?.get?.(selectedTill.id);
  const canResume =
    existingOpen && user?.id && Number(existingOpen.cashier_id) === Number(user.id);
  const blockedByOtherCashier = existingOpen && !canResume;
  const blockedByAssignment =
    selectedTill &&
    user?.id &&
    selectedTill.cashier_id != null &&
    Number(selectedTill.cashier_id) !== Number(user.id);
  const branchName =
    branches.find((b) => b.id === (selectedTill?.branch_id ?? user?.branch_id))?.branch_name ?? "—";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

        {blockedByOtherCashier ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This till already has an open session by another cashier. Close that session first or choose another till.
          </p>
        ) : blockedByAssignment ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This till is assigned to another cashier. Each till can only be used by its assigned cashier.
          </p>
        ) : canResume ? (
          <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            You already have an open session on this till. Click below to resume it — no new float entry is created.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          <Field label="Till">
            {autoAssignTill ? (
              <input
                className={`${inputClassName()} bg-slate-50 text-slate-900`}
                readOnly
                value={
                  selectedTill
                    ? tillDisplayName(selectedTill)
                    : pendingTillLabel
                      ? `${pendingTillLabel} (created when you save float)`
                      : "Assigning till…"
                }
              />
            ) : (
              <select
                className={inputClassName()}
                value={tillId}
                onChange={(e) => {
                  setTillId(e.target.value);
                }}
              >
                <option value="">Select till</option>
                {tills.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.till_name || t.till_number} ({t.till_number})
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Cashier (logged-in user)">
            <input
              className={`${inputClassName()} bg-slate-50 text-slate-900`}
              readOnly
              value={user?.full_name ?? user?.username ?? "—"}
            />
          </Field>
          <Field label="Payment type">
            <select
              className={inputClassName()}
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              required={requireTillFloat}
              disabled={canResume || !requireTillFloat}
            >
              {FLOAT_PAYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          {requireTillFloat ? (
            <>
              <Field label="Operating float (KES)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputClassName()}
                  value={floatAmount}
                  onChange={(e) => setFloatAmount(e.target.value)}
                  placeholder="Enter the cash amount you are starting with"
                  required={!canResume}
                  disabled={canResume}
                />
              </Field>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <p className="text-slate-500">Declared operating float</p>
                <p className="text-lg font-semibold text-slate-900">
                  KES {Number(floatAmount || 0).toLocaleString("en-KE")}
                </p>
                <p className="mt-1 text-xs text-slate-400">Branch: {branchName}</p>
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Operating float is not required for this organization. A till session will open with zero float so you can run X/Z reports and track sales.
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={
              busy ||
              blockedByOtherCashier ||
              blockedByAssignment ||
              (!autoAssignTill && !tillId) ||
              (requireTillFloat && !canResume && (floatAmount === "" || Number(floatAmount) <= 0))
            }
            onClick={() =>
              onOpen({
                till_id: tillId ? Number(tillId) : null,
                branch_id: selectedTill?.branch_id ?? user?.branch_id,
                working_amount: canResume
                  ? Number(existingOpen?.working_amount ?? 0)
                  : requireTillFloat
                    ? Number(floatAmount) || 0
                    : 0,
                payment_type: paymentType,
              })
            }
          >
            {busy ? "Opening…" : canResume ? "Resume session" : requireTillFloat ? "Open session" : "Start session"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function AddFloatModal({ open, onClose, onSaved, session, busy, error }) {
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("CASH");

  const currentTotal = Number(session?.working_amount ?? 0);
  const nextTotal = currentTotal + (Number(amount) || 0);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setPaymentType("CASH");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Add float</h2>
        <p className="mt-1 text-sm text-slate-500">
          Add extra cash to your session float. The session total will update.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Current float total</span>
            <span className="font-semibold text-slate-900">{formatTillKes(currentTotal)}</span>
          </div>
          {amount && Number(amount) > 0 ? (
            <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2">
              <span className="text-slate-500">After this add</span>
              <span className="font-semibold text-emerald-700">{formatTillKes(nextTotal)}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Payment type">
            <select className={inputClassName()} value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
              {FLOAT_PAYMENT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount to add (KES)">
            <input
              type="number"
              min={0.01}
              step="0.01"
              required
              className={inputClassName()}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount received for float"
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={busy || !amount || Number(amount) <= 0}
            onClick={() => onSaved({ new_float: Number(amount), payment_type: paymentType })}
          >
            {busy ? "Saving…" : "Save float"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function FloatBreakdownModal({
  open,
  onClose,
  session,
  tillName,
  cashierName,
  onCorrectFloat,
  canAddFloat = false,
  onAddFloat,
  addFloatBusy = false,
  addFloatError = null,
  onCashMovement,
  cashMovementBusy = false,
  cashMovementError = null,
}) {
  const [addingFloat, setAddingFloat] = useState(false);
  const [recordingMovement, setRecordingMovement] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("CASH");
  const [movementType, setMovementType] = useState("drop");
  const [movementReason, setMovementReason] = useState("");

  const entries = normalizeFloatEntries(session?.float_breakdown);
  const movements = Array.isArray(session?.cash_movements) ? session.cash_movements : [];
  const total = sumFloatEntries(entries) || Number(session?.working_amount ?? 0);
  const nextTotal = total + (Number(amount) || 0);

  useEffect(() => {
    if (!open) return;
    setAddingFloat(false);
    setRecordingMovement(false);
    setAmount("");
    setPaymentType("CASH");
    setMovementType("drop");
    setMovementReason("");
  }, [open, session?.id, session?.working_amount]);

  if (!open) return null;

  function cancelAddFloat() {
    setAddingFloat(false);
    setAmount("");
    setPaymentType("CASH");
  }

  async function handleSaveFloat() {
    if (!amount || Number(amount) <= 0 || !onAddFloat) return;
    try {
      await onAddFloat({ new_float: Number(amount), payment_type: paymentType });
      cancelAddFloat();
    } catch {
      /* addFloatError from parent keeps the form open */
    }
  }

  async function handleSaveMovement() {
    if (!amount || Number(amount) <= 0 || !onCashMovement) return;
    try {
      await onCashMovement({
        type: movementType,
        amount: Number(amount),
        reason: movementReason.trim() || null,
      });
      setRecordingMovement(false);
      setAmount("");
      setMovementReason("");
    } catch {
      /* cashMovementError from parent */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Float details</h2>
          <p className="mt-1 text-sm text-slate-500">
            {tillName ? `${tillName} · ` : ""}
            {cashierName ?? "Cashier"}
            {session?.id ? ` · Session #${session.id}` : ""}
          </p>
          <p className="mt-2 text-base font-semibold text-slate-900">
            Total float: {formatTillKes(total)}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500">No float entries recorded for this session.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-3 py-2">Date added</th>
                  <th className="px-3 py-2">Payment type</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={`${entry.date_added}-${index}`} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2.5 text-slate-600">{formatFloatEntryDate(entry.date_added)}</td>
                    <td className="px-3 py-2.5 text-slate-800">{entry.payment_type}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                      {formatTillKes(entry.new_float)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-medium text-slate-900">
                  <td className="px-3 py-2.5" colSpan={2}>Total</td>
                  <td className="px-3 py-2.5 text-right">{formatTillKes(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {movements.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cash movements</p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((row, index) => (
                    <tr key={`${row.recorded_at}-${index}`} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2.5 capitalize text-slate-800">{String(row.type ?? "").replace("_", " ")}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.reason ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatTillKes(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {addingFloat ? (
            <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">Add float</p>
              {addFloatError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {addFloatError}
                </p>
              ) : null}
              <Field label="Payment type">
                <select
                  className={inputClassName()}
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  disabled={addFloatBusy}
                >
                  {FLOAT_PAYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="Amount to add (KES)">
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  className={inputClassName()}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount received for float"
                  disabled={addFloatBusy}
                />
              </Field>
              {amount && Number(amount) > 0 ? (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-slate-500">After this add</span>
                  <span className="font-semibold text-emerald-700">{formatTillKes(nextTotal)}</span>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelAddFloat}
                  disabled={addFloatBusy}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <PrimaryButton
                  type="button"
                  showIcon={false}
                  disabled={addFloatBusy || !amount || Number(amount) <= 0}
                  onClick={() => void handleSaveFloat()}
                >
                  {addFloatBusy ? "Saving…" : "Save float"}
                </PrimaryButton>
              </div>
            </div>
          ) : null}

          {recordingMovement ? (
            <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">Record cash movement</p>
              {cashMovementError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {cashMovementError}
                </p>
              ) : null}
              <Field label="Type">
                <select
                  className={inputClassName()}
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value)}
                  disabled={cashMovementBusy}
                >
                  <option value="drop">Safe drop</option>
                  <option value="pay_out">Pay out</option>
                  <option value="pay_in">Pay in</option>
                </select>
              </Field>
              <Field label="Amount (KES)">
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  className={inputClassName()}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={cashMovementBusy}
                />
              </Field>
              <Field label="Reason (optional)">
                <input
                  className={inputClassName()}
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  disabled={cashMovementBusy}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRecordingMovement(false);
                    setAmount("");
                    setMovementReason("");
                  }}
                  disabled={cashMovementBusy}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <PrimaryButton
                  type="button"
                  showIcon={false}
                  disabled={cashMovementBusy || !amount || Number(amount) <= 0}
                  onClick={() => void handleSaveMovement()}
                >
                  {cashMovementBusy ? "Saving…" : "Save movement"}
                </PrimaryButton>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {canAddFloat && !addingFloat && !recordingMovement ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRecordingMovement(false);
                    setAddingFloat(true);
                  }}
                  className="rounded-lg border border-[#185FA5]/30 bg-[#E6F1FB] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#0C447C] hover:bg-[#185FA5]/10"
                >
                  Add float
                </button>
                {onCashMovement ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingFloat(false);
                      setRecordingMovement(true);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
                  >
                    Cash movement
                  </button>
                ) : null}
              </>
            ) : null}
            {onCorrectFloat ? (
              <PrimaryButton type="button" showIcon={false} onClick={onCorrectFloat}>
                Edit cashier float
              </PrimaryButton>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Clickable float total — opens breakdown modal. */
export function FloatTotalLink({ session, onClick, className = "" }) {
  const total = Number(session?.working_amount ?? 0);
  const entries = normalizeFloatEntries(session?.float_breakdown);
  const hasBreakdown = entries.length > 0;

  if (!session) return <span className={className}>—</span>;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasBreakdown && total <= 0}
      className={`inline-flex flex-col items-start text-left text-sm font-semibold text-[#185FA5] hover:underline disabled:cursor-default disabled:text-slate-700 disabled:no-underline ${className}`}
      title={hasBreakdown ? "View float breakdown" : undefined}
    >
      <span>{formatTillKes(total)}</span>
      {hasBreakdown ? (
        <span className="text-[10px] font-normal text-slate-500">
          {entries.length} entr{entries.length === 1 ? "y" : "ies"} · click to view
        </span>
      ) : null}
    </button>
  );
}

export function FloatEntriesTable({ session }) {
  const entries = normalizeFloatEntries(session?.float_breakdown);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-medium text-slate-900">Float added for the session</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Total working float: {formatTillKes(session?.working_amount)}
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">No float entries recorded.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <th className="px-4 py-2.5">Date added</th>
              <th className="px-4 py-2.5">Payment type</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={`${entry.date_added}-${index}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-3 text-slate-600">{formatFloatEntryDate(entry.date_added)}</td>
                <td className="px-4 py-3 text-slate-800">{entry.payment_type}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  {formatTillKes(entry.new_float)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function EditSessionFloatDrawer({ open, onClose, onSaved, session, tillName, cashierName }) {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !session) return;
    setError(null);
    setEntries(
      normalizeFloatEntries(session.float_breakdown).map((entry) => ({
        ...entry,
        new_float: String(entry.new_float ?? 0),
      })),
    );
  }, [open, session]);

  const total = sumFloatEntries(
    entries.map((entry) => ({ ...entry, new_float: Number(entry.new_float) || 0 })),
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!session?.id) return;
    setSaving(true);
    setError(null);
    try {
      const floatBreakdown = entries.map((entry) => ({
        new_float: Number(entry.new_float) || 0,
        payment_type: entry.payment_type || "CASH",
        date_added: entry.date_added ?? new Date().toISOString(),
      }));
      await apiRequest(`/till-float-sessions/${session.id}`, {
        method: "PATCH",
        body: {
          float_breakdown: floatBreakdown,
        },
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save float corrections");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDrawer
      title="Edit cashier float"
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      error={error}
      submitLabel="Save float"
    >
      <p className="-mt-2 mb-4 text-xs text-slate-500">
        Cashiers declare float at POS. Adjust entries here only to fix mistakes.
        {tillName ? ` ${tillName}` : ""}
        {cashierName ? ` · ${cashierName}` : ""}
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No float entries on this session yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div key={`${entry.date_added}-${index}`} className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs text-slate-500">
                Entry {index + 1} · {formatFloatEntryDate(entry.date_added)} · {entry.payment_type}
              </p>
              <Field label="Amount (KES)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputClassName()}
                  value={entry.new_float}
                  onChange={(e) =>
                    setEntries((rows) =>
                      rows.map((row, i) => (i === index ? { ...row, new_float: e.target.value } : row)),
                    )
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Corrected total</span>
          <span className="font-semibold text-slate-900">{formatTillKes(total)}</span>
        </div>
      </div>
    </FormDrawer>
  );
}

export function DeleteTillConfirmModal({
  open,
  onClose,
  onConfirm,
  till,
  openSession,
  cashierName,
  deleting,
  error,
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const inOperation = Boolean(openSession);

  useEffect(() => {
    if (open) setAcknowledged(false);
  }, [open, till?.id]);

  if (!open || !till) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl"
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Delete till</h2>
          <p className="mt-1 text-sm text-slate-500">
            {tillDisplayName(till)} ({till.till_number ?? "—"})
          </p>
        </div>

        <div className="space-y-4 px-6 py-4">
          {inOperation ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">This till is currently in operation</p>
              <p className="mt-2 text-sm text-red-800">
                Deleting this till will immediately end the active cashier session and interrupt their
                work at POS. Any in-progress sale on that terminal may be lost.
              </p>
              <dl className="mt-3 space-y-1 text-sm text-red-900">
                <div className="flex gap-2">
                  <dt className="font-medium">Cashier:</dt>
                  <dd>{cashierName ?? "Unknown"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium">Session:</dt>
                  <dd>#{openSession.id}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium">Opened:</dt>
                  <dd>{formatSessionDateTime(openSession.opened_at)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium">Operating float:</dt>
                  <dd>{formatTillKes(openSession.working_amount)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">This till is not active right now</p>
              <p className="mt-2">
                Deleting it will permanently remove all float session history on this till and unlink
                any sales that reference it. This cannot be undone.
              </p>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              {inOperation
                ? "I understand the cashier session will be deleted and the cashier will be interrupted at POS."
                : "I understand this till and its session history will be permanently deleted."}
            </span>
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!acknowledged || deleting}
            onClick={() => onConfirm?.()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Deleting…" : inOperation ? "Delete till and end session" : "Delete till"}
          </button>
        </div>
      </div>
    </div>
  );
}
