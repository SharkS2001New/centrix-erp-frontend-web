"use client";

import { AdminGuard } from "@/components/admin/admin-guard";

export default function SpaAdminLayout({ children }) {
  return <AdminGuard>{children}</AdminGuard>;
}
