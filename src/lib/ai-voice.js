/**
 * Browser voice helpers for Centrix Assistant (Web Speech API).
 * STT: Chrome/Edge best; Safari partial; Firefox often unsupported.
 */

const TTS_PREF_KEY = "centrix_ai_tts";
const TALK_PREF_KEY = "centrix_ai_talk_mode";

export function isSpeechRecognitionSupported() {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported() {
  if (typeof window === "undefined") return false;
  return typeof window.speechSynthesis !== "undefined";
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

export function getAiTalkModePref() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TALK_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAiTalkModePref(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TALK_PREF_KEY, enabled ? "1" : "0");
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
  text = text.replace(/[*_~]+/g, "");
  text = text.replace(/\|/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, 1200);
}

/**
 * @param {{
 *   lang?: string,
 *   continuous?: boolean,
 *   onInterim?: (text: string) => void,
 *   onFinal?: (text: string) => void,
 *   onError?: (message: string) => void,
 *   onEnd?: () => void,
 * }} [options]
 * @returns {{ start: () => void, stop: () => void, supported: boolean } | null}
 */
export function createSpeechRecognizer(options = {}) {
  if (!isSpeechRecognitionSupported()) return null;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = options.lang || "en-KE";
  recognition.interimResults = true;
  recognition.continuous = Boolean(options.continuous);
  recognition.maxAlternatives = 1;

  let stoppedByUser = false;

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
    if (interim) options.onInterim?.(interim.trim());
    if (finalChunk.trim()) options.onFinal?.(finalChunk.trim());
  };

  recognition.onerror = (event) => {
    const code = String(event?.error ?? "unknown");
    if (code === "aborted" || code === "no-speech") {
      options.onEnd?.();
      return;
    }
    const messages = {
      "not-allowed": "Microphone permission denied. Allow mic access for this site.",
      "service-not-allowed": "Speech recognition is blocked in this browser.",
      network: "Speech recognition needs a network connection.",
      "audio-capture": "No microphone found.",
    };
    options.onError?.(messages[code] || `Voice input failed (${code}).`);
    options.onEnd?.();
  };

  recognition.onend = () => {
    if (!stoppedByUser && options.continuous) {
      try {
        recognition.start();
        return;
      } catch {
        /* fall through */
      }
    }
    options.onEnd?.();
  };

  return {
    supported: true,
    start() {
      stoppedByUser = false;
      try {
        recognition.start();
      } catch (err) {
        options.onError?.(err instanceof Error ? err.message : "Could not start microphone.");
        options.onEnd?.();
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
export function speakAssistantText(text, { lang = "en-KE", rate = 1 } = {}) {
  if (!isSpeechSynthesisSupported()) return Promise.resolve(false);
  const plain = plainTextForSpeech(text);
  if (!plain) return Promise.resolve(false);
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = lang;
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
    // Some browsers fire neither end nor error if cancelled mid-flight.
    window.setTimeout(() => finish(true), Math.min(60_000, 2_000 + plain.length * 60));
  });
}

export function stopAssistantSpeech() {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}
