"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { canShowAiInsights, canUseAiInsights, formatInsightClipboard, aiInsightsBlockedReason } from "@/lib/ai-insights";
import { PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";

/**
 * Side panel for Analyze / Ask / Send AI insights.
 */
export function AiInsightPanel({
  open,
  onClose,
  title = "AI Insights",
  mode = "report", // report | explain_screen | catalog type key
  reportKey = null,
  screenKey = null,
  filters = {},
  rows = [],
  summary = null,
  initialQuestion = "",
  productCode = null,
  productQuery = null,
  customerNum = null,
  lookbackDays = null,
}) {
  const { capabilities, hasPermission } = useAuth();
  const allowed = canUseAiInsights({ capabilities, hasPermission });
  const blockedReason = aiInsightsBlockedReason({ capabilities, hasPermission });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [insight, setInsight] = useState(null);
  const [question, setQuestion] = useState(initialQuestion);
  const [deliverMsg, setDeliverMsg] = useState(null);

  const runAnalyze = useCallback(async () => {
    if (!allowed) return;
    setBusy(true);
    setError(null);
    setDeliverMsg(null);
    try {
      let res;
      if (mode === "stock_pulse" || mode === "sales_brief") {
        res = await apiRequest(`/ai/insights/${mode.replace("_", "-")}`, { method: "POST", body: {} });
      } else if (mode === "explain_screen" || mode === "explain") {
        res = await apiRequest("/ai/insights/explain-screen", {
          method: "POST",
          body: {
            screen_key: reportKey || screenKey || "screen",
            filters,
            rows: (rows ?? []).slice(0, 80),
            summary,
            question: question.trim() || undefined,
          },
        });
      } else if (mode === "report") {
        res = await apiRequest("/ai/insights/analyze-report", {
          method: "POST",
          body: {
            report_key: reportKey || "report",
            filters,
            rows: (rows ?? []).slice(0, 80),
            summary,
            question: question.trim() || undefined,
          },
        });
      } else {
        res = await apiRequest("/ai/insights/run", {
          method: "POST",
          body: {
            type: mode,
            product_code: productCode || undefined,
            product_query: productQuery || undefined,
            customer_num: customerNum || undefined,
            lookback_days: lookbackDays || undefined,
            screen_key: screenKey || reportKey || undefined,
            filters,
            rows: (rows ?? []).slice(0, 80),
            summary,
            question: question.trim() || undefined,
          },
        });
      }
      setInsight(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Analysis failed");
      setInsight(null);
    } finally {
      setBusy(false);
    }
  }, [
    allowed,
    mode,
    reportKey,
    screenKey,
    filters,
    rows,
    summary,
    question,
    productCode,
    productQuery,
    customerNum,
    lookbackDays,
  ]);

  useEffect(() => {
    if (!open) return;
    setInsight(null);
    setError(null);
    setDeliverMsg(null);
    const timer = window.setTimeout(() => {
      void runAnalyze();
    }, 50);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, reportKey]);

  async function askFollowUp(e) {
    e?.preventDefault?.();
    if (!question.trim() || !allowed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest("/ai/insights/ask", {
        method: "POST",
        body: {
          question: question.trim(),
          insight_id: insight?.insight_id ?? undefined,
          context: insight
            ? { type: insight.type, summary: insight.summary, findings: insight.findings }
            : { report_key: reportKey, filters },
        },
      });
      setInsight(res);
      setQuestion("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Follow-up failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendBrief() {
    if (!insight?.insight_id) return;
    setBusy(true);
    setDeliverMsg(null);
    setError(null);
    try {
      const res = await apiRequest("/ai/insights/deliver", {
        method: "POST",
        body: { insight_id: insight.insight_id },
      });
      const parts = [];
      if (res.sent?.email) parts.push(`${res.sent.email} email`);
      if (res.sent?.whatsapp) parts.push(`${res.sent.whatsapp} WhatsApp`);
      if (res.sent?.sms) parts.push(`${res.sent.sms} SMS`);
      setDeliverMsg(
        parts.length
          ? `Sent: ${parts.join(", ")}`
          : `Nothing sent. ${ (res.skipped || []).join("; ") || "Configure recipients under AI settings." }`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send brief");
    } finally {
      setBusy(false);
    }
  }

  function copyBrief() {
    const text = formatInsightClipboard(insight);
    if (text) void navigator.clipboard?.writeText(text);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" role="dialog" aria-modal="true">
      <button type="button" className="flex-1 cursor-default" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">Centrix AI Insights</p>
          </div>
          <button type="button" className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Close
          </button>
        </div>

        {!allowed ? (
          <p className="p-4 text-sm text-amber-800">
            {blockedReason ??
              "AI insights need the Use AI assistant permission and a configured OpenAI key."}
          </p>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              {busy && !insight ? <p className="text-slate-500">Analyzing…</p> : null}
              {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p> : null}
              {insight ? (
                <>
                  <p className="whitespace-pre-wrap text-slate-800">{insight.summary}</p>
                  {insight.findings?.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-slate-700">
                      {insight.findings.map((f, i) => (
                        <li key={`${i}-${f.slice(0, 24)}`}>{f}</li>
                      ))}
                    </ul>
                  ) : null}
                  {insight.actions?.length ? (
                    <div className="space-y-1 border-t border-slate-100 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</p>
                      {insight.actions.map((action, i) =>
                        action.href ? (
                          <Link
                            key={`${i}-${action.label}`}
                            href={action.href}
                            className="block text-sm font-medium text-[var(--theme-primary)] hover:underline"
                            onClick={onClose}
                          >
                            {action.label}
                          </Link>
                        ) : (
                          <p key={`${i}-${action.label}`} className="text-sm text-slate-700">
                            {action.label}
                          </p>
                        ),
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
              {deliverMsg ? <p className="text-xs text-emerald-700">{deliverMsg}</p> : null}
            </div>

            <div className="space-y-2 border-t border-slate-200 p-4">
              <div className="flex flex-wrap gap-2">
                <PrimaryButton type="button" showIcon={false} disabled={busy} onClick={() => void runAnalyze()}>
                  {busy ? "Working…" : "Refresh analysis"}
                </PrimaryButton>
                <button
                  type="button"
                  disabled={busy || !insight}
                  onClick={copyBrief}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Copy
                </button>
                <button
                  type="button"
                  disabled={busy || !insight}
                  onClick={() => void sendBrief()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Send brief
                </button>
              </div>
              <form onSubmit={askFollowUp} className="flex gap-2">
                <input
                  className={`${inputClassName()} flex-1`}
                  placeholder="Ask a follow-up…"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy || !question.trim()}
                  className="theme-primary-btn rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  Ask
                </button>
              </form>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/** Compact trigger button for toolbars. */
export function AiAnalyzeButton({ onClick, disabled = false, label = "Analyze with AI" }) {
  const { capabilities, hasPermission } = useAuth();
  // Show whenever Insights is enabled for the org and the user may use AI —
  // do not hide just because the API key is missing (panel explains that).
  if (!canShowAiInsights({ capabilities, hasPermission })) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
