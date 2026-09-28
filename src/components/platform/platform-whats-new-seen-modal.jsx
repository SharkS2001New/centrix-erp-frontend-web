"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { notifyError } from "@/lib/notify";

function formatSeenAt(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

/**
 * Lists users who dismissed the login “What's new” popup for a note.
 */
export function PlatformWhatsNewSeenModal({ note, open, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !note?.id) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    setRows([]);
    void (async () => {
      try {
        const res = await apiRequest(`/admin/whats-new/${note.id}/reads`, { loading: false });
        if (cancelled) return;
        setRows(res?.data ?? []);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "Failed to load who has seen this update.";
        setError(message);
        notifyError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, note?.id]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !note) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-seen-title"
        className="theme-modal flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id="whats-new-seen-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Who has seen this update
            </h2>
            <p className="mt-1 truncate text-sm text-slate-500">{note.title}</p>
            <p className="mt-1 text-xs text-slate-400">
              Users who dismissed the login popup for this note.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">
              No one has dismissed this popup yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">User</th>
                    <th className="px-3 py-2 font-medium">Organization</th>
                    <th className="px-3 py-2 font-medium">Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.user_id}-${row.dismissed_at}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">
                          {row.full_name || row.username || `User #${row.user_id}`}
                        </div>
                        <div className="text-xs text-slate-500">
                          {[row.username, row.email].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.organization_name || "—"}
                        {row.company_code ? (
                          <span className="ml-1 text-xs text-slate-400">{row.company_code}</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                        {formatSeenAt(row.dismissed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-6 py-3 dark:border-slate-800">
          <p className="text-xs text-slate-500">
            {loading ? "…" : `${rows.length} user${rows.length === 1 ? "" : "s"}`}
          </p>
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
