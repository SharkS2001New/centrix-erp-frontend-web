"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  PLATFORM_ADMIN_LINKS,
  platformAdminHref,
  platformOrgSettingsHref,
} from "@/lib/platform-admin-nav";

export function PlatformAdminNav() {
  const params = useParams();
  const pathname = usePathname();
  const orgId = params?.id;

  if (!orgId) return null;

  const hubPath = platformAdminHref(orgId, "");
  const settingsPath = platformOrgSettingsHref(orgId);
  const isHub = pathname === hubPath || pathname === `${hubPath}/`;

  const tabs = [
    { href: hubPath, label: "Overview", exact: true },
    ...PLATFORM_ADMIN_LINKS.map((item) => ({
      href: platformAdminHref(orgId, item.href),
      label: item.label,
      exact: false,
    })),
    { href: settingsPath, label: "Settings", exact: false },
  ];

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-[var(--theme-border)] pb-3">
      {tabs.map((tab) => {
        const active = tab.exact
          ? isHub
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              active
                ? "bg-[#E6F1FB] text-[#185FA5] dark:bg-sky-950/50 dark:text-sky-300"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
