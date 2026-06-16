"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  OrganizationModuleToggles,
  modulesForProfile,
} from "@/components/admin/organization-register-form";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";

export default function ManageOrganizationPage() {
  const params = useParams();
  const orgId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [effectiveModules, setEffectiveModules] = useState({});
  const [moduleOptions, setModuleOptions] = useState([]);
  const [profilePresets, setProfilePresets] = useState([]);
  const [deploymentProfile, setDeploymentProfile] = useState("wholesale_retail");
  const [enabledModules, setEnabledModules] = useState({});

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [optionsRes, orgRes] = await Promise.all([
        apiRequest("/admin/organizations/provision-options"),
        apiRequest(`/admin/organizations/${orgId}`),
      ]);
      setProfilePresets(optionsRes.profiles ?? []);
      setModuleOptions(optionsRes.modules ?? []);
      setOrganization(orgRes.organization ?? null);
      setEffectiveModules(orgRes.effective_modules ?? {});
      const org = orgRes.organization ?? {};
      setDeploymentProfile(org.deployment_profile ?? "wholesale_retail");
      const profileModules = modulesForProfile(optionsRes.profiles ?? [], org.deployment_profile);
      setEnabledModules({ ...profileModules, ...(org.enabled_modules ?? {}) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load organization.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  function onProfileChange(nextProfile) {
    setDeploymentProfile(nextProfile);
    setEnabledModules(modulesForProfile(profilePresets, nextProfile));
  }

  function toggleModule(key) {
    setEnabledModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(`/admin/organizations/${orgId}`, {
        method: "PATCH",
        body: {
          deployment_profile: deploymentProfile,
          enabled_modules: enabledModules,
        },
      });
      setOrganization(res.organization ?? null);
      setEffectiveModules(res.effective_modules ?? {});
      setMessage("Organization modules updated. Users may need to refresh or sign in again to see changes.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save organization.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title={organization ? organization.org_name : "Organization"}
      subtitle="Platform super admin — enable or disable ERP modules for this tenant."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: organization?.org_name ?? "Organization" },
        ]}
      />

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={onSave} className="mt-6 max-w-3xl space-y-8">
          {organization ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p>
                <span className="font-medium">Company code:</span>{" "}
                <span className="font-mono">{organization.company_code}</span>
              </p>
              <p className="mt-1">
                <span className="font-medium">Profile:</span> {organization.deployment_profile}
              </p>
            </div>
          ) : null}

          <OrganizationModuleToggles
            moduleOptions={moduleOptions}
            enabledModules={enabledModules}
            onToggle={toggleModule}
            onProfileChange={onProfileChange}
            profilePresets={profilePresets}
            deploymentProfile={deploymentProfile}
          />

          {Object.keys(effectiveModules).length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <p className="font-medium text-slate-800">Currently active modules</p>
              <p className="mt-1">
                {Object.entries(effectiveModules)
                  .filter(([, on]) => on)
                  .map(([key]) => key)
                  .join(", ") || "None"}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          ) : null}
          {message ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}

          <div className="flex gap-3">
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save module access"}
            </PrimaryButton>
            <Link
              href="/platform"
              className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to platform
            </Link>
          </div>
        </form>
      )}
    </CatalogPageShell>
  );
}
