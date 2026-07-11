/** Shared unread count for platform mailbox (sidebar badge + mailbox panel). */

export const PLATFORM_MAIL_UNREAD_EVENT = "centrix:platform-mail-unread";
export const PLATFORM_MAIL_AUTO_SYNC_KEY = "centrix.platform_mail.auto_synced_session";

export function publishPlatformMailUnread(count) {
  const next = Math.max(0, Number(count) || 0);
  if (typeof window === "undefined") return next;
  try {
    window.dispatchEvent(
      new CustomEvent(PLATFORM_MAIL_UNREAD_EVENT, { detail: { count: next } }),
    );
  } catch {
    /* ignore */
  }
  return next;
}
