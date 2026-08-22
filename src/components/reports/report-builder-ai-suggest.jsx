"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { suggestReportBuilderWithAi } from "@/lib/reports/report-builder-ai-suggest";
import { SECONDARY_BTN_CLASS, inputClassName } from "@/components/catalog/catalog-shared";

/**
 * Natural-language report draft — applies sources/columns/name without saving.
 */
export function ReportBuilderAiSuggest({ workspaceId, onApply, className = "" }) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    const text = instruction.trim();
    if (!text) {
      notifyError("Describe the report you need first.");
      return;
    }
    setBusy(true);
    try {
      const result = await suggestReportBuilderWithAi({
        instruction: text,
        workspaceId,
      });
      if (!result?.spec?.columns?.length) {
        notifyError("AI returned no columns. Try a clearer description.");
        return;
      }
      onApply?.(result);
      notifySuccess("Suggestions applied — review then Preview / Save.");
    } catch (err) {
      notifyError(
        err instanceof ApiError
          ? err.message
          : "AI suggest failed. Check Administration → Settings → AI.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`theme-panel rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm dark:border-indigo-900/40 dark:bg-indigo-950/20 ${className}`}
    >
      <h2 className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">
        Describe the report you need
      </h2>
      <p className="mt-1 text-xs text-indigo-900/80 dark:text-indigo-200/80">
        Centrix suggests sources, columns, and a name using your{" "}
        <Link href="/admin/settings?tab=ai" className="font-medium underline">
          organization AI settings
        </Link>
        . You review before saving.
      </p>
      <label className="mt-3 block text-sm">
        <span className="sr-only">Report description</span>
        <textarea
          className={`${inputClassName()} resize-y bg-white dark:bg-slate-900`}
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Daily sales by product with unpaid totals&#10;Stock on hand by branch for low items"
          disabled={busy}
        />
      </label>
      <div className="mt-3">
        <button type="button" className={SECONDARY_BTN_CLASS} disabled={busy} onClick={() => void run()}>
          {busy ? "Suggesting…" : "Suggest report"}
        </button>
      </div>
    </section>
  );
}
