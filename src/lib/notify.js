import { toast } from "@/lib/toast";

/** Transient success feedback — use instead of page-level green banners. */
export function notifySuccess(message) {
  if (message) toast.success(message);
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
