"use client";

import { SuperAdminGuard } from "@/components/admin/super-admin-guard";

export default function ManageOrganizationLayout({ children }) {
  return <SuperAdminGuard>{children}</SuperAdminGuard>;
}
