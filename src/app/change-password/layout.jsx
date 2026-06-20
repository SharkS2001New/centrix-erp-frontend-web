"use client";

import { AuthGuard } from "@/components/auth-guard";

export default function ChangePasswordLayout({ children }) {
  return <AuthGuard>{children}</AuthGuard>;
}
