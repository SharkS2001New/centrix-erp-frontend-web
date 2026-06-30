/** Detect natural-language questions in the module search box. */

export function looksLikeSearchQuestion(text) {
  const q = text.trim().toLowerCase();
  if (!q) return false;
  if (q.endsWith("?")) return true;

  return /^(how|what|where|why|when|can|could|should|is|are|do|does|help|explain)\b/.test(q);
}

/** Message to send when search had no matches. */
export function searchAskAiPrompt(query, workspaceLabel) {
  const trimmed = query.trim();
  if (!trimmed) return "";
  if (looksLikeSearchQuestion(trimmed)) return trimmed;
  return `Where can I find “${trimmed}” in ${workspaceLabel}?`;
}
