"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiError, uploadOrganizationLogo } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { EntityPhotoDisplay, organizationLogoFileUrl } from "@/components/media/entity-photo-display";

const EMPTY_FORM = {
  org_name: "",
  company_code: "",
  org_pin: "",
  org_email: "",
  primary_tel: "",
  secondary_tel: "",
  addn_tel1: "",
  addn_tel2: "",
  org_address: "",
  vat_regno: "",
};

const readOnlyClass = `${inputClassName()} cursor-not-allowed bg-slate-50 text-slate-700`;

export default function AdminCompanyPage() {
  const { user, capabilities } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const fileInputRef = useRef(null);
  const [orgId, setOrgId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [hasLogo, setHasLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
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
      setHasLogo(Boolean(res.has_logo));
      setForm({
        org_name: res.org_name ?? "",
        company_code: res.company_code ?? "",
        org_pin: res.org_pin ?? "",
        org_email: res.org_email ?? "",
        primary_tel: res.primary_tel ?? "",
        secondary_tel: res.secondary_tel ?? "",
        addn_tel1: res.addn_tel1 ?? "",
        addn_tel2: res.addn_tel2 ?? "",
        org_address: res.org_address ?? "",
        vat_regno: res.vat_regno ?? "",
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
          primary_tel: form.primary_tel.trim(),
          secondary_tel: form.secondary_tel.trim() || null,
          addn_tel1: form.addn_tel1.trim() || null,
          addn_tel2: form.addn_tel2.trim() || null,
          org_address: form.org_address.trim(),
          org_pin: form.org_pin.trim() || null,
          vat_regno: form.vat_regno.trim() || null,
        },
      });
      setMessage("Company profile saved.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoPick(e) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    setUploadingLogo(true);
    setError(null);
    setMessage(null);
    try {
      await uploadOrganizationLogo(orgId, file);
      setHasLogo(true);
      setMessage("Logo uploaded.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Logo upload failed");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    if (!orgId || !hasLogo) return;
    setUploadingLogo(true);
    setError(null);
    try {
      await apiRequest(`/organizations/${orgId}/logo`, { method: "DELETE" });
      setHasLogo(false);
      setMessage("Logo removed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <CatalogPageShell
      title="Company profile"
      subtitle="Update your organization details and logo. Company code and billing email are managed by platform administration."
    >
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
            <h2 className="text-[15px] font-medium text-slate-900">Organization details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Company name *">
                  <input
                    className={inputClassName()}
                    value={form.org_name}
                    onChange={(e) => setForm((f) => ({ ...f, org_name: e.target.value }))}
                    required
                  />
                </Field>
              </div>
              <Field label="Company code">
                <input className={`${readOnlyClass} font-mono uppercase`} value={form.company_code} readOnly disabled />
              </Field>
              <Field label="Billing email">
                <input type="email" className={readOnlyClass} value={form.org_email} readOnly disabled />
              </Field>
              <Field label="Phone *">
                <input
                  className={inputClassName()}
                  value={form.primary_tel}
                  onChange={(e) => setForm((f) => ({ ...f, primary_tel: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Secondary phone">
                <input
                  className={inputClassName()}
                  value={form.secondary_tel}
                  onChange={(e) => setForm((f) => ({ ...f, secondary_tel: e.target.value }))}
                />
              </Field>
              <Field label="Additional phone 1">
                <input
                  className={inputClassName()}
                  value={form.addn_tel1}
                  onChange={(e) => setForm((f) => ({ ...f, addn_tel1: e.target.value }))}
                />
              </Field>
              <Field label="Additional phone 2">
                <input
                  className={inputClassName()}
                  value={form.addn_tel2}
                  onChange={(e) => setForm((f) => ({ ...f, addn_tel2: e.target.value }))}
                />
              </Field>
              <Field label="KRA PIN">
                <input
                  className={`${inputClassName()} uppercase`}
                  value={form.org_pin}
                  onChange={(e) => setForm((f) => ({ ...f, org_pin: e.target.value }))}
                />
              </Field>
              <Field label="VAT reg no">
                <input
                  className={inputClassName()}
                  value={form.vat_regno}
                  onChange={(e) => setForm((f) => ({ ...f, vat_regno: e.target.value }))}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address *">
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
                {saving ? "Saving…" : "Save profile"}
              </PrimaryButton>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-[15px] font-medium text-slate-900">Logo</h2>
            <p className="mt-1 text-sm text-slate-500">PNG, JPG, or WebP up to 2 MB.</p>
            <div className="mt-4 flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
              {hasLogo && orgId ? (
                <EntityPhotoDisplay
                  fileUrl={organizationLogoFileUrl(orgId)}
                  alt="Company logo"
                  className="h-full w-full object-contain p-2"
                  placeholderClassName="px-2 text-center text-xs text-slate-400"
                />
              ) : (
                <span className="px-2 text-center text-xs text-slate-400">No logo uploaded</span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleLogoPick}
            />
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={uploadingLogo}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {uploadingLogo ? "Uploading…" : hasLogo ? "Replace logo" : "Upload logo"}
              </button>
              {hasLogo ? (
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={() => void handleRemoveLogo()}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove logo
                </button>
              ) : null}
            </div>
          </div>
        </form>
      )}
    </CatalogPageShell>
  );
}
