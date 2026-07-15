"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";

/** Keep a dirty form tab mounted so unsaved inputs survive switching to other tabs. */
export function useTabFormDirty(isDirty) {
  const pathname = usePathname();
  const { enabled, markTabDirty, clearTabDirty } = useTabWorkspace();

  useEffect(() => {
    if (!enabled) return;
    if (isDirty) {
      markTabDirty(pathname);
    } else {
      clearTabDirty(pathname);
    }
  }, [clearTabDirty, enabled, isDirty, markTabDirty, pathname]);
}
