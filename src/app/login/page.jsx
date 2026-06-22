"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession, getStoredUser } from "@/lib/auth-storage";
import { ApiError, isSessionConflictError } from "@/lib/api";
import {
  clearStoredCompanyCode,
  getDefaultCompanyCode,
  getStoredCompanyCode,
} from "@/lib/tenant-config";
import {
  AuthError,
  AuthField,
  AuthNotice,
  AuthShell,
  AuthSubmitButton,
  authInputClass,
} from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { ForgotPasswordHelpDialog } from "@/components/auth/forgot-password-help-dialog";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  // SSR and first client paint must match — read localStorage only after mount.
  const [showOrgField, setShowOrgField] = useState(true);
  const [companyCode, setCompanyCode] = useState(() => getDefaultCompanyCode());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [sessionConflict, setSessionConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredCompanyCode();
    if (stored) {
      setCompanyCode(stored);
      setShowOrgField(false);
    }
  }, []);

  useEffect(() => {
    if (hasAuthSession()) {
      const storedUser = getStoredUser();
      router.replace(
        storedUser?.must_change_password ? "/change-password" : "/dashboard",
      );
    }
  }, [router]);

  function useDifferentOrganization() {
    clearStoredCompanyCode();
    setShowOrgField(true);
    setCompanyCode("");
  }

  async function attemptLogin(forceLogout = false) {
    setError(null);
    if (!forceLogout) {
      setSessionConflict(false);
    }
    setSubmitting(true);
    try {
      await login(companyCode, username, password, { forceLogout });
    } catch (err) {
      if (isSessionConflictError(err)) {
        setSessionConflict(true);
        setError(
          err instanceof ApiError
            ? err.message
            : "This account is already signed in on another device.",
        );
      } else {
        setSessionConflict(false);
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Login failed. Check that the API is reachable and try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!companyCode.trim() && !username.includes("@")) {
      setError("Organization code is required unless signing in with a platform admin email.");
      return;
    }
    await attemptLogin(false);
  }

  async function onForceLogout() {
    await attemptLogin(true);
  }

  const sessionMessage =
    reason === "idle"
      ? "Your session expired due to inactivity. Please sign in again."
      : reason === "session"
        ? "Your session ended because this account signed in on another device."
        : null;

  return (
    <AuthShell subtitle="Sign in with your email or username and password.">
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {showOrgField ? (
          <AuthField label="Organization code">
            <input
              className={authInputClass("uppercase")}
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
              placeholder="e.g. DEMO (optional for platform admin)"
              autoComplete="organization"
            />
          </AuthField>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-slate-600 dark:text-slate-400">
              Organization{" "}
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {companyCode}
              </span>
            </p>
            <button
              type="button"
              onClick={useDifferentOrganization}
              className="mt-1 text-xs font-medium text-emerald-700 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Use a different organization
            </button>
          </div>
        )}

        <AuthField label="Email or username">
          <input
            className={authInputClass()}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="you@company.com or username"
            required
          />
        </AuthField>

        <AuthField label="Password">
          <PasswordInput
            className={authInputClass()}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="mt-1.5 text-right">
            <button
              type="button"
              onClick={() => setForgotPasswordOpen(true)}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Forgot password?
            </button>
          </div>
        </AuthField>

        <ForgotPasswordHelpDialog
          open={forgotPasswordOpen}
          onClose={() => setForgotPasswordOpen(false)}
        />

        {sessionMessage ? <AuthNotice>{sessionMessage}</AuthNotice> : null}
        <AuthError>{error}</AuthError>

        {sessionConflict ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 dark:border-amber-800/60 dark:bg-amber-950/30">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              You can sign out the other device and continue here. Any unsaved work on that device
              may be lost.
            </p>
            <button
              type="button"
              onClick={onForceLogout}
              disabled={submitting}
              className="mt-3 w-full rounded-lg border border-amber-400/60 bg-amber-100 py-2.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:border-amber-600/50 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
            >
              {submitting ? "Please wait…" : "Sign out other device and continue"}
            </button>
          </div>
        ) : null}

        <AuthSubmitButton disabled={submitting}>
          {submitting ? "Please wait…" : "Continue"}
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
