"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  OrgRegisterField,
  inputClass,
  OrganizationModuleToggles,
  OrganizationPlatformSalesSettings,
  ManagerAccountFields,
  modulesForProfile,
  defaultSalesPlatformState,
} from "@/components/admin/organization-register-form";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";

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
  const [navGroups, setNavGroups] = useState([]);
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

  useEffect(() => {
    apiRequest("/admin/organizations/provision-options")
      .then((res) => {
        const profiles = res.profiles ?? [];
        const modules = res.modules ?? [];
        setProfilePresets(profiles);
        setModuleOptions(modules);
        setNavGroups(res.nav_groups ?? []);
        const initialProfile = profiles.find((p) => p.key === "wholesale_retail")
          ? "wholesale_retail"
          : profiles[0]?.key;
        if (initialProfile) {
          setDeploymentProfile(initialProfile);
          setEnabledModules(modulesForProfile(profiles, initialProfile));
          setSalesPlatform(defaultSalesPlatformState(initialProfile));
        }
      })
      .catch((err) => {
        setOptionsError(
          err instanceof ApiError ? err.message : "Could not load module options.",
        );
      });
  }, []);

  function onProfileChange(nextProfile) {
    setDeploymentProfile(nextProfile);
    setEnabledModules(modulesForProfile(profilePresets, nextProfile));
    setSalesPlatform(defaultSalesPlatformState(nextProfile));
  }

  function toggleModule(key) {
    setEnabledModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setModules(partial) {
    setEnabledModules((prev) => ({ ...prev, ...partial }));
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
          enabled_modules: enabledModules,
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
      subtitle="Register a tenant, choose sidebar modules (Sales, HR, Inventory, etc.), configure sales checkout & workflow, and create the manager account."
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
              <dt className="font-medium">Manager username</dt>
              <dd className="font-mono">{result.manager?.username}</dd>
            </div>
          </dl>
          <p className="mt-4 text-emerald-800">
            Share the manager username and password securely. They sign in with organization code{" "}
            <strong>{result.organization?.company_code}</strong> on the same application URL, then configure
            company profile, branches, users, roles, and system preferences under Administration.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <PrimaryButton type="button" onClick={() => setResult(null)}>
              Register another
            </PrimaryButton>
            <Link
              href={`/platform/organizations/${result.organization?.id}`}
              className="inline-flex items-center rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
            >
              Manage modules
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
        <form onSubmit={onSubmit} className="mt-6 max-w-3xl space-y-8">
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

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#185FA5]">Organization details</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <OrgRegisterField label="Company code *">
                <input
                  className={`${inputClass} uppercase`}
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                  placeholder="e.g. ACME"
                  required
                />
              </OrgRegisterField>
              <OrgRegisterField label="Company name *">
                <input className={inputClass} value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
              </OrgRegisterField>
              <OrgRegisterField label="Email *">
                <input
                  type="email"
                  className={inputClass}
                  value={orgEmail}
                  onChange={(e) => setOrgEmail(e.target.value)}
                  required
                />
              </OrgRegisterField>
              <OrgRegisterField label="Telephone *">
                <input className={inputClass} value={primaryTel} onChange={(e) => setPrimaryTel(e.target.value)} required />
              </OrgRegisterField>
              <OrgRegisterField label="Physical address *" className="sm:col-span-2">
                <input className={inputClass} value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} required />
              </OrgRegisterField>
              <OrgRegisterField label="KRA PIN (optional)">
                <input
                  className={`${inputClass} uppercase`}
                  value={orgPin}
                  onChange={(e) => setOrgPin(e.target.value)}
                />
              </OrgRegisterField>
              <OrgRegisterField label="VAT reg no (optional)">
                <input className={inputClass} value={vatRegno} onChange={(e) => setVatRegno(e.target.value)} />
              </OrgRegisterField>
            </div>
          </section>

          <OrganizationModuleToggles
            moduleOptions={moduleOptions}
            navGroups={navGroups}
            enabledModules={enabledModules}
            onToggle={toggleModule}
            onSetModules={setModules}
            onProfileChange={onProfileChange}
            profilePresets={profilePresets}
            deploymentProfile={deploymentProfile}
          />

          <OrganizationPlatformSalesSettings
            salesPlatform={salesPlatform}
            onChange={setSalesPlatform}
            deploymentProfile={deploymentProfile}
            enabledModules={enabledModules}
          />

          <ManagerAccountFields
            values={{ managerFullName, managerUsername, managerEmail, managerPassword }}
            onChange={updateManager}
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
