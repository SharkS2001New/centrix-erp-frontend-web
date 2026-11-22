"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  getGlobalBranchId,
  globalBranchStorageKey,
  GLOBAL_BRANCH_CHANGED_EVENT,
} from "@/lib/global-branch";

export function useGlobalBranchId() {
  const { user, organization, isOrgWide } = useAuth();
  const orgWide = isOrgWide();
  const userId = user?.id;
  const organizationId = organization?.id;
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (!orgWide) {
      setBranchId("");
      return undefined;
    }
    const key = globalBranchStorageKey(userId, organizationId);
    const sync = (event) => {
      if (event?.detail) {
        if (
          String(event.detail.userId) !== String(userId) ||
          String(event.detail.organizationId) !== String(organizationId)
        ) {
          return;
        }
        setBranchId(String(event.detail.branchId ?? ""));
        return;
      }
      setBranchId(getGlobalBranchId(userId, organizationId));
    };

    sync();
    window.addEventListener(GLOBAL_BRANCH_CHANGED_EVENT, sync);
    const onStorage = (event) => {
      if (event.key === key) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(GLOBAL_BRANCH_CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [organizationId, orgWide, userId]);

  return branchId;
}
