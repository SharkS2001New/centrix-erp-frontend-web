"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { suggestReportBuilderWithAi } from "@/lib/reports/report-builder-ai-suggest";
import { SECONDARY_BTN_CLASS, inputClassName } from "@/components/catalog/catalog-shared";

const MAX_WORDS = 100;

function wordCount(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Natural-language report draft — works with keyword matching; uses org AI when connected.
 */
export function ReportBuilderAiSuggest({ workspaceId, onApply, className = "" }) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const words = wordCount(instruction);

  async function run() {
    const text = instruction.trim();
    if (!text) {
      notifyError("Describe the report you need first.");
      return;
    }
    if (wordCount(text) > MAX_WORDS) {
      notifyError(`Keep the description under ${MAX_WORDS} words.`);
      return;
    }
    setBusy(true);
    try {
      const result = await suggestReportBuilderWithAi({
        instruction: text,
        workspaceId,
      });
      if (!result?.spec?.columns?.length) {
        notifyError("No matching columns found. Try a clearer description.");
        return;
      }
      onApply?.(result);
      notifySuccess(
        result.mode === "ai"
          ? result.provider === "gemini"
            ? "Gemini suggestions applied — review then Preview / Save."
            : "AI suggestions applied — review then Preview / Save."
          : "Suggestions applied — review then Preview / Save.",
      );
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Suggest failed. Try a shorter, clearer description.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`theme-panel rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 ${className}`}
    >
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Describe the report you need
      </h2>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        Plain English, under {MAX_WORDS} words. Centrix picks sources and columns. When organization AI is enabled
        (Gemini or OpenAI), that provider is used first.
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
          maxLength={800}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${words > MAX_WORDS ? "text-red-600" : "text-slate-500"}`}>
          {words}/{MAX_WORDS} words
        </p>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={busy || words === 0 || words > MAX_WORDS}
          onClick={() => void run()}
        >
          {busy ? "Suggesting…" : "Suggest report"}
        </button>
      </div>
    </section>
  );
}
