"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { composePlatformEmailWithAi } from "@/lib/platform-ai-compose";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";

/**
 * Helps platform admins draft/improve email subject + body with platform AI keys.
 * Supports drafting from a saved mailbox template, and reply suggestions with memory.
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
  variant = "compose",
  inboundEmail = null,
  similarReplies = [],
  onCheckSimilar = null,
  onSaveForFuture = null,
  savedForFuture = false,
  savingForFuture = false,
  className = "",
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState(selectedTemplateId || "");
  const [matchedCount, setMatchedCount] = useState(similarReplies?.length || 0);
  const [useSimilarResponses, setUseSimilarResponses] = useState(false);
  const isReply = variant === "reply";

  useEffect(() => {
    setTemplateId(selectedTemplateId || "");
  }, [selectedTemplateId]);

  useEffect(() => {
    setMatchedCount(similarReplies?.length || 0);
  }, [similarReplies]);

  const selectedTemplate = (templates || []).find((row) => String(row.id) === String(templateId)) || null;

  function chooseTemplate(id) {
    setTemplateId(id);
    onSelectedTemplateIdChange?.(id);
  }

  async function run(mode, repliesOverride = null, successMessage = null) {
    setBusy(true);
    try {
      const usingTemplate = mode === "from_template";
      if (usingTemplate && !selectedTemplate) {
        notifyError("Select a saved template first.");
        return;
      }

      const repliesForAi =
        repliesOverride != null ? repliesOverride : mode === "reply" ? similarReplies : undefined;

      const result = await composePlatformEmailWithAi({
        mode,
        instruction:
          instruction ||
          (mode === "reply"
            ? repliesForAi?.length
              ? "Read the inbound email and the similar saved responses. Draft a clear, professional reply that matches how we answered similar emails."
              : "Read the inbound email carefully and draft a clear, professional reply the platform admin can send."
            : usingTemplate
              ? "Update this template for the current recipient. Change names, dates, amounts, and other details as needed; keep the overall structure."
              : undefined),
        subject: usingTemplate ? selectedTemplate.subject : subject,
        body: usingTemplate ? selectedTemplate.body : body,
        placeholders,
        template: usingTemplate ? selectedTemplate : null,
        context: draftContext || undefined,
        inboundEmail: mode === "reply" ? inboundEmail : undefined,
        similarReplies: mode === "reply" ? repliesForAi : undefined,
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
        successMessage ||
          (usingTemplate
            ? "Drafted from template — review before sending."
            : mode === "reply"
              ? (repliesForAi?.length
                  ? `Drafted from this email plus ${repliesForAi.length} similar saved response${repliesForAi.length === 1 ? "" : "s"} — review before sending.`
                  : "Reply drafted from the email above — review before sending.")
              : mode === "draft"
                ? "Draft applied — review before saving."
                : "Email updated — review before saving."),
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

  async function draftReplyFromEmail() {
    setBusy(true);
    try {
      let replies = [];
      if (useSimilarResponses) {
        if (typeof onCheckSimilar === "function") {
          replies = (await onCheckSimilar()) || [];
        } else {
          replies = similarReplies || [];
        }
        setMatchedCount(Array.isArray(replies) ? replies.length : 0);
      } else {
        setMatchedCount(0);
      }

      const list = Array.isArray(replies) ? replies : [];
      await run(
        "reply",
        list,
        useSimilarResponses
          ? list.length
            ? `Drafted from this email plus ${list.length} similar saved response${list.length === 1 ? "" : "s"} — review in the box below.`
            : "No similar saved responses found — drafted from this email alone. Review before sending."
          : "Reply drafted from the email above — review in the box below before sending.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (isReply) {
    return (
      <div
        className={`rounded-lg border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/50 dark:bg-sky-950/30 ${className}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-sky-950 dark:text-sky-100">AI reply assist</p>
            <p className="mt-0.5 text-xs text-sky-800/80 dark:text-sky-200/80">
              <strong>Draft reply</strong> reads the email above and fills the reply box below. Tick{" "}
              <strong>Check through similar responses</strong> to also use replies you saved.{" "}
              <strong>Save response for future response</strong> stores this reply (kept up to 3 months).
              Credentials:{" "}
              <Link href="/platform/settings?tab=ai" className="font-medium underline">
                platform AI settings
              </Link>
              .
              {useSimilarResponses && matchedCount > 0 ? (
                <span className="mt-1 block">
                  Last draft used {matchedCount} similar saved response{matchedCount === 1 ? "" : "s"}.
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-sky-900 dark:text-sky-200">
            Extra guidance (optional)
          </span>
          <textarea
            className="w-full resize-y rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100"
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Apologize for the delay and offer a call tomorrow."
            disabled={busy}
          />
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm text-sky-950 dark:text-sky-100">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-sky-300 text-[#185FA5] focus:ring-[#185FA5]"
            checked={useSimilarResponses}
            onChange={(e) => setUseSimilarResponses(e.target.checked)}
            disabled={busy}
          />
          <span>
            <span className="font-medium">Check through similar responses</span>
            <span className="block text-xs text-sky-800/80 dark:text-sky-200/80">
              When checked, Draft reply also reads your saved similar responses and uses them with the email above.
            </span>
          </span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-[#185FA5] px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#144e88] disabled:opacity-60"
            disabled={busy || !inboundEmail}
            onClick={() => void draftReplyFromEmail()}
          >
            {busy ? "Drafting…" : "Draft reply"}
          </button>
          {typeof onSaveForFuture === "function" ? (
            <button
              type="button"
              className={
                savedForFuture
                  ? "inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
                  : "inline-flex items-center justify-center rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-900 shadow-sm hover:bg-sky-50 disabled:opacity-60"
              }
              disabled={busy || savingForFuture}
              onClick={() => void onSaveForFuture()}
            >
              {savingForFuture
                ? "Saving…"
                : savedForFuture
                  ? "Saved for future response · Remove"
                  : "Save response for future response"}
            </button>
          ) : null}
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={busy || !body?.trim()}
            onClick={() => void run("improve")}
          >
            Improve draft
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/30 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-indigo-950 dark:text-indigo-100">AI email assist</p>
          <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">
            Uses your{" "}
            <Link href="/platform/settings?tab=ai" className="font-medium underline">
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
