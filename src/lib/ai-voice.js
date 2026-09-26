/**
 * Browser voice helpers for Centrix Assistant (Web Speech API).
 * STT: Chrome/Edge best; Safari partial; Firefox often unsupported.
 *
 * Note: Chrome’s cloud STT uses Google’s servers. Unsupported locales (e.g. en-KE)
 * often surface as a misleading `network` error.
 */

const TTS_PREF_KEY = "centrix_ai_tts";

/** Locales Chrome Web Speech handles reliably enough for Centrix. */
const SAFE_SPEECH_LANGS = new Set([
  "en-US",
  "en-GB",
  "en-AU",
  "en-IN",
  "en-IE",
  "en-NZ",
  "en-ZA",
  "en-CA",
]);

export function isSpeechRecognitionSupported() {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported() {
  if (typeof window === "undefined") return false;
  return typeof window.speechSynthesis !== "undefined";
}

/** Prefer browser language only when Chrome STT supports it; else en-US. */
export function preferredSpeechLang() {
  if (typeof navigator === "undefined") return "en-US";
  const raw = String(navigator.language || "en-US").trim();
  if (SAFE_SPEECH_LANGS.has(raw)) return raw;
  if (/^en(-|$)/i.test(raw)) return "en-US";
  return "en-US";
}

export function getAiTtsPref() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TTS_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAiTtsPref(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TTS_PREF_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Strip markdown / chart fences so TTS reads cleanly. */
export function plainTextForSpeech(raw) {
  let text = String(raw ?? "");
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[[^\]]*]\([^)]*\)/g, " ");
  text = text.replace(/\[([^\]]+)]\([^)]*\)/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^>\s?/gm, "");
  text = text.replace(/^\|.*\|$/gm, " ");
  text = text.replace(/[*_~]+/g, "");
  text = text.replace(/\|/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, 1200);
}

/**
 * Short spoken answer only — never narrate the full chat markdown.
 * Prefers the first 1–3 sentences (e.g. till float direct_answer).
 */
export function spokenBriefForSpeech(raw) {
  let text = String(raw ?? "");
  // Drop trailing “Open …” / “Detail …” sections so TTS stays on the answer.
  text = text.split(/\n(?=Detail\b|Open\b)/i)[0] ?? text;
  text = text.replace(/^[-*]\s+/gm, "");
  text = plainTextForSpeech(text);
  text = text.replace(/\bKES\s+/gi, "KES ");
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 0) {
    text = sentences.slice(0, 3).join(" ");
  }
  return text.slice(0, 420).trim();
}


export function speechErrorMessage(code) {
  const messages = {
    "not-allowed": "Microphone permission denied. Allow mic access for this site in the browser address bar.",
    "service-not-allowed": "Speech recognition is blocked in this browser. Try Chrome or Edge.",
    network:
      "Browser speech failed — Centrix will record your voice and transcribe it instead. Tap Done when you finish speaking.",
    "audio-capture": "No microphone found.",
    "language-not-supported": "This speech language is not supported. Falling back to English (US).",
    "insecure-context": "Voice needs HTTPS (or localhost). Open Centrix on a secure URL, or type your question.",
  };
  return messages[code] || `Voice input failed (${code || "unknown"}).`;
}

/** Transient STT failures worth a short retry. */
export function isRetryableSpeechError(code) {
  return (
    code === "network" ||
    code === "no-speech" ||
    code === "aborted" ||
    code === "language-not-supported"
  );
}

/** True when Web Speech STT is likely to work in this page context. */
export function canUseBrowserSpeechRecognition() {
  if (typeof window === "undefined") return false;
  if (!isSpeechRecognitionSupported()) return false;
  if (!window.isSecureContext) return false;
  return true;
}

/** MediaRecorder path — works without Google’s browser speech cloud. */
export function canUseMediaRecorderVoice() {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  if (typeof MediaRecorder === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Either browser STT or record-and-transcribe is available. */
export function canUseVoiceInput() {
  return canUseBrowserSpeechRecognition() || canUseMediaRecorderVoice();
}

/**
 * Ask for mic permission up front so STT does not fail immediately.
 * Avoid calling this immediately before Web Speech — it often causes Chrome’s fake "network" error.
 * @returns {Promise<boolean>}
 */
export async function ensureMicrophoneAccess() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return true;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a short voice clip until stop() is called.
 * @returns {Promise<{
 *   start: () => Promise<void>,
 *   stop: () => Promise<Blob>,
 *   cancel: () => void,
 * } | null>}
 */
export async function createVoiceRecorder() {
  if (!canUseMediaRecorderVoice()) return null;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return null;
  }

  const mimeCandidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  const mimeType = mimeCandidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks = [];
  let resolveStop = null;
  let rejectStop = null;
  let stopped = false;

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = () => {
    rejectStop?.(new Error("Recording failed."));
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
    resolveStop?.(blob);
  };

  return {
    async start() {
      chunks.length = 0;
      recorder.start(250);
    },
    stop() {
      if (stopped) {
        return Promise.resolve(new Blob([], { type: "audio/webm" }));
      }
      stopped = true;
      return new Promise((resolve, reject) => {
        resolveStop = resolve;
        rejectStop = reject;
        try {
          if (recorder.state !== "inactive") recorder.stop();
          else {
            stream.getTracks().forEach((t) => t.stop());
            resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
          }
        } catch (err) {
          stream.getTracks().forEach((t) => t.stop());
          reject(err);
        }
      });
    },
    cancel() {
      stopped = true;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/**
 * @param {{
 *   lang?: string,
 *   continuous?: boolean,
 *   onInterim?: (text: string) => void,
 *   onFinal?: (text: string) => void,
 *   onError?: (info: { code: string, message: string }) => void,
 *   onEnd?: () => void,
 * }} [options]
 * @returns {{ start: () => void, stop: () => void, supported: boolean } | null}
 */
export function createSpeechRecognizer(options = {}) {
  if (!isSpeechRecognitionSupported()) return null;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  // Always prefer a Chrome-safe English locale; callers may pass an override for retries.
  recognition.lang = options.lang || preferredSpeechLang() || "en-US";
  recognition.interimResults = true;
  recognition.continuous = Boolean(options.continuous);
  recognition.maxAlternatives = 1;

  let stoppedByUser = false;
  let errorHandled = false;
  let gotResult = false;

  recognition.onresult = (event) => {
    let interim = "";
    let finalChunk = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result?.[0]?.transcript ?? "";
      if (result.isFinal) {
        finalChunk += transcript;
      } else {
        interim += transcript;
      }
    }
    if (interim || finalChunk) gotResult = true;
    if (interim) options.onInterim?.(interim.trim());
    if (finalChunk.trim()) options.onFinal?.(finalChunk.trim());
  };

  recognition.onerror = (event) => {
    const code = String(event?.error ?? "unknown");
    if (code === "aborted") {
      // User/stop() — onend will run.
      return;
    }
    if (code === "no-speech") {
      // Silence — treat as normal end.
      return;
    }
    // If we already captured speech, ignore late network blips and finish normally.
    if (code === "network" && gotResult) {
      return;
    }
    errorHandled = true;
    options.onError?.({ code, message: speechErrorMessage(code) });
  };

  recognition.onend = () => {
    if (!stoppedByUser && options.continuous && !errorHandled) {
      try {
        recognition.start();
        return;
      } catch {
        /* fall through */
      }
    }
    // After a handled error, panel decides whether to retry — skip auto onEnd restart noise.
    if (errorHandled) {
      errorHandled = false;
      return;
    }
    options.onEnd?.();
  };

  return {
    supported: true,
    start() {
      stoppedByUser = false;
      errorHandled = false;
      gotResult = false;
      try {
        recognition.start();
      } catch (err) {
        options.onError?.({
          code: "start-failed",
          message: err instanceof Error ? err.message : "Could not start microphone.",
        });
      }
    },
    stop() {
      stoppedByUser = true;
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Speak text aloud. Resolves when utterance ends (or immediately if unsupported/empty).
 * @returns {Promise<boolean>}
 */
export function speakAssistantText(text, { lang = "en-US", rate = 1 } = {}) {
  if (!isSpeechSynthesisSupported()) return Promise.resolve(false);
  const plain = plainTextForSpeech(text);
  if (!plain) return Promise.resolve(false);
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = lang || preferredSpeechLang();
    utter.rate = rate;
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    utter.onend = () => finish(true);
    utter.onerror = () => finish(false);
    window.speechSynthesis.speak(utter);
    window.setTimeout(() => finish(true), Math.min(60_000, 2_000 + plain.length * 60));
  });
}

export function stopAssistantSpeech() {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}
