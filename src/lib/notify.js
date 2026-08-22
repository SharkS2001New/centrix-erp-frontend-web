import { toast } from "@/lib/toast";

/** Long enough to read full price/markup copy on busy POS screens. */
const PRICE_UPDATE_TOAST_DURATION_MS = 10_000;

/** Transient success feedback — use instead of page-level green banners. */
export function notifySuccess(message) {
  if (message) toast.success(message);
}

/** Toast for live catalogue price / markup changes (External POS). */
export function notifyPriceUpdate(message) {
  if (message) {
    toast.success(message, { duration: PRICE_UPDATE_TOAST_DURATION_MS });
  }
}

/** Transient error feedback — use instead of page-level red banners for actions. */
export function notifyError(message) {
  if (message) toast.error(message);
}

/**
 * Drop-in replacement for `setMessage` / `setError` state setters.
 * Pass to child panels that still call setMessage("Saved.").
 */
export function toastMessageSetter(message) {
  notifySuccess(message);
}

export function toastErrorSetter(message) {
  notifyError(message);
}
