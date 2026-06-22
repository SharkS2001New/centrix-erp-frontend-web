"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  OrganizationConfigTabs,
  modulesForProfile,
  salesPlatformFromApi,
  defaultSalesPlatformState,
} from "@/components/admin/organization-register-form";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { OrganizationCachePanel } from "@/components/admin/organization-cache-panel";
import { buildDomainChildrenMap, normalizeDomainModules, patchEnabledModules } from "@/lib/module-registry";
import { applicationsFromEnabledModules } from "@/lib/workspace-modules";

export default function ManageOrganizationPage() {
  const params = useParams();
  const orgId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [moduleOptions, setModuleOptions] = useState([]);
  const [profilePresets, setProfilePresets] = useState([]);
  const [deploymentProfile, setDeploymentProfile] = useState("wholesale_retail");
  const [enabledModules, setEnabledModules] = useState({});
  const [salesPlatform, setSalesPlatform] = useState(null);
  const [orgActive, setOrgActive] = useState(true);

  const [orgName, setOrgName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [primaryTel, setPrimaryTel] = useState("");
  const [secondaryTel, setSecondaryTel] = useState("");
  const [addnTel1, setAddnTel1] = useState("");
  const [addnTel2, setAddnTel2] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [orgPin, setOrgPin] = useState("");
  const [vatRegno, setVatRegno] = useState("");
  const [administrationEnabled, setAdministrationEnabled] = useState(true);

  const domainChildrenMap = useMemo(() => buildDomainChildrenMap(moduleOptions), [moduleOptions]);

  const tenantValues = {
    company_code: organization?.company_code ?? "",
    org_name: orgName,
    org_email: orgEmail,
    primary_tel: primaryTel,
    secondary_tel: secondaryTel,
    addn_tel1: addnTel1,
    addn_tel2: addnTel2,
    org_address: orgAddress,
    org_pin: orgPin,
    vat_regno: vatRegno,
  };

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
      const org = orgRes.organization ?? {};
      setOrganization(org);
      const childrenMap = buildDomainChildrenMap(optionsRes.modules ?? []);
      setDeploymentProfile(org.deployment_profile ?? "wholesale_retail");
      setEnabledModules(normalizeDomainModules(orgRes.effective_modules ?? {}, childrenMap));
      setAdministrationEnabled(Boolean(orgRes.effective_modules?.admin));
      setSalesPlatform(salesPlatformFromApi(orgRes.sales_platform));
      setOrgActive(org.is_active !== false);
      setOrgName(org.org_name ?? "");
      setOrgEmail(org.org_email ?? "");
      setPrimaryTel(org.primary_tel ?? "");
      setSecondaryTel(org.secondary_tel ?? "");
      setAddnTel1(org.addn_tel1 ?? "");
      setAddnTel2(org.addn_tel2 ?? "");
      setOrgAddress(org.org_address ?? "");
      setOrgPin(org.org_pin ?? "");
      setVatRegno(org.vat_regno ?? "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load organization.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  function onTenantChange(field, value) {
    const map = {
      org_name: setOrgName,
      org_email: setOrgEmail,
      primary_tel: setPrimaryTel,
      secondary_tel: setSecondaryTel,
      addn_tel1: setAddnTel1,
      addn_tel2: setAddnTel2,
      org_address: setOrgAddress,
      org_pin: setOrgPin,
      vat_regno: setVatRegno,
    };
    map[field]?.(value);
  }

  function onProfileChange(nextProfile) {
    setDeploymentProfile(nextProfile);
    setEnabledModules(modulesForProfile(profilePresets, nextProfile, moduleOptions, salesPlatform?.enable_mobile_orders !== false));
  }

  function toggleModule(key) {
    setEnabledModules((prev) => patchEnabledModules(prev, { [key]: !prev[key] }, domainChildrenMap));
  }

  function setModules(partial) {
    setEnabledModules((prev) => patchEnabledModules(prev, partial, domainChildrenMap));
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
          org_name: orgName,
          org_email: orgEmail,
          primary_tel: primaryTel,
          secondary_tel: secondaryTel || null,
          addn_tel1: addnTel1 || null,
          addn_tel2: addnTel2 || null,
          org_address: orgAddress,
          org_pin: orgPin || null,
          vat_regno: vatRegno || null,
          deployment_profile: deploymentProfile,
          applications: applicationsFromEnabledModules(enabledModules),
          sales_platform: salesPlatform,
          is_active: orgActive,
        },
      });
      const org = res.organization ?? null;
      setOrganization(org);
      const childrenMap = buildDomainChildrenMap(moduleOptions);
      setEnabledModules(normalizeDomainModules(res.effective_modules ?? enabledModules, childrenMap));
      setAdministrationEnabled(Boolean(res.effective_modules?.admin));
      setSalesPlatform(salesPlatformFromApi(res.sales_platform));
      setOrgActive(org?.is_active !== false);
      setOrgName(org?.org_name ?? orgName);
      setOrgEmail(org?.org_email ?? orgEmail);
      setPrimaryTel(org?.primary_tel ?? primaryTel);
      setSecondaryTel(org?.secondary_tel ?? "");
      setAddnTel1(org?.addn_tel1 ?? "");
      setAddnTel2(org?.addn_tel2 ?? "");
      setOrgAddress(org?.org_address ?? orgAddress);
      setOrgPin(org?.org_pin ?? "");
      setVatRegno(org?.vat_regno ?? "");
      setMessage("Organization configuration saved. Users may need to refresh or sign in again.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save organization.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title={organization ? organization.org_name : "Organization"}
      subtitle="Configure tenant profile, sales behaviour, modules, and access."
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
        <div className="mt-6 w-full min-w-0 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800">
            <p className="font-medium">Organization settings</p>
            <p className="mt-1 text-xs text-slate-600">
              Configure checkout, finance, distribution, notifications, security, and other operational
              preferences for this tenant from the platform.
            </p>
            <Link
              href={`/platform/organizations/${orgId}/settings`}
              className="mt-3 inline-flex items-center rounded-lg bg-[#185FA5] px-3 py-2 text-xs font-medium text-white hover:bg-[#134d88]"
            >
              Open organization settings
            </Link>
            {!administrationEnabled ? (
              <Link
                href={`/platform/organizations/${orgId}/admin`}
                className="mt-3 ml-2 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              >
                Platform admin
              </Link>
            ) : null}
          </div>

          {!administrationEnabled ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
              <p className="font-medium">Administration is disabled</p>
              <p className="mt-1 text-xs text-amber-800">
                Tenant managers cannot open the Administration workspace. Manage users, branches, and roles from
                Platform admin instead.
              </p>
              <Link
                href={`/platform/organizations/${orgId}/admin`}
                className="mt-3 inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100"
              >
                Platform admin
              </Link>
            </div>
          ) : null}

          <form onSubmit={onSave} className="space-y-6">
            <OrganizationConfigTabs
              mode="manage"
              tenantValues={tenantValues}
              onTenantChange={onTenantChange}
              profilePresets={profilePresets}
              deploymentProfile={deploymentProfile}
              onProfileChange={onProfileChange}
              salesPlatform={salesPlatform ?? defaultSalesPlatformState()}
              onSalesChange={setSalesPlatform}
              enabledModules={enabledModules}
              moduleOptions={moduleOptions}
              onToggleModule={toggleModule}
              onSetModules={setModules}
              mobileOrdersEnabled={salesPlatform?.enable_mobile_orders !== false}
              organization={organization}
              organizationId={orgId}
              onStatusChange={({ is_active }) => setOrgActive(is_active)}
            />

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
                {saving ? "Saving…" : "Save configuration"}
              </PrimaryButton>
              <Link
                href="/platform"
                className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to platform
              </Link>
            </div>
          </form>

          <OrganizationCachePanel organizationId={orgId} />
        </div>
      )}
    </CatalogPageShell>
  );
}
