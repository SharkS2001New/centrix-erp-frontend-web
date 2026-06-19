"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { getStoredWorkspace } from "@/lib/auth-storage";
import {
  canShowAiAssistant,
  isAiAssistantAvailable,
  isAiAssistantEnabledForOrg,
} from "@/lib/ai-settings";
import { aiStartersForWorkspace, aiWorkspaceLabel } from "@/lib/ai-workspace";
import { AI_ASSISTANT_TITLE } from "@/lib/branding";
import { defaultWorkspaceId } from "@/lib/workspaces";

function closePanel(setOpen, setExpanded) {
  setExpanded(false);
  setOpen(false);
}

function ExpandIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
      />
    </svg>
  );
}

function MinimizeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M15 9h4.5M15 9V4.5M15 9l5.25-5.25M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
    </svg>
  );
}

export function AiAssistPanel({ title = AI_ASSISTANT_TITLE }) {
  const pathname = usePathname();
  const { hasPermission, capabilities, user, organization, isSuperAdmin } = useAuth();
  const workspaceId = useMemo(
    () => getStoredWorkspace() ?? defaultWorkspaceId(capabilities, { user, organization, isSuperAdmin }),
    [capabilities, organization, user, isSuperAdmin],
  );
  const workspaceLabel = useMemo(
    () => aiWorkspaceLabel(workspaceId, capabilities),
    [capabilities, workspaceId],
  );
  const starters = useMemo(() => aiStartersForWorkspace(workspaceId), [workspaceId]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [formSpec, setFormSpec] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [actionResult, setActionResult] = useState(null);
  const bottomRef = useRef(null);

  const canUse = canShowAiAssistant(hasPermission);
  const orgAvailable = isAiAssistantAvailable(capabilities);
  const orgEnabled = isAiAssistantEnabledForOrg(capabilities);

  useEffect(() => {
    if (!canUse) return;
    apiRequest("/ai/status")
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }));
  }, [canUse]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, pendingAction, formSpec, actionResult]);

  const clearActionState = useCallback(() => {
    setPendingAction(null);
    setFormSpec(null);
    setFormValues({});
  }, []);

  const applyChatResponse = useCallback(
    (res) => {
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);

      if (res.pending_action) {
        setPendingAction(res.pending_action);
      } else if (res.action_result) {
        clearActionState();
      }

      if (res.form_spec?.fields?.length) {
        setFormSpec(res.form_spec);
        setFormValues((prev) => ({
          ...buildInitialFormValues(res.form_spec),
          ...prev,
          ...(res.pending_action?.params ?? {}),
        }));
      } else if (!res.pending_action) {
        setFormSpec(null);
      }

      if (res.action_result?.result) {
        setActionResult(res.action_result.result);
      }
      if (res.declined_off_topic) {
        clearActionState();
      }
    },
    [clearActionState],
  );

  const send = useCallback(
    async (text, { confirm = false, formValuesOverride = null } = {}) => {
      const message = text.trim();
      if (!message || loading) return;
      setError(null);
      setActionResult(null);
      setLoading(true);
      if (!confirm) {
        setMessages((prev) => [...prev, { role: "user", content: message }]);
      }
      setInput("");
      try {
        const history = messages.slice(-10);
        const res = await apiRequest("/ai/chat", {
          method: "POST",
          body: {
            context: "erp",
            workspace_id: workspaceId,
            pathname,
            message,
            history,
            pending_action: pendingAction ?? undefined,
            form_values: Object.keys(formValuesOverride ?? formValues).length
              ? formValuesOverride ?? formValues
              : undefined,
            confirm_action: confirm,
          },
        });
        applyChatResponse(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "AI request failed");
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, pendingAction, formValues, applyChatResponse, workspaceId, pathname],
  );

  const submitForm = useCallback(() => {
    if (!pendingAction) return;
    send("confirm", { confirm: true, formValuesOverride: formValues });
  }, [pendingAction, formValues, send]);

  if (!canUse) return null;

  const statusHint =
    orgAvailable && status?.enabled !== false
      ? expanded
        ? `${workspaceLabel} · expanded view`
        : `${workspaceLabel} only · switch workspace for other modules`
      : orgEnabled
        ? "Finish AI setup under Admin → Settings → AI (API key required)."
        : "Not configured — enable under Admin → Settings → AI.";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700"
        title={title}
        aria-label={`Open ${AI_ASSISTANT_TITLE}`}
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
          />
        </svg>
      </button>

      {open ? (
        <div
          className={`fixed inset-0 z-50 flex bg-black/25 ${
            expanded ? "items-center justify-center p-4 sm:p-6" : "justify-end"
          }`}
          onClick={() => closePanel(setOpen, setExpanded)}
          role="presentation"
        >
          <div
            className={`flex flex-col bg-white shadow-2xl ${
              expanded
                ? "h-[min(90vh,820px)] w-full max-w-3xl rounded-xl"
                : "h-full w-full max-w-md"
            }`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0 pr-3">
                <h2 className="font-semibold text-slate-900">{title}</h2>
                <p className="text-xs text-slate-500">{statusHint}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label={expanded ? "Minimize assistant" : "Expand assistant"}
                  title={expanded ? "Minimize" : "Expand"}
                >
                  {expanded ? <MinimizeIcon className="h-5 w-5" /> : <ExpandIcon className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => closePanel(setOpen, setExpanded)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 hover:text-red-700"
                  aria-label="Close assistant"
                >
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">
                    Ask about <span className="font-medium text-slate-800">{workspaceLabel}</span> — navigation,
                    workflows, or creating records in this module.
                  </p>
                  <div className={expanded ? "grid gap-2 sm:grid-cols-2" : "space-y-2"}>
                    {starters.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? expanded
                        ? "ml-16 bg-indigo-50 text-indigo-900"
                        : "ml-8 bg-indigo-50 text-indigo-900"
                      : expanded
                        ? "mr-16 bg-slate-100 text-slate-800"
                        : "mr-4 bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.content}
                </div>
              ))}

              {formSpec?.fields?.length ? (
                <div className={expanded ? "mx-8" : "mr-4"}>
                  {pendingAction?.summary ? (
                    <p className="mb-1 text-sm font-medium text-slate-800">{pendingAction.summary}</p>
                  ) : null}
                  <AiActionForm
                    formSpec={formSpec}
                    values={formValues}
                    loading={loading}
                    onChange={(name, value) => setFormValues((prev) => ({ ...prev, [name]: value }))}
                    onSubmit={submitForm}
                    onCancel={clearActionState}
                  />
                </div>
              ) : pendingAction ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <p className="font-medium text-amber-950">Ready to create</p>
                  <p className="mt-1 text-amber-900">{pendingAction.summary ?? pendingAction.type}</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => send("yes, confirm", { confirm: true })}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={clearActionState}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {actionResult?.path ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <p className="font-medium text-emerald-900">Created successfully</p>
                  <Link href={actionResult.path} className="mt-1 inline-block text-emerald-700 underline">
                    Open {decodeURIComponent(actionResult.path.replace(/^\/products\//, ""))}
                  </Link>
                </div>
              ) : null}

              {loading ? <p className="text-center text-xs text-slate-500">Thinking…</p> : null}
              {error ? <p className="text-center text-xs text-red-600">{error}</p> : null}
              <div ref={bottomRef} />
            </div>

            <form
              className="border-t border-slate-200 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                rows={expanded ? 5 : 4}
                className="min-h-[120px] w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-base leading-relaxed text-slate-900 placeholder:text-slate-400"
                placeholder={`Ask about ${workspaceLabel}…`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                disabled={loading}
              />
              <div className="mt-3 flex justify-start">
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="min-w-[120px] rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <p className="mt-1.5 text-center text-xs text-slate-500">Enter to send · Shift+Enter for a new line</p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
