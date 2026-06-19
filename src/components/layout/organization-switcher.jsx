"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";

export function OrganizationSwitcher({ collapsed = false }) {
  const { organization, memberships, switchOrganization } = useAuth();
  const [switching, setSwitching] = useState(false);

  const options = memberships?.length
    ? memberships
    : organization
      ? [
          {
            organization_id: organization.id,
            company_code: organization.company_code,
            org_name: organization.org_name,
          },
        ]
      : [];

  if (!organization) return null;

  if (collapsed) {
    return (
      <div className="flex justify-center pb-2" title={organization.org_name}>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm text-white">
          {(organization.org_name?.[0] ?? "O").toUpperCase()}
        </span>
      </div>
    );
  }

  if (options.length <= 1) {
    return (
      <div className="app-sidebar-org px-[22px] pb-3">
        <p className="truncate text-[13px] font-medium text-white/95">{organization.org_name}</p>
        <p className="truncate text-[11px] text-[#abb9e8]">{organization.company_code}</p>
      </div>
    );
  }

  async function onChange(e) {
    const code = e.target.value;
    if (!code || code === organization?.company_code || switching) return;
    setSwitching(true);
    try {
      await switchOrganization(code);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="app-sidebar-org px-[22px] pb-3">
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#abb9e8]">
          Organization
        </span>
        <select
          className="app-sidebar-select w-full rounded-md border px-2 py-1.5 text-[13px] outline-none"
          value={organization?.company_code ?? ""}
          onChange={onChange}
          disabled={switching}
        >
          {options.map((m) => (
            <option key={m.organization_id} value={m.company_code}>
              {m.org_name} ({m.company_code})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
