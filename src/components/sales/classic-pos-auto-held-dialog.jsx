"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatOrderNumber } from "@/lib/sales";

/**
 * Shown on classic POS open when the last leave auto-held a sale.
 */
export function ClassicPosAutoHeldDialog({
  open,
  orderNum,
  busy = false,
  onRestore,
  onDelete,
  onDismiss,
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape" && !busy) onDismiss?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onDismiss]);

  if (!open || !mounted || typeof document === "undefined") return null;

  const label =
    orderNum != null && orderNum !== ""
      ? `order ${formatOrderNumber(orderNum)}`
      : "a held order";

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="classic-auto-held-title"
        className="w-full max-w-md theme-panel rounded-xl border p-5 shadow-xl"
      >
        <h2 id="classic-auto-held-title" className="text-base font-semibold">
          Held sale from last session
        </h2>
        <p className="theme-text-muted mt-2 text-sm leading-relaxed">
          You left POS with items in the cart. That sale was automatically held as {label}.
          Restore it to continue, or delete it and release the reserved stock.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="theme-secondary-btn rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Decide later
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            {busy ? "Working…" : "Delete held sale"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRestore}
            className="rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--theme-primary-hover)] disabled:opacity-50"
          >
            {busy ? "Working…" : "Restore sale"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
