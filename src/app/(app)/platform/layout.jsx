"use client";

import { SuperAdminGuard } from "@/components/admin/super-admin-guard";

export default function PlatformLayout({ children }) {
  return <SuperAdminGuard>{children}</SuperAdminGuard>;
}
