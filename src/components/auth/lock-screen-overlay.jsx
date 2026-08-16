"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/auth-context";
import { PasswordInput } from "@/components/auth/password-input";
import { PinDots, PinKeypad } from "@/components/auth/pin-keypad";
import { CentrixLogoFull } from "@/components/branding/centrix-logo";
import { inputClassName, PrimaryButton, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";

function LockIcon({ className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25-2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
      />
    </svg>
  );
}

function UserAvatar({ name, large = false }) {
  const initial = (String(name ?? "U").trim()?.[0] ?? "U").toUpperCase();
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-[#405189] font-semibold text-white ${
        large ? "h-16 w-16 text-xl" : "h-12 w-12 text-sm"
      }`}
    >
      {initial}
    </div>
  );
}

function operatorName(row) {
  return row?.full_name || row?.username || "User";
}

export function LockScreenOverlay({
  user,
  unlocking,
  error,
  passkeyAvailable = false,
  pinUnlockAvailable = false,
  changeUserAvailable = false,
  operators = [],
  operatorsLoading = false,
  selectedOperator = null,
  onSelectOperator,
  onChangeUser,
  onBackToLastUser,
  onUnlock,
  onUnlockWithPin,
  onUnlockWithPasskey,
}) {
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState(pinUnlockAvailable ? "pin" : "password");

  const activeUser = selectedOperator ?? user;
  const displayName = operatorName(activeUser);
  const switchingUser =
    selectedOperator != null && String(selectedOperator.id) !== String(user?.id);
  const usePin =
    mode === "pin" && (switchingUser || selectedOperator?.has_login_pin || user?.has_login_pin);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPin("");
    setPassword("");
  }, [selectedOperator?.id, mode]);

  useEffect(() => {
    if (pinUnlockAvailable) setMode("pin");
    else setMode("password");
  }, [pinUnlockAvailable, selectedOperator?.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("screen-locked");

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove("screen-locked");
    };
  }, []);

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (!password.trim() || unlocking) return;
    await onUnlock(password);
  }

  async function submitPin(nextPin = pin) {
    const digits = String(nextPin ?? "").replace(/\D/g, "");
    if (digits.length < 4 || unlocking) return;
    await onUnlockWithPin?.(digits);
    setPin("");
  }

  const otherOperators = useMemo(
    () => operators.filter((row) => String(row.id) !== String(user?.id)),
    [operators, user?.id],
  );

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
        {mode === "users" ? (
          <>
            <div className="flex flex-col items-center text-center">
              <CentrixLogoFull />
              <h1 id="lock-screen-title" className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Who is signing in?
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Tap your name, then enter your PIN.
              </p>
            </div>
            <div className="mt-5 max-h-[50vh] space-y-2 overflow-y-auto">
              {operatorsLoading ? (
                <p className="py-6 text-center text-sm text-slate-500">Loading staff…</p>
              ) : operators.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No staff PINs are set yet. Ask an administrator to add a screen PIN.
                </p>
              ) : (
                operators.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    onClick={() => {
                      onSelectOperator?.(row);
                      setMode("pin");
                    }}
                  >
                    <UserAvatar name={operatorName(row)} />
                    <span>
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {operatorName(row)}
                      </span>
                      {row.username ? (
                        <span className="block text-xs text-slate-500">{row.username}</span>
                      ) : null}
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              className={`${SECONDARY_BTN_CLASS} mt-4 w-full justify-center`}
              onClick={() => {
                onBackToLastUser?.();
                setMode(pinUnlockAvailable ? "pin" : "password");
              }}
            >
              Back
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center text-center">
              <CentrixLogoFull />
              <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                <LockIcon />
              </div>
              <div className="mt-4">
                <UserAvatar name={displayName} large />
              </div>
              <h1 id="lock-screen-title" className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {displayName}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {switchingUser
                  ? "Enter your PIN to take over this screen"
                  : usePin
                    ? "Last signed in — enter your PIN to unlock"
                    : passkeyAvailable
                      ? "Enter your password or unlock with a passkey."
                      : "Enter your password to unlock the screen!"}
              </p>
            </div>

            {usePin ? (
              <div className="mt-6 space-y-4">
                <PinDots length={Math.max(4, pin.length || 4)} filled={pin.length} />
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submitPin();
                    }
                  }}
                  className="sr-only"
                  aria-label="PIN"
                  disabled={unlocking}
                />
                <PinKeypad
                  value={pin}
                  onChange={setPin}
                  disabled={unlocking}
                  onSubmit={(next) => void submitPin(next)}
                />
                <PrimaryButton
                  type="button"
                  disabled={unlocking || pin.length < 4}
                  className="w-full justify-center"
                  onClick={() => void submitPin()}
                >
                  {unlocking ? "Unlocking…" : "Unlock"}
                </PrimaryButton>
                {switchingUser ? null : (
                <button
                  type="button"
                  className="w-full text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  onClick={() => setMode("password")}
                >
                  Use password instead
                </button>
                )}
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
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
                <PrimaryButton type="submit" disabled={unlocking || !password.trim()} className="w-full justify-center">
                  {unlocking ? "Unlocking…" : "Unlock"}
                </PrimaryButton>
                {pinUnlockAvailable ? (
                  <button
                    type="button"
                    className="w-full text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    onClick={() => setMode("pin")}
                  >
                    Use PIN instead
                  </button>
                ) : null}
              </form>
            )}

            {error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            ) : null}

            {passkeyAvailable && onUnlockWithPasskey && !usePin ? (
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

            {changeUserAvailable || otherOperators.length > 0 ? (
              <button
                type="button"
                className={`${SECONDARY_BTN_CLASS} mt-4 w-full justify-center`}
                onClick={() => {
                  onChangeUser?.();
                  setMode("users");
                }}
              >
                Not you? Change user
              </button>
            ) : null}
          </>
        )}

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
