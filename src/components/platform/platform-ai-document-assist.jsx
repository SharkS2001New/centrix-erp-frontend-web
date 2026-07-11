"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { composePlatformDocumentFieldsWithAi } from "@/lib/platform-ai-compose";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";

/**
 * Suggests title / reference / notes for quotes and contracts using platform AI.
 */
export function PlatformAiDocumentAssist({
  kind = "quote",
  form = {},
  onApply,
  className = "",
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const label = kind === "contract" ? "contract" : "quote";

  async function run() {
    setBusy(true);
    try {
      const result = await composePlatformDocumentFieldsWithAi({
        kind,
        instruction,
        form,
      });
      if (!result.title && !result.reference && !result.notes) {
        notifyError("AI returned no suggestions. Try a clearer instruction.");
        return;
      }
      onApply?.(result);
      notifySuccess("Suggestions applied — review before saving.");
    } catch (err) {
      notifyError(
        err instanceof ApiError
          ? err.message
          : "AI suggest failed. Check Platform → AI training → Credentials.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/30 ${className}`}
    >
      <div>
        <p className="text-sm font-medium text-indigo-950 dark:text-indigo-100">
          AI suggest {label} details
        </p>
        <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">
          Uses your{" "}
          <Link href="/platform/settings?tab=ai" className="font-medium underline">
            platform AI credentials
          </Link>{" "}
          to propose a title, reference, and short notes from the customer / plan already on this form.
        </p>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs font-medium text-indigo-900 dark:text-indigo-200">
          Hint for AI (optional)
        </span>
        <textarea
          className="w-full resize-y rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100"
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={"e.g. Annual renewal for Acme.\nStarter plan onboarding quote."}
          disabled={busy}
        />
      </label>
      <div className="mt-3">
        <button type="button" className={SECONDARY_BTN_CLASS} disabled={busy} onClick={() => void run()}>
          {busy ? "Suggesting…" : `Suggest ${label} name & details`}
        </button>
      </div>
    </div>
  );
}
