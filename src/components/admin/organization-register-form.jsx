"use client";

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

export function OrganizationModuleToggles({ moduleOptions, enabledModules, onToggle, onProfileChange, profilePresets, deploymentProfile }) {
  const sortedModuleOptions = [...moduleOptions].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#185FA5]">Platform modules</h2>
      <p className="mt-1 text-sm text-slate-500">
        Control what this organization can access in the app — navigation, API routes, and feature areas. These are
        not user permissions; the organization manager assigns roles and permissions after sign-in.
      </p>
      {profilePresets.length > 0 ? (
        <OrgRegisterField label="Deployment profile" className="mt-4 sm:max-w-md">
          <select
            className={inputClass}
            value={deploymentProfile}
            onChange={(e) => onProfileChange?.(e.target.value)}
          >
            {profilePresets.map((profile) => (
              <option key={profile.key} value={profile.key}>
                {profile.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Profiles preset the module toggles below. You can adjust individual modules before saving.
          </p>
        </OrgRegisterField>
      ) : null}
      {sortedModuleOptions.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sortedModuleOptions.map((module) => (
            <label
              key={module.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(enabledModules[module.key])}
                onChange={() => onToggle(module.key)}
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{module.label}</span>
                <span className="block font-mono text-xs text-slate-500">{module.key}</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}

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
          <input
            type="password"
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
