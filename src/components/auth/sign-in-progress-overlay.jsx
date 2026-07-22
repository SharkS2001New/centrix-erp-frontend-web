"use client";

import { createPortal } from "react-dom";

/**
 * Full-screen sign-in wait state with circular percentage progress.
 * Keep mounted until the ERP route replaces the login page.
 */
export function SignInProgressOverlay({
  label = "Signing in",
  progress = 0,
  open = false,
}) {
  if (!open || typeof document === "undefined") return null;

  const pct = Math.min(100, Math.max(0, Math.round(Number(progress) || 0)));
  const size = 88;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="relative w-full max-w-xs rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="relative mx-auto" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              className="text-slate-200 dark:text-slate-700"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="text-emerald-600 transition-[stroke-dashoffset] duration-300 ease-out dark:text-emerald-400"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {pct}%
            </span>
          </div>
        </div>
        <p className="mt-5 text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
      </div>
    </div>,
    document.body,
  );
}
