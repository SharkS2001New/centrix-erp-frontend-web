"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  OrganizationConfigTabs,
  InitialAdministratorFields,
  modulesForProfile,
  defaultSalesPlatformState,
} from "@/components/admin/organization-register-form";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { buildDomainChildrenMap, patchEnabledModules } from "@/lib/module-registry";
import { applicationsFromEnabledModules } from "@/lib/workspace-modules";

export default function RegisterOrganizationPage() {
  const { capabilities } = useAuth();
  const provisioningEnabled = capabilities?.allow_org_provisioning !== false;
  const [companyCode, setCompanyCode] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [primaryTel, setPrimaryTel] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [orgPin, setOrgPin] = useState("");
  const [vatRegno, setVatRegno] = useState("");
  const [deploymentProfile, setDeploymentProfile] = useState("wholesale_retail");
  const [moduleOptions, setModuleOptions] = useState([]);
  const [profilePresets, setProfilePresets] = useState([]);
  const [enabledModules, setEnabledModules] = useState({});
  const [salesPlatform, setSalesPlatform] = useState(() => defaultSalesPlatformState());
  const [managerUsername, setManagerUsername] = useState("admin");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [managerFullName, setManagerFullName] = useState("");
  const [optionsError, setOptionsError] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const domainChildrenMap = useMemo(() => buildDomainChildrenMap(moduleOptions), [moduleOptions]);

  const tenantValues = {
    company_code: companyCode,
    org_name: orgName,
    org_email: orgEmail,
    primary_tel: primaryTel,
    org_address: orgAddress,
    org_pin: orgPin,
    vat_regno: vatRegno,
  };

  useEffect(() => {
    apiRequest("/admin/organizations/provision-options")
      .then((res) => {
        const profiles = res.profiles ?? [];
        const modules = res.modules ?? [];
        setProfilePresets(profiles);
        setModuleOptions(modules);
        const initialProfile = profiles.find((p) => p.key === "wholesale_retail")
          ? "wholesale_retail"
          : profiles[0]?.key;
        if (initialProfile) {
          setDeploymentProfile(initialProfile);
          setEnabledModules(modulesForProfile(profiles, initialProfile, modules, defaultSalesPlatformState(initialProfile).enable_mobile_orders !== false));
          setSalesPlatform(defaultSalesPlatformState(initialProfile));
        }
      })
      .catch((err) => {
        setOptionsError(
          err instanceof ApiError ? err.message : "Could not load module options.",
        );
      });
  }, []);

  function onTenantChange(field, value) {
    const map = {
      company_code: setCompanyCode,
      org_name: setOrgName,
      org_email: setOrgEmail,
      primary_tel: setPrimaryTel,
      org_address: setOrgAddress,
      org_pin: setOrgPin,
      vat_regno: setVatRegno,
    };
    map[field]?.(value);
  }

  function onProfileChange(nextProfile) {
    setDeploymentProfile(nextProfile);
    setEnabledModules(modulesForProfile(profilePresets, nextProfile, moduleOptions, salesPlatform?.enable_mobile_orders !== false));
    setSalesPlatform(defaultSalesPlatformState(nextProfile));
  }

  function toggleModule(key) {
    setEnabledModules((prev) => patchEnabledModules(prev, { [key]: !prev[key] }, domainChildrenMap));
  }

  function setModules(partial) {
    setEnabledModules((prev) => patchEnabledModules(prev, partial, domainChildrenMap));
  }

  function updateManager(field, value) {
    const map = {
      managerFullName: setManagerFullName,
      managerUsername: setManagerUsername,
      managerEmail: setManagerEmail,
      managerPassword: setManagerPassword,
    };
    map[field]?.(value);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const res = await apiRequest("/admin/organizations/provision", {
        method: "POST",
        body: {
          company_code: companyCode.toUpperCase(),
          org_name: orgName,
          org_email: orgEmail,
          primary_tel: primaryTel,
          org_address: orgAddress,
          org_pin: orgPin || null,
          vat_regno: vatRegno || null,
          deployment_profile: deploymentProfile,
          applications: applicationsFromEnabledModules(enabledModules),
          sales_platform: salesPlatform,
          admin_username: managerUsername,
          admin_email: managerEmail,
          admin_password: managerPassword,
          admin_full_name: managerFullName,
        },
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register organization.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CatalogPageShell
      title="Register organization"
      subtitle="Configure tenant profile, sales behaviour, modules, and the first administrator."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Register organization" },
        ]}
      />

      {result ? (
        <div className="mt-6 max-w-2xl rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
          <h2 className="text-base font-semibold text-emerald-950">Organization registered</h2>
          <p className="mt-2">{result.message}</p>
          <dl className="mt-4 space-y-2">
            <div>
              <dt className="font-medium">Company code</dt>
              <dd className="font-mono">{result.organization?.company_code}</dd>
            </div>
            <div>
              <dt className="font-medium">Organization</dt>
              <dd>{result.organization?.org_name}</dd>
            </div>
            <div>
              <dt className="font-medium">Administrator username</dt>
              <dd className="font-mono">{result.manager?.username}</dd>
            </div>
          </dl>
          <p className="mt-4 text-emerald-800">
            Share the administrator username and password securely. They sign in with organization code{" "}
            <strong>{result.organization?.company_code}</strong> on the same application URL.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <PrimaryButton type="button" onClick={() => setResult(null)}>
              Register another
            </PrimaryButton>
            <Link
              href={`/platform/organizations/${result.organization?.id}`}
              className="inline-flex items-center rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
            >
              Manage organization
            </Link>
            <Link
              href="/platform"
              className="inline-flex items-center rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
            >
              Back to platform
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 w-full min-w-0 space-y-6">
          {!provisioningEnabled ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Organization registration is disabled on this server. Set{" "}
              <code className="font-mono text-xs">APP_ALLOW_ORG_PROVISIONING=true</code> in the API
              environment and restart the API.
            </p>
          ) : null}
          {optionsError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {optionsError}
            </p>
          ) : null}

          <OrganizationConfigTabs
            mode="register"
            tenantValues={tenantValues}
            onTenantChange={onTenantChange}
            profilePresets={profilePresets}
            deploymentProfile={deploymentProfile}
            onProfileChange={onProfileChange}
            salesPlatform={salesPlatform}
            onSalesChange={setSalesPlatform}
            enabledModules={enabledModules}
            moduleOptions={moduleOptions}
            onToggleModule={toggleModule}
            onSetModules={setModules}
            adminPanel={
              <InitialAdministratorFields
                values={{ managerFullName, managerUsername, managerEmail, managerPassword }}
                onChange={updateManager}
              />
            }
          />

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          ) : null}

          <div className="flex gap-3">
            <PrimaryButton type="submit" disabled={submitting || !provisioningEnabled}>
              {submitting ? "Registering…" : "Register organization"}
            </PrimaryButton>
            <Link
              href="/platform"
              className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </CatalogPageShell>
  );
}
