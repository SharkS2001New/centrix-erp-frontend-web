"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";

export default function SpaPayrollLayout({ children }) {
  const { user, hasPermission } = useAuth();
  const allowed =
    user?.is_admin ||
    hasPermission(P.hr.payroll.view) ||
    hasPermission(P.hr.manage);

  if (!allowed) {
    return (
      <div className="theme-panel mx-auto max-w-xl rounded-xl border p-6 text-center">
        <h1 className="theme-heading font-semibold">Payroll access required</h1>
        <p className="theme-subtext mt-2 text-sm">Your role does not have permission to view staff payroll.</p>
        <Link className="mt-4 inline-block text-sm font-medium text-[var(--theme-accent-text)]" href="/spa/staff">Return to staff</Link>
      </div>
    );
  }

  return children;
}
