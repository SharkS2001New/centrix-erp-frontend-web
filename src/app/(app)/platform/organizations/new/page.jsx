"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  DEFAULT_INDUSTRY,
  defaultProfileForIndustry,
  industryForProfile,
  normalizeIndustries,
  profilesForIndustry,
} from "@/lib/erp-industries";
import {
  ProvisionSetupPreview,
  ProvisionTemplateControls,
} from "@/components/platform/provision-setup-preview";
import { ProvisionSubscriptionFields } from "@/components/platform/provision-subscription-fields";
import {
  buildProvisionSubscriptionPayload,
  emptyProvisionSubscriptionForm,
  ensureSubscriptionAfterProvision,
} from "@/lib/provision-subscription";
import { formatBillingDate, formatBillingMoney } from "@/lib/platform-billing";
import { notifyError, notifySuccess } from "@/lib/notify";

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
  const [industry, setIndustry] = useState(DEFAULT_INDUSTRY);
  const [industries, setIndustries] = useState([]);
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
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [templateName, setTemplateName] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [cloneOrgId, setCloneOrgId] = useState("");
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [subscriptionForm, setSubscriptionForm] = useState(() => emptyProvisionSubscriptionForm());
  const [createdSubscription, setCreatedSubscription] = useState(null);

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

  const refreshPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const payload = await apiRequest("/admin/organizations/provision-preview", {
        method: "POST",
        body: {
          deployment_profile: deploymentProfile,
          applications: applicationsFromEnabledModules(enabledModules),
          sales_platform: salesPlatform,
        },
      });
      setPreview(payload);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [deploymentProfile, enabledModules, salesPlatform]);

  useEffect(() => {
    apiRequest("/admin/organizations/provision-options")
      .then((res) => {
        const profiles = res.profiles ?? [];
        const modules = res.modules ?? [];
        const industryList = normalizeIndustries(res.industries);
        setProfilePresets(profiles);
        setModuleOptions(modules);
        setIndustries(industryList);
        setTemplates(res.provisioning_templates ?? []);
        const initialIndustry = industryList[0]?.id ?? DEFAULT_INDUSTRY;
        const industryProfiles = profilesForIndustry(profiles, initialIndustry, industryList);
        const initialProfile =
          industryProfiles.find((p) => p.key === defaultProfileForIndustry(initialIndustry, industryList))?.key ??
          industryProfiles[0]?.key ??
          "wholesale_retail";
        setIndustry(initialIndustry);
        setDeploymentProfile(initialProfile);
        setEnabledModules(
          modulesForProfile(
            profiles,
            initialProfile,
            modules,
            defaultSalesPlatformState(initialProfile).enable_mobile_orders !== false,
          ),
        );
        setSalesPlatform(defaultSalesPlatformState(initialProfile));
      })
      .catch((err) => {
        setOptionsError(
          err instanceof ApiError ? err.message : "Could not load module options.",
        );
      });

    apiRequest("/admin/organizations")
      .then((res) => setOrganizations(res.data ?? []))
      .catch(() => setOrganizations([]));

    setPlansLoading(true);
    apiRequest("/admin/platform-plans")
      .then((res) => setPlans((res.data ?? []).filter((p) => p.is_active !== false)))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  useEffect(() => {
    if (!profilePresets.length) return;
    void refreshPreview();
  }, [profilePresets.length, refreshPreview]);

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

  function applyProfile(nextProfile) {
    setDeploymentProfile(nextProfile);
    setEnabledModules(
      modulesForProfile(
        profilePresets,
        nextProfile,
        moduleOptions,
        defaultSalesPlatformState(nextProfile).enable_mobile_orders !== false,
      ),
    );
    setSalesPlatform(defaultSalesPlatformState(nextProfile));
  }

  function onIndustryChange(nextIndustry) {
    setIndustry(nextIndustry);
    const industryProfiles = profilesForIndustry(profilePresets, nextIndustry, industries);
    const nextProfile =
      industryProfiles.find((p) => p.key === defaultProfileForIndustry(nextIndustry, industries))?.key ??
      industryProfiles[0]?.key ??
      "custom";
    applyProfile(nextProfile);
  }

  function onProfileChange(nextProfile) {
    setIndustry(industryForProfile(nextProfile, industries, profilePresets));
    applyProfile(nextProfile);
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

  function applyTemplate(template) {
    if (!template) return;
    const nextProfile = template.deployment_profile ?? "custom";
    setIndustry(industryForProfile(nextProfile, industries, profilePresets));
    setDeploymentProfile(nextProfile);
    if (template.sales_platform) {
      setSalesPlatform({ ...defaultSalesPlatformState(nextProfile), ...template.sales_platform });
    } else {
      setSalesPlatform(defaultSalesPlatformState(nextProfile));
    }
    if (template.enabled_modules && Object.keys(template.enabled_modules).length > 0) {
      setEnabledModules(template.enabled_modules);
    } else {
      setEnabledModules(modulesForProfile(profilePresets, nextProfile, moduleOptions));
    }
  }

  async function cloneOrganization(orgId) {
    if (!orgId) return;
    try {
      const snapshot = await apiRequest(`/admin/organizations/${orgId}/provision-snapshot`);
      const nextProfile = snapshot.deployment_profile ?? "custom";
      setIndustry(industryForProfile(nextProfile, industries, profilePresets));
      setDeploymentProfile(nextProfile);
      if (snapshot.sales_platform) {
        setSalesPlatform({ ...defaultSalesPlatformState(nextProfile), ...snapshot.sales_platform });
      } else {
        setSalesPlatform(defaultSalesPlatformState(nextProfile));
      }
      if (snapshot.enabled_modules && Object.keys(snapshot.enabled_modules).length > 0) {
        setEnabledModules(snapshot.enabled_modules);
      } else if (snapshot.applications) {
        const partial = {};
        for (const [key, value] of Object.entries(snapshot.applications)) {
          if (key === "pos" && value) partial["sales.pos"] = true;
          if (key === "backoffice" && value) {
            partial["sales.backend"] = true;
            partial.inventory = true;
            partial.customers_suppliers = true;
          }
          if (key === "hotel_bar_pos" && value) {
            partial.hospitality = true;
            partial["hospitality.bar_pos"] = true;
          }
          if (key === "hospitality_backoffice" && value) {
            partial.hospitality = true;
            partial["hospitality.backend"] = true;
          }
          if (key === "distribution" && value) partial.distribution = true;
          if (key === "accounting" && value) partial.accounting = true;
          if (key === "hr" && value) partial.hr_payroll = true;
          if (key === "admin" && value) partial.admin = true;
        }
        setEnabledModules((prev) => patchEnabledModules(prev, partial, domainChildrenMap));
      } else {
        setEnabledModules(modulesForProfile(profilePresets, nextProfile, moduleOptions));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load organization setup.");
    }
  }

  async function saveTemplate() {
    const name = templateName.trim();
    if (!name) return;
    setTemplateSaving(true);
    setError(null);
    try {
      const created = await apiRequest("/admin/organizations/provisioning-templates", {
        method: "POST",
        body: {
          name,
          deployment_profile: deploymentProfile,
          enabled_modules: enabledModules,
          sales_platform: salesPlatform,
        },
      });
      setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setTemplateName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save template.");
    } finally {
      setTemplateSaving(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setCreatedSubscription(null);
    setSubmitting(true);

    const subscriptionPayload = buildProvisionSubscriptionPayload(subscriptionForm, plans);

    if (subscriptionForm.license_mode === "plan" && !subscriptionForm.plan_id) {
      setError("Select a subscription plan, or choose Free trial / No licence yet.");
      setSubmitting(false);
      return;
    }

    if (
      (subscriptionForm.license_mode === "trial" || subscriptionForm.license_mode === "plan") &&
      !subscriptionForm.current_period_end
    ) {
      setError("Set a licence expiry date.");
      setSubmitting(false);
      return;
    }

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
          ...(subscriptionPayload
            ? {
                subscription: subscriptionPayload,
                plan_id: subscriptionPayload.plan_id,
                license: subscriptionPayload,
              }
            : { subscription: null }),
        },
      });

      const orgId = res.organization?.id ?? res.data?.organization?.id ?? res.data?.id;
      let subscription = res.subscription ?? res.data?.subscription ?? null;

      if (subscriptionPayload && orgId && !subscription?.id) {
        try {
          subscription = await ensureSubscriptionAfterProvision({
            apiRequest,
            organizationId: orgId,
            subscriptionPayload,
            provisionResponse: res,
          });
          notifySuccess("Organization registered and subscription assigned.");
        } catch (subErr) {
          notifyError(
            subErr instanceof ApiError
              ? `Organization created, but subscription failed: ${subErr.message}`
              : "Organization created, but subscription could not be assigned. Use Platform → Subscriptions.",
          );
        }
      }

      setCreatedSubscription(subscription);
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
      subtitle="Choose industry first (Retail & Distribution or Hotel & Hospitality), then setup type, applications, licence, and the first administrator."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Register organization" },
        ]}
      />

      {result ? (
        <div className="mt-6 max-w-3xl rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
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
            <div>
              <dt className="font-medium">Licence</dt>
              <dd>
                {createdSubscription || result.subscription ? (
                  <>
                    {(createdSubscription ?? result.subscription)?.status === "trialing"
                      ? "Free trial"
                      : (createdSubscription ?? result.subscription)?.plan?.name ?? "Subscription"}
                    {" · expires "}
                    {formatBillingDate(
                      (createdSubscription ?? result.subscription)?.current_period_end ??
                        (createdSubscription ?? result.subscription)?.trial_ends_at,
                    )}
                    {(createdSubscription ?? result.subscription)?.plan?.renewal_price != null ||
                    (createdSubscription ?? result.subscription)?.plan?.price != null ? (
                      <span className="block text-xs text-emerald-800">
                        Renewal{" "}
                        {formatBillingMoney(
                          (createdSubscription ?? result.subscription)?.plan?.renewal_price ??
                            (createdSubscription ?? result.subscription)?.plan?.price,
                          (createdSubscription ?? result.subscription)?.plan?.currency ?? "KES",
                        )}
                      </span>
                    ) : null}
                  </>
                ) : subscriptionForm.license_mode === "none" ? (
                  "Not assigned — org is locked until you add a plan under Subscriptions"
                ) : (
                  "Pending — check Platform → Subscriptions"
                )}
              </dd>
            </div>
          </dl>

          {result.recommended_roles?.length ? (
            <div className="mt-4">
              <h3 className="font-medium text-emerald-950">Recommended staff roles</h3>
              <ul className="mt-2 space-y-1">
                {result.recommended_roles.map((role) => (
                  <li key={role.role_name}>
                    <strong>{role.role_name}</strong>
                    {role.description ? ` — ${role.description}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.onboarding_steps?.length ? (
            <div className="mt-4">
              <h3 className="font-medium text-emerald-950">Next steps</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                {result.onboarding_steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          <p className="mt-4 text-emerald-800">
            Share the administrator username and password securely. They sign in with organization code{" "}
            <strong>{result.organization?.company_code}</strong> on the same application URL.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <PrimaryButton
              type="button"
              onClick={() => {
                setResult(null);
                setCreatedSubscription(null);
                setSubscriptionForm(emptyProvisionSubscriptionForm());
              }}
            >
              Register another
            </PrimaryButton>
            <Link
              href={`/platform/organizations/${result.organization?.id}`}
              className="inline-flex items-center rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
            >
              Manage organization
            </Link>
            <Link
              href="/platform/subscriptions"
              className="inline-flex items-center rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
            >
              Subscriptions
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

          <ProvisionTemplateControls
            templates={templates}
            organizations={organizations}
            templateName={templateName}
            onTemplateNameChange={setTemplateName}
            onLoadTemplate={applyTemplate}
            onSaveTemplate={saveTemplate}
            onCloneOrganization={cloneOrganization}
            selectedCloneOrgId={cloneOrgId}
            onSelectedCloneOrgIdChange={setCloneOrgId}
            saving={templateSaving}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-6">
              <OrganizationConfigTabs
                mode="register"
                tenantValues={tenantValues}
                onTenantChange={onTenantChange}
                profilePresets={profilePresets}
                industries={industries}
                industry={industry}
                onIndustryChange={onIndustryChange}
                deploymentProfile={deploymentProfile}
                onProfileChange={onProfileChange}
                salesPlatform={salesPlatform}
                onSalesChange={setSalesPlatform}
                enabledModules={enabledModules}
                moduleOptions={moduleOptions}
                onToggleModule={toggleModule}
                onSetModules={setModules}
                adminPanel={
                  <div className="space-y-6">
                    <InitialAdministratorFields
                      values={{ managerFullName, managerUsername, managerEmail, managerPassword }}
                      onChange={updateManager}
                    />
                    <ProvisionSubscriptionFields
                      form={subscriptionForm}
                      onChange={setSubscriptionForm}
                      plans={plans}
                      plansLoading={plansLoading}
                    />
                  </div>
                }
              />
            </div>

            <ProvisionSetupPreview preview={preview} loading={previewLoading} className="xl:sticky xl:top-6 xl:self-start" />
          </div>

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
