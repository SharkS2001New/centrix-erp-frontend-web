"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";

const EMPTY_FORM = {
  org_name: "",
  company_code: "",
  org_pin: "",
  org_email: "",
  primary_tel: "",
  secondary_tel: "",
  org_address: "",
  logo: "",
};

export default function AdminCompanyPage() {
  const { user, capabilities } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const [orgId, setOrgId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest(`/organizations/${organizationId}`);
      setOrgId(res.id);
      setForm({
        org_name: res.org_name ?? "",
        company_code: res.company_code ?? "",
        org_pin: res.org_pin ?? "",
        org_email: res.org_email ?? "",
        primary_tel: res.primary_tel ?? "",
        secondary_tel: res.secondary_tel ?? "",
        org_address: res.org_address ?? "",
        logo: res.logo ?? "",
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load company profile");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/organizations/${orgId}`, {
        method: "PUT",
        body: {
          org_name: form.org_name.trim(),
          company_code: form.company_code.trim(),
          org_pin: form.org_pin.trim() || null,
          org_email: form.org_email.trim(),
          primary_tel: form.primary_tel.trim(),
          secondary_tel: form.secondary_tel.trim() || null,
          org_address: form.org_address.trim(),
          logo: form.logo.trim() || null,
        },
      });
      setMessage("Company profile saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell title="Company profile" subtitle="Organization details and branding.">
      <AdminBreadcrumb
        items={[{ label: "Administration", href: "/admin" }, { label: "Company profile" }]}
      />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-[1fr_220px]">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-[15px] font-medium text-slate-900">Company profile</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
              <Field label="Company name">
                <input
                  className={inputClassName()}
                  value={form.org_name}
                  onChange={(e) => setForm((f) => ({ ...f, org_name: e.target.value }))}
                  required
                />
              </Field>
              </div>
              <Field label="Registration number">
                <input
                  className={inputClassName()}
                  value={form.company_code}
                  onChange={(e) => setForm((f) => ({ ...f, company_code: e.target.value }))}
                  required
                />
              </Field>
              <Field label="PIN number">
                <input
                  className={inputClassName()}
                  value={form.org_pin}
                  onChange={(e) => setForm((f) => ({ ...f, org_pin: e.target.value }))}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={inputClassName()}
                  value={form.org_email}
                  onChange={(e) => setForm((f) => ({ ...f, org_email: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Phone">
                <input
                  className={inputClassName()}
                  value={form.primary_tel}
                  onChange={(e) => setForm((f) => ({ ...f, primary_tel: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Website">
                <input
                  className={inputClassName()}
                  value={form.secondary_tel}
                  onChange={(e) => setForm((f) => ({ ...f, secondary_tel: e.target.value }))}
                  placeholder="www.example.com"
                />
              </Field>
              <div className="sm:col-span-2">
              <Field label="Address">
                <textarea
                  className={`${inputClassName()} min-h-[80px]`}
                  value={form.org_address}
                  onChange={(e) => setForm((f) => ({ ...f, org_address: e.target.value }))}
                  required
                />
              </Field>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </PrimaryButton>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-[15px] font-medium text-slate-900">Logo</h2>
            <div className="mt-4 flex aspect-square items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
              {form.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logo} alt="Company logo" className="max-h-full max-w-full object-contain" />
              ) : (
                "No logo"
              )}
            </div>
            <Field label="Logo URL" className="mt-4">
              <input
                className={inputClassName()}
                value={form.logo}
                onChange={(e) => setForm((f) => ({ ...f, logo: e.target.value }))}
                placeholder="https://…"
              />
            </Field>
          </div>
        </form>
      )}
    </CatalogPageShell>
  );
}
