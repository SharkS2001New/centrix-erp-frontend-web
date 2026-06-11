"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function PosLeaveGuardDialog({
  open,
  lineCount = 0,
  busy = false,
  onStay,
  onLeaveKeepReservation,
  onClearAndLeave,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape" && !busy) onStay?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onStay]);

  if (!open || !mounted) return null;

  const itemLabel = lineCount === 1 ? "1 item" : `${lineCount} items`;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-leave-guard-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <h2 id="pos-leave-guard-title" className="text-base font-semibold text-slate-900">
          Leave point of sale?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          You have {itemLabel} in the current sale. Stock for these items is reserved and unavailable
          for other sales until you complete, save, or clear the cart.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Clear the sale and restore stock to inventory before leaving, or keep the reservation if
          you plan to return to this cart.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onStay}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Stay on POS
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onLeaveKeepReservation}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            Leave, keep reservation
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClearAndLeave}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a] disabled:opacity-50"
          >
            {busy ? "Clearing…" : "Clear sale & leave"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
