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
 * Header control: ask by voice and hear a short answer — does not open the assistant sidebar.
 * Prefers browser speech; on Chrome’s common “network” failure, records audio and transcribes via Centrix.
 */
export function AiVoiceTalkButton() {
  const pathname = usePathname();
  const { capabilities } = useAuth();
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");
  const [mode, setMode] = useState("speech"); // speech | record

  const recognizerRef = useRef(null);
  const recorderRef = useRef(null);
  const voiceFinalRef = useRef("");
  const abortRef = useRef(null);
  const cancelledRef = useRef(false);
  const startRecordRef = useRef(null);

  useEffect(() => {
    setVoiceSupported(canUseVoiceInput());
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      recognizerRef.current?.stop();
      recorderRef.current?.cancel();
      abortRef.current?.abort();
      stopAssistantSpeech();
    };
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    stopAssistantSpeech();
    voiceFinalRef.current = "";
    setHeard("");
    setMode("speech");
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
          setMode("speech");
        }
      } catch (err) {
        if (cancelledRef.current || err?.name === "AbortError") return;
        notifyError(err instanceof Error ? err.message : "Could not get an answer.");
        setPhase("idle");
        setHeard("");
        setMode("speech");
      } finally {
        abortRef.current = null;
      }
    },
    [capabilities, pathname],
  );

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) {
      setPhase("idle");
      return;
    }

    setPhase("thinking");
    setHeard("Transcribing…");

    try {
      const blob = await recorder.stop();
      if (cancelledRef.current) return;
      if (!blob || blob.size < 200) {
        notifyError("No speech was captured. Tap Talk again and speak clearly.");
        setPhase("idle");
        setHeard("");
        return;
      }

      const file = new File([blob], "voice.webm", { type: blob.type || "audio/webm" });
      const res = await apiRequestMultipart("/ai/transcribe", { audio: file });
      if (cancelledRef.current) return;

      const text = String(res?.text ?? "").trim();
      if (!text) {
        notifyError("No speech was detected. Try again.");
        setPhase("idle");
        setHeard("");
        return;
      }

      await askAndSpeak(text);
    } catch (err) {
      if (cancelledRef.current) return;
      notifyError(err instanceof Error ? err.message : "Could not transcribe your voice.");
      setPhase("idle");
      setHeard("");
      setMode("speech");
    }
  }, [askAndSpeak]);

  const startRecording = useCallback(async () => {
    cancelledRef.current = false;
    if (!canUseMediaRecorderVoice()) {
      notifyError(
        "Voice recording is not available here. Use Chrome/Edge on HTTPS, or type in the assistant.",
      );
      return;
    }

    recognizerRef.current?.stop();
    recognizerRef.current = null;
    stopAssistantSpeech();

    const recorder = await createVoiceRecorder();
    if (!recorder) {
      notifyError("Microphone permission denied. Allow mic access for this site.");
      return;
    }

    recorderRef.current = recorder;
    setMode("record");
    setHeard("");
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

  useEffect(() => {
    startRecordRef.current = startRecording;
  }, [startRecording]);

  const startBrowserSpeech = useCallback(async () => {
    cancelledRef.current = false;

    if (!canUseBrowserSpeechRecognition()) {
      void startRecording();
      return;
    }

    // Do NOT call getUserMedia before Web Speech — that triggers Chrome’s fake "network" error.
    stopAssistantSpeech();
    voiceFinalRef.current = "";
    setHeard("");
    setMode("speech");
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    await new Promise((r) => window.setTimeout(r, 120));
    if (cancelledRef.current) return;

    const recognizer = createSpeechRecognizer({
      lang: "en-US",
      continuous: true,
      onInterim: (text) => setHeard(text),
      onFinal: (text) => {
        voiceFinalRef.current = [voiceFinalRef.current, text].filter(Boolean).join(" ").trim();
        setHeard(voiceFinalRef.current);
      },
      onError: ({ code }) => {
        recognizerRef.current = null;
        // Fall through to MediaRecorder instead of showing a dead-end Google speech error.
        if (
          (code === "network" || code === "service-not-allowed" || code === "language-not-supported") &&
          canUseMediaRecorderVoice()
        ) {
          void startRecordRef.current?.();
          return;
        }
        if (code === "not-allowed" || code === "audio-capture") {
          notifyError(speechErrorMessage(code));
          setPhase("idle");
          setHeard("");
          return;
        }
        if (canUseMediaRecorderVoice()) {
          void startRecordRef.current?.();
          return;
        }
        notifyError(speechErrorMessage(code));
        setPhase("idle");
        setHeard("");
      },
      onEnd: () => {
        recognizerRef.current = null;
        // Continuous mode restarts until user stops; stop() sets stoppedByUser so onEnd runs once.
        const spoken = voiceFinalRef.current.trim();
        voiceFinalRef.current = "";
        if (spoken) {
          void askAndSpeak(spoken);
        } else if (!cancelledRef.current && phase === "listening" && mode === "speech") {
          // Empty stop — stay idle
          setPhase("idle");
          setHeard("");
        }
      },
    });

    if (!recognizer) {
      void startRecording();
      return;
    }

    recognizerRef.current = recognizer;
    setPhase("listening");
    recognizer.start();
  }, [askAndSpeak, mode, phase, startRecording]);

  const finishListening = useCallback(async () => {
    if (phase !== "listening") return;

    if (mode === "record") {
      await finishRecording();
      return;
    }

    const spoken = voiceFinalRef.current.trim() || heard.trim();
    recognizerRef.current?.stop();
    recognizerRef.current = null;

    if (spoken) {
      voiceFinalRef.current = "";
      void askAndSpeak(spoken);
      return;
    }

    // No browser transcript — switch to record path if possible.
    if (canUseMediaRecorderVoice()) {
      void startRecording();
      return;
    }

    setPhase("idle");
    setHeard("");
    notifyError("Didn’t catch that. Try again or type your question.");
  }, [askAndSpeak, finishRecording, heard, mode, phase, startRecording]);

  const onClick = useCallback(() => {
    if (phase === "listening") {
      void finishListening();
      return;
    }
    if (phase !== "idle") {
      reset();
      return;
    }
    // Record-and-transcribe is more reliable than Chrome’s Google speech cloud
    // (which often fails with a fake "network" error, especially outside the US).
    if (canUseMediaRecorderVoice()) {
      void startRecording();
    } else {
      void startBrowserSpeech();
    }
  }, [finishListening, phase, reset, startBrowserSpeech, startRecording]);

  if (!voiceSupported) return null;

  const busy = phase !== "idle";
  const statusLabel =
    phase === "listening"
      ? mode === "record"
        ? "Recording… tap Done when finished"
        : "Listening… tap Done when finished"
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
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap shadow-sm transition ${
          phase === "listening"
            ? "bg-red-600 text-white hover:bg-red-700"
            : busy
              ? "bg-indigo-700 text-white hover:bg-indigo-800"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
        }`}
        aria-label={phase === "listening" ? "Done — send question" : "Talk To AI Assistant"}
        title={
          phase === "listening"
            ? "Done — send your question"
            : "Talk To AI Assistant — ask and hear a short answer"
        }
        aria-pressed={busy}
      >
        <MicIcon className={`h-4 w-4 shrink-0 ${phase === "listening" ? "animate-pulse" : ""}`} />
        <span className="max-sm:hidden">
          {phase === "listening" ? "Done" : "Talk To AI Assistant"}
        </span>
        <span className="sm:hidden">{phase === "listening" ? "Done" : "Talk To AI"}</span>
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
                  ? mode === "record"
                    ? "Speak your question, then tap Done"
                    : "Speak your question — tap Done when you pause"
                  : phase === "thinking"
                    ? "Looking up your answer"
                    : "Short spoken answer"}
              </p>
              {heard.trim() && heard !== "Transcribing…" ? (
                <p className="mt-2 line-clamp-2 text-sm text-slate-800 dark:text-slate-200">“{heard.trim()}”</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {phase === "listening" ? (
                <button
                  type="button"
                  onClick={() => void finishListening()}
                  className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Done
                </button>
              ) : null}
              <button
                type="button"
                onClick={reset}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
