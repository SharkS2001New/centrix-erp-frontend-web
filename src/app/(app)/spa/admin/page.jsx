"use client";

import Link from "next/link";
import { ArrowRight, Building2, MapPinned, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/spa/ui";

const ADMIN_PAGES = [
  { href: "/spa/admin/users", label: "Users", detail: "Manage organization accounts and access.", icon: Users },
  { href: "/spa/admin/roles", label: "Roles & permissions", detail: "Control what each team role can access.", icon: ShieldCheck },
  { href: "/spa/admin/branches", label: "Branches", detail: "Manage branches and their operating details.", icon: MapPinned },
  { href: "/spa/admin/company", label: "Company profile", detail: "Update organization details and registration information.", icon: Building2 },
  { href: "/spa/admin/license", label: "License information", detail: "View the organization's plan and billing details.", icon: Building2 },
];

export default function SpaAdministrationPage() {
  return (
    <div>
      <PageHeader title="Administration" detail="Manage the people and organization settings for this Spa workspace." />
      <div className="grid gap-3 md:grid-cols-2">
        {ADMIN_PAGES.map(({ href, label, detail, icon: Icon }) => (
          <Link key={href} href={href} className="theme-panel flex items-center gap-4 rounded-xl border p-4 shadow-sm transition hover:shadow-md">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--theme-primary-soft)] text-[var(--theme-primary)]"><Icon size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="theme-heading block font-semibold">{label}</span>
              <span className="theme-subtext mt-1 block text-sm">{detail}</span>
            </span>
            <ArrowRight className="theme-subtext shrink-0" size={18} />
          </Link>
        ))}
      </div>
    </div>
  );
}
