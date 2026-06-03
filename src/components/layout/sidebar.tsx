"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

const nav = [
  { href: "/dashboard", label: "Dashboard", module: null },
  { href: "/sales", label: "Sales", module: "sales.backend" },
  { href: "/products", label: "Products", module: null },
  { href: "/inventory", label: "Inventory", module: "inventory" },
  { href: "/employees", label: "Employees", module: "hr_payroll" },
  { href: "/reports", label: "Reports", module: "reports" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, capabilities, logout, isModuleEnabled } = useAuth();

  const visible = nav.filter(
    (item) => !item.module || isModuleEnabled(item.module),
  );

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-4 py-5">
        <p className="text-sm font-semibold text-white">POS / ERP</p>
        <p className="mt-1 truncate text-xs text-slate-400">
          {capabilities?.profile_label ?? capabilities?.deployment_profile}
        </p>
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {visible.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-emerald-600/20 text-emerald-300"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <p className="truncate text-xs text-slate-400">{user?.full_name ?? user?.username}</p>
        <button
          type="button"
          onClick={() => logout()}
          className="mt-2 w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
