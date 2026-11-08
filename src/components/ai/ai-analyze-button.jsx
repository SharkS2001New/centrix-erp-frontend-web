"use client";

import { useAuth } from "@/contexts/auth-context";
import { canShowAiInsights } from "@/lib/ai-insights";

/** Compact trigger button for toolbars — kept separate so list screens don't pull the insight panel chunk. */
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
