"use client";

import { useParams } from "next/navigation";
import { AdminApiProvider } from "@/contexts/admin-api-context";

/** Wraps tenant admin screens with platform org-scoped API paths. */
export function PlatformAdminScreen({ children }) {
  const orgId = useParams()?.id;
  const apiPrefix = orgId ? `/admin/organizations/${orgId}` : "";

  return (
    <AdminApiProvider apiPrefix={apiPrefix} organizationId={orgId}>
      {children}
    </AdminApiProvider>
  );
}
