"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { getDefaultCompanyCode, getStoredCompanyCode } from "@/lib/tenant-config";
import {
  AuthError,
  AuthField,
  AuthShell,
  AuthSubmitButton,
  AuthSuccess,
  authInputClass,
} from "@/components/auth/auth-shell";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const orgFromUrl =
    searchParams.get("org")?.toUpperCase() || getStoredCompanyCode() || getDefaultCompanyCode();

  const [companyCode, setCompanyCode] = useState(orgFromUrl);
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await apiRequest("/auth/reset-password", {
        method: "POST",
        body: {
          company_code: companyCode.trim().toUpperCase(),
          token: token.trim(),
          password,
          password_confirmation: passwordConfirmation,
        },
        token: null,
      });
      setSuccess(res.message);
      setTimeout(() => router.replace("/login"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Reset password" subtitle="Choose a new password for your account.">
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <AuthField label="Organization code">
          <input
            className={authInputClass("uppercase")}
            value={companyCode}
            onChange={(e) => setCompanyCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
            required
          />
        </AuthField>
        {!tokenFromUrl ? (
          <AuthField label="Reset token">
            <input
              className={authInputClass()}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </AuthField>
        ) : null}
        <AuthField label="New password">
          <input
            type="password"
            className={authInputClass()}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </AuthField>
        <AuthField label="Confirm new password">
          <input
            type="password"
            className={authInputClass()}
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            minLength={6}
            required
          />
        </AuthField>
        <AuthError>{error}</AuthError>
        <AuthSuccess>{success}</AuthSuccess>
        <AuthSubmitButton disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </AuthSubmitButton>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-emerald-700 dark:text-emerald-400">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
