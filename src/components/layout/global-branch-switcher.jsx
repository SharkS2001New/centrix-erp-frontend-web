"use client";

import { useEffect, useMemo } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/hooks/use-branch-scope";
import { useGlobalBranchId } from "@/hooks/use-global-branch-id";
import { invalidateAllTabAwareDataLoads } from "@/contexts/tab-pane-activity-context";
import { invalidateReferenceDataCache } from "@/lib/reference-data-cache";
import { setGlobalBranchId } from "@/lib/global-branch";

export function GlobalBranchSwitcher() {
  const { user, organization, isOrgWide } = useAuth();
  const { branches } = useBranchScope();
  const orgWide = isOrgWide();
  const selectedBranchId = useGlobalBranchId();
  const branchOptions = useMemo(
    () => branches.filter((branch) => branch.is_active == null || !["0", "false"].includes(String(branch.is_active).toLowerCase())),
    [branches],
  );

  useEffect(() => {
    if (!orgWide) {
      if (selectedBranchId) setGlobalBranchId("", user?.id, organization?.id);
      return;
    }
    if (selectedBranchId && !branchOptions.some((branch) => String(branch.id) === selectedBranchId)) {
      setGlobalBranchId("", user?.id, organization?.id);
    }
  }, [branchOptions, organization?.id, orgWide, selectedBranchId, user?.id]);

  if (!orgWide || branchOptions.length < 2) return null;

  function changeBranch(event) {
    const branchId = event.target.value;
    const branchName = branchOptions.find((branch) => String(branch.id) === branchId)?.branch_name;
    setGlobalBranchId(branchId, user?.id, organization?.id, branchName);
    invalidateReferenceDataCache();
    invalidateAllTabAwareDataLoads();
  }

  return (
    <div className="relative inline-flex min-w-0 shrink-0 items-center">
      <span className="app-topbar-app-switcher-icon pointer-events-none absolute left-1 z-[1] text-[var(--theme-primary)]" aria-hidden>
        <MapPin className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <select
        className="app-topbar-app-switcher min-w-0 cursor-pointer appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2"
        value={selectedBranchId}
        onChange={changeBranch}
        aria-label="Global branch"
        title="Default branch for the system"
        style={{
          height: "2.5rem",
          width: "13.3rem",
          maxWidth: "13.3rem",
          paddingLeft: "2.5rem",
          paddingRight: "2.25rem",
          fontSize: "0.875rem",
        }}
      >
        <option value="">All branches</option>
        {branchOptions.map((branch) => (
          <option key={branch.id} value={String(branch.id)}>
            {branch.branch_name ?? `Branch #${branch.id}`}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 h-4 w-4 text-[var(--theme-subtext)]"
        aria-hidden
      />
    </div>
  );
}
