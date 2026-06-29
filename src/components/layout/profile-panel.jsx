"use client";

import { useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { PasswordInput } from "@/components/auth/password-input";
import {
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

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

export function ProfilePanel({ compact = false }) {
  const {
    user,
    organization,
    capabilities,
    applyPasswordExpiry,
    clearMustChangePassword,
    refreshCapabilities,
  } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest("/auth/change-password", {
        method: "POST",
        body: {
          current_password: currentPassword,
          password,
          password_confirmation: passwordConfirmation,
        },
      });
      applyPasswordExpiry(res.password_expiry ?? null);
      if (res.must_change_password === false) {
        clearMustChangePassword();
      }
      await refreshCapabilities().catch(() => {});
      notifySuccess(res.message);
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirmation("");
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
    <div className={gridClass}>
      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Full name</dt>
            <dd className="font-medium text-slate-900">{user?.full_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Username</dt>
            <dd className="font-mono text-slate-900">{user?.username ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-900">{user?.email ?? "—"}</dd>
          </div>
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
      </section>

      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Change password
        </h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <Field label="Current password">
            <PasswordInput
              className={inputClassName()}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </Field>
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
            {saving ? "Saving…" : "Update password"}
          </PrimaryButton>
        </form>
      </section>
    </div>
  );
}
