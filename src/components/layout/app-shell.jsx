"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
        <Sidebar />
        <main className="min-h-0 flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
