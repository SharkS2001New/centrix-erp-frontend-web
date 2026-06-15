"use client";

import { SuperAdminGuard } from "@/components/admin/super-admin-guard";

export default function ProvisionOrganizationLayout({ children }) {
  return <SuperAdminGuard>{children}</SuperAdminGuard>;
}
