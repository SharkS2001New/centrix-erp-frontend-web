"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError } from "@/lib/api";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { resolvePostLoginPath } from "@/lib/workspaces";
import {
  AuthError,
  AuthField,
  AuthShell,
  AuthSubmitButton,
  authInputClass,
} from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, organization, capabilities, clearMustChangePassword, refreshCapabilities } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    try {
      await apiRequest("/auth/set-required-password", {
        method: "POST",
        body: {
          password,
          password_confirmation: confirmation,
        },
      });
      clearMustChangePassword();
      const caps = capabilities ?? (await refreshCapabilities());
      const ctx = buildAccessContext({
        user: { ...user, must_change_password: false },
        organization,
        capabilities: caps,
        requireTillFloat: resolveTillFloatNavFlag(caps),
      });
      router.replace(resolvePostLoginPath(ctx, caps));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle={`Hi ${user?.full_name ?? user?.username ?? "there"} — choose a new password before continuing.`}
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
