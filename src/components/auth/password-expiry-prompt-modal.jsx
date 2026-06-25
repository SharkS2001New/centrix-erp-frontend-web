"use client";

export function PasswordExpiryPromptModal({
  open,
  busy = false,
  passwordExpiry,
  onSkip,
  onUpdateLater,
  onUpdateNow,
}) {
  if (!open) return null;

  const skipsRemaining = Number(passwordExpiry?.skips_remaining ?? 0);
  const skipCount = Number(passwordExpiry?.skip_count ?? 0);
  const maxSkips = Number(passwordExpiry?.max_skips ?? 2);
  const expiryDays = Number(passwordExpiry?.expiry_days ?? 90);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-expiry-title"
        className="relative w-full max-w-md rounded-xl border border-[var(--theme-border)] bg-[var(--theme-panel-bg)] p-6 shadow-xl"
      >
        <h2 id="password-expiry-title" className="text-lg font-semibold text-slate-900">
          Password update recommended
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Your password is older than {expiryDays} days. For security, please choose a new password.
        </p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You can defer this {skipsRemaining} more time{skipsRemaining === 1 ? "" : "s"} before access
          is blocked. Reminders used: {skipCount} of {maxSkips}.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy || skipsRemaining <= 0}
            onClick={() => void onSkip()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={busy || skipsRemaining <= 0}
            onClick={() => void onUpdateLater()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Update later
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onUpdateNow}
            className="rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Update now
          </button>
        </div>
      </div>
    </div>
  );
}
