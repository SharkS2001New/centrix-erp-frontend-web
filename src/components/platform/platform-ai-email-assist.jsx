"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { composePlatformEmailWithAi } from "@/lib/platform-ai-compose";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";

/**
 * Helps platform admins draft/improve email subject + body with platform AI keys.
 * Supports drafting from a saved mailbox template.
 */
export function PlatformAiEmailAssist({
  subject,
  body,
  onApply,
  placeholders,
  templates = [],
  selectedTemplateId = "",
  onSelectedTemplateIdChange,
  draftContext = null,
  className = "",
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState(selectedTemplateId || "");

  useEffect(() => {
    setTemplateId(selectedTemplateId || "");
  }, [selectedTemplateId]);

  const selectedTemplate = (templates || []).find((row) => String(row.id) === String(templateId)) || null;

  function chooseTemplate(id) {
    setTemplateId(id);
    onSelectedTemplateIdChange?.(id);
  }

  async function run(mode) {
    setBusy(true);
    try {
      const usingTemplate = mode === "from_template";
      if (usingTemplate && !selectedTemplate) {
        notifyError("Select a saved template first.");
        return;
      }

      const result = await composePlatformEmailWithAi({
        mode,
        instruction:
          instruction ||
          (usingTemplate
            ? "Update this template for the current recipient. Change names, dates, amounts, and other details as needed; keep the overall structure."
            : undefined),
        subject: usingTemplate ? selectedTemplate.subject : subject,
        body: usingTemplate ? selectedTemplate.body : body,
        placeholders,
        template: usingTemplate ? selectedTemplate : null,
        context: draftContext || undefined,
      });
      if (!result.subject && !result.body) {
        notifyError("AI returned an empty email. Try a clearer instruction.");
        return;
      }
      onApply?.({
        subject: result.subject || subject,
        body: result.body || body,
      });
      notifySuccess(
        usingTemplate
          ? "Drafted from template — review before sending."
          : mode === "draft"
            ? "Draft applied — review before saving."
            : "Email updated — review before saving.",
      );
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
            . Save a good email as a template, then draft from it and tell AI what to change.
          </p>
        </div>
      </div>

      {(templates || []).length > 0 ? (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-indigo-900 dark:text-indigo-200">
            Saved template
          </span>
          <select
            className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100"
            value={templateId}
            onChange={(e) => chooseTemplate(e.target.value)}
            disabled={busy}
          >
            <option value="">— Select a template —</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs font-medium text-indigo-900 dark:text-indigo-200">
          What should the AI do? (optional)
        </span>
        <textarea
          className="w-full resize-y rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100"
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={
            selectedTemplate
              ? "e.g. Same template for Acme Ltd, due date 30 Jul, mention VAT invoice attached."
              : "e.g. Make this more formal.\nMention that a VAT invoice will follow.\nKeep the renewal reminder short."
          }
          disabled={busy}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={busy || !selectedTemplate}
          onClick={() => void run("from_template")}
          title={!selectedTemplate ? "Select a saved template first" : undefined}
        >
          {busy ? "Working…" : "Draft from template"}
        </button>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={busy}
          onClick={() => void run("draft")}
        >
          Draft with AI
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
