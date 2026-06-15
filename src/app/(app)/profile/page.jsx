"use client";

import { useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";

export default function ProfilePage() {
  const { user, organization } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
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
      setSuccess(res.message);
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirmation("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell title="My profile" subtitle="Account details and security.">
      <AdminBreadcrumb items={[{ label: "Profile" }]} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
              <dd className="text-slate-900">
                {user?.is_admin
                  ? "Organization administrator"
                  : user?.access_scope === "org"
                    ? "Whole organization"
                    : "Single branch"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Change password
          </h2>
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <Field label="Current password">
              <input
                type="password"
                className={inputClassName()}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                className={inputClassName()}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                className={inputClassName()}
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                minLength={6}
                required
              />
            </Field>
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {success}
              </p>
            ) : null}
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Update password"}
            </PrimaryButton>
          </form>
        </section>
      </div>
    </CatalogPageShell>
  );
}
