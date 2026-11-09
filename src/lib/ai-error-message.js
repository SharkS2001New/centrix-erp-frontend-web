import { ApiError, isNetworkFetchError } from "@/lib/api";

/** User-facing copy when Centrix AI / provider is unreachable or overloaded. */
export const AI_SERVER_DOWN_MESSAGE = "Server is down";

const AI_DOWN_ERROR_CODES = new Set([
  "unavailable",
  "timeout",
  "ai_busy",
  "internal_error",
  "malformed_response",
  "provider_error",
  "ai_server_down",
]);

function looksLikeAiDownMessage(message) {
  return /temporarily unavailable|timed out|busy right now|contacting the ai|ai service|server is down|failed to fetch|networkerror|ai request failed/i.test(
    String(message ?? ""),
  );
}

/**
 * @param {unknown} error
 * @param {string} [fallback]
 */
export function userFacingAiErrorMessage(error, fallback = AI_SERVER_DOWN_MESSAGE) {
  if (!error) return fallback;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Please check your internet connection and try again.";
  }

  if (isNetworkFetchError(error)) {
    return AI_SERVER_DOWN_MESSAGE;
  }

  if (error instanceof ApiError) {
    const code = String(error.body?.error_code ?? error.body?.code ?? "").toLowerCase();
    if (AI_DOWN_ERROR_CODES.has(code)) {
      return AI_SERVER_DOWN_MESSAGE;
    }
    if (error.status === 502 || error.status === 503 || error.status === 504 || error.status === 0) {
      return AI_SERVER_DOWN_MESSAGE;
    }
    const message = String(error.message ?? "").trim();
    if (looksLikeAiDownMessage(message)) {
      return AI_SERVER_DOWN_MESSAGE;
    }
    return message || fallback;
  }

  // Plain response-shaped objects from /ai/chat success:false
  if (typeof error === "object" && error !== null && ("message" in error || "body" in error)) {
    const code = String(error.body?.error_code ?? error.error_code ?? error.code ?? "").toLowerCase();
    if (AI_DOWN_ERROR_CODES.has(code) || looksLikeAiDownMessage(error.message)) {
      return AI_SERVER_DOWN_MESSAGE;
    }
    const message = String(error.message ?? "").trim();
    return message || fallback;
  }

  if (error instanceof Error) {
    const message = String(error.message ?? "").trim();
    if (looksLikeAiDownMessage(message)) {
      return AI_SERVER_DOWN_MESSAGE;
    }
    return message || fallback;
  }

  return fallback;
}
