"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiRequest, apiRequestMultipart } from "@/lib/api";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { defaultWorkspaceId } from "@/lib/workspace-navigation";
import { buildPageContext } from "@/lib/ai-assist-bridge";
import { notifyError } from "@/lib/notify";
import { useAuth } from "@/contexts/auth-context";
import {
  canUseBrowserSpeechRecognition,
  canUseMediaRecorderVoice,
  canUseVoiceInput,
  createSpeechRecognizer,
  createVoiceRecorder,
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
 * Conversational voice: listen → show live words → answer when you pause.
 * Sidebar stays closed.
 */
export function AiVoiceTalkButton() {
  const pathname = usePathname();
  const { capabilities } = useAuth();
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");
  const [level, setLevel] = useState(0);

  const recognizerRef = useRef(null);
  const recorderRef = useRef(null);
  const voiceFinalRef = useRef("");
  const abortRef = useRef(null);
  const cancelledRef = useRef(false);
  const pauseTimerRef = useRef(0);
  const askingRef = useRef(false);
  const finishRecordRef = useRef(null);
  const startListenRef = useRef(null);

  useEffect(() => {
    setVoiceSupported(canUseVoiceInput());
  }, []);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = 0;
    }
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    askingRef.current = false;
    clearPauseTimer();
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    stopAssistantSpeech();
    voiceFinalRef.current = "";
    setHeard("");
    setLevel(0);
    setPhase("idle");
  }, [clearPauseTimer]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearPauseTimer();
      recognizerRef.current?.stop();
      recorderRef.current?.cancel();
      abortRef.current?.abort();
      stopAssistantSpeech();
    };
  }, [clearPauseTimer]);

  const askAndSpeak = useCallback(
    async (question) => {
      const q = String(question ?? "").trim();
      if (!q || cancelledRef.current || askingRef.current) return;
      askingRef.current = true;
      clearPauseTimer();
      recognizerRef.current?.stop();
      recognizerRef.current = null;

      setPhase("thinking");
      setHeard(q);
      setLevel(0);

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
            message: q,
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
        askingRef.current = false;
      }
    },
    [capabilities, clearPauseTimer, pathname],
  );

  const scheduleAskFromSpeech = useCallback(
    (delayMs = 900) => {
      clearPauseTimer();
      pauseTimerRef.current = window.setTimeout(() => {
        const spoken = voiceFinalRef.current.trim();
        if (spoken) {
          voiceFinalRef.current = "";
          void askAndSpeak(spoken);
        }
      }, delayMs);
    },
    [askAndSpeak, clearPauseTimer],
  );

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder || askingRef.current) return;

    setPhase("thinking");
    setHeard((prev) => prev || "Understanding…");
    setLevel(0);

    try {
      const blob = await recorder.stop();
      if (cancelledRef.current) return;
      if (!blob || blob.size < 200) {
        notifyError("Didn’t catch that — tap Talk and ask again.");
        setPhase("idle");
        setHeard("");
        return;
      }

      const file = new File([blob], "voice.webm", { type: blob.type || "audio/webm" });
      const res = await apiRequestMultipart("/ai/transcribe", { audio: file });
      if (cancelledRef.current) return;

      const text = String(res?.text ?? "").trim();
      if (!text) {
        notifyError("Didn’t catch that — tap Talk and ask again.");
        setPhase("idle");
        setHeard("");
        return;
      }

      await askAndSpeak(text);
    } catch (err) {
      if (cancelledRef.current) return;
      notifyError(err instanceof Error ? err.message : "Could not understand your voice.");
      setPhase("idle");
      setHeard("");
    }
  }, [askAndSpeak]);

  useEffect(() => {
    finishRecordRef.current = finishRecording;
  }, [finishRecording]);

  const startRecordingFallback = useCallback(async () => {
    if (!canUseMediaRecorderVoice()) {
      notifyError("Voice needs Chrome or Edge with microphone access.");
      return;
    }

    recognizerRef.current?.stop();
    recognizerRef.current = null;
    stopAssistantSpeech();
    setHeard("");
    setLevel(0);

    const recorder = await createVoiceRecorder({
      silenceMs: 1300,
      maxMs: 18000,
      onLevel: (rms) => {
        if (!cancelledRef.current) setLevel(Math.min(1, rms * 4));
      },
      onAutoStop: () => {
        void finishRecordRef.current?.();
      },
    });
    if (!recorder) {
      notifyError("Microphone permission denied. Allow mic access for this site.");
      return;
    }

    recorderRef.current = recorder;
    setPhase("listening");
    setHeard("");
    try {
      await recorder.start();
    } catch {
      recorder.cancel();
      recorderRef.current = null;
      notifyError("Could not start the microphone.");
      setPhase("idle");
    }
  }, []);

  const startListening = useCallback(async () => {
    cancelledRef.current = false;
    askingRef.current = false;
    clearPauseTimer();
    stopAssistantSpeech();
    voiceFinalRef.current = "";
    setHeard("");
    setLevel(0);

    // Conversational path: live browser speech (words appear as you talk; answers on pause).
    if (canUseBrowserSpeechRecognition()) {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      await new Promise((r) => window.setTimeout(r, 80));
      if (cancelledRef.current) return;

      const recognizer = createSpeechRecognizer({
        lang: "en-US",
        continuous: true,
        onInterim: (text) => {
          if (cancelledRef.current) return;
          setHeard((prev) => {
            const base = voiceFinalRef.current.trim();
            const next = [base, text].filter(Boolean).join(" ").trim();
            return next || prev;
          });
          setLevel(0.35);
          clearPauseTimer();
        },
        onFinal: (text) => {
          if (cancelledRef.current) return;
          voiceFinalRef.current = [voiceFinalRef.current, text].filter(Boolean).join(" ").trim();
          setHeard(voiceFinalRef.current);
          setLevel(0.2);
          // Pause after a finished phrase → ask automatically (no Done button).
          scheduleAskFromSpeech(1000);
        },
        onError: ({ code }) => {
          recognizerRef.current = null;
          clearPauseTimer();
          if (code === "not-allowed" || code === "audio-capture") {
            notifyError(speechErrorMessage(code));
            setPhase("idle");
            setHeard("");
            return;
          }
          // Google speech often fails with "network" — seamless mic fallback (still auto-answers).
          if (canUseMediaRecorderVoice()) {
            void startRecordingFallback();
            return;
          }
          notifyError(speechErrorMessage(code));
          setPhase("idle");
          setHeard("");
        },
        onEnd: () => {
          recognizerRef.current = null;
          // continuous:true restarts until we stop after scheduling ask, or user cancels.
        },
      });

      if (recognizer) {
        recognizerRef.current = recognizer;
        setPhase("listening");
        recognizer.start();
        return;
      }
    }

    await startRecordingFallback();
  }, [clearPauseTimer, scheduleAskFromSpeech, startRecordingFallback]);

  useEffect(() => {
    startListenRef.current = startListening;
  }, [startListening]);

  const onClick = useCallback(() => {
    if (phase !== "idle") {
      reset();
      return;
    }
    void startListening();
  }, [phase, reset, startListening]);

  if (!voiceSupported) return null;

  const busy = phase !== "idle";
  const statusLabel =
    phase === "listening"
      ? "Listening…"
      : phase === "thinking"
        ? "Thinking…"
        : phase === "speaking"
          ? "Answering…"
          : null;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap shadow-sm transition ${
          phase === "listening"
            ? "bg-red-600 text-white hover:bg-red-700"
            : busy
              ? "bg-indigo-700 text-white hover:bg-indigo-800"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
        }`}
        aria-label={busy ? "Stop" : "Talk To AI Assistant"}
        title={busy ? "Stop" : "Talk To AI Assistant — ask and hear a short answer"}
        aria-pressed={busy}
      >
        <MicIcon className={`h-4 w-4 shrink-0 ${phase === "listening" ? "animate-pulse" : ""}`} />
        <span className="max-sm:hidden">{busy ? "Stop" : "Talk To AI Assistant"}</span>
        <span className="sm:hidden">{busy ? "Stop" : "Talk To AI"}</span>
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
              style={
                phase === "listening" && level > 0
                  ? { boxShadow: `0 0 0 ${4 + Math.round(level * 10)}px rgba(239, 68, 68, 0.25)` }
                  : undefined
              }
            >
              <MicIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{statusLabel}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {phase === "listening"
                  ? "Ask your question — I’ll answer when you pause"
                  : phase === "thinking"
                    ? "Looking that up"
                    : "Speaking a short answer"}
              </p>
              {heard.trim() ? (
                <p className="mt-2 line-clamp-3 text-sm text-slate-800 dark:text-slate-200">“{heard.trim()}”</p>
              ) : phase === "listening" ? (
                <p className="mt-2 text-sm italic text-slate-400">Waiting for your voice…</p>
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
