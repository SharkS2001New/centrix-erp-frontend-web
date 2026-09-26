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
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="whats-new-modal relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--theme-border-strong,var(--theme-border))] shadow-2xl"
      >
        <div className="whats-new-modal__glow" aria-hidden />
        <div className="whats-new-modal__sheen" aria-hidden />
        <div className="relative z-[1] p-6 sm:p-7">
          <div className="mb-4 flex items-center gap-2">
            <span className="whats-new-modal__chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide">
              <span className="whats-new-modal__chip-dot" aria-hidden />
              New in Centrix
            </span>
          </div>
          <h2
            id="whats-new-title"
            className="text-xl font-semibold tracking-tight text-[var(--theme-text)]"
          >
            {note.title}
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--theme-text-muted)]">
            {note.body}
          </p>
          {note.link_url ? (
            <a
              href={note.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex text-sm font-semibold text-[var(--theme-primary)] hover:underline"
            >
              Learn more
            </a>
          ) : null}
          <div className="mt-7 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void dismiss()}
              className="rounded-lg border border-[var(--theme-border-strong,var(--theme-border))] bg-[var(--theme-surface)] px-4 py-2 text-sm font-medium text-[var(--theme-text)] hover:bg-[var(--theme-hover)] disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void dismiss()}
              className="rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-[var(--theme-primary-fg,#fff)] hover:bg-[var(--theme-primary-hover,var(--theme-primary))] hover:opacity-95 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Got it"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
