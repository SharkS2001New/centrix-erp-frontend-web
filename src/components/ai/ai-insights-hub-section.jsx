"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import {
  aiInsightsBlockedReason,
  canShowAiInsights,
  canUseAiInsights,
} from "@/lib/ai-insights";
import { AiInsightPanel, AiAnalyzeButton } from "@/components/ai/ai-insight-panel";
import { DashboardSection } from "@/components/dashboard/dashboard-shared";

/**
 * Always-visible AI Insights entry on Reports (and similar hubs).
 * Shows actions when ready, or a clear reason / settings link when not.
 */
export function AiInsightsHubSection({ className = "mb-8" }) {
  const { capabilities, hasPermission } = useAuth();
  const show = canShowAiInsights({ capabilities, hasPermission });
  const ready = canUseAiInsights({ capabilities, hasPermission });
  const blocked = aiInsightsBlockedReason({ capabilities, hasPermission });
  const [panel, setPanel] = useState(null);

  // Still show a hint for admins who enabled Insights but lack ai.assist themselves.
  const insightsOn = capabilities?.ai_assistant?.insights?.enabled !== false;
  const orgAiOn = Boolean(capabilities?.ai_assistant?.enabled);
  const showAdminHint = !show && orgAiOn && insightsOn;

  if (!show && !showAdminHint) return null;

  return (
    <>
      <DashboardSection
        title="AI Insights"
        subtitle="Stock Pulse, Sales brief, and Analyze with AI on individual reports"
        className={className}
      >
        {show && ready ? (
          <div className="flex flex-wrap gap-2">
            <AiAnalyzeButton label="Stock Pulse" onClick={() => setPanel("stock_pulse")} />
            <AiAnalyzeButton label="Sales brief" onClick={() => setPanel("sales_brief")} />
            <p className="w-full text-xs text-slate-500">
              Open any report and use <span className="font-medium">Analyze with AI</span> next to Print / CSV.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p>{blocked ?? "AI Insights is not ready for your user yet."}</p>
            {showAdminHint ? (
              <p className="mt-2 text-xs text-amber-900/80">
                Insights is enabled for the organization, but your role also needs{" "}
                <span className="font-medium">Use AI assistant</span> to see Analyze / Stock Pulse.
              </p>
            ) : null}
            <Link href="/settings?tab=ai" className="mt-2 inline-block font-medium text-[var(--theme-primary)] hover:underline">
              Open AI settings
            </Link>
          </div>
        )}
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
