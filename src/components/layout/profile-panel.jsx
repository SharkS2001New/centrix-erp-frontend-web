"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { navigateAfterAuthSessionReady } from "@/lib/post-auth-navigation";
import { PasswordInput } from "@/components/auth/password-input";
import {
  Field,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { ProfileTwoFactorSection } from "@/components/layout/profile-two-factor-section";

function accessLabel(user, capabilities) {
  if (user?.is_super_admin || capabilities?.is_super_admin) {
    return "Platform super administrator";
  }
  if (user?.is_admin || capabilities?.is_admin) {
    return "Organization administrator";
  }
  if (user?.access_scope === "org") {
    return "Whole organization";
  }
  return "Single branch";
}

export function ProfilePanel({ compact = false, onPasswordChangeComplete }) {
  const router = useRouter();
  const {
    user,
    organization,
    capabilities,
    completePasswordChange,
    updateProfile,
    switchWorkspace,
  } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMode, setVerifyMode] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const requiredPasswordChange = Boolean(user?.must_change_password);
  const savedEmail = String(user?.email ?? "").trim();
  const emailVerified = Boolean(user?.email_verified_at);
  const emailDirty = email.trim() !== savedEmail;

  useEffect(() => {
    setFullName(user?.full_name ?? "");
    setUsername(user?.username ?? "");
    setEmail(user?.email ?? "");
  }, [user?.email, user?.full_name, user?.username]);

  async function onSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiRequest("/auth/me", {
        method: "PATCH",
        body: {
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim() || null,
        },
      });
      updateProfile({
        full_name: res.full_name,
        username: res.username,
        email: res.email,
        email_verified_at: res.email_verified_at ?? null,
      });
      setVerifyMode(false);
      setVerifyCode("");
      notifySuccess("Profile updated.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function beginEmailVerification() {
    setVerifyBusy(true);
    try {
      const res = await apiRequest("/auth/email/verify/begin", { method: "POST", body: {} });
      if (res.already_verified) {
        updateProfile({ email_verified_at: res.verified_at ?? user?.email_verified_at });
        notifySuccess("Email is already verified.");
        setVerifyMode(false);
      } else {
        setVerifyMode(true);
        setVerifyCode("");
        notifySuccess("Verification code sent to your email.");
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not send verification email.");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function confirmEmailVerification(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const code = verifyCode.trim();
    if (!code || verifyBusy) return;

    setVerifyBusy(true);
    try {
      const res = await apiRequest("/auth/email/verify/confirm", {
        method: "POST",
        body: { code },
      });
      updateProfile({
        email: res.email,
        email_verified_at: res.email_verified_at ?? new Date().toISOString(),
      });
      setVerifyMode(false);
      setVerifyCode("");
      notifySuccess("Email verified.");
    } catch (err) {
      // Keep the verification UI open so the user can retry or dismiss it.
      notifyError(err instanceof ApiError ? err.message : "Invalid verification code.");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = requiredPasswordChange
        ? await apiRequest("/auth/set-required-password", {
            method: "POST",
            body: {
              password,
              password_confirmation: passwordConfirmation,
            },
          })
        : await apiRequest("/auth/change-password", {
            method: "POST",
            body: {
              current_password: currentPassword,
              password,
              password_confirmation: passwordConfirmation,
            },
          });

      const caps = (await completePasswordChange(res)) ?? capabilities;
      notifySuccess(res.message);
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirmation("");

      const nextUser = { ...(res?.user ?? user), must_change_password: false };
      const ctx = buildAccessContext({
        user: nextUser,
        organization,
        capabilities: caps,
        requireTillFloat: resolveTillFloatNavFlag(caps),
      });
      await navigateAfterAuthSessionReady(ctx, caps, router, {
        switchWorkspace,
        afterPasswordLock: true,
      });
      onPasswordChangeComplete?.();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not update password.");
    } finally {
      setSaving(false);
    }
  }

  const gridClass = compact
    ? "grid gap-5"
    : "grid gap-6 lg:grid-cols-2";

  return (
    <div className="space-y-6">
      <div className={gridClass}>
      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Account</h2>
        <form onSubmit={onSaveProfile} className="mt-4 space-y-4">
          <Field label="Full name">
            <input
              type="text"
              className={inputClassName()}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={200}
              autoComplete="name"
            />
          </Field>
          <Field label="Username">
            <input
              type="text"
              className={`${inputClassName()} font-mono`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={50}
              autoComplete="username"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputClassName()}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              autoComplete="email"
            />
          </Field>
          {savedEmail ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
              {emailVerified && !emailDirty ? (
                <p className="text-xs text-emerald-700">Email verified. Required before enabling email 2FA.</p>
              ) : (
                <p className="text-xs text-amber-800">
                  {emailDirty
                    ? "Save your email first, then verify it. Email 2FA requires a verified address."
                    : "This email is not verified yet. Verify it before enabling email 2FA."}
                </p>
              )}
              {!emailVerified && !emailDirty ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={SECONDARY_BTN_CLASS}
                    disabled={verifyBusy || savingProfile}
                    onClick={() => void beginEmailVerification()}
                  >
                    {verifyBusy && !verifyMode ? "Sending…" : "Send verification code"}
                  </button>
                </div>
              ) : null}
              {verifyMode && !emailDirty && !emailVerified ? (
                <div className="space-y-2 pt-1">
                  <Field label="Email verification code">
                    <input
                      className={inputClassName()}
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (verifyCode.trim() && !verifyBusy) {
                            void confirmEmailVerification(e);
                          }
                        }
                      }}
                      placeholder="6-digit code"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton
                      type="button"
                      showIcon={false}
                      disabled={verifyBusy || !verifyCode.trim()}
                      onClick={(e) => void confirmEmailVerification(e)}
                    >
                      {verifyBusy ? "Verifying…" : "Verify email"}
                    </PrimaryButton>
                    <button
                      type="button"
                      className={SECONDARY_BTN_CLASS}
                      disabled={verifyBusy}
                      onClick={() => {
                        setVerifyMode(false);
                        setVerifyCode("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Add and save an email address, then verify it to use email two-factor authentication.
            </p>
          )}
          <dl className="space-y-3 border-t border-slate-100 pt-4 text-sm">
            <div>
              <dt className="text-slate-500">Organization</dt>
              <dd className="text-slate-900">
                {organization?.org_name ?? "—"}
                {organization?.company_code ? (
                  <span className="ml-2 font-mono text-xs text-slate-500">
                    ({organization.company_code})
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Access</dt>
              <dd className="text-slate-900">{accessLabel(user, capabilities)}</dd>
            </div>
          </dl>
          <PrimaryButton type="submit" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </PrimaryButton>
        </form>
      </section>

      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {requiredPasswordChange ? "Set a new password" : "Change password"}
        </h2>
        {requiredPasswordChange ? (
          <p className="mt-2 text-sm text-slate-600">
            Choose a new password to unlock the rest of the application.
          </p>
        ) : null}
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          {!requiredPasswordChange ? (
            <Field label="Current password">
              <PasswordInput
                className={inputClassName()}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
          ) : null}
          <Field label="New password">
            <PasswordInput
              className={inputClassName()}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput
              className={inputClassName()}
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              minLength={6}
              required
            />
          </Field>
          <PrimaryButton type="submit" disabled={saving}>
            {saving
              ? "Saving…"
              : requiredPasswordChange
                ? "Save password and continue"
                : "Update password"}
          </PrimaryButton>
        </form>
      </section>
      </div>
      {!requiredPasswordChange ? <ProfileTwoFactorSection /> : null}
    </div>
  );
}
