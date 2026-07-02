"use client";

import { tripStatusLabel, tripWorkflowIndex, tripWorkflowSteps } from "@/lib/trip-status";

export function TripWorkflowBanner({ status }) {
  const steps = tripWorkflowSteps();
  const currentIndex = tripWorkflowIndex(status);
  const cancelled = String(status ?? "") === "cancelled";

  if (cancelled) {
    return (
      <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        This trip chart was cancelled and will not be dispatched.
      </div>
    );
  }

  return (
    <div className="mb-6 theme-panel rounded-xl border p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Trip lifecycle</p>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const done = currentIndex > index;
          const active = currentIndex === index;
          return (
            <li
              key={step.key}
              className={`rounded-lg border px-3 py-2 ${
                active
                  ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/5"
                  : done
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  active ? "text-[var(--theme-primary)]" : done ? "text-emerald-800" : "text-slate-600"
                }`}
              >
                {index + 1}. {step.label}
              </p>
              <p className="mt-1 text-xs text-slate-600">{step.hint}</p>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-slate-500">
        Current status: <span className="font-medium text-slate-700">{tripStatusLabel(status)}</span>
        {status === "draft" || status === "loading"
          ? " — use Lock loading list, then Start trip to dispatch."
          : null}
      </p>
    </div>
  );
}
