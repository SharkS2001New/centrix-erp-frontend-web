"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession, getStoredUser, readCachedAuthSnapshot } from "@/lib/auth-storage";
import { buildAccessContext, resolveHomePath } from "@/lib/access-control";
import { ApiError, apiRequest, isSessionConflictError } from "@/lib/api";
import {
  isLicenseExpiredApiError,
  licenseExpiredMessage,
} from "@/lib/organization-license";
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
import { getPasskeyAssertion, webAuthnSupported } from "@/lib/webauthn";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login, loginWithPasskey, completeTwoFactorLogin, completeTwoFactorWithPasskey } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [showOrgField, setShowOrgField] = useState(true);
  const [companyCode, setCompanyCode] = useState(() => getDefaultCompanyCode());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [sessionConflict, setSessionConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const passkeysOk = webAuthnSupported();

  useEffect(() => {
    const stored = getStoredCompanyCode();
    if (stored) {
      setCompanyCode(stored);
      setShowOrgField(false);
    }
  }, []);

  useEffect(() => {
    if (!passkeysOk) {
      setPasskeyAvailable(false);
      return undefined;
    }

    const org = companyCode.trim().toUpperCase();
    const user = username.trim();
    if (!org || !user) {
      setPasskeyAvailable(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void apiRequest("/auth/passkeys/login/availability", {
        method: "POST",
        body: { company_code: org, username: user },
        token: null,
      })
        .then((res) => {
          if (!cancelled) setPasskeyAvailable(Boolean(res?.available));
        })
        .catch(() => {
          if (!cancelled) setPasskeyAvailable(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [companyCode, username, passkeysOk]);

  useEffect(() => {
    if (hasAuthSession()) {
      const storedUser = getStoredUser();
      if (storedUser?.must_change_password) {
        router.replace("/change-password");
        return;
      }
      const cached = readCachedAuthSnapshot();
      const homePath = resolveHomePath(
        buildAccessContext({
          user: storedUser ?? cached?.user ?? null,
          organization: cached?.organization ?? null,
          capabilities: cached?.capabilities ?? null,
          isSuperAdmin: () =>
            Boolean(storedUser?.is_super_admin || cached?.capabilities?.is_super_admin),
        }),
      );
      router.replace(homePath);
    }
  }, [router]);

  function useDifferentOrganization() {
    clearStoredCompanyCode();
    setShowOrgField(true);
    setCompanyCode("");
    setPasskeyAvailable(false);
  }

  async function attemptLogin(forceLogout = false) {
    setError(null);
    if (!forceLogout) {
      setSessionConflict(false);
    }
    setSubmitting(true);
    try {
      const result = await login(companyCode, username, password, { forceLogout });
      if (result?.mfa_required) {
        setMfaChallenge(result);
        setMfaCode("");
      }
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
        if (isLicenseExpiredApiError(err)) {
          setError(
            err instanceof ApiError
              ? err.message
              : licenseExpiredMessage(null),
          );
        } else {
          setError(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Login failed. Check that the API is reachable and try again.",
          );
        }
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

  async function onVerifyMfa(e) {
    e.preventDefault();
    if (!mfaChallenge?.challenge_token) return;
    setError(null);
    setSubmitting(true);
    try {
      await completeTwoFactorLogin(mfaChallenge.challenge_token, mfaCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid verification code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResendMfa() {
    if (!mfaChallenge?.challenge_token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest("/auth/2fa/resend", {
        method: "POST",
        body: { challenge_token: mfaChallenge.challenge_token },
        token: null,
      });
      setMfaChallenge((prev) => ({ ...prev, email_hint: res.email_hint ?? prev?.email_hint }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resend code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasskeyLogin() {
    setError(null);
    setSessionConflict(false);
    setSubmitting(true);
    try {
      const org = companyCode.trim().toUpperCase();
      const user = username.trim();
      if (!org || !user) {
        setError("Enter organization code and username to sign in with a passkey.");
        return;
      }
      const begin = await apiRequest("/auth/passkeys/login/options", {
        method: "POST",
        body: {
          company_code: org,
          username: user,
        },
        token: null,
      });
      if (!begin?.has_credentials || !begin?.options || !begin?.challenge_token) {
        setPasskeyAvailable(false);
        setError("No passkey is registered for this organization account.");
        return;
      }
      const credential = await getPasskeyAssertion(begin.options);
      await loginWithPasskey(begin.challenge_token, credential);
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setError("Passkey sign-in was cancelled.");
      } else if (isSessionConflictError(err)) {
        setSessionConflict(true);
        setError(err instanceof ApiError ? err.message : "Already signed in elsewhere.");
      } else {
        setError(err instanceof ApiError ? err.message : err?.message || "Passkey sign-in failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasskeyMfa() {
    if (!mfaChallenge?.challenge_token) return;
    setError(null);
    setSubmitting(true);
    try {
      const begin = await apiRequest("/auth/2fa/passkey/options", {
        method: "POST",
        body: { challenge_token: mfaChallenge.challenge_token },
        token: null,
      });
      const credential = await getPasskeyAssertion(begin.options);
      await completeTwoFactorWithPasskey(begin.challenge_token, credential);
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setError("Passkey verification was cancelled.");
      } else {
        setError(err instanceof ApiError ? err.message : err?.message || "Passkey verification failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const sessionMessage =
    reason === "idle"
      ? "Your session expired due to inactivity. Please sign in again."
      : reason === "session"
        ? "Your session ended because this account signed in on another device."
        : reason === "license"
          ? "Your organization’s Centrix licence has expired. All users have been signed out. Contact your Centrix administrator to renew or extend the licence."
          : null;

  if (mfaChallenge?.mfa_required) {
    const isEmail = mfaChallenge.method === "email";
    return (
      <AuthShell
        title="Two-factor authentication"
        subtitle={
          isEmail
            ? `Enter the code sent to ${mfaChallenge.email_hint || "your email"}.`
            : "Enter the 6-digit code from Google Authenticator."
        }
      >
        <form onSubmit={onVerifyMfa} className="mt-6 space-y-4">
          {error ? <AuthError>{error}</AuthError> : null}
          <AuthField label="Verification code">
            <input
              className={authInputClass()}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="6-digit code"
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
            />
          </AuthField>
          <AuthSubmitButton disabled={submitting || !mfaCode.trim()}>
            {submitting ? "Verifying…" : "Verify and continue"}
          </AuthSubmitButton>
          {mfaChallenge.passkey_available && passkeysOk ? (
            <button
              type="button"
              className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900"
              disabled={submitting}
              onClick={() => void onPasskeyMfa()}
            >
              Use a passkey instead
            </button>
          ) : null}
          {isEmail ? (
            <button
              type="button"
              className="w-full text-sm font-medium text-emerald-700 hover:underline"
              disabled={submitting}
              onClick={() => void onResendMfa()}
            >
              Resend email code
            </button>
          ) : null}
          <button
            type="button"
            className="w-full text-sm text-slate-500 hover:underline"
            disabled={submitting}
            onClick={() => {
              setMfaChallenge(null);
              setMfaCode("");
              setError(null);
            }}
          >
            Back to sign in
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" subtitle="Sign in with your email or username and password.">
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
        <AuthField label="Username or email">
          <input
            className={authInputClass()}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
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
        </AuthField>
        {sessionMessage ? <AuthNotice>{sessionMessage}</AuthNotice> : null}
        {error ? <AuthError>{error}</AuthError> : null}
        {sessionConflict ? (
          <button
            type="button"
            onClick={() => void onForceLogout()}
            className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900"
            disabled={submitting}
          >
            Sign out other device and continue
          </button>
        ) : null}
        <AuthSubmitButton disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </AuthSubmitButton>
        {passkeysOk && passkeyAvailable ? (
          <>
            <div className="relative py-1 text-center text-xs text-slate-400">
              <span className="relative z-10 bg-white px-2 dark:bg-slate-950">or</span>
              <span className="absolute inset-x-0 top-1/2 border-t border-slate-200 dark:border-slate-800" />
            </div>
            <button
              type="button"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              disabled={submitting}
              onClick={() => void onPasskeyLogin()}
            >
              Sign in with a passkey
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="w-full text-sm text-slate-500 hover:underline"
          onClick={() => setForgotPasswordOpen(true)}
        >
          Forgot password?
        </button>
      </form>
      <ForgotPasswordHelpDialog open={forgotPasswordOpen} onClose={() => setForgotPasswordOpen(false)} />
    </AuthShell>
  );
}
