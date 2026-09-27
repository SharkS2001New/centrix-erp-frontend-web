"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiRequestMultipart } from "@/lib/api";
import {
  buildPageContext,
  openAiAssistPanel,
  requestAiAssist,
  subscribeAiVoiceComplete,
  subscribeAiVoiceSpeaking,
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
  hasMicrophonePermission,
  isCentrixWakePhrase,
  isTalkEndPhrase,
  speakAssistantText,
  speechErrorMessage,
  stopAssistantSpeech,
  stripCentrixWakePrefix,
} from "@/lib/ai-voice";

/**
 * Pause after the last finalized phrase before sending.
 * Chrome finalizes mid-thought after short silences — keep this long enough
 * that a natural pause does not cut the user off.
 */
const HANDOFF_PAUSE_MS = 1700;
/** Extra wait when the last phrase does not look finished (no . ? !). */
const HANDOFF_INCOMPLETE_PAUSE_MS = 2400;
/** After the assistant finishes speaking, wait briefly so we don’t hear its own voice. */
const RESUME_LISTEN_MS = 450;
/** Ignore barge-in for a moment so TTS echo does not look like the user talking. */
const BARGE_IN_GUARD_MS = 550;
/** Silence before auto-stop on MediaRecorder fallback (matches handoff feel). */
const RECORD_SILENCE_MS = 1800;

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
  const { capabilities, hasPermission, user } = useAuth();
  const speakerFirst = String(user?.full_name || user?.username || "")
    .trim()
    .split(/\s+/)[0] || "there";
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | listening | waiting | speaking
  /** True only while a Talk session is running — drives mic UI; false the moment Stop is pressed. */
  const [sessionActive, setSessionActive] = useState(false);
  const [heard, setHeard] = useState("");
  const [interimHeard, setInterimHeard] = useState("");
  const [spokenReply, setSpokenReply] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [level, setLevel] = useState(0);

  const orgAiEnabled = canUseAiTalk({ capabilities, hasPermission });
  const recognizerRef = useRef(null);
  const recorderRef = useRef(null);
  const voiceFinalRef = useRef("");
  const interimHeardRef = useRef("");
  const cancelledRef = useRef(false);
  /** Stays true for the whole Talk session until Stop — enables continuous turns. */
  const conversationActiveRef = useRef(false);
  const pauseTimerRef = useRef(0);
  const resumeTimerRef = useRef(0);
  const handedOffRef = useRef(false);
  const finishRecordRef = useRef(null);
  const startListeningRef = useRef(null);
  const resetRef = useRef(null);
  const wakeRecognizerRef = useRef(null);
  /** After the user grants mic once (Talk click or wake), keep quiet wake listening while idle. */
  const wakeEnabledRef = useRef(false);
  /** True while TTS is playing and barge-in is armed. */
  const speakingRef = useRef(false);
  const bargeInArmedAtRef = useRef(0);
  const speakInterruptedRef = useRef(false);
  const handOffToAssistantRef = useRef(null);

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

  const stopMicHard = useCallback(() => {
    clearPauseTimer();
    clearResumeTimer();
    const recognizer = recognizerRef.current;
    recognizerRef.current = null;
    try {
      recognizer?.abort?.() ?? recognizer?.stop?.();
    } catch {
      /* ignore */
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    try {
      recorder?.cancel?.();
    } catch {
      /* ignore */
    }
    stopAssistantSpeech();
  }, [clearPauseTimer, clearResumeTimer]);

  const stopWakeListener = useCallback(() => {
    const wake = wakeRecognizerRef.current;
    wakeRecognizerRef.current = null;
    try {
      wake?.abort?.() ?? wake?.stop?.();
    } catch {
      /* ignore */
    }
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    conversationActiveRef.current = false;
    handedOffRef.current = false;
    speakingRef.current = false;
    speakInterruptedRef.current = false;
    // Hide mic mode immediately — do not wait for STT/TTS teardown.
    setSessionActive(false);
    setPhase("idle");
    setHeard("");
    setInterimHeard("");
    setSpokenReply("");
    setSuggestOpen(false);
    setLevel(0);
    voiceFinalRef.current = "";
    interimHeardRef.current = "";
    stopMicHard();
  }, [stopMicHard]);

  useEffect(() => {
    resetRef.current = reset;
  }, [reset]);

  const endTalkPolitely = useCallback(async () => {
    stopMicHard();
    conversationActiveRef.current = false;
    cancelledRef.current = true;
    handedOffRef.current = true;
    setSessionActive(false);
    setPhase("idle");
    setHeard("");
    setInterimHeard("");
    setSuggestOpen(false);
    setLevel(0);
    voiceFinalRef.current = "";
    interimHeardRef.current = "";
    setSpokenReply("Okay — talk anytime.");
    try {
      await speakAssistantText(`Okay ${speakerFirst}, talk anytime.`, { lang: "en-US", rate: 1.05 });
    } catch {
      /* ignore */
    }
    setSpokenReply("");
    // Allow wake word again after a polite close.
    cancelledRef.current = false;
  }, [speakerFirst, stopMicHard]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      conversationActiveRef.current = false;
      stopMicHard();
      stopWakeListener();
    };
  }, [stopMicHard, stopWakeListener]);

  const handOffToAssistant = useCallback(
    (question) => {
      const q = String(question ?? "").trim();
      if (!q || cancelledRef.current || handedOffRef.current || !conversationActiveRef.current) return;

      // "Nothing else" / "no" / "bye" → close Talk instead of another AI turn.
      if (isTalkEndPhrase(q)) {
        void endTalkPolitely();
        return;
      }

      speakingRef.current = false;
      handedOffRef.current = true;
      clearPauseTimer();
      // Release mic while waiting for the answer — session stays on until Stop.
      const recognizer = recognizerRef.current;
      recognizerRef.current = null;
      try {
        recognizer?.abort?.() ?? recognizer?.stop?.();
      } catch {
        /* ignore */
      }
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
    [capabilities, clearPauseTimer, endTalkPolitely, pathname],
  );

  useEffect(() => {
    handOffToAssistantRef.current = handOffToAssistant;
  }, [handOffToAssistant]);

  const scheduleHandOff = useCallback(
    (delayMs = HANDOFF_PAUSE_MS) => {
      clearPauseTimer();
      pauseTimerRef.current = window.setTimeout(() => {
        // Still hearing interim speech — wait longer instead of cutting off.
        if (interimHeardRef.current.trim()) {
          scheduleHandOff(HANDOFF_PAUSE_MS);
          return;
        }
        const spoken = voiceFinalRef.current.trim();
        if (spoken) {
          voiceFinalRef.current = "";
          handOffToAssistant(spoken);
        }
      }, delayMs);
    },
    [clearPauseTimer, handOffToAssistant],
  );

  /** Listen while TTS plays — user speech pauses the answer and becomes the next question. */
  const startBargeInListening = useCallback(() => {
    if (!canUseBrowserSpeechRecognition()) return;
    if (!conversationActiveRef.current || cancelledRef.current) return;

    const prev = recognizerRef.current;
    recognizerRef.current = null;
    try {
      prev?.abort?.() ?? prev?.stop?.();
    } catch {
      /* ignore */
    }

    voiceFinalRef.current = "";
    interimHeardRef.current = "";
    bargeInArmedAtRef.current = Date.now();

    const acceptBargeIn = (text) => {
      const q = String(text ?? "").trim();
      if (!q || !speakingRef.current) return;
      if (Date.now() - bargeInArmedAtRef.current < BARGE_IN_GUARD_MS) return;
      // Ignore tiny noise / single filler while TTS is playing.
      const words = q.split(/\s+/).filter(Boolean);
      if (words.length < 1) return;
      if (words.length === 1 && /^(um+|uh+|ah+|hm+|hmm+|mm+)$/i.test(words[0])) return;

      speakInterruptedRef.current = true;
      speakingRef.current = false;
      stopAssistantSpeech();
      clearPauseTimer();
      const recognizer = recognizerRef.current;
      recognizerRef.current = null;
      try {
        recognizer?.abort?.() ?? recognizer?.stop?.();
      } catch {
        /* ignore */
      }
      // Allow a new handoff while the previous answer was still speaking.
      handedOffRef.current = false;
      setPhase("listening");
      setHeard(q);
      setInterimHeard("");
      setSpokenReply((prev) => (prev ? `${prev} (interrupted)` : "Interrupted"));
      handOffToAssistantRef.current?.(q);
    };

    const recognizer = createSpeechRecognizer({
      lang: "en-US",
      continuous: true,
      minConfidence: 0.25,
      onInterim: (text) => {
        if (!speakingRef.current || cancelledRef.current) return;
        if (Date.now() - bargeInArmedAtRef.current < BARGE_IN_GUARD_MS) return;
        interimHeardRef.current = text;
        setInterimHeard(text);
        setHeard(text);
        setLevel(0.45);
        // Strong multi-word interim → interrupt without waiting for final.
        if (text.trim().split(/\s+/).filter(Boolean).length >= 3) {
          acceptBargeIn(text);
        }
      },
      onFinal: (text) => {
        if (!speakingRef.current || cancelledRef.current) return;
        voiceFinalRef.current = [voiceFinalRef.current, text].filter(Boolean).join(" ").trim();
        setHeard(voiceFinalRef.current);
        acceptBargeIn(voiceFinalRef.current);
      },
      onError: () => {
        recognizerRef.current = null;
      },
      onEnd: () => {
        recognizerRef.current = null;
        // Keep barge-in alive until TTS ends or Talk stops.
        if (speakingRef.current && conversationActiveRef.current && !cancelledRef.current) {
          window.setTimeout(() => {
            if (speakingRef.current && conversationActiveRef.current && !cancelledRef.current) {
              startBargeInListening();
            }
          }, 200);
        }
      },
    });

    if (!recognizer) return;
    recognizerRef.current = recognizer;
    try {
      recognizer.start();
    } catch {
      recognizerRef.current = null;
    }
  }, [clearPauseTimer]);

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
        notifyError("Didn’t catch that — tap Talk to Centrix Assistant and ask again.");
        setSessionActive(false);
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
        notifyError("Didn’t catch that — tap Talk to Centrix Assistant and ask again.");
        setSessionActive(false);
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
      setSessionActive(false);
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
      silenceMs: RECORD_SILENCE_MS,
      speakThreshold: 0.07,
      maxMs: 30000,
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
      setSessionActive(false);
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
      setSessionActive(false);
      setPhase("idle");
    }
  }, []);

  const startListening = useCallback(
    async ({ resume = false, seedMessage = null } = {}) => {
      if (!resume) {
        conversationActiveRef.current = true;
        setSessionActive(true);
        wakeEnabledRef.current = true;
        stopWakeListener();
      }
      if (!conversationActiveRef.current || cancelledRef.current) return;

      cancelledRef.current = false;
      handedOffRef.current = false;
      clearPauseTimer();
      clearResumeTimer();
      stopAssistantSpeech();
      voiceFinalRef.current = "";
      interimHeardRef.current = "";
      setHeard("");
      setInterimHeard("");
      setSuggestOpen(false);
      setLevel(0);

      // Wake word already captured a greeting / question — send it immediately.
      if (seedMessage && String(seedMessage).trim()) {
        setPhase("listening");
        voiceFinalRef.current = String(seedMessage).trim();
        setHeard(voiceFinalRef.current);
        handOffToAssistant(voiceFinalRef.current);
        return;
      }

      if (canUseBrowserSpeechRecognition()) {
        const prev = recognizerRef.current;
        recognizerRef.current = null;
        try {
          prev?.abort?.() ?? prev?.stop?.();
        } catch {
          /* ignore */
        }
        await new Promise((r) => window.setTimeout(r, resume ? 30 : 60));
        if (cancelledRef.current || !conversationActiveRef.current) return;

        const recognizer = createSpeechRecognizer({
          // Force US English — Chrome STT mishandles en-KE and Kenyan English accents fare better on en-US.
          lang: "en-US",
          continuous: true,
          // Allow lower scores so accented English is not dropped mid-sentence.
          minConfidence: 0.2,
          onInterim: (text) => {
            if (cancelledRef.current) return;
            interimHeardRef.current = text;
            setInterimHeard(text);
            setHeard(() => {
              const base = voiceFinalRef.current.trim();
              return [base, text].filter(Boolean).join(" ").trim();
            });
            setLevel(0.4);
            // Keep listening while they are still speaking / thinking mid-phrase.
            clearPauseTimer();
          },
          onFinal: (text) => {
            if (cancelledRef.current) return;
            voiceFinalRef.current = [voiceFinalRef.current, text].filter(Boolean).join(" ").trim();
            interimHeardRef.current = "";
            setInterimHeard("");
            setHeard(voiceFinalRef.current);
            setLevel(0.25);
            const looksComplete = /[.!?…]["')\]]*\s*$/.test(text.trim());
            scheduleHandOff(looksComplete ? HANDOFF_PAUSE_MS : HANDOFF_INCOMPLETE_PAUSE_MS);
          },
          onError: ({ code }) => {
            recognizerRef.current = null;
            clearPauseTimer();
            if (code === "not-allowed" || code === "audio-capture") {
              notifyError(speechErrorMessage(code));
              conversationActiveRef.current = false;
              setSessionActive(false);
              setPhase("idle");
              setHeard("");
              setInterimHeard("");
              return;
            }
            // Prefer browser STT text already captured — avoid Gemini STT fallback
            // (DeepSeek chat orgs use Gemini only for voice, which rate-limits easily).
            const spokenNow = [voiceFinalRef.current, interimHeardRef.current]
              .filter(Boolean)
              .join(" ")
              .trim();
            if (spokenNow) {
              voiceFinalRef.current = spokenNow;
              interimHeardRef.current = "";
              handOffToAssistant(spokenNow);
              return;
            }
            if (canUseMediaRecorderVoice()) {
              void startRecordingFallback();
              return;
            }
            notifyError(speechErrorMessage(code));
            conversationActiveRef.current = false;
            setSessionActive(false);
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
    [
      clearPauseTimer,
      clearResumeTimer,
      handOffToAssistant,
      scheduleHandOff,
      startRecordingFallback,
      stopWakeListener,
    ],
  );

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Quiet wake-word listener while idle: say "Hi Centrix" / "Talk to Centrix Assistant"
  // to start Talk (no banner until woken). Requires mic permission (granted earlier or via Talk click).
  useEffect(() => {
    if (!orgAiEnabled || !voiceSupported || sessionActive) {
      stopWakeListener();
      return undefined;
    }
    if (!canUseBrowserSpeechRecognition()) return undefined;

    let disposed = false;
    let restartTimer = 0;

    const startWake = async () => {
      if (disposed || conversationActiveRef.current || sessionActive) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      // Browsers block SpeechRecognition without mic permission — don't spin forever.
      const permitted =
        wakeEnabledRef.current || (await hasMicrophonePermission());
      if (disposed || conversationActiveRef.current) return;
      if (!permitted) {
        // Wait until the user clicks "Talk to Centrix Assistant" once (grants mic).
        return;
      }
      wakeEnabledRef.current = true;

      stopWakeListener();

      const wake = createSpeechRecognizer({
        lang: "en-US",
        continuous: true,
        minConfidence: 0.15,
        onFinal: (text) => {
          if (disposed || conversationActiveRef.current) return;
          if (!isCentrixWakePhrase(text)) return;
          wakeEnabledRef.current = true;
          stopWakeListener();
          cancelledRef.current = false;
          const question = stripCentrixWakePrefix(text);
          // Greeting only ("Hi Centrix") → open mic and listen for the real question.
          // Greeting + question → send the question immediately.
          if (question) {
            void startListeningRef.current?.({ resume: false, seedMessage: question });
          } else {
            void startListeningRef.current?.({ resume: false });
          }
        },
        onError: ({ code }) => {
          wakeRecognizerRef.current = null;
          // Need a click once for mic permission — then wake works.
          if (code === "not-allowed" || code === "audio-capture" || code === "service-not-allowed") {
            wakeEnabledRef.current = false;
            return;
          }
          if (disposed || conversationActiveRef.current) return;
          restartTimer = window.setTimeout(() => {
            void startWake();
          }, 1200);
        },
        onEnd: () => {
          wakeRecognizerRef.current = null;
          if (disposed || conversationActiveRef.current) return;
          restartTimer = window.setTimeout(() => {
            void startWake();
          }, 400);
        },
      });

      if (!wake) return;
      wakeRecognizerRef.current = wake;
      try {
        wake.start();
      } catch {
        wakeRecognizerRef.current = null;
      }
    };

    // Small delay so Talk Stop can release the mic before wake re-attaches.
    restartTimer = window.setTimeout(() => {
      void startWake();
    }, wakeEnabledRef.current ? 500 : 900);

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        stopWakeListener();
      } else if (!conversationActiveRef.current) {
        restartTimer = window.setTimeout(() => {
          void startWake();
        }, 400);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      disposed = true;
      window.clearTimeout(restartTimer);
      document.removeEventListener("visibilitychange", onVis);
      stopWakeListener();
    };
  }, [orgAiEnabled, sessionActive, stopWakeListener, voiceSupported]);

  // While CentrixAssistant is speaking, listen for barge-in follow-ups.
  useEffect(() => {
    return subscribeAiVoiceSpeaking((payload = {}) => {
      if (cancelledRef.current || !conversationActiveRef.current) return;
      speakInterruptedRef.current = false;
      speakingRef.current = true;
      // Unlock handoff so a follow-up can cut in mid-answer.
      handedOffRef.current = false;
      setSessionActive(true);
      setPhase("speaking");
      if (payload.brief) setSpokenReply(payload.brief);
      setHeard("");
      setInterimHeard("");
      setLevel(0);
      clearResumeTimer();
      // Short delay so we don't pick up the start of TTS as the user.
      window.setTimeout(() => {
        if (!speakingRef.current || cancelledRef.current || !conversationActiveRef.current) return;
        startBargeInListening();
      }, BARGE_IN_GUARD_MS);
    });
  }, [clearResumeTimer, startBargeInListening]);

  // After the spoken answer finishes, keep the conversation going without another click.
  useEffect(() => {
    return subscribeAiVoiceComplete((payload = {}) => {
      if (cancelledRef.current || !conversationActiveRef.current) {
        speakingRef.current = false;
        setSessionActive(false);
        setPhase("idle");
        setHeard("");
        setInterimHeard("");
        setLevel(0);
        handedOffRef.current = false;
        return;
      }

      speakingRef.current = false;

      // Barge-in already stopped TTS and sent the follow-up — do not resume listen here.
      if (payload.interrupted || speakInterruptedRef.current) {
        speakInterruptedRef.current = false;
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
      setSessionActive(true);
      setPhase("listening");
      clearResumeTimer();
      resumeTimerRef.current = window.setTimeout(() => {
        if (cancelledRef.current || !conversationActiveRef.current) return;
        void startListeningRef.current?.({ resume: true });
      }, RESUME_LISTEN_MS);
    });
  }, [clearResumeTimer]);

  const onClick = useCallback(() => {
    if (sessionActive || phase !== "idle") {
      reset();
      return;
    }
    void startListening({ resume: false });
  }, [phase, reset, sessionActive, startListening]);

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

  // Mic mode UI only while Talk session is on — never after Stop.
  const micModeOn = sessionActive && phase !== "idle";
  const liveHeard = heard.trim() || interimHeard.trim();
  const buttonLabel =
    phase === "listening"
      ? "Listening…"
      : phase === "speaking"
        ? "Speaking… (interrupt OK)"
        : phase === "waiting"
          ? "Waiting…"
          : "Talk to Centrix Assistant";
  const buttonLabelShort =
    phase === "listening"
      ? "Listening…"
      : phase === "speaking"
        ? "Speaking…"
        : phase === "waiting"
          ? "Waiting…"
          : "Talk";

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        data-phase={
          micModeOn
            ? phase === "waiting"
              ? "thinking"
              : phase === "speaking"
                ? "speaking"
                : phase
            : "idle"
        }
        className="app-topbar-ai-talk-btn"
        aria-label={
          micModeOn
            ? "Stop Talk to Centrix Assistant"
            : "Talk to Centrix Assistant"
        }
        title={
          micModeOn
            ? phase === "speaking"
              ? "Speak to interrupt and ask a follow-up — or Stop"
              : "Stop conversation — or say no / nothing else to close"
            : "Talk to Centrix Assistant — click once to enable the mic, then say “Hi Centrix” anytime"
        }
        aria-pressed={micModeOn}
      >
        <MicIcon className={`h-4 w-4 ${phase === "listening" && micModeOn ? "animate-pulse" : ""}`} />
        <span className="max-sm:hidden">{micModeOn ? buttonLabel : "Talk to Centrix Assistant"}</span>
        <span className="sm:hidden">{micModeOn ? buttonLabelShort : "Talk"}</span>
      </button>

      {micModeOn ? (
        <div
          className="fixed inset-x-0 top-[78px] z-[60] flex justify-center px-3 pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-indigo-200 bg-white px-4 py-3 shadow-lg dark:border-indigo-800 dark:bg-slate-900">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                phase === "listening"
                  ? "bg-red-500 text-white animate-pulse"
                  : phase === "speaking"
                    ? "bg-violet-600 text-white"
                    : "bg-indigo-600 text-white"
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
                {phase === "listening"
                  ? `Talk to Centrix Assistant · listening to ${speakerFirst}`
                  : phase === "speaking"
                    ? "Talk to Centrix Assistant · speaking — interrupt anytime"
                    : "Talk to Centrix Assistant · getting answer…"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {phase === "listening"
                  ? `Ask in English — or say “nothing else” / “no” to close`
                  : phase === "speaking"
                    ? "Start talking to pause this answer and ask a follow-up"
                    : "I’ll speak a short answer; open the assistant only if you want full detail"}
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
                    {phase === "listening"
                      ? "Waiting for your voice…"
                      : phase === "speaking"
                        ? "Speak to interrupt…"
                        : "Understanding…"}
                  </p>
                )}
              </div>

              {spokenReply && (phase === "listening" || phase === "speaking") ? (
                <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-2.5 py-2 dark:border-indigo-900 dark:bg-indigo-950/40">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">
                    {phase === "speaking" ? "Speaking now" : "Last answer"}
                  </p>
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
