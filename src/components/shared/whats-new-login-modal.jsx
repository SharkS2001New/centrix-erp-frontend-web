"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/api";
import { getStoredWorkspace } from "@/lib/auth-storage";

/**
 * Dismissible “New in Centrix” modal — shows once per published note for matching
 * org + workspace users. Close / Got it marks it read permanently.
 */
export function WhatsNewLoginModal() {
  const { user, loading, isSuperAdmin } = useAuth();
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const loadPending = useCallback(async () => {
    if (!user || loading || isSuperAdmin?.()) {
      setChecked(true);
      return;
    }

    const workspace = getStoredWorkspace();
    try {
      const qs = workspace ? `?workspace=${encodeURIComponent(workspace)}` : "";
      const res = await apiRequest(`/whats-new/pending${qs}`, { loading: false });
      const first = Array.isArray(res?.data) ? res.data[0] : null;
      setNote(first ?? null);
    } catch {
      setNote(null);
    } finally {
      setChecked(true);
    }
  }, [user, loading, isSuperAdmin]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  async function dismiss() {
    if (!note?.id || busy) return;
    setBusy(true);
    try {
      await apiRequest(`/whats-new/${note.id}/dismiss`, { method: "POST", loading: false });
    } catch {
      // Still close locally so the user is not stuck.
    } finally {
      setNote(null);
      setBusy(false);
      // Load next pending note if any remain.
      void loadPending();
    }
  }

  if (!checked || !note) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="relative w-full max-w-lg rounded-xl border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-6 shadow-xl"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex rounded-full bg-[#E6F1FB] px-2.5 py-0.5 text-xs font-semibold text-[#185FA5]">
            New in Centrix
          </span>
        </div>
        <h2 id="whats-new-title" className="text-lg font-semibold text-slate-900">
          {note.title}
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{note.body}</p>
        {note.link_url ? (
          <a
            href={note.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-medium text-[#185FA5] hover:underline"
          >
            Learn more
          </a>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void dismiss()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void dismiss()}
            className="rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
