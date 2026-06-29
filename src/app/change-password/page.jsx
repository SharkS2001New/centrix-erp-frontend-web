"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError } from "@/lib/api";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { navigateAfterAuthSessionReady } from "@/lib/post-auth-navigation";
import {
  AuthError,
  AuthField,
  AuthShell,
  AuthSubmitButton,
  authInputClass,
} from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";

function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    organization,
    completePasswordChange,
    switchWorkspace,
  } = useAuth();
  const reason = searchParams.get("reason");
  const isExpired = reason === "expired" && !user?.must_change_password;
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function redirectAfterSuccess(nextUser, res) {
    const caps = (await completePasswordChange(res)) ?? null;
    const ctx = buildAccessContext({
      user: nextUser,
      organization,
      capabilities: caps,
      requireTillFloat: resolveTillFloatNavFlag(caps),
    });
    await navigateAfterAuthSessionReady(ctx, caps, router, { switchWorkspace });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Password confirmation does not match.");
      return;
    }
    if (isExpired && !currentPassword.trim()) {
      setError("Enter your current password.");
      return;
    }

    setSubmitting(true);
    try {
      if (isExpired || (!user?.must_change_password && currentPassword)) {
        const res = await apiRequest("/auth/change-password", {
          method: "POST",
          body: {
            current_password: currentPassword,
            password,
            password_confirmation: confirmation,
          },
        });
        await redirectAfterSuccess({ ...user, must_change_password: false }, res);
        return;
      }

      const res = await apiRequest("/auth/set-required-password", {
        method: "POST",
        body: {
          password,
          password_confirmation: confirmation,
        },
      });
      await redirectAfterSuccess({ ...user, must_change_password: false }, res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  }

  const title = isExpired ? "Change your password" : "Set a new password";
  const subtitle = isExpired
    ? "Your password has expired. Enter your current password and choose a new one to continue."
    : `Hi ${user?.full_name ?? user?.username ?? "there"} — choose a new password before continuing.`;

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {isExpired ? (
          <AuthField label="Current password">
            <PasswordInput
              className={authInputClass()}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </AuthField>
        ) : null}
        <AuthField label="New password">
          <PasswordInput
            className={authInputClass()}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </AuthField>
        <AuthField label="Confirm password">
          <PasswordInput
            className={authInputClass()}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </AuthField>
        <AuthError>{error}</AuthError>
        <AuthSubmitButton disabled={submitting}>
          {submitting ? "Saving…" : "Save password and continue"}
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Change password" subtitle="Loading…" />}>
      <ChangePasswordForm />
    </Suspense>
  );
}
