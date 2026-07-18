"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/auth-context";
import { PasswordInput } from "@/components/auth/password-input";
import { CentrixLogoFull } from "@/components/branding/centrix-logo";
import { inputClassName, PrimaryButton } from "@/components/catalog/catalog-shared";

function LockIcon({ className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
      />
    </svg>
  );
}

export function LockScreenOverlay({
  user,
  unlocking,
  error,
  passkeyAvailable = false,
  onUnlock,
  onUnlockWithPasskey,
}) {
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("screen-locked");

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove("screen-locked");
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!password.trim() || unlocking) return;
    await onUnlock(password);
  }

  const displayName = user?.full_name ?? user?.username ?? "User";
  const initial = (displayName.trim()?.[0] ?? "U").toUpperCase();

  if (!mounted) return null;

  return createPortal(
    <div
      id="lock-screen-root"
      className="lock-screen-overlay fixed inset-0 z-[99999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-screen-title"
    >
      <div className="velzon-modal w-full max-w-md rounded-xl border bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex flex-col items-center text-center">
          <CentrixLogoFull />
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
            <LockIcon />
          </div>
          <div className="mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#405189] text-sm font-semibold text-white">
            {initial}
          </div>
          <h1 id="lock-screen-title" className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {displayName}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {passkeyAvailable
              ? "Enter your password or unlock with a passkey."
              : "Enter your password to unlock the screen!"}
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="lock-screen-password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <PasswordInput
              id="lock-screen-password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClassName()}
              placeholder="Enter your password"
              disabled={unlocking}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <PrimaryButton type="submit" disabled={unlocking || !password.trim()} className="w-full justify-center">
            {unlocking ? "Unlocking…" : "Unlock"}
          </PrimaryButton>
        </form>

        {passkeyAvailable && onUnlockWithPasskey ? (
          <>
            <div className="relative my-4 text-center text-xs text-slate-400">
              <span className="relative z-10 bg-white px-2 dark:bg-slate-900">or</span>
              <span className="absolute inset-x-0 top-1/2 border-t border-slate-200 dark:border-slate-700" />
            </div>
            <button
              type="button"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              disabled={unlocking}
              onClick={() => void onUnlockWithPasskey()}
            >
              {unlocking ? "Unlocking…" : "Unlock with a passkey"}
            </button>
          </>
        ) : null}

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm text-slate-500 transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
