"use client";

import { AdminGuard } from "@/components/admin/admin-guard";

export default function AdminLayout({ children }) {
  return <AdminGuard>{children}</AdminGuard>;
}
