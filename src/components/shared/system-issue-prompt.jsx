"use client";

import { createPortal } from "react-dom";

export function SystemIssuePrompt({
  open,
  message,
  reportId,
  notes,
  onNotesChange,
  onDismiss,
  onReport,
  reporting,
  reported,
  technicalViewer = false,
}) {
  if (!open || typeof document === "undefined") return null;

  const helperText = technicalViewer
    ? "Technical details are shown below. You can still report this to track it on the system issues board."
    : "An error was logged automatically. You can notify the System Administrator with extra details to help resolve it faster.";

  return createPortal(
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
      <div
        className="w-full max-w-md theme-panel rounded-xl border px-6 py-6 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="system-issue-title"
      >
        <h2 id="system-issue-title" className="text-lg font-semibold text-slate-900">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-slate-600">{helperText}</p>
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-sm text-slate-800 ${
            technicalViewer
              ? "border-amber-200 bg-amber-50 font-mono text-xs whitespace-pre-wrap break-words"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          {message}
        </p>
        {reportId ? (
          <p className="mt-2 font-mono text-xs text-slate-500">Reference: {reportId}</p>
        ) : null}
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Additional notes (optional)</span>
          <textarea
            className="theme-input w-full rounded-lg border px-3 py-2 text-sm"
            rows={3}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="What were you trying to do?"
          />
        </label>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onDismiss}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="theme-primary-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={reporting || reported}
            onClick={onReport}
          >
            {reported ? "Reported" : reporting ? "Reporting…" : "Report to System Admin"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
