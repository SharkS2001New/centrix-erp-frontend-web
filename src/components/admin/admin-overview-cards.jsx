"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { canAccessOrgAdminSettings } from "@/lib/admin-scope";
import { P } from "@/lib/permission-codes";

const CARDS = [
  {
    href: "/admin/company",
    title: "Company profile",
    description: "Manage organization info, registration details, and logo.",
    icon: "🏢",
    permission: P.admin.company.view,
  },
  {
    href: "/admin/branches",
    title: "Branches",
    description: "Manage branch locations, contacts, and status.",
    icon: "🏬",
    permission: P.admin.branches.view,
  },
  {
    href: "/admin/users",
    title: "Users",
    description: "Create users, assign branches and roles.",
    icon: "👤",
    permission: P.admin.users.view,
  },
  {
    href: "/admin/roles",
    title: "Roles & permissions",
    description: "Define roles and control module access levels.",
    icon: "🔐",
    permission: P.admin.roles.view,
  },
  {
    href: "/admin/audit",
    title: "Audit trail",
    description: "View system activity and change history.",
    icon: "📜",
    permission: P.admin.audit.view,
  },
  {
    href: "/admin/settings",
    title: "System settings",
    description: "Configure sales, inventory, and organization preferences.",
    icon: "⚙️",
    permission: P.admin.settings.view,
  },
];

export function AdminOverviewCards() {
  const { hasPermission, isSuperAdmin, organization, user, capabilities } = useAuth();
  const orgAdminOk = canAccessOrgAdminSettings({
    organization,
    isSuperAdmin,
    hasPermission,
    user,
    capabilities,
  });
  const visible = CARDS.filter((card) => orgAdminOk && hasPermission(card.permission));

  if (visible.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
        You do not have access to any administration modules.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#185FA5]/30 hover:shadow-md"
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>
              {card.icon}
            </span>
            <div>
              <h2 className="text-[15px] font-medium text-slate-900 group-hover:text-[#185FA5]">
                {card.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{card.description}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
