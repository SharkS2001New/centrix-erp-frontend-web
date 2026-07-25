/** Shared open-issue count for System errors & reports (sidebar badge + issues page). */

export const PLATFORM_SYSTEM_ISSUES_COUNT_EVENT = "centrix:platform-system-issues-count";

/** Actionable issues: open + acknowledged (not yet resolved). */
export function systemIssuesBadgeCount(summary) {
  if (!summary || typeof summary !== "object") return 0;
  const open = Number(summary.open) || 0;
  const acknowledged = Number(summary.acknowledged) || 0;
  return Math.max(0, open + acknowledged);
}

export function publishPlatformSystemIssuesCount(count) {
  const next = Math.max(0, Number(count) || 0);
  if (typeof window === "undefined") return next;
  try {
    window.dispatchEvent(
      new CustomEvent(PLATFORM_SYSTEM_ISSUES_COUNT_EVENT, { detail: { count: next } }),
    );
  } catch {
    /* ignore */
  }
  return next;
}

export function publishPlatformSystemIssuesSummary(summary) {
  return publishPlatformSystemIssuesCount(systemIssuesBadgeCount(summary));
}
