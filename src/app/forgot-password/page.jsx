"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const initialOrg =
    searchParams.get("org")?.toUpperCase() || getStoredCompanyCode() || getDefaultCompanyCode();

  const [companyCode, setCompanyCode] = useState(initialOrg);
  const [username, setUsername] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [devResetUrl, setDevResetUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setDevResetUrl(null);
    setSubmitting(true);
    try {
      const res = await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: {
          company_code: companyCode.trim().toUpperCase(),
          username: username.trim(),
        },
        token: null,
      });
      setSuccess(res.message);
      if (res.reset_url) {
        setDevResetUrl(res.reset_url);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not request password reset.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your organization code and username. If the account exists, reset instructions will be sent to the email on file."
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <AuthField label="Organization code">
          <input
            className={authInputClass("uppercase")}
            value={companyCode}
            onChange={(e) => setCompanyCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
            required
          />
        </AuthField>
        <AuthField label="Username">
          <input
            className={authInputClass()}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </AuthField>
        <AuthError>{error}</AuthError>
        <AuthSuccess>{success}</AuthSuccess>
        {devResetUrl ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            Development reset link:{" "}
            <Link href={devResetUrl.replace(/^https?:\/\/[^/]+/, "")} className="break-all text-emerald-700 dark:text-emerald-400">
              open reset page
            </Link>
          </p>
        ) : null}
        <AuthSubmitButton disabled={submitting}>
          {submitting ? "Sending…" : "Send reset instructions"}
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

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
