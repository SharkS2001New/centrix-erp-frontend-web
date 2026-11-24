"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { useGlobalBranchId } from "@/hooks/use-global-branch-id";
import { setGlobalBranchName } from "@/lib/global-branch";

/**
 * Branch lists are access-filtered by the API. Inline branch filters remain
 * org-wide only; the topbar can offer a switch when this list has multiple rows.
 */
export function useBranchScope() {
  const { capabilities, user, organization, isOrgWide } = useAuth();
  const orgWide = isOrgWide();
  const catalogMultiBranch = isMultiBranchCatalog(capabilities);
  const globalBranchId = useGlobalBranchId();
  const organizationId = organization?.id ?? user?.organization_id;
  const [branches, setBranches] = useState([]);
  const [branchLoadError, setBranchLoadError] = useState(null);

  useEffect(() => {
    if (!organizationId || (!catalogMultiBranch && !orgWide)) {
      setBranches([]);
      setBranchLoadError(null);
      return;
    }
    let cancelled = false;
    setBranchLoadError(null);
    fetchBranchesCached(organizationId)
      .then((rows) => {
        if (!cancelled) {
          setBranches(
            (Array.isArray(rows) ? rows : []).filter(
              (branch) => branch.is_active == null || !["0", "false"].includes(String(branch.is_active).toLowerCase()),
            ),
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBranches([]);
          setBranchLoadError(error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [catalogMultiBranch, organizationId, orgWide]);

  useEffect(() => {
    if (!globalBranchId) return;
    const branch = branches.find((row) => String(row.id) === globalBranchId);
    if (branch?.branch_name) {
      setGlobalBranchName(globalBranchId, branch.branch_name, user?.id, organizationId);
    }
  }, [branches, globalBranchId, organizationId, user?.id]);

  const multiBranch = branches.length > 0 ? branches.length > 1 : catalogMultiBranch;
  const lockedBranchId = !orgWide && user?.branch_id != null ? String(user.branch_id) : "";
  const effectiveBranchId = globalBranchId || lockedBranchId || (
    branches.length === 1 ? String(branches[0].id) : ""
  );
  const showBranchFilter = multiBranch && orgWide;

  return useMemo(
    () => ({
      branches,
      branchLoadError,
      multiBranch,
      isOrgWide: orgWide,
      showBranchFilter,
      lockedBranchId,
      effectiveBranchId,
      globalBranchId,
    }),
    [branches, branchLoadError, effectiveBranchId, globalBranchId, lockedBranchId, multiBranch, orgWide, showBranchFilter],
  );
}
