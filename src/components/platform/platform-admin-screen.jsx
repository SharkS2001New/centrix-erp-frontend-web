"use client";

import { PlatformAdminShell } from "@/components/platform/platform-admin-shell";

/** Wraps tenant admin screens with platform org-scoped API paths, guard, and nav. */
export function PlatformAdminScreen({ children, breadcrumbTail = [] }) {
  return (
    <PlatformAdminShell embedded breadcrumbTail={breadcrumbTail}>
      {children}
    </PlatformAdminShell>
  );
}
