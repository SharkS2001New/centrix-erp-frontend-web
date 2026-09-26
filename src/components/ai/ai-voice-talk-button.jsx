"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiRequestMultipart } from "@/lib/api";
import { buildPageContext, requestAiAssist, subscribeAiVoiceComplete } from "@/lib/ai-assist-bridge";
import { notifyError } from "@/lib/notify";
import { useAuth } from "@/contexts/auth-context";
import { canUseAiTalk } from "@/lib/ai-settings";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { defaultWorkspaceId } from "@/lib/workspace-navigation";
import {
  canUseBrowserSpeechRecognition,
  canUseMediaRecorderVoice,
  canUseVoiceInput,
  createSpeechRecognizer,
  createVoiceRecorder,
  speechErrorMessage,
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
 * Header voice: listen → put the question into Centrix Assistant → wait for the short spoken reply.
 */
export function AiVoiceTalkButton() {
  const pathname = usePathname();
  const { capabilities, hasPermission } = useAuth();
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | listening | waiting
  const [heard, setHeard] = useState("");
  const [level, setLevel] = useState(0);

  const orgAiEnabled = canUseAiTalk({ capabilities, hasPermission });
  const recognizerRef = useRef(null);
  const recorderRef = useRef(null);
  const voiceFinalRef = useRef("");
  const cancelledRef = useRef(false);
  const pauseTimerRef = useRef(0);
  const handedOffRef = useRef(false);
  const finishRecordRef = useRef(null);

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
    handedOffRef.current = false;
    clearPauseTimer();
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
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
      stopAssistantSpeech();
    };
  }, [clearPauseTimer]);

  useEffect(() => {
    return subscribeAiVoiceComplete(() => {
      if (cancelledRef.current) return;
      setPhase("idle");
      setHeard("");
      setLevel(0);
      handedOffRef.current = false;
    });
  }, []);

  const handOffToAssistant = useCallback(
    (question) => {
      const q = String(question ?? "").trim();
      if (!q || cancelledRef.current || handedOffRef.current) return;
      handedOffRef.current = true;
      clearPauseTimer();
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      recorderRef.current?.cancel();
      recorderRef.current = null;

      const workspaceId = getStoredWorkspace() ?? defaultWorkspaceId(capabilities, {});
      setPhase("waiting");
      setHeard(q);
      setLevel(0);

      requestAiAssist({
        message: q,
        autoSend: true,
        fromVoice: true,
        pageContext: buildPageContext({
          pathname,
          screenKey: workspaceId,
          voiceMode: true,
        }),
      });
    },
    [capabilities, clearPauseTimer, pathname],
  );

  const scheduleHandOff = useCallback(
    (delayMs = 900) => {
      clearPauseTimer();
      pauseTimerRef.current = window.setTimeout(() => {
        const spoken = voiceFinalRef.current.trim();
        if (spoken) {
          voiceFinalRef.current = "";
          handOffToAssistant(spoken);
        }
      }, delayMs);
    },
    [clearPauseTimer, handOffToAssistant],
  );

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder || handedOffRef.current) return;

    setPhase("waiting");
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

      handOffToAssistant(text);
    } catch (err) {
      if (cancelledRef.current) return;
      notifyError(err instanceof Error ? err.message : "Could not understand your voice.");
      setPhase("idle");
      setHeard("");
      handedOffRef.current = false;
    }
  }, [handOffToAssistant]);

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
    handedOffRef.current = false;
    clearPauseTimer();
    stopAssistantSpeech();
    voiceFinalRef.current = "";
    setHeard("");
    setLevel(0);

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
          setHeard(() => {
            const base = voiceFinalRef.current.trim();
            return [base, text].filter(Boolean).join(" ").trim();
          });
          setLevel(0.35);
          clearPauseTimer();
        },
        onFinal: (text) => {
          if (cancelledRef.current) return;
          voiceFinalRef.current = [voiceFinalRef.current, text].filter(Boolean).join(" ").trim();
          setHeard(voiceFinalRef.current);
          setLevel(0.2);
          scheduleHandOff(1000);
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
  }, [clearPauseTimer, scheduleHandOff, startRecordingFallback]);

  const onClick = useCallback(() => {
    if (phase !== "idle") {
      reset();
      return;
    }
    void startListening();
  }, [phase, reset, startListening]);

  if (!orgAiEnabled || !voiceSupported) return null;

  const busy = phase !== "idle";
  const buttonLabel =
    phase === "listening" ? "Listening…" : phase === "waiting" ? "Waiting…" : "Talk To AI Assistant";
  const buttonLabelShort =
    phase === "listening" ? "Listening…" : phase === "waiting" ? "Waiting…" : "Talk To AI";

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        data-phase={phase === "waiting" ? "thinking" : phase}
        className="app-topbar-ai-talk-btn"
        aria-label={busy ? "Stop voice assistant" : "Talk To AI Assistant"}
        title={busy ? "Stop" : "Talk To AI Assistant — ask; answer appears in the assistant"}
        aria-pressed={busy}
      >
        <MicIcon className={`h-4 w-4 ${phase === "listening" ? "animate-pulse" : ""}`} />
        <span className="max-sm:hidden">{buttonLabel}</span>
        <span className="sm:hidden">{buttonLabelShort}</span>
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
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {phase === "listening" ? "Listening…" : "Waiting for answer…"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {phase === "listening"
                  ? "Ask your question — I’ll send it to the assistant when you pause"
                  : "Your question is in Centrix Assistant"}
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
