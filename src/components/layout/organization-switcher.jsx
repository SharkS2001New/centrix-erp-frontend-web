"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";

export function OrganizationSwitcher() {
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

  if (options.length <= 1) {
    if (!organization) return null;
    return (
      <div className="app-sidebar-divider border-b px-4 py-3">
        <p className="app-sidebar-section-label text-[10px] font-bold uppercase tracking-wider">
          Organization
        </p>
        <p className="app-sidebar-title mt-0.5 truncate text-sm font-medium">{organization.org_name}</p>
        <p className="app-sidebar-muted text-xs">{organization.company_code}</p>
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
    <div className="app-sidebar-divider border-b px-4 py-3">
      <label className="block">
        <span className="app-sidebar-section-label text-[10px] font-bold uppercase tracking-wider">
          Organization
        </span>
        <select
          className="app-sidebar-select mt-1 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
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
