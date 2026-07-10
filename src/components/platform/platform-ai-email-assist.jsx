"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { composePlatformEmailWithAi } from "@/lib/platform-ai-compose";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";

/**
 * Helps platform admins draft/improve email subject + body with platform AI keys.
 * Does not use knowledge training — direct compose like a normal AI assistant.
 */
export function PlatformAiEmailAssist({
  subject,
  body,
  onApply,
  placeholders,
  className = "",
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(mode) {
    setBusy(true);
    try {
      const result = await composePlatformEmailWithAi({
        mode,
        instruction,
        subject,
        body,
        placeholders,
      });
      if (!result.subject && !result.body) {
        notifyError("AI returned an empty email. Try a clearer instruction.");
        return;
      }
      onApply?.({
        subject: result.subject || subject,
        body: result.body || body,
      });
      notifySuccess(mode === "draft" ? "Draft applied — review before saving." : "Email updated — review before saving.");
    } catch (err) {
      notifyError(
        err instanceof ApiError
          ? err.message
          : "AI compose failed. Check Platform → AI training → Credentials.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/30 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-indigo-950 dark:text-indigo-100">AI email assist</p>
          <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">
            Uses your{" "}
            <Link href="/platform/ai-training/credentials" className="font-medium underline">
              platform AI credentials
            </Link>
            . No training notes required — works like a normal AI rewrite.
          </p>
        </div>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs font-medium text-indigo-900 dark:text-indigo-200">
          What should the AI do? (optional)
        </span>
        <input
          className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder='e.g. "More formal", "Mention VAT invoice follows", "Shorter renewal reminder"'
          disabled={busy}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={busy}
          onClick={() => void run("draft")}
        >
          {busy ? "Working…" : "Draft with AI"}
        </button>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={busy || (!subject?.trim() && !body?.trim())}
          onClick={() => void run("improve")}
        >
          Improve
        </button>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={busy || !body?.trim()}
          onClick={() => void run("shorten")}
        >
          Shorten
        </button>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={busy || !body?.trim()}
          onClick={() => void run("formal")}
        >
          More formal
        </button>
      </div>
    </div>
  );
}
