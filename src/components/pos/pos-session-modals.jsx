"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { PosReportView } from "@/components/pos/pos-report-view";
import { PosStatusBadge, printPosTillReport } from "@/components/pos/pos-shared";
import { CLOSE_REASONS, formatTillKesExact, tillDisplayName, varianceLabel } from "@/lib/pos-till";

const CLOSE_DENOMINATIONS = [1000, 500, 200, 100, 50, 40, 20, 10, 5, 1];

function PosSessionDialogShell({ open, onClose, title, subtitle, children, footer, wide = false }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[90vh] w-full flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <div className="shrink-0 border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-slate-200 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

function ReportModalFooter({ onClose, onPrint, printLabel = "Print report" }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        Close
      </button>
      <PrimaryButton type="button" showIcon={false} onClick={onPrint}>
        {printLabel}
      </PrimaryButton>
    </div>
  );
}

export function XReportModal({
  open,
  onClose,
  session,
  report,
  tillName,
  cashierName,
  showFloatBreakdown = false,
  organizationName = "POS / ERP",
  loading = false,
  error = null,
}) {
  function handlePrint() {
    printPosTillReport({
      type: "X",
      organizationName,
      tillName,
      cashierName,
      report,
      session,
      showFloatBreakdown,
    });
  }

  return (
    <PosSessionDialogShell
      open={open}
      onClose={onClose}
      wide
      title="X report"
      subtitle="Interim snapshot — session remains open"
      footer={
        report ? (
          <ReportModalFooter onClose={onClose} onPrint={handlePrint} printLabel="Print X report" />
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        )
      }
    >
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {loading || !report ? (
        <p className="text-sm text-slate-500">{loading ? "Loading report…" : "No report data."}</p>
      ) : (
        <>
          <PosReportView
            report={report}
            session={session}
            tillName={tillName}
            cashierName={cashierName}
            showFloatBreakdown={showFloatBreakdown}
          />
          <p className="mt-4 text-center text-xs text-slate-500">
            Session still open — this is not an end-of-day Z report.
          </p>
        </>
      )}
    </PosSessionDialogShell>
  );
}

export function CloseSessionModal({
  open,
  onClose,
  session,
  sessionReport,
  closeSession,
  busy = false,
  error = null,
  requireTillFloat = false,
  blindTillClose = false,
  onClosed,
}) {
  const [actualCash, setActualCash] = useState("");
  const [reason, setReason] = useState(CLOSE_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [denomCounts, setDenomCounts] = useState(() =>
    Object.fromEntries(CLOSE_DENOMINATIONS.map((value) => [value, ""])),
  );

  useEffect(() => {
    if (!open) return;
    setActualCash("");
    setReason(CLOSE_REASONS[0]);
    setNotes("");
    setDenomCounts(Object.fromEntries(CLOSE_DENOMINATIONS.map((value) => [value, ""])));
  }, [open, session?.id]);

  const denomTotal = useMemo(
    () =>
      CLOSE_DENOMINATIONS.reduce(
        (sum, value) => sum + value * (Number(denomCounts[value]) || 0),
        0,
      ),
    [denomCounts],
  );

  const closingDenominations = useMemo(
    () =>
      CLOSE_DENOMINATIONS.filter((value) => Number(denomCounts[value]) > 0).map((value) => ({
        denomination: value,
        count: Number(denomCounts[value]),
      })),
    [denomCounts],
  );

  const expected = sessionReport?.expected_cash ?? 0;
  const actual = Number(actualCash.replace(/[\s,]/g, "")) || 0;
  const variance = actual - Number(expected);
  const varianceMeta = varianceLabel(variance);

  async function handleClose(e) {
    e.preventDefault();
    try {
      const res = await closeSession({
        closing_amount: actual,
        expected_amount: expected,
        notes: notes.trim() ? `${reason}: ${notes.trim()}` : reason,
        closing_denominations: closingDenominations.length ? closingDenominations : null,
      });
      onClosed?.(res);
    } catch {
      /* error from parent */
    }
  }

  return (
    <PosSessionDialogShell
      open={open}
      onClose={onClose}
      title="Close POS session"
      subtitle={
        blindTillClose
          ? "Count all cash in the drawer. Expected cash is hidden until the session closes."
          : "Count cash in the drawer and reconcile before closing"
      }
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <PrimaryButton
            type="submit"
            form="close-session-form"
            showIcon={false}
            disabled={busy || !actualCash}
          >
            {busy ? "Closing…" : "Close session"}
          </PrimaryButton>
        </div>
      }
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form id="close-session-form" onSubmit={handleClose} className="space-y-4">
        {!blindTillClose ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <dl className="space-y-2 text-sm">
              {requireTillFloat ? (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Operating float</dt>
                  <dd className="font-medium">{formatTillKesExact(session?.working_amount)}</dd>
                </div>
              ) : null}
              <div className={`flex justify-between ${requireTillFloat ? "border-t border-slate-200 pt-2" : ""}`}>
                <dt className="text-slate-500">Expected cash</dt>
                <dd className="font-semibold text-slate-900">{formatTillKesExact(expected)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Enter the total cash you counted. Variance will appear on the Z report after closing.
          </p>
        )}

        <Field label="Actual cash counted (KES)">
          <input
            type="number"
            min={0}
            step="0.01"
            required
            className={inputClassName()}
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            placeholder={denomTotal > 0 ? String(denomTotal) : "184000"}
            disabled={busy}
          />
          {denomTotal > 0 ? (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-[#185FA5] hover:underline"
              onClick={() => setActualCash(String(denomTotal))}
              disabled={busy}
            >
              Use denomination total ({formatTillKesExact(denomTotal)})
            </button>
          ) : null}
        </Field>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Denomination count (optional)
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CLOSE_DENOMINATIONS.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="w-10 shrink-0 text-right text-xs text-slate-500">{value}</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  className={`${inputClassName()} py-1`}
                  value={denomCounts[value]}
                  onChange={(e) =>
                    setDenomCounts((rows) => ({ ...rows, [value]: e.target.value }))
                  }
                  disabled={busy}
                />
              </label>
            ))}
          </div>
          {denomTotal > 0 ? (
            <p className="mt-2 text-sm font-medium text-slate-900">
              Counted total: {formatTillKesExact(denomTotal)}
            </p>
          ) : null}
        </div>

        {!blindTillClose ? (
          <div
            className={`rounded-lg px-4 py-3 ${varianceMeta.tone === "shortage" ? "bg-red-50" : varianceMeta.tone === "surplus" ? "bg-amber-50" : "bg-emerald-50"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700">Variance</span>
              <span
                className={`text-lg font-semibold ${varianceMeta.tone === "shortage" ? "text-red-700" : varianceMeta.tone === "surplus" ? "text-amber-800" : "text-emerald-700"}`}
              >
                {formatTillKesExact(variance)}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-600">{varianceMeta.text}</p>
          </div>
        ) : null}

        <Field label="Reason">
          <select
            className={inputClassName()}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          >
            {CLOSE_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea
            className={`${inputClassName()} min-h-[72px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional details"
            disabled={busy}
          />
        </Field>
      </form>
    </PosSessionDialogShell>
  );
}

export function ZReportModal({
  open,
  onClose,
  payload = null,
  sessionId = null,
  organizationName = "POS / ERP",
  showFloatBreakdown = false,
  fallbackCashierName = null,
}) {
  const [loaded, setLoaded] = useState(null);
  const [till, setTill] = useState(null);
  const [cashierName, setCashierName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setLoaded(null);
      setTill(null);
      setCashierName(null);
      setError(null);
      return;
    }

    if (payload) {
      setLoaded(payload);
      const session = payload.session ?? payload.report?.session;
      if (session?.till_id) {
        apiRequest(`/tills/${session.till_id}`)
          .then(setTill)
          .catch(() => setTill(null));
      }
      if (session?.cashier_id) {
        apiRequest(`/users/${session.cashier_id}`)
          .then((u) => setCashierName(u.full_name ?? u.username ?? null))
          .catch(() => setCashierName(fallbackCashierName));
      } else {
        setCashierName(fallbackCashierName);
      }
      return;
    }

    if (!sessionId) return;

    setLoading(true);
    setError(null);
    apiRequest(`/pos/sessions/${sessionId}/z-report`)
      .then(async (res) => {
        setLoaded(res);
        const session = res.session ?? res.report?.session;
        if (session?.till_id) {
          const t = await apiRequest(`/tills/${session.till_id}`).catch(() => null);
          setTill(t);
        }
        if (session?.cashier_id) {
          const u = await apiRequest(`/users/${session.cashier_id}`).catch(() => null);
          setCashierName(u?.full_name ?? u?.username ?? fallbackCashierName);
        } else {
          setCashierName(fallbackCashierName);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load Z report"))
      .finally(() => setLoading(false));
  }, [open, payload, sessionId, fallbackCashierName]);

  const session = loaded?.session ?? loaded?.report?.session;
  const report = loaded?.report ?? loaded;
  const variance = loaded?.variance;
  const tillName = useMemo(() => tillDisplayName(till), [till]);
  const resolvedCashier = cashierName ?? fallbackCashierName;

  function handlePrint() {
    printPosTillReport({
      type: "Z",
      organizationName,
      tillName,
      cashierName: resolvedCashier,
      report,
      session,
      variance,
      showFloatBreakdown,
    });
  }

  return (
    <PosSessionDialogShell
      open={open}
      onClose={onClose}
      wide
      title="Z report"
      subtitle="End-of-day report for the closed session"
      footer={
        report ? (
          <ReportModalFooter onClose={onClose} onPrint={handlePrint} printLabel="Print Z report" />
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        )
      }
    >
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {loading || (!report && !error) ? (
        <p className="text-sm text-slate-500">{loading ? "Loading Z report…" : "No report data."}</p>
      ) : report ? (
        <>
          <div className="mb-4">
            <PosStatusBadge label="Session closed" tone="closed" />
          </div>
          <PosReportView
            report={report}
            session={session}
            tillName={tillName}
            cashierName={resolvedCashier}
            showCashReconciliation
            variance={variance}
            showFloatBreakdown={showFloatBreakdown}
          />
        </>
      ) : null}
    </PosSessionDialogShell>
  );
}

export function HandoverSessionModal({
  open,
  onClose,
  session,
  tillName,
  cashierName,
  cashiers = [],
  onHandover,
  busy = false,
  error = null,
}) {
  const [toCashierId, setToCashierId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setToCashierId("");
    setNotes("");
  }, [open, session?.id]);

  const options = cashiers.filter((u) => String(u.id) !== String(session?.cashier_id));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!toCashierId) return;
    try {
      await onHandover?.({
        to_cashier_id: Number(toCashierId),
        notes: notes.trim() || null,
      });
    } catch {
      /* parent shows error */
    }
  }

  return (
    <PosSessionDialogShell
      open={open}
      onClose={onClose}
      title="Hand over session"
      subtitle="Transfer this open till session to another cashier"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <PrimaryButton
            type="submit"
            form="handover-session-form"
            showIcon={false}
            disabled={busy || !toCashierId}
          >
            {busy ? "Handing over…" : "Hand over"}
          </PrimaryButton>
        </div>
      }
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <form id="handover-session-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="text-slate-500">Till · current cashier</p>
          <p className="font-medium text-slate-900">
            {tillName ?? "—"} · {cashierName ?? "—"}
          </p>
          <p className="mt-2 text-slate-500">Session #{session?.id ?? "—"}</p>
        </div>
        <Field label="Hand over to">
          <select
            className={inputClassName()}
            value={toCashierId}
            onChange={(e) => setToCashierId(e.target.value)}
            required
            disabled={busy}
          >
            <option value="">Select cashier</option>
            {options.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ?? u.username}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes (optional)">
          <textarea
            className={`${inputClassName()} min-h-[72px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
          />
        </Field>
      </form>
    </PosSessionDialogShell>
  );
}
