"use client";

import { createPortal } from "react-dom";

/**
 * Full-screen blocking wait dialog for operations that must finish in place
 * (e.g. POS checkout with KRA fiscalization). No minimize or cancel controls.
 */
export function BlockingWaitOverlay({ open, message, detail, progress = 0 }) {
  if (!open || typeof document === "undefined") return null;

  const pct = Math.min(100, Math.max(0, Number(progress)));

  return createPortal(
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/40 p-4"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm theme-panel rounded-xl border px-6 py-7 text-center shadow-2xl ring-1 ring-slate-900/5">
        <p className="text-sm font-semibold text-slate-900">{message}</p>
        {detail ? <p className="mt-1 text-sm text-slate-600">{detail}</p> : null}
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#185FA5] transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">{Math.round(pct)}%</p>
      </div>
    </div>,
    document.body,
  );
}
