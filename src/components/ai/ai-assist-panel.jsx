"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiRequest, apiFetchBlob, aiChatStream } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { getStoredWorkspace } from "@/lib/auth-storage";
import {
  canShowAiAssistant,
  isAiAssistantAvailable,
  isAiAssistantEnabledForOrg,
  isAiPlatformEnabled,
} from "@/lib/ai-settings";
import { aiStartersForWorkspace, aiWorkspaceLabel } from "@/lib/ai-workspace";
import { AI_ASSISTANT_TITLE } from "@/lib/branding";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import {
  defaultWorkspaceId,
  openAppPathAcrossWorkspaces,
} from "@/lib/workspace-navigation";
import { pathBelongsToWorkspace } from "@/lib/workspaces";
import { notifyError, notifySuccess } from "@/lib/notify";
import { WorkspaceOpeningScreen } from "@/components/branding/workspace-opening-screen";
import { buildPageContext, subscribeAiAssistRequests } from "@/lib/ai-assist-bridge";
import { AiActionForm, buildInitialFormValues } from "@/components/ai/ai-action-form";
import { AiMessageContent } from "@/components/ai/ai-message-content";
import { EntityMentionTextarea } from "@/components/ai/entity-mention-textarea";
import { serializeEntityRefs } from "@/lib/ai/entity-mention-search";
import { userAskedForChart, preferredChartType } from "@/lib/ai-message-format";
import {
  canUseBrowserSpeechRecognition,
  createSpeechRecognizer,
  ensureMicrophoneAccess,
  getAiTtsPref,
  isRetryableSpeechError,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  preferredSpeechLang,
  setAiTtsPref,
  speakAssistantText,
  speechErrorMessage,
  spokenBriefForSpeech,
  stopAssistantSpeech,
} from "@/lib/ai-voice";

function closePanel(setOpen, setExpanded) {
  setExpanded(false);
  setOpen(false);
}

/** Confirm / form UI is only for write creates — never for open/navigate deep links. */
function isWritePendingAction(action) {
  const type = String(action?.type ?? "");
  return (
    type.startsWith("create_") ||
    type === "record_customer_payment" ||
    [
      "submit_lpo_for_approval",
      "approve_lpo",
      "mark_lpo_sent",
      "receive_lpo_goods",
    ].includes(type)
  );
}

async function downloadDocumentLink(link) {
  const apiPath = link?.api_path;
  if (!apiPath) return;
  const blob = await apiFetchBlob(apiPath);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = link.filename || "document.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Charts only when the preceding user turn asked for one. */
function showChartsForMessage(messages, index) {
  if (messages[index]?.role !== "assistant") return false;
  for (let j = index - 1; j >= 0; j -= 1) {
    if (messages[j]?.role === "user") {
      return userAskedForChart(messages[j].content);
    }
  }
  return false;
}

function preferredChartTypeForMessage(messages, index) {
  if (messages[index]?.role !== "assistant") return null;
  for (let j = index - 1; j >= 0; j -= 1) {
    if (messages[j]?.role === "user") {
      return preferredChartType(messages[j].content);
    }
  }
  return null;
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

function MicIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
      />
    </svg>
  );
}

function SpeakerIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
      />
    </svg>
  );
}

function ThumbUpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"
      />
    </svg>
  );
}

function ThumbDownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10zM17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3"
      />
    </svg>
  );
}

export function AiAssistPanel({ title = AI_ASSISTANT_TITLE }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    hasPermission,
    hasNavPermission,
    isModuleEnabled,
    capabilities,
    user,
    organization,
    isSuperAdmin,
    switchWorkspace,
  } = useAuth();
  const workspaceId = useMemo(
    () =>
      getStoredWorkspace() ??
      defaultWorkspaceId(capabilities, {
        user,
        organization,
        isSuperAdmin,
        hasPermission,
        hasNavPermission,
        isModuleEnabled,
      }),
    [capabilities, hasNavPermission, hasPermission, isModuleEnabled, isSuperAdmin, organization, user],
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
  const [entityRefs, setEntityRefs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streamStatus, setStreamStatus] = useState(null);
  const [error, setError] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [formSpec, setFormSpec] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [actionResult, setActionResult] = useState(null);
  const [pageContext, setPageContext] = useState(null);
  const [openingWorkspaceId, setOpeningWorkspaceId] = useState(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const bottomRef = useRef(null);
  const sendRef = useRef(null);
  const recognizerRef = useRef(null);
  const voiceFinalRef = useRef("");
  const lastSpokenRef = useRef("");
  const startListeningRef = useRef(null);
  const speechRetryRef = useRef(0);
  /** Speak a short brief only for questions asked via the mic (not typed). */
  const voiceAskedRef = useRef(false);

  const canUse = canShowAiAssistant(hasPermission) && isAiPlatformEnabled(capabilities);
  const orgAvailable = isAiAssistantAvailable(capabilities);
  const orgEnabled = isAiAssistantEnabledForOrg(capabilities);

  const accessCtx = useMemo(
    () =>
      buildAccessContext({
        user,
        organization,
        capabilities,
        requireTillFloat: resolveTillFloatNavFlag(capabilities),
        isSuperAdmin,
      }),
    [capabilities, isSuperAdmin, organization, user],
  );

  useEffect(() => {
    if (!openingWorkspaceId) return;
    if (pathBelongsToWorkspace(pathname, openingWorkspaceId)) {
      setOpeningWorkspaceId(null);
    }
  }, [pathname, openingWorkspaceId]);

  useEffect(() => {
    if (!openingWorkspaceId) return;
    const timeout = window.setTimeout(() => setOpeningWorkspaceId(null), 12_000);
    return () => window.clearTimeout(timeout);
  }, [openingWorkspaceId]);

  const navigateFromAi = useCallback(
    async (href) => {
      if (!href) return;
      closePanel(setOpen, setExpanded);
      try {
        await openAppPathAcrossWorkspaces({
          href,
          currentPathname: pathname,
          userId: user?.id,
          organizationId: organization?.id,
          capabilities,
          ctx: accessCtx,
          currentWorkspaceId: workspaceId,
          switchWorkspace,
          router,
          onSwitchStart: (targetId) => setOpeningWorkspaceId(targetId),
        });
      } catch (err) {
        setOpeningWorkspaceId(null);
        notifyError(err instanceof Error ? err.message : "Could not open that screen.");
      }
    },
    [
      accessCtx,
      capabilities,
      organization?.id,
      pathname,
      router,
      switchWorkspace,
      user?.id,
      workspaceId,
    ],
  );

  useEffect(() => {
    if (!canUse) return;
    apiRequest("/ai/status")
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }));
  }, [canUse]);

  useEffect(() => {
    setVoiceSupported(canUseBrowserSpeechRecognition() || isSpeechRecognitionSupported());
    setTtsSupported(isSpeechSynthesisSupported());
    setTtsEnabled(getAiTtsPref());
  }, []);

  useEffect(() => {
    if (!open) {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      setListening(false);
      setSpeaking(false);
      voiceAskedRef.current = false;
      stopAssistantSpeech();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
      stopAssistantSpeech();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, pendingAction, formSpec, actionResult, listening, speaking]);

  const clearActionState = useCallback(() => {
    setPendingAction(null);
    setFormSpec(null);
    setFormValues({});
  }, []);

  const speakReplyIfNeeded = useCallback(
    (content) => {
      if (!content) return;
      // Mic questions always get a short spoken answer. Speaker toggle does the same for typed asks.
      // Never narrate the full markdown already shown in chat.
      const fromMic = voiceAskedRef.current;
      if (!fromMic && !ttsEnabled) {
        voiceAskedRef.current = false;
        return;
      }
      const brief = spokenBriefForSpeech(content);
      if (!brief) {
        voiceAskedRef.current = false;
        return;
      }
      const key = brief.slice(0, 80);
      if (lastSpokenRef.current === key) {
        voiceAskedRef.current = false;
        return;
      }
      lastSpokenRef.current = key;
      setSpeaking(true);
      void speakAssistantText(brief).finally(() => {
        setSpeaking(false);
        voiceAskedRef.current = false;
      });
    },
    [ttsEnabled],
  );

  const applyChatResponse = useCallback(
    (res, { skipAssistantAppend = false } = {}) => {
      if (res.conversation_id) {
        setConversationId(res.conversation_id);
      }

      const content = res.message || res.reply || "";
      if (res.success === false && content) {
        setError(content);
        voiceAskedRef.current = false;
        return;
      }

      if (content && !skipAssistantAppend) {
        setMessages((prev) => [...prev, { role: "assistant", content }]);
      }

      if (content) {
        speakReplyIfNeeded(content);
      } else {
        voiceAskedRef.current = false;
      }

      if (Object.prototype.hasOwnProperty.call(res, "pending_action")) {
        setPendingAction(res.pending_action || null);
      } else if (res.action_result || res.declined_off_topic) {
        setPendingAction(null);
      }

      if (res.form_spec?.fields?.length) {
        setFormSpec(res.form_spec);
        setFormValues((prev) => ({
          ...buildInitialFormValues(res.form_spec),
          ...prev,
          ...(res.pending_action?.params ?? {}),
        }));
      } else {
        setFormSpec(null);
        if (!res.pending_action) {
          setFormValues({});
        }
      }

      if (res.action_result?.result) {
        setActionResult({
          ...res.action_result.result,
          document_links:
            res.action_result.result.document_links ?? res.document_links ?? [],
        });
        clearActionState();
      } else if (Array.isArray(res.document_links) && res.document_links.length > 0) {
        setActionResult((prev) => ({
          ...(prev && typeof prev === "object" ? prev : {}),
          document_links: res.document_links,
          path: prev?.path ?? res.document_links.find((l) => l.path)?.path,
        }));
      }
      if (res.declined_off_topic) {
        clearActionState();
      }
    },
    [clearActionState, speakReplyIfNeeded],
  );

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setLastFailedMessage(null);
    setActionResult(null);
    lastSpokenRef.current = "";
    voiceAskedRef.current = false;
    stopAssistantSpeech();
    clearActionState();
  }, [clearActionState]);

  const stopVoiceInput = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (loading || speaking) return;
    if (!canUseBrowserSpeechRecognition()) {
      if (!window.isSecureContext) {
        notifyError(speechErrorMessage("insecure-context"));
      } else {
        notifyError(
          "Voice needs Chrome or Edge in a normal browser tab (not an in-app preview). You can still type your question.",
        );
      }
      return;
    }

    const micOk = await ensureMicrophoneAccess();
    if (!micOk) {
      notifyError("Microphone permission denied. Allow mic access for this site.");
      return;
    }

    stopAssistantSpeech();
    setSpeaking(false);
    voiceFinalRef.current = "";
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    await new Promise((r) => window.setTimeout(r, 250));

    const retryLangs = ["en-US", "en-GB", preferredSpeechLang()];
    const lang = retryLangs[Math.min(speechRetryRef.current, retryLangs.length - 1)] || "en-US";

    const recognizer = createSpeechRecognizer({
      lang,
      onInterim: (text) => setInput(text),
      onFinal: (text) => {
        voiceFinalRef.current = [voiceFinalRef.current, text].filter(Boolean).join(" ").trim();
        setInput(voiceFinalRef.current);
        speechRetryRef.current = 0;
      },
      onError: ({ code, message }) => {
        setListening(false);
        recognizerRef.current = null;
        if (isRetryableSpeechError(code) && speechRetryRef.current < 3) {
          speechRetryRef.current += 1;
          window.setTimeout(() => startListeningRef.current?.(), 800);
          return;
        }
        notifyError(message);
        speechRetryRef.current = 0;
        voiceAskedRef.current = false;
      },
      onEnd: () => {
        setListening(false);
        recognizerRef.current = null;
        const spoken = voiceFinalRef.current.trim();
        voiceFinalRef.current = "";
        if (spoken) {
          speechRetryRef.current = 0;
          voiceAskedRef.current = true;
          void sendRef.current?.(spoken);
        } else {
          voiceAskedRef.current = false;
        }
      },
    });
    if (!recognizer) {
      notifyError("Voice is not supported in this browser.");
      return;
    }
    recognizerRef.current = recognizer;
    setListening(true);
    setOpen(true);
    recognizer.start();
  }, [loading, speaking]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      setAiTtsPref(next);
      if (!next) {
        stopAssistantSpeech();
        setSpeaking(false);
      }
      return next;
    });
  }, []);

  const sendFeedback = useCallback(
    async (messageIndex, rating) => {
      const assistant = messages[messageIndex];
      if (!assistant || assistant.role !== "assistant" || assistant.feedback) return;
      let userPreview = "";
      for (let j = messageIndex - 1; j >= 0; j -= 1) {
        if (messages[j]?.role === "user") {
          userPreview = messages[j].content;
          break;
        }
      }
      try {
        await apiRequest("/ai/feedback", {
          method: "POST",
          body: {
            rating,
            conversation_id: conversationId || undefined,
            workspace_id: workspaceId || undefined,
            pathname: pathname || undefined,
            user_message_preview: userPreview.slice(0, 2000) || undefined,
            assistant_message_preview: String(assistant.content ?? "").slice(0, 4000) || undefined,
          },
        });
        setMessages((prev) => {
          const next = [...prev];
          next[messageIndex] = { ...next[messageIndex], feedback: rating };
          return next;
        });
        notifySuccess(rating === "up" ? "Thanks — marked helpful." : "Thanks — we’ll use that to improve.");
      } catch (err) {
        notifyError(err instanceof Error ? err.message : "Could not save feedback.");
      }
    },
    [conversationId, messages, pathname, workspaceId],
  );

  const send = useCallback(
    async (
      text,
      {
        confirm = false,
        formValuesOverride = null,
        pageContextOverride = null,
        entityRefsOverride = null,
      } = {},
    ) => {
      const message = text.trim();
      if (!message || loading) return;
      stopAssistantSpeech();
      stopVoiceInput();
      const refsForSend = serializeEntityRefs(entityRefsOverride ?? entityRefs);
      setError(null);
      setLastFailedMessage(null);
      setActionResult(null);
      setLoading(true);
      setStreamStatus(null);
      if (!confirm) {
        setMessages((prev) => [...prev, { role: "user", content: message }]);
      }
      setInput("");
      setEntityRefs([]);
      const normalizedConfirmText = message.replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
      const typedConfirm =
        Boolean(pendingAction) &&
        (/^(yes|yeah|yep|confirm|proceed|go ahead|do it|create it|ok|okay)\b/i.test(
          normalizedConfirmText,
        ) ||
          /^(?:please\s+)?save(?:\s+(?:it|this|the))?(?:\s+(?:product|supplier|customer|employee|lpo|order|purchase\s+order|draft))?\s*$/i.test(
            normalizedConfirmText,
          ));
      const effectiveConfirm = confirm || typedConfirm;
      try {
        const history = messages.slice(-6);
        const effectivePageContext =
          pageContextOverride ??
          pageContext ??
          buildPageContext({ pathname, screenKey: workspaceId });
        const mergedFormValues = formValuesOverride ?? formValues;
        const requestBody = {
          context: "erp",
          workspace_id: workspaceId,
          pathname,
          page_context: Object.keys(effectivePageContext).length ? effectivePageContext : undefined,
          message,
          conversation_id: conversationId || undefined,
          history,
          entity_refs: refsForSend.length ? refsForSend : undefined,
          // Keep create/write drafts across turns so "confirm" can POST (e.g. create_lpo).
          pending_action: pendingAction || undefined,
          form_values:
            Object.keys(mergedFormValues || {}).length > 0 ? mergedFormValues : undefined,
          confirm_action: effectiveConfirm || undefined,
        };

        const useStream =
          !effectiveConfirm &&
          !pendingAction &&
          status?.supports_streaming !== false;

        if (useStream) {
          let accumulated = "";
          setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

          const done = await aiChatStream(requestBody, {
            onEvent: (event) => {
              if (event.event === "status" && event.message) {
                setStreamStatus(event.message);
              }
              if (event.event === "delta" && event.content) {
                accumulated += event.content;
                setStreamStatus(null);
                setMessages((prev) => {
                  if (prev.length === 0) return prev;
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") {
                    next[next.length - 1] = {
                      ...last,
                      content: accumulated,
                      streaming: true,
                    };
                  }
                  return next;
                });
              }
            },
          });

          setStreamStatus(null);
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                role: "assistant",
                content: done?.reply || done?.message || accumulated || last.content,
              };
            }
            return next;
          });
          if (done) {
            applyChatResponse(done, { skipAssistantAppend: true });
          }
          return;
        }

        const res = await apiRequest("/ai/chat", {
          method: "POST",
          body: requestBody,
        });
        applyChatResponse(res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "AI request failed";
        setError(msg);
        setLastFailedMessage(confirm || effectiveConfirm ? null : message);
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      messages,
      pendingAction,
      formValues,
      applyChatResponse,
      clearActionState,
      workspaceId,
      pathname,
      conversationId,
      pageContext,
      entityRefs,
      status?.supports_streaming,
      stopVoiceInput,
    ],
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    if (!canUse) return undefined;
    return subscribeAiAssistRequests((request) => {
      setExpanded(false);
      setOpen(true);

      if (request.pageContext) {
        setPageContext(request.pageContext);
      }

      if (request.startVoice) {
        speechRetryRef.current = 0;
        window.setTimeout(() => startListeningRef.current?.(), 50);
        return;
      }

      const message = request.message?.trim() ?? "";
      if (!message) return;

      if (request.autoSend !== false) {
        void sendRef.current?.(message, { pageContextOverride: request.pageContext ?? null });
        return;
      }

      setInput(message);
    });
  }, [canUse]);

  useEffect(() => {
    if (!canUse) return undefined;

    function onKeyDown(e) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      if (pathname === "/sales/pos") return;
      const tag = e.target?.tagName?.toLowerCase?.();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) {
        // Still allow Cmd+K from search boxes to open assistant when Shift is held.
        if (!e.shiftKey) return;
      }
      e.preventDefault();
      setExpanded(false);
      setOpen(true);
      setPageContext(buildPageContext({ pathname, screenKey: workspaceId }));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUse, pathname, workspaceId]);

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
        ? "Finish AI setup under Admin → Settings → AI (choose platform AI or add your API key)."
        : "AI is not enabled for this organization — contact your platform administrator.";

  return (
    <>
      {openingWorkspaceId ? <WorkspaceOpeningScreen message="Opening" /> : null}

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
                ? "h-[min(92vh,920px)] w-full max-w-4xl rounded-xl"
                : "h-full w-full max-w-xl"
            }`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0 pr-3">
                <h2 className="font-semibold text-slate-900">{title}</h2>
                <p className="text-xs text-slate-500">
                  {listening
                    ? "Listening — ask your question"
                    : speaking
                      ? "Speaking a short answer…"
                      : statusHint}
                  {canUse && !listening && !speaking ? " · ⌘K / Ctrl+K opens assistant" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {ttsSupported ? (
                  <button
                    type="button"
                    onClick={toggleTts}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
                      ttsEnabled
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                    aria-pressed={ttsEnabled}
                    aria-label={ttsEnabled ? "Turn off short spoken answers for typed questions" : "Speak short answers for typed questions"}
                    title={
                      ttsEnabled
                        ? "Short spoken answers for typed questions: on"
                        : "Short spoken answers for typed questions: off (mic always speaks)"
                    }
                  >
                    <SpeakerIcon className="h-5 w-5" />
                  </button>
                ) : null}
                {messages.length > 0 ? (
                  <button
                    type="button"
                    onClick={startNewConversation}
                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                    title="Start a new conversation"
                  >
                    New chat
                  </button>
                ) : null}
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
                    Ask anything about <span className="font-medium text-slate-800">{workspaceLabel}</span>.
                    Not sure what to say? Send <span className="font-medium text-slate-800">Help</span> for a
                    full list
                    {voiceSupported ? ", or use the mic beside header search." : "."}
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
                  className={`rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? `whitespace-pre-wrap ${
                          expanded
                            ? "ml-16 bg-indigo-50 text-indigo-900"
                            : "ml-8 bg-indigo-50 text-indigo-900"
                        }`
                      : expanded
                        ? "mr-16 bg-slate-100 text-slate-800"
                        : "mr-4 bg-slate-100 text-slate-800"
                  }`}
                >
                  <AiMessageContent
                    content={m.content}
                    showCharts={showChartsForMessage(messages, i)}
                    preferredChartType={preferredChartTypeForMessage(messages, i)}
                    onNavigate={(_event, href) => void navigateFromAi(href)}
                  />
                  {m.role === "assistant" && m.content && !m.streaming ? (
                    <div className="mt-2 flex items-center gap-1 border-t border-slate-200/80 pt-1.5">
                      <span className="mr-1 text-[11px] text-slate-500">Helpful?</span>
                      <button
                        type="button"
                        disabled={Boolean(m.feedback)}
                        onClick={() => void sendFeedback(i, "up")}
                        className={`rounded p-1 ${
                          m.feedback === "up"
                            ? "text-emerald-600"
                            : "text-slate-400 hover:bg-white hover:text-emerald-600"
                        } disabled:opacity-60`}
                        aria-label="Mark helpful"
                        title="Helpful"
                      >
                        <ThumbUpIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(m.feedback)}
                        onClick={() => void sendFeedback(i, "down")}
                        className={`rounded p-1 ${
                          m.feedback === "down"
                            ? "text-amber-600"
                            : "text-slate-400 hover:bg-white hover:text-amber-600"
                        } disabled:opacity-60`}
                        aria-label="Mark not helpful"
                        title="Not helpful"
                      >
                        <ThumbDownIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}

              {formSpec?.fields?.length && isWritePendingAction(pendingAction) ? (
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
              ) : null}

              {isWritePendingAction(pendingAction) &&
              !formSpec?.fields?.length &&
              pendingAction?.ready_to_confirm ? (
                <div
                  className={`rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm ${
                    expanded ? "mx-8" : "mr-4"
                  }`}
                >
                  <p className="font-medium text-indigo-900">
                    {pendingAction?.summary || "Ready to create"}
                  </p>
                  <p className="mt-1 text-xs text-indigo-800">
                    Details look complete. Reply <span className="font-semibold">confirm</span> in
                    chat, or use the buttons below to save.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={submitForm}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Confirm & save
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={clearActionState}
                      className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {actionResult?.path ||
              actionResult?.href ||
              (Array.isArray(actionResult?.document_links) &&
                actionResult.document_links.length > 0) ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <p className="font-medium text-emerald-900">
                    {actionResult.navigate
                      ? "Ready to open"
                      : actionResult?.document_links?.length && !actionResult?.lpo_no
                        ? "Documents"
                        : "Done"}
                  </p>
                  {actionResult?.note ? (
                    <p className="mt-1 text-xs text-emerald-800">{actionResult.note}</p>
                  ) : null}
                  {actionResult.path || actionResult.href ? (
                    <Link
                      href={actionResult.path || actionResult.href}
                      className="mt-1 inline-block text-emerald-700 underline"
                      onClick={(event) => {
                        event.preventDefault();
                        void navigateFromAi(actionResult.path || actionResult.href);
                      }}
                    >
                      {actionResult.path || actionResult.href}
                    </Link>
                  ) : null}
                  {Array.isArray(actionResult.document_links) &&
                  actionResult.document_links.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {actionResult.document_links.map((link) => {
                        const key = `${link.kind || "link"}-${link.path || link.api_path || link.label}`;
                        if (link.download && link.api_path) {
                          return (
                            <button
                              key={key}
                              type="button"
                              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                              onClick={() => {
                                void downloadDocumentLink(link).catch((err) => {
                                  notifyError(
                                    err instanceof Error ? err.message : "Could not download PDF",
                                  );
                                });
                              }}
                            >
                              {link.label || "Download PDF"}
                            </button>
                          );
                        }
                        if (link.path) {
                          return (
                            <button
                              key={key}
                              type="button"
                              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                              onClick={() => void navigateFromAi(link.path)}
                            >
                              {link.label || link.path}
                            </button>
                          );
                        }
                        return null;
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {loading ? (
                <p className="text-center text-xs text-slate-500">
                  {streamStatus || "Thinking…"}
                </p>
              ) : null}
              {error ? (
                <div className="space-y-1 text-center">
                  <p className="text-xs text-red-600">{error}</p>
                  {lastFailedMessage ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => send(lastFailedMessage)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <form
              className="border-t border-slate-200 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (listening || speaking) return;
                voiceAskedRef.current = false;
                send(input, { entityRefsOverride: entityRefs });
              }}
            >
              {listening || speaking ? (
                <div
                  className="flex min-h-[96px] flex-col justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        speaking ? "bg-indigo-600 text-white" : "bg-red-500 text-white animate-pulse"
                      }`}
                    >
                      <MicIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-indigo-950">
                        {speaking ? "Answering…" : "Listening…"}
                      </p>
                      <p className="mt-0.5 text-xs text-indigo-800/80">
                        {speaking
                          ? "Short spoken answer — full reply stays in chat"
                          : "Ask your question, then pause"}
                      </p>
                      {listening && input.trim() ? (
                        <p className="mt-2 line-clamp-3 text-sm text-indigo-950/90">“{input.trim()}”</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        stopVoiceInput();
                        stopAssistantSpeech();
                        setSpeaking(false);
                        voiceAskedRef.current = false;
                      }}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-indigo-900 shadow-sm ring-1 ring-indigo-200 hover:bg-indigo-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="min-w-0">
                  <EntityMentionTextarea
                    rows={expanded ? 5 : 4}
                    value={input}
                    entityRefs={entityRefs}
                    disabled={loading}
                    placeholder="Ask anything… Type Help for ideas · @ for products, suppliers, customers"
                    textareaClassName="min-h-[96px] w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-base leading-relaxed text-slate-900 placeholder:text-slate-400"
                    onChange={({ text, entityRefs: nextRefs }) => {
                      setInput(text);
                      setEntityRefs(nextRefs);
                    }}
                    onSubmit={({ text, entityRefs: nextRefs }) => {
                      voiceAskedRef.current = false;
                      send(text, { entityRefsOverride: nextRefs });
                    }}
                  />
                </div>
              )}

              {!(listening || speaking) ? (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="min-w-[100px] rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Send
                  </button>
                  <p className="text-xs text-slate-500">
                    Enter to send
                    {voiceSupported ? " · mic beside header search to ask by voice" : ""}
                  </p>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
