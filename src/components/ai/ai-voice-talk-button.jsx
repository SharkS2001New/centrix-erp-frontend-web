"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { defaultWorkspaceId } from "@/lib/workspace-navigation";
import { buildPageContext } from "@/lib/ai-assist-bridge";
import { notifyError } from "@/lib/notify";
import { useAuth } from "@/contexts/auth-context";
import {
  canUseBrowserSpeechRecognition,
  createSpeechRecognizer,
  ensureMicrophoneAccess,
  isRetryableSpeechError,
  preferredSpeechLang,
  speakAssistantText,
  speechErrorMessage,
  spokenBriefForSpeech,
  stopAssistantSpeech,
} from "@/lib/ai-voice";

function MicIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
      />
    </svg>
  );
}

/**
 * Header control: ask by voice and hear a short answer — does not open the assistant sidebar.
 */
export function AiVoiceTalkButton() {
  const pathname = usePathname();
  const { capabilities } = useAuth();
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");

  const recognizerRef = useRef(null);
  const voiceFinalRef = useRef("");
  const speechRetryRef = useRef(0);
  const startListeningRef = useRef(null);
  const abortRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    setVoiceSupported(canUseBrowserSpeechRecognition());
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      recognizerRef.current?.stop();
      abortRef.current?.abort();
      stopAssistantSpeech();
    };
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    stopAssistantSpeech();
    voiceFinalRef.current = "";
    speechRetryRef.current = 0;
    setHeard("");
    setPhase("idle");
  }, []);

  const askAndSpeak = useCallback(
    async (question) => {
      if (!question || cancelledRef.current) return;
      setPhase("thinking");
      setHeard(question);

      const workspaceId = getStoredWorkspace() ?? defaultWorkspaceId(capabilities, {});
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await apiRequest("/ai/chat", {
          method: "POST",
          signal: controller.signal,
          body: {
            context: "erp",
            workspace_id: workspaceId,
            pathname,
            page_context: buildPageContext({ pathname, screenKey: workspaceId }),
            message: question,
            history: [],
          },
        });

        if (cancelledRef.current) return;

        const content = res?.message || res?.reply || "";
        if (res?.success === false && content) {
          notifyError(content);
          setPhase("idle");
          setHeard("");
          return;
        }

        const brief = spokenBriefForSpeech(content);
        if (!brief) {
          notifyError("No spoken answer came back — try typing in the assistant.");
          setPhase("idle");
          setHeard("");
          return;
        }

        setPhase("speaking");
        await speakAssistantText(brief);
        if (!cancelledRef.current) {
          setPhase("idle");
          setHeard("");
        }
      } catch (err) {
        if (cancelledRef.current || err?.name === "AbortError") return;
        notifyError(err instanceof Error ? err.message : "Could not get an answer.");
        setPhase("idle");
        setHeard("");
      } finally {
        abortRef.current = null;
      }
    },
    [capabilities, pathname],
  );

  const startListening = useCallback(async () => {
    cancelledRef.current = false;

    if (!canUseBrowserSpeechRecognition()) {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        notifyError(speechErrorMessage("insecure-context"));
      } else {
        notifyError(
          "Voice needs Chrome or Edge in a normal browser tab (not an in-app preview). You can still type in the assistant.",
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
    voiceFinalRef.current = "";
    setHeard("");
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    await new Promise((r) => window.setTimeout(r, 250));
    if (cancelledRef.current) return;

    const retryLangs = ["en-US", "en-GB", preferredSpeechLang()];
    const lang = retryLangs[Math.min(speechRetryRef.current, retryLangs.length - 1)] || "en-US";

    const recognizer = createSpeechRecognizer({
      lang,
      onInterim: (text) => setHeard(text),
      onFinal: (text) => {
        voiceFinalRef.current = [voiceFinalRef.current, text].filter(Boolean).join(" ").trim();
        setHeard(voiceFinalRef.current);
        speechRetryRef.current = 0;
      },
      onError: ({ code, message }) => {
        setPhase("idle");
        recognizerRef.current = null;
        if (isRetryableSpeechError(code) && speechRetryRef.current < 3) {
          speechRetryRef.current += 1;
          window.setTimeout(() => startListeningRef.current?.(), 800);
          return;
        }
        notifyError(message);
        speechRetryRef.current = 0;
        setHeard("");
      },
      onEnd: () => {
        recognizerRef.current = null;
        const spoken = voiceFinalRef.current.trim();
        voiceFinalRef.current = "";
        if (spoken) {
          speechRetryRef.current = 0;
          void askAndSpeak(spoken);
        } else if (!cancelledRef.current) {
          setPhase("idle");
          setHeard("");
        }
      },
    });

    if (!recognizer) {
      notifyError("Voice is not supported in this browser.");
      return;
    }

    recognizerRef.current = recognizer;
    setPhase("listening");
    recognizer.start();
  }, [askAndSpeak]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const onClick = useCallback(() => {
    if (phase !== "idle") {
      reset();
      return;
    }
    speechRetryRef.current = 0;
    void startListening();
  }, [phase, reset, startListening]);

  if (!voiceSupported) return null;

  const busy = phase !== "idle";
  const statusLabel =
    phase === "listening"
      ? "Listening…"
      : phase === "thinking"
        ? "Checking…"
        : phase === "speaking"
          ? "Answering…"
          : null;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`app-topbar-icon-btn inline-flex shrink-0 items-center gap-1.5 px-2.5 text-sm font-medium whitespace-nowrap ${
          busy ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200" : ""
        }`}
        aria-label="Talk To AI Assistant"
        title="Talk To AI Assistant — ask and hear a short answer"
        aria-pressed={busy}
      >
        <MicIcon className={`h-4 w-4 shrink-0 ${phase === "listening" ? "animate-pulse" : ""}`} />
        <span className="max-sm:hidden">Talk To AI Assistant</span>
        <span className="sm:hidden">Talk To AI</span>
      </button>

      {busy ? (
        <div
          className="fixed inset-x-0 top-[78px] z-[60] flex justify-center px-3 pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-indigo-200 bg-white px-4 py-3 shadow-lg dark:border-indigo-800 dark:bg-slate-900">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                phase === "listening" ? "bg-red-500 text-white animate-pulse" : "bg-indigo-600 text-white"
              }`}
            >
              <MicIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{statusLabel}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {phase === "listening"
                  ? "Ask your question, then pause"
                  : phase === "thinking"
                    ? "Looking up your answer"
                    : "Short spoken answer — sidebar stays closed"}
              </p>
              {heard.trim() ? (
                <p className="mt-2 line-clamp-2 text-sm text-slate-800 dark:text-slate-200">“{heard.trim()}”</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={reset}
              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
