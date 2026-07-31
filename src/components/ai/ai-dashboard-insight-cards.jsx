"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { canUseAiInsights } from "@/lib/ai-insights";
import { AiInsightPanel, AiAnalyzeButton } from "@/components/ai/ai-insight-panel";
import { StatCard } from "@/components/catalog/catalog-shared";
import { DashboardSection } from "@/components/dashboard/dashboard-shared";

/**
 * Compact AI insight cards from GET /ai/insights/dashboard.
 * Click opens Stock Pulse or Sales brief panel.
 */
export function AiDashboardInsightCards({ className = "mt-8" }) {
  const { capabilities, hasPermission } = useAuth();
  const allowed = canUseAiInsights({ capabilities, hasPermission });
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [panel, setPanel] = useState(null); // stock_pulse | sales_brief | null

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiRequest("/ai/insights/dashboard")
      .then((res) => {
        if (!cancelled) setCards(Array.isArray(res?.cards) ? res.cards : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setCards([]);
          setError(e instanceof ApiError ? e.message : "Could not load AI insight cards");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed) return null;

  const displayCards = cards.slice(0, 3);

  return (
    <>
      <DashboardSection
        title="AI Insights"
        subtitle="Quick signals from stock and sales — open a brief for details"
        className={className}
        action={
          <div className="flex flex-wrap gap-2">
            <AiAnalyzeButton label="Stock Pulse" onClick={() => setPanel("stock_pulse")} />
            <AiAnalyzeButton label="Sales brief" onClick={() => setPanel("sales_brief")} />
          </div>
        }
      >
        {loading ? <p className="text-sm text-slate-500">Loading insight cards…</p> : null}
        {error ? <p className="text-sm text-amber-800">{error}</p> : null}
        {!loading && displayCards.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className="text-left"
                onClick={() => setPanel(card.insight_type === "stock_pulse" ? "stock_pulse" : "sales_brief")}
              >
                <StatCard
                  label={card.label}
                  value={
                    typeof card.value === "number" && card.id !== "yesterday_sales" && card.id !== "week_sales"
                      ? String(card.value)
                      : card.hint ?? String(card.value ?? "—")
                  }
                  hint={
                    card.href ? (
                      <Link
                        href={card.href}
                        className="text-[var(--theme-primary)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open report
                      </Link>
                    ) : (
                      card.hint
                    )
                  }
                />
              </button>
            ))}
          </div>
        ) : null}
        {!loading && !error && !displayCards.length ? (
          <p className="text-sm text-slate-500">No insight cards yet. Try Stock Pulse or Sales brief.</p>
        ) : null}
      </DashboardSection>

      <AiInsightPanel
        open={panel != null}
        onClose={() => setPanel(null)}
        title={panel === "stock_pulse" ? "Stock Pulse" : "Sales brief"}
        mode={panel === "stock_pulse" ? "stock_pulse" : "sales_brief"}
      />
    </>
  );
}
