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
  defaultPayrollPlatformState,
  payrollPlatformFromApi,
  payrollPlatformToApi,
} from "@/components/admin/organization-register-form";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { buildDomainChildrenMap, normalizeDomainModules, patchEnabledModules } from "@/lib/module-registry";
import { applicationsFromEnabledModules } from "@/lib/workspace-modules";
import {
  DEFAULT_INDUSTRY,
  defaultProfileForIndustry,
  industryForProfile,
  normalizeIndustries,
  profilesForIndustry,
} from "@/lib/erp-industries";
import { menuGroupStateFromProfile } from "@/lib/menu-groups";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useAuth } from "@/contexts/auth-context";
import { useConfirm } from "@/contexts/confirm-context";

export default function ManageOrganizationPage() {
  const params = useParams();
  const orgId = params?.id;
  const { refreshCapabilities, organization: sessionOrganization } = useAuth();
  const confirm = useConfirm();
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoGeneratedAt, setDemoGeneratedAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [moduleOptions, setModuleOptions] = useState([]);
  const [profilePresets, setProfilePresets] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [industry, setIndustry] = useState(DEFAULT_INDUSTRY);
  const [deploymentProfile, setDeploymentProfile] = useState("wholesale_retail");
  const [enabledModules, setEnabledModules] = useState({});
  const [salesPlatform, setSalesPlatform] = useState(null);
  const [payrollPlatform, setPayrollPlatform] = useState(null);
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
  const [enableTabWorkspace, setEnableTabWorkspace] = useState(true);

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
    try {
      const [optionsRes, orgRes] = await Promise.all([
        apiRequest("/admin/organizations/provision-options"),
        apiRequest(`/admin/organizations/${orgId}`),
      ]);
      setProfilePresets(optionsRes.profiles ?? []);
      setModuleOptions(optionsRes.modules ?? []);
      const industryList = normalizeIndustries(optionsRes.industries);
      setIndustries(industryList);
      const org = orgRes.organization ?? {};
      setOrganization(org);
      const childrenMap = buildDomainChildrenMap(optionsRes.modules ?? []);
      const nextProfile = org.deployment_profile ?? "wholesale_retail";
      setDeploymentProfile(nextProfile);
      setIndustry(
        org.industry ??
          orgRes.capabilities?.industry ??
          industryForProfile(nextProfile, industryList, optionsRes.profiles ?? []),
      );
      setEnabledModules(normalizeDomainModules(orgRes.effective_modules ?? {}, childrenMap));
      setAdministrationEnabled(Boolean(orgRes.effective_modules?.admin));
      setEnableTabWorkspace(orgRes.capabilities?.platform_tab_workspace_enabled !== false);
      setSalesPlatform(salesPlatformFromApi(orgRes.sales_platform));
      setPayrollPlatform(payrollPlatformFromApi(orgRes.payroll_platform));
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
      setDemoGeneratedAt(orgRes.organization?.module_settings?.platform_demo?.generated_at ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load organization.");
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

  function onIndustryChange(nextIndustry) {
    setIndustry(nextIndustry);
    const industryProfiles = profilesForIndustry(profilePresets, nextIndustry, industries);
    const nextProfile =
      industryProfiles.find((p) => p.key === defaultProfileForIndustry(nextIndustry, industries))?.key ??
      industryProfiles[0]?.key ??
      deploymentProfile;
    setDeploymentProfile(nextProfile);
    setEnabledModules(
      modulesForProfile(profilePresets, nextProfile, moduleOptions, salesPlatform?.enable_mobile_orders !== false),
    );
    const preset = profilePresets.find((profile) => profile.key === nextProfile);
    setSalesPlatform((prev) => ({
      ...(nextIndustry === "hospitality" ? defaultSalesPlatformState(nextProfile) : prev ?? {}),
      ...menuGroupStateFromProfile(preset),
    }));
  }

  function onProfileChange(nextProfile) {
    setIndustry(industryForProfile(nextProfile, industries, profilePresets));
    setDeploymentProfile(nextProfile);
    setEnabledModules(modulesForProfile(profilePresets, nextProfile, moduleOptions, salesPlatform?.enable_mobile_orders !== false));
    const preset = profilePresets.find((profile) => profile.key === nextProfile);
    setSalesPlatform((prev) => ({ ...(prev ?? {}), ...menuGroupStateFromProfile(preset) }));
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
          payroll_platform: payrollPlatformToApi(payrollPlatform ?? defaultPayrollPlatformState()),
          is_active: orgActive,
        },
      });
      await apiRequest(`/admin/organizations/${orgId}/settings/general`, {
        method: "PATCH",
        body: { enable_tab_workspace: Boolean(enableTabWorkspace) },
      });
      const org = res.organization ?? null;
      setOrganization(org);
      const childrenMap = buildDomainChildrenMap(moduleOptions);
      setEnabledModules(normalizeDomainModules(res.effective_modules ?? enabledModules, childrenMap));
      setAdministrationEnabled(Boolean(res.effective_modules?.admin));
      setEnableTabWorkspace(enableTabWorkspace);
      setSalesPlatform(salesPlatformFromApi(res.sales_platform));
      setPayrollPlatform(payrollPlatformFromApi(res.payroll_platform));
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
      notifySuccess("Organization configuration saved.");
      // If this is the signed-in org, refresh session capabilities so nav updates immediately.
      if (String(sessionOrganization?.id ?? "") === String(orgId)) {
        await refreshCapabilities({ force: true });
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not save organization.");
    } finally {
      setSaving(false);
    }
  }

  async function generateDemoData() {
    if (!orgId || demoBusy) return;
    const ok = await confirm({
      title: "Generate demo data?",
      message: "Sample records are added to this organisation only. The organisation, its users, and its settings stay as they are. Generating again replaces the previous sample.",
      confirmLabel: "Generate demo data",
    });
    if (!ok) return;
    setDemoBusy(true);
    try {
      const res = await apiRequest(`/admin/organizations/${orgId}/demo-data`, { method: "POST" });
      setDemoGeneratedAt(res?.generated_at ?? null);
      notifySuccess(res?.message ?? "Demo data is ready for this organisation.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not generate demo data.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function removeDemoData() {
    if (!orgId || demoBusy) return;
    const ok = await confirm({
      title: "Remove demo data?",
      message: "This removes the sample records added for this organisation. The organisation and its real records stay.",
      confirmLabel: "Remove demo data",
      destructive: true,
    });
    if (!ok) return;
    setDemoBusy(true);
    try {
      const res = await apiRequest(`/admin/organizations/${orgId}/demo-data`, { method: "DELETE" });
      setDemoGeneratedAt(null);
      notifySuccess(res?.message ?? "Demo data was removed.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not remove demo data.");
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <CatalogPageShell
      title={organization ? organization.org_name : "Organization"}
      subtitle="Configure industry, setup type, applications, and access for this tenant."
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
            <p className="font-medium">Demo data</p>
            <p className="mt-1 text-xs text-slate-600">
              Platform admin only. This fills the organisation you are managing. It does not create another company.
              Day-to-day settings stay in that organisation&apos;s Administration module.
            </p>
            {demoGeneratedAt ? (
              <p className="mt-2 text-xs text-slate-500">Last generated {demoGeneratedAt}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void generateDemoData()}
                disabled={demoBusy}
                className="inline-flex items-center rounded-lg bg-[#185FA5] px-3 py-2 text-xs font-medium text-white hover:bg-[#134d88] disabled:opacity-50"
              >
                {demoBusy ? "Working…" : "Generate demo data"}
              </button>
              <button
                type="button"
                onClick={() => void removeDemoData()}
                disabled={demoBusy}
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                Remove demo data
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800">
            <p className="font-medium">Organization settings</p>
            <p className="mt-1 text-xs text-slate-600">
              Checkout, finance, notifications, security, and the rest of the operational settings live in the
              tenant Administration module. This link is the platform copy of those same settings for this organisation.
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
              industries={industries}
              industry={industry}
              onIndustryChange={onIndustryChange}
              deploymentProfile={deploymentProfile}
              onProfileChange={onProfileChange}
              enableTabWorkspace={enableTabWorkspace}
              onEnableTabWorkspaceChange={setEnableTabWorkspace}
              salesPlatform={salesPlatform ?? defaultSalesPlatformState()}
              onSalesChange={setSalesPlatform}
              payrollPlatform={payrollPlatform ?? defaultPayrollPlatformState()}
              onPayrollChange={setPayrollPlatform}
              enabledModules={enabledModules}
              moduleOptions={moduleOptions}
              onToggleModule={toggleModule}
              onSetModules={setModules}
              mobileOrdersEnabled={salesPlatform?.enable_mobile_orders !== false}
              organization={organization}
              organizationId={orgId}
              isActive={orgActive}
              onStatusChange={({ is_active }) => setOrgActive(is_active)}
            />

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
        </div>
      )}
    </CatalogPageShell>
  );
}
