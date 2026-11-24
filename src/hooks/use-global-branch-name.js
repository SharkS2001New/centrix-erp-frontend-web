"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  getGlobalBranchName,
  GLOBAL_BRANCH_CHANGED_EVENT,
} from "@/lib/global-branch";

export function useGlobalBranchName(branchId) {
  const { user, organization } = useAuth();
  const userId = user?.id;
  const organizationId = organization?.id;
  const [cachedName, setCachedName] = useState({ branchId: "", branchName: "" });

  useEffect(() => {
    const update = (name) => {
      setCachedName({ branchId: String(branchId ?? ""), branchName: name });
    };
    const sync = (event) => {
      if (
        event?.detail &&
        (String(event.detail.userId) !== String(userId) ||
          String(event.detail.organizationId) !== String(organizationId))
      ) {
        return;
      }
      if (event?.detail && String(event.detail.branchId ?? "") === String(branchId ?? "")) {
        update(String(event.detail.branchName ?? "") || getGlobalBranchName(branchId, userId, organizationId));
        return;
      }
      update(getGlobalBranchName(branchId, userId, organizationId));
    };

    sync();
    window.addEventListener(GLOBAL_BRANCH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(GLOBAL_BRANCH_CHANGED_EVENT, sync);
  }, [branchId, organizationId, userId]);

  return cachedName.branchId === String(branchId ?? "") ? cachedName.branchName : "";
}
