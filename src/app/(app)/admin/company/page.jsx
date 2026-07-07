"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiError, uploadOrganizationLogo, apiBaseOrigin } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useAdminApi } from "@/contexts/admin-api-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { EntityPhotoDisplay } from "@/components/media/entity-photo-display";
import { notifyError, notifySuccess } from "@/lib/notify";
import { confirmRemoveOptions, useConfirm } from "@/lib/use-confirm";

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

function mapOrganizationToForm(org) {
  if (!org) return EMPTY_FORM;

  return {
    org_name: org.org_name ?? "",
    company_code: org.company_code ?? "",
    org_pin: org.org_pin ?? "",
    org_email: org.org_email ?? "",
    primary_tel: org.primary_tel ?? "",
    secondary_tel: org.secondary_tel ?? "",
    addn_tel1: org.addn_tel1 ?? "",
    addn_tel2: org.addn_tel2 ?? "",
    org_address: org.org_address ?? "",
    vat_regno: org.vat_regno ?? "",
  };
}

function organizationFromResponse(res) {
  if (!res || typeof res !== "object") return null;
  return res.organization ?? res;
}

const readOnlyClass = `${inputClassName()} cursor-not-allowed bg-slate-50 text-slate-700`;

export default function AdminCompanyPage() {
  const { organization: authOrganization, loading: authLoading } = useAuth();
  const confirm = useConfirm();
  const {
    organizationId: platformOrgId,
    organizationPath,
    logoUploadPath,
    logoFileUrl,
    organizationProfile,
  } = useAdminApi();
  const fileInputRef = useRef(null);
  const [orgId, setOrgId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [hasLogo, setHasLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const load = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    try {
      const res = platformOrgId
        ? await apiRequest(organizationPath(""))
        : await apiRequest("/erp/organization/profile");
      const org = organizationFromResponse(res);
      if (!org?.id) {
        throw new ApiError("Organization profile could not be loaded.", 422);
      }
      setOrgId(org.id);
      setHasLogo(Boolean(org.has_logo));
      setForm(mapOrganizationToForm(org));
    } catch (e) {
      const seed = organizationProfile ?? authOrganization;
      if (seed?.id) {
        setOrgId(seed.id);
        setHasLogo(Boolean(seed.has_logo));
        setForm(mapOrganizationToForm(seed));
      }
      notifyError(e instanceof ApiError ? e.message : "Failed to load company profile");
    } finally {
      setLoading(false);
    }
  }, [authLoading, authOrganization, organizationPath, organizationProfile, platformOrgId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const path = platformOrgId ? organizationPath("") : "/erp/organization/profile";
      await apiRequest(path, {
        method: "PATCH",
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
      notifySuccess("Company profile saved.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!orgId) {
      notifyError("Company profile is still loading. Please try again in a moment.");
      return;
    }
    setUploadingLogo(true);
    try {
      const res = await uploadOrganizationLogo(orgId, file, { uploadPath: logoUploadPath(orgId) });
      const uploaded = organizationFromResponse(res);
      setHasLogo(Boolean(uploaded?.has_logo ?? true));
      notifySuccess("Logo uploaded.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Logo upload failed");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    if (!orgId || !hasLogo) return;
    const ok = await confirm(confirmRemoveOptions("the company logo"));
    if (!ok) return;
    setUploadingLogo(true);
    try {
      await apiRequest(logoUploadPath(orgId), { method: "DELETE" });
      setHasLogo(false);
      notifySuccess("Logo removed.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not remove logo");
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

      {loading || authLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-[1fr_220px]">
          <div className="theme-panel rounded-xl border p-6 shadow-sm">
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
                <input className={`${readOnlyClass} font-mono uppercase`} value={form.company_code} readOnly />
                <p className="mt-1 text-xs text-slate-500">Set at registration and cannot be changed.</p>
              </Field>
              <Field label="Billing email">
                <input type="email" className={readOnlyClass} value={form.org_email} readOnly />
                <p className="mt-1 text-xs text-slate-500">Managed by platform administration.</p>
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

          <div className="theme-panel rounded-xl border p-6 shadow-sm">
            <h2 className="text-[15px] font-medium text-slate-900">Logo</h2>
            <p className="mt-1 text-sm text-slate-500">PNG, JPG, or WebP up to 2 MB.</p>
            <div className="mt-4 flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
              {hasLogo && orgId ? (
                <EntityPhotoDisplay
                  fileUrl={
                    platformOrgId
                      ? logoFileUrl(orgId)
                      : `${apiBaseOrigin()}/api/v1/erp/organization/logo/file`
                  }
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
