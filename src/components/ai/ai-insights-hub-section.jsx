"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import {
  aiInsightsBlockedReason,
  canShowAiInsights,
  canUseAiInsights,
} from "@/lib/ai-insights";
import { AI_INSIGHT_DIGESTS, AI_INSIGHT_ON_DEMAND } from "@/lib/ai-settings";
import { AiInsightPanel, AiAnalyzeButton } from "@/components/ai/ai-insight-panel";
import { DashboardSection } from "@/components/dashboard/dashboard-shared";

const HUB_BUTTONS = [
  ...AI_INSIGHT_DIGESTS.slice(0, 6),
  ...AI_INSIGHT_ON_DEMAND.filter((d) => d.key !== "explain_screen"),
];

/**
 * Always-visible AI Insights entry on Reports (and similar hubs).
 */
export function AiInsightsHubSection({ className = "mb-8" }) {
  const { capabilities, hasPermission } = useAuth();
  const show = canShowAiInsights({ capabilities, hasPermission });
  const ready = canUseAiInsights({ capabilities, hasPermission });
  const blocked = aiInsightsBlockedReason({ capabilities, hasPermission });
  const [panel, setPanel] = useState(null);

  const insightsOn = capabilities?.ai_assistant?.insights?.enabled !== false;
  const orgAiOn = Boolean(capabilities?.ai_assistant?.enabled);
  const showAdminHint = !show && orgAiOn && insightsOn;
  const active = HUB_BUTTONS.find((b) => b.key === panel);

  if (!show && !showAdminHint) return null;

  return (
    <>
      <DashboardSection
        title="AI Insights"
        subtitle="Morning digests, debtors, tills, demand, and page analysis on Orders / reports"
        className={className}
      >
        {show && ready ? (
          <div className="flex flex-wrap gap-2">
            {HUB_BUTTONS.map((b) => (
              <AiAnalyzeButton key={b.key} label={b.label} onClick={() => setPanel(b.key)} />
            ))}
            <p className="w-full text-xs text-slate-500">
              On Orders, Customer statement, or any report, use{" "}
              <span className="font-medium">Analyze this page with AI</span> for
              findings based on what you are viewing.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p>{blocked ?? "AI Insights is not ready for your user yet."}</p>
            {showAdminHint ? (
              <p className="mt-2 text-xs text-amber-900/80">
                Insights is enabled for the organization, but your role also needs{" "}
                <span className="font-medium">Use AI assistant</span>.
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
        title={active?.label || "AI Insights"}
        mode={panel || "sales_brief"}
      />
    </>
  );
}
