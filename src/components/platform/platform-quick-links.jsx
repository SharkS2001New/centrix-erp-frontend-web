"use client";

import Link from "next/link";
import { PLATFORM_LINK_GROUPS } from "@/lib/platform-nav";
import { NavIcon } from "@/lib/nav-icons";

export function PlatformQuickLinks() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {PLATFORM_LINK_GROUPS.map((section) => (
        <section
          key={section.id}
          className="theme-panel rounded-xl border p-4 shadow-sm"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.label}</h2>
          <ul className="mt-3 space-y-2">
            {section.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-start gap-3 rounded-lg border border-transparent px-2 py-2 transition hover:border-slate-200 hover:bg-slate-50"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <NavIcon iconKey={link.icon ?? "link"} size="item" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#185FA5]">{link.label}</span>
                    {link.description ? (
                      <span className="mt-0.5 block text-xs text-slate-500">{link.description}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
