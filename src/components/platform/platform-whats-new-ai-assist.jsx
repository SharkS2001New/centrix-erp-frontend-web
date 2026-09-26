"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { composePlatformWhatsNewWithAi } from "@/lib/platform-ai-compose";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";

/**
 * Draft or polish Platform → What’s new title/body from a rough idea.
 */
export function PlatformWhatsNewAiAssist({
  title = "",
  body = "",
  linkUrl = "",
  workspaces = [],
  onApply,
  className = "",
}) {
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const hasDraft = Boolean(String(title).trim() || String(body).trim());

  async function run(mode) {
    if (mode === "draft" && !idea.trim() && !hasDraft) {
      notifyError("Describe the update in a few words first.");
      return;
    }
    if (mode === "improve" && !hasDraft && !idea.trim()) {
      notifyError("Add a rough title/body or an idea to improve.");
      return;
    }

    setBusy(true);
    try {
      const result = await composePlatformWhatsNewWithAi({
        mode,
        instruction: idea,
        title,
        body: body || idea,
        link_url: linkUrl,
        workspaces,
      });
      if (!result.title && !result.body) {
        notifyError("AI returned an empty note. Try a clearer idea.");
        return;
      }
      onApply?.(result);
      notifySuccess(
        mode === "draft"
          ? "Draft applied — review before saving."
          : "Note improved — review before saving.",
      );
    } catch (err) {
      notifyError(
        err instanceof ApiError
          ? err.message
          : "AI formulate failed. Check Platform → AI training → Credentials.",
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
          Formulate with AI
        </p>
        <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">
          Sketch the update in plain words — AI turns it into a clear title and body using your{" "}
          <Link href="/platform/settings?tab=ai" className="font-medium underline">
            platform AI credentials
          </Link>
          .
        </p>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs font-medium text-indigo-900 dark:text-indigo-200">
          Rough idea
        </span>
        <textarea
          className="w-full resize-y rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100"
          rows={3}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder={
            "e.g. Payment date only when collecting unpaid / debtors, not at checkout.\nTalk AI continuous listen + Heard banner."
          }
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
          disabled={busy || (!hasDraft && !idea.trim())}
          onClick={() => void run("improve")}
        >
          Improve title & body
        </button>
      </div>
    </div>
  );
}
