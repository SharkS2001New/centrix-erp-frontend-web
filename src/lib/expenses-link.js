/** Build /expenses URL with optional date range filters. */
export function buildExpensesHref({ fromDate, toDate } = {}) {
  const params = new URLSearchParams();
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  const query = params.toString();
  return query ? `/expenses?${query}` : "/expenses";
}

/** Collapse duplicated API error text (e.g. same sentence repeated). */
export function dedupeErrorMessage(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return trimmed;

  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= 2 && sentences.every((sentence) => sentence === sentences[0])) {
    return sentences[0];
  }

  const mid = Math.floor(trimmed.length / 2);
  const first = trimmed.slice(0, mid).trim();
  const second = trimmed.slice(mid).trim().replace(/^\.\s*/, "");
  if (first && second === first) return first;

  return trimmed;
}
