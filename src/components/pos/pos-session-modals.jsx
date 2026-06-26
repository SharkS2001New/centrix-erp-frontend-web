"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { PosReportView } from "@/components/pos/pos-report-view";
import { PosStatusBadge, printPosTillReport } from "@/components/pos/pos-shared";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { CLOSE_REASONS, DEFAULT_CLOSE_REASON, formatTillKesExact, tillDisplayName, varianceLabel, resolveTillReportBundle } from "@/lib/pos-till";

function PosSessionDialogShell({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
  closeOnBackdrop = true,
  embedded = false,
  layerClassName = "z-50",
}) {
  if (!open) return null;

  return (
    <div className={`${embedded ? "absolute" : "fixed"} inset-0 flex items-center justify-center p-4 ${layerClassName}`}>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onMouseDown={
          closeOnBackdrop
            ? (e) => {
                e.preventDefault();
                onClose();
              }
            : undefined
        }
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 flex max-h-[90vh] w-full flex-col theme-panel rounded-xl border text-slate-900 shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
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

function sessionExpenseDate(session) {
  if (!session) return null;
  if (session.session_date) return String(session.session_date).slice(0, 10);
  if (session.opened_at) return String(session.opened_at).slice(0, 10);
  return null;
}

function deferModalAction(fn) {
  window.setTimeout(() => fn(), 0);
}

function ReportModalFooter({ onClose, onPrint, printLabel = "Print report" }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          deferModalAction(onClose);
        }}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        Close
      </button>
      <PrimaryButton
        type="button"
        showIcon={false}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPrint();
        }}
      >
        {printLabel}
      </PrimaryButton>
    </div>
  );
}

export function XReportModal({
  open,
  onClose,
  session,
  report: reportPayload,
  tillName,
  cashierName,
  showFloatBreakdown = false,
  organizationName = DEFAULT_PRINT_ORG_NAME,
  loading = false,
  error = null,
  embedded = false,
}) {
  const { report: resolvedReport } = useMemo(
    () => resolveTillReportBundle({ ...(reportPayload ?? {}), session: session ?? reportPayload?.session }),
    [reportPayload, session],
  );
  const hasReport = Boolean(resolvedReport?.sales || resolvedReport?.expected_cash != null);

  function handlePrint() {
    printPosTillReport({
      type: "X",
      organizationName,
      tillName,
      cashierName,
      report: reportPayload,
      session,
      showFloatBreakdown,
    });
  }

  return (
    <PosSessionDialogShell
      open={open}
      onClose={onClose}
      wide
      embedded={embedded}
      title="X report"
      subtitle="Interim snapshot — session remains open"
      footer={
        hasReport ? (
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
      {loading || !hasReport ? (
        <p className="text-sm text-slate-500">{loading ? "Loading report…" : "No report data."}</p>
      ) : (
        <>
          <PosReportView
            report={resolvedReport}
            session={session}
            tillName={tillName}
            cashierName={cashierName}
            showFloatBreakdown={showFloatBreakdown}
            expensesFromDate={sessionExpenseDate(session)}
            expensesToDate={sessionExpenseDate(session)}
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
  embedded = false,
}) {
  const formRef = useRef(null);
  const [actualCash, setActualCash] = useState("");
  const [reason, setReason] = useState(DEFAULT_CLOSE_REASON);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setActualCash("");
    setReason(DEFAULT_CLOSE_REASON);
    setNotes("");
  }, [open, session?.id]);

  const expected = resolveTillReportBundle(sessionReport).report?.expected_cash ?? 0;
  const actual = Number(actualCash.replace(/[\s,]/g, "")) || 0;
  const variance = actual - Number(expected);
  const varianceMeta = varianceLabel(variance);
  const isBalanced = actualCash !== "" && Math.abs(variance) < 0.01;

  useEffect(() => {
    if (!open || blindTillClose) return;
    setActualCash((current) => (current === "" ? String(expected) : current));
  }, [open, blindTillClose, expected]);

  useEffect(() => {
    if (!open || !isBalanced) return;
    setReason(DEFAULT_CLOSE_REASON);
  }, [open, isBalanced]);

  async function handleClose(e) {
    e.preventDefault();
    if (actualCash === "" || Number.isNaN(actual)) return;
    try {
      const res = await closeSession({
        closing_amount: actual,
        expected_amount: expected,
        notes: notes.trim() ? `${reason}: ${notes.trim()}` : reason,
        closing_denominations: null,
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
      layerClassName="z-[90]"
      embedded={embedded}
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
            type="button"
            showIcon={false}
            disabled={busy || !actualCash}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {busy ? "Closing…" : "Close session"}
          </PrimaryButton>
        </div>
      }
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form ref={formRef} id="close-session-form" onSubmit={handleClose} className="space-y-4">
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
            placeholder="184000"
            disabled={busy}
          />
        </Field>

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
  organizationName = DEFAULT_PRINT_ORG_NAME,
  showFloatBreakdown = false,
  fallbackCashierName = null,
  fallbackTillName = null,
  embedded = false,
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
      setCashierName(fallbackCashierName);
      setTill(null);
      if (fallbackTillName) return;

      const session = payload.session ?? payload.report?.session;
      if (session?.till_id) {
        apiRequest(`/tills/${session.till_id}`)
          .then(setTill)
          .catch(() => setTill(null));
      }
      if (session?.cashier_id && !fallbackCashierName) {
        apiRequest(`/users/${session.cashier_id}`)
          .then((u) => setCashierName(u.full_name ?? u.username ?? null))
          .catch(() => setCashierName(fallbackCashierName));
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
  }, [open, payload, sessionId, fallbackCashierName, fallbackTillName]);

  const bundle = useMemo(() => resolveTillReportBundle(loaded), [loaded]);
  const session = bundle.session;
  const report = bundle.report;
  const variance = bundle.variance;
  const tillName = useMemo(
    () => fallbackTillName ?? tillDisplayName(till),
    [fallbackTillName, till],
  );
  const resolvedCashier = cashierName ?? fallbackCashierName;

  function handlePrint() {
    printPosTillReport({
      type: "Z",
      organizationName,
      tillName,
      cashierName: resolvedCashier,
      report: loaded,
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
      closeOnBackdrop={false}
      layerClassName="z-[100]"
      embedded={embedded}
      title="Z report"
      subtitle="End-of-day report for the closed session — print before closing"
      footer={
        report?.sales || report?.expected_cash != null ? (
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
      {loading || (!report?.sales && report?.expected_cash == null && !error) ? (
        <p className="text-sm text-slate-500">{loading ? "Loading Z report…" : "No report data."}</p>
      ) : report?.sales || report?.expected_cash != null ? (
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
            expensesFromDate={sessionExpenseDate(session)}
            expensesToDate={sessionExpenseDate(session)}
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
  const formRef = useRef(null);
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
            type="button"
            showIcon={false}
            disabled={busy || !toCashierId}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {busy ? "Handing over…" : "Hand over"}
          </PrimaryButton>
        </div>
      }
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <form ref={formRef} id="handover-session-form" onSubmit={handleSubmit} className="space-y-4">
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
