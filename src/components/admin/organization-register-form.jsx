"use client";

import { PasswordInput } from "@/components/auth/password-input";

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

export function modulesForProfile(profiles, profileKey) {
  const profile = profiles.find((p) => p.key === profileKey);
  return profile?.modules ?? {};
}

export {
  OrganizationModuleToggles,
  OrganizationPlatformSalesSettings,
  defaultSalesPlatformState,
  salesPlatformFromApi,
} from "@/components/admin/organization-platform-config";

export function ManagerAccountFields({ values, onChange }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#185FA5]">Manager account</h2>
      <p className="mt-1 text-sm text-slate-500">
        Creates the organization administrator. They sign in with the company code and these credentials, then add
        staff under Admin → Users.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
    </section>
  );
}
