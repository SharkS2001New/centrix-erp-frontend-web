"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiRequestMultipart } from "@/lib/api";
import {
  buildPageContext,
  openAiAssistPanel,
  requestAiAssist,
  subscribeAiVoiceComplete,
} from "@/lib/ai-assist-bridge";
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

/** Pause after you finish speaking before sending — short for snappy English turn-taking. */
const HANDOFF_PAUSE_MS = 500;
/** After the assistant finishes speaking, wait briefly so we don’t hear its own voice. */
const RESUME_LISTEN_MS = 350;

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
 * Header voice: continuous conversation — listen → ask → hear answer → listen again
 * until the user taps Stop. Sidebar stays closed unless the answer needs it or they open it.
 */
export function AiVoiceTalkButton() {
  const pathname = usePathname();
  const { capabilities, hasPermission } = useAuth();
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | listening | waiting
  const [heard, setHeard] = useState("");
  const [interimHeard, setInterimHeard] = useState("");
  const [spokenReply, setSpokenReply] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [level, setLevel] = useState(0);

  const orgAiEnabled = canUseAiTalk({ capabilities, hasPermission });
  const recognizerRef = useRef(null);
  const recorderRef = useRef(null);
  const voiceFinalRef = useRef("");
  const cancelledRef = useRef(false);
  /** Stays true for the whole Talk session until Stop — enables continuous turns. */
  const conversationActiveRef = useRef(false);
  const pauseTimerRef = useRef(0);
  const resumeTimerRef = useRef(0);
  const handedOffRef = useRef(false);
  const finishRecordRef = useRef(null);
  const startListeningRef = useRef(null);

  useEffect(() => {
    setVoiceSupported(canUseVoiceInput());
  }, []);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = 0;
    }
  }, []);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = 0;
    }
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    conversationActiveRef.current = false;
    handedOffRef.current = false;
    clearPauseTimer();
    clearResumeTimer();
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    stopAssistantSpeech();
    voiceFinalRef.current = "";
    setHeard("");
    setInterimHeard("");
    setSpokenReply("");
    setSuggestOpen(false);
    setLevel(0);
    setPhase("idle");
  }, [clearPauseTimer, clearResumeTimer]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      conversationActiveRef.current = false;
      clearPauseTimer();
      clearResumeTimer();
      recognizerRef.current?.stop();
      recorderRef.current?.cancel();
      stopAssistantSpeech();
    };
  }, [clearPauseTimer, clearResumeTimer]);

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
      setInterimHeard("");
      setSpokenReply("");
      setSuggestOpen(false);
      setLevel(0);

      requestAiAssist({
        message: q,
        autoSend: true,
        fromVoice: true,
        openPanel: false,
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
    (delayMs = HANDOFF_PAUSE_MS) => {
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
    setInterimHeard("");
    setLevel(0);

    try {
      const blob = await recorder.stop();
      if (cancelledRef.current) return;
      if (!blob || blob.size < 200) {
        if (conversationActiveRef.current) {
          setHeard("");
          setPhase("listening");
          window.setTimeout(() => {
            if (conversationActiveRef.current && !cancelledRef.current) {
              void startListeningRef.current?.({ resume: true });
            }
          }, 200);
          return;
        }
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
        if (conversationActiveRef.current) {
          setHeard("");
          void startListeningRef.current?.({ resume: true });
          return;
        }
        notifyError("Didn’t catch that — tap Talk and ask again.");
        setPhase("idle");
        setHeard("");
        return;
      }

      handOffToAssistant(text);
    } catch (err) {
      if (cancelledRef.current) return;
      notifyError(err instanceof Error ? err.message : "Could not understand your voice.");
      if (conversationActiveRef.current) {
        handedOffRef.current = false;
        void startListeningRef.current?.({ resume: true });
        return;
      }
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
    setInterimHeard("");
    setLevel(0);

    const recorder = await createVoiceRecorder({
      silenceMs: 850,
      speakThreshold: 0.075,
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
      conversationActiveRef.current = false;
      setPhase("idle");
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
      conversationActiveRef.current = false;
      setPhase("idle");
    }
  }, []);

  const startListening = useCallback(
    async ({ resume = false } = {}) => {
      if (!resume) {
        conversationActiveRef.current = true;
      }
      if (!conversationActiveRef.current) return;

      cancelledRef.current = false;
      handedOffRef.current = false;
      clearPauseTimer();
      clearResumeTimer();
      stopAssistantSpeech();
      voiceFinalRef.current = "";
      setHeard("");
      setInterimHeard("");
      setSuggestOpen(false);
      setLevel(0);

      if (canUseBrowserSpeechRecognition()) {
        recognizerRef.current?.stop();
        recognizerRef.current = null;
        await new Promise((r) => window.setTimeout(r, resume ? 30 : 60));
        if (cancelledRef.current || !conversationActiveRef.current) return;

        const recognizer = createSpeechRecognizer({
          lang: "en-US",
          continuous: true,
          minConfidence: 0.4,
          onInterim: (text) => {
            if (cancelledRef.current) return;
            setInterimHeard(text);
            setHeard(() => {
              const base = voiceFinalRef.current.trim();
              return [base, text].filter(Boolean).join(" ").trim();
            });
            setLevel(0.4);
            clearPauseTimer();
          },
          onFinal: (text) => {
            if (cancelledRef.current) return;
            voiceFinalRef.current = [voiceFinalRef.current, text].filter(Boolean).join(" ").trim();
            setInterimHeard("");
            setHeard(voiceFinalRef.current);
            setLevel(0.25);
            scheduleHandOff(HANDOFF_PAUSE_MS);
          },
          onError: ({ code }) => {
            recognizerRef.current = null;
            clearPauseTimer();
            if (code === "not-allowed" || code === "audio-capture") {
              notifyError(speechErrorMessage(code));
              conversationActiveRef.current = false;
              setPhase("idle");
              setHeard("");
              setInterimHeard("");
              return;
            }
            if (canUseMediaRecorderVoice()) {
              void startRecordingFallback();
              return;
            }
            notifyError(speechErrorMessage(code));
            conversationActiveRef.current = false;
            setPhase("idle");
            setHeard("");
            setInterimHeard("");
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
    },
    [clearPauseTimer, clearResumeTimer, scheduleHandOff, startRecordingFallback],
  );

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // After the spoken answer finishes, keep the conversation going without another click.
  useEffect(() => {
    return subscribeAiVoiceComplete((payload = {}) => {
      if (cancelledRef.current || !conversationActiveRef.current) {
        setPhase("idle");
        setHeard("");
        setInterimHeard("");
        setLevel(0);
        handedOffRef.current = false;
        return;
      }

      if (payload.brief) {
        setSpokenReply(payload.brief);
      }
      // Suggest opening the sidebar for long answers; forms already force-open the panel.
      setSuggestOpen(Boolean(payload.detailed) && !payload.needsPanel);

      handedOffRef.current = false;
      setHeard("");
      setInterimHeard("");
      setLevel(0);
      setPhase("listening");
      clearResumeTimer();
      resumeTimerRef.current = window.setTimeout(() => {
        if (cancelledRef.current || !conversationActiveRef.current) return;
        void startListeningRef.current?.({ resume: true });
      }, RESUME_LISTEN_MS);
    });
  }, [clearResumeTimer]);

  const onClick = useCallback(() => {
    if (phase !== "idle") {
      reset();
      return;
    }
    void startListening({ resume: false });
  }, [phase, reset, startListening]);

  const onOpenAssistant = useCallback(() => {
    openAiAssistPanel(
      buildPageContext({
        pathname,
        screenKey: getStoredWorkspace() ?? defaultWorkspaceId(capabilities, {}),
      }),
    );
    setSuggestOpen(false);
  }, [capabilities, pathname]);

  if (!orgAiEnabled || !voiceSupported) return null;

  const busy = phase !== "idle";
  const liveHeard = heard.trim() || interimHeard.trim();
  const buttonLabel =
    phase === "listening"
      ? "Listening…"
      : phase === "waiting"
        ? "Waiting…"
        : "Talk To AI Assistant";
  const buttonLabelShort =
    phase === "listening" ? "Listening…" : phase === "waiting" ? "Waiting…" : "Talk To AI";

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        data-phase={phase === "waiting" ? "thinking" : phase}
        className="app-topbar-ai-talk-btn"
        aria-label={busy ? "Stop voice conversation" : "Talk To AI Assistant"}
        title={
          busy
            ? "Stop conversation"
            : "Talk To AI Assistant — continuous chat near the mic. Sidebar stays closed unless you open it."
        }
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
                {phase === "listening" ? "Listening… (conversation on)" : "Getting answer…"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {phase === "listening"
                  ? "Speak near the mic — what you say appears below"
                  : "I’ll speak the short answer; open the assistant only if you want the full detail"}
              </p>

              <div className="mt-2 min-h-[2.5rem] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/80">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Heard</p>
                {liveHeard ? (
                  <p className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">
                    “{liveHeard}”
                    {interimHeard && !voiceFinalRef.current ? (
                      <span className="ml-1 text-xs italic text-slate-400">…</span>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm italic text-slate-400">
                    {phase === "listening" ? "Waiting for your voice…" : "Understanding…"}
                  </p>
                )}
              </div>

              {spokenReply && phase === "listening" ? (
                <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-2.5 py-2 dark:border-indigo-900 dark:bg-indigo-950/40">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">Last answer</p>
                  <p className="mt-0.5 text-sm text-indigo-950 dark:text-indigo-100">{spokenReply}</p>
                </div>
              ) : null}

              {suggestOpen ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-500">Answer has more detail.</p>
                  <button
                    type="button"
                    onClick={onOpenAssistant}
                    className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Open assistant
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestOpen(false)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Not now
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAssistant}
                  className="mt-2 text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                >
                  Open assistant
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={reset}
              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
            >
              Stop
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
