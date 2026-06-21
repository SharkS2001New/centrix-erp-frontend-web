"use client";

import { apiRequest } from "@/lib/api";

export function KraProductUploadToolbar({
  enabled,
  selectMode,
  selectedCount,
  filteredCount,
  busy,
  message,
  error,
  onEnterSelectMode,
  onExitSelectMode,
  onClearSelection,
  onUploadSelected,
  onUploadAll,
}) {
  if (!enabled) {
    return null;
  }

  if (!selectMode) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onEnterSelectMode}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Select items
        </button>
        <button
          type="button"
          onClick={onUploadAll}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          title="Register the full active catalogue on the KRA device"
        >
          {busy ? "Uploading…" : "Upload all items to KRA device"}
        </button>
        {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <span className="font-medium text-slate-900">{selectedCount} selected</span>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={onExitSelectMode}
            className="text-sm font-medium text-slate-600 hover:underline"
          >
            Cancel
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onUploadSelected}
            disabled={busy || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload items to KRA device"}
          </button>
          <button
            type="button"
            onClick={onUploadAll}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            title={`Upload all ${filteredCount} active products`}
          >
            Upload all ({filteredCount})
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

/** Submit KRA registration (returns 202 + task_id when queued). */
export async function submitKraProductRegistration({ productCodes, all = false }) {
  return apiRequest("/kra/register-products", {
    method: "POST",
    body: all ? { all: true } : { product_codes: productCodes },
  });
}
