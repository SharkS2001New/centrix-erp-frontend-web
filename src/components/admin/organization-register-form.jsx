"use client";

import { PasswordInput } from "@/components/auth/password-input";
import { PlatformFormSection } from "@/components/admin/organization-platform-config";
import {
  buildDomainChildrenMap,
  normalizeDomainModules,
} from "@/lib/module-registry";
import { modulesFromApplications } from "@/lib/workspace-modules";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-[#185FA5]";

export function OrgRegisterField({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export { inputClass };

export function modulesForProfile(profiles, profileKey, moduleOptions = [], mobileOrdersEnabled = true) {
  const profile = profiles.find((p) => p.key === profileKey);
  if (profile?.applications) {
    return modulesFromApplications(profile.applications, moduleOptions, mobileOrdersEnabled);
  }
  const raw = profile?.modules ?? {};
  const map = buildDomainChildrenMap(moduleOptions);
  if (map.size === 0) {
    return raw;
  }
  return normalizeDomainModules(raw, map);
}

export {
  OrganizationConfigTabs,
  OrganizationModuleToggles,
  OrganizationOrderWorkflowSettings,
  OrganizationPlatformSalesSettings,
  OrganizationTenantProfile,
  OrganizationUsersPanel,
  OrganizationStatusPanel,
  PlatformFormSection,
  defaultSalesPlatformState,
  salesPlatformFromApi,
} from "@/components/admin/organization-platform-config";

export function InitialAdministratorFields({ values, onChange }) {
  return (
    <PlatformFormSection
      title="Initial administrator"
      description="Creates the first organization administrator. They sign in with the company code and these credentials, then add staff under Administration → Users."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <OrgRegisterField label="Full name *">
          <input
            className={inputClass}
            value={values.managerFullName}
            onChange={(e) => onChange("managerFullName", e.target.value)}
            required
          />
        </OrgRegisterField>
        <OrgRegisterField label="Username *">
          <input
            className={inputClass}
            value={values.managerUsername}
            onChange={(e) => onChange("managerUsername", e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            required
          />
        </OrgRegisterField>
        <OrgRegisterField label="Email *">
          <input
            type="email"
            className={inputClass}
            value={values.managerEmail}
            onChange={(e) => onChange("managerEmail", e.target.value)}
            required
          />
        </OrgRegisterField>
        <OrgRegisterField label="Password *">
          <PasswordInput
            className={inputClass}
            value={values.managerPassword}
            onChange={(e) => onChange("managerPassword", e.target.value)}
            minLength={6}
            required
          />
        </OrgRegisterField>
      </div>
    </PlatformFormSection>
  );
}

/** @deprecated Use InitialAdministratorFields */
export const ManagerAccountFields = InitialAdministratorFields;
