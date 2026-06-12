"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { usePosSession } from "@/contexts/pos-session-context";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { formatTillKesExact, varianceLabel, CLOSE_REASONS } from "@/lib/pos-till";
import { isPosTillFloatRequired } from "@/lib/sales-settings";

export default function CloseSessionPage() {
  const router = useRouter();
  const { capabilities } = useAuth();
  const { activeSession, sessionReport, closeSession, busy, error, refreshReport } = usePosSession();
  const requireTillFloat = isPosTillFloatRequired(capabilities?.module_settings);
  const [actualCash, setActualCash] = useState("");
  const [reason, setReason] = useState(CLOSE_REASONS[0]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!activeSession) {
      router.replace("/sales/pos");
      return;
    }
    refreshReport(activeSession.id);
  }, [activeSession, refreshReport, router]);

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
      });
      if (res?.session?.id) {
        router.push(`/sales/session/z-report?session=${res.session.id}`);
      }
    } catch {
      /* error shown via context */
    }
  }

  if (!activeSession) return null;

  return (
    <CatalogPageShell
      title="Close POS session"
      subtitle="Count cash in the drawer and reconcile before closing"
      action={
        <Link href="/sales/pos" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Cancel
        </Link>
      }
      banner={
        error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null
      }
    >
      <form onSubmit={handleClose} className="mx-auto max-w-lg space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <dl className="space-y-3 text-sm">
            {requireTillFloat ? (
              <div className="flex justify-between"><dt className="text-slate-500">Operating float</dt><dd className="font-medium">{formatTillKesExact(activeSession.working_amount)}</dd></div>
            ) : null}
            <div className={`flex justify-between ${requireTillFloat ? "border-t border-slate-100 pt-3" : ""}`}><dt className="text-slate-500">Expected cash</dt><dd className="font-semibold text-slate-900">{formatTillKesExact(expected)}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
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
            />
          </Field>

          <div className={`rounded-lg px-4 py-3 ${varianceMeta.tone === "shortage" ? "bg-red-50" : varianceMeta.tone === "surplus" ? "bg-amber-50" : "bg-emerald-50"}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700">Variance</span>
              <span className={`text-lg font-semibold ${varianceMeta.tone === "shortage" ? "text-red-700" : varianceMeta.tone === "surplus" ? "text-amber-800" : "text-emerald-700"}`}>
                {formatTillKesExact(variance)}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-600">{varianceMeta.text}</p>
          </div>

          <Field label="Reason">
            <select className={inputClassName()} value={reason} onChange={(e) => setReason(e.target.value)}>
              {CLOSE_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              className={`${inputClassName()} min-h-[80px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional details"
            />
          </Field>
        </div>

        <PrimaryButton type="submit" showIcon={false} disabled={busy || !actualCash}>
          {busy ? "Closing…" : "Close session"}
        </PrimaryButton>
      </form>
    </CatalogPageShell>
  );
}
