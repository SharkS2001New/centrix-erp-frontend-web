"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }) {
  const pathname = usePathname();
  const isPos = pathname === "/sales/pos";

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
        <Sidebar />
        <main
          className={
            isPos
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              : "min-h-0 flex-1 overflow-y-auto p-6 md:p-8"
          }
        >
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
