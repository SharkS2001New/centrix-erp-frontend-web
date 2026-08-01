"use client";

import Link from "next/link";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { useAuth } from "@/contexts/auth-context";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";

export { HotelBarPosScreen } from "@/components/hospitality/hotel-bar-pos-screen";

const DASHBOARD_LINKS = [
  { href: "/hospitality/rooms", label: "Rooms", service: "rooms" },
  { href: "/hospitality/reservations", label: "Reservations", service: "reservations" },
  { href: "/hospitality/front-desk", label: "Front desk", service: "front_desk" },
  { href: "/hospitality/folios", label: "Guest folios", service: "folios" },
  { href: "/hospitality/housekeeping", label: "Housekeeping", service: "housekeeping" },
  { href: "/hospitality/outlets", label: "Outlets", service: null },
  { href: "/hospitality/night-audit", label: "Night audit", service: "night_audit" },
  { href: "/hospitality/settings", label: "Settings", service: null },
];

export function HospitalityDashboardScreen() {
  const { capabilities } = useAuth();
  const links = DASHBOARD_LINKS.filter(
    (item) => !item.service || isHospitalityServiceEnabled(capabilities, item.service),
  );

  return (
    <CatalogPageShell
      title="Hospitality"
      subtitle="Main outlet and Rooms are on by default. Other services are enabled by your platform administrator."
    >
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 text-sm">
        <p className="theme-heading font-medium">Hospitality Backoffice</p>
        <p className="theme-subtext mt-2 leading-relaxed">
          Shared with the rest of Centrix: products, stock, users, branches, VAT, and payment methods.
          Hotel &amp; Bar POS always uses the Main outlet.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-[var(--theme-text)] hover:bg-[var(--theme-hover)]"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </CatalogPageShell>
  );
}

export function HospitalityPlaceholderScreen({ title, description, serviceKey = null }) {
  const { capabilities } = useAuth();
  const enabled = !serviceKey || isHospitalityServiceEnabled(capabilities, serviceKey);

  if (!enabled) {
    return (
      <CatalogPageShell
        title={title}
        subtitle={`${title} is not enabled for this organization. Ask your Centrix platform administrator to turn it on under Applications → Hospitality services.`}
      >
        <p className="theme-subtext rounded-xl border border-dashed border-[var(--theme-border)] px-4 py-8 text-center text-sm">
          Service disabled for this tenant.
        </p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell title={title} subtitle={description}>
      <p className="theme-subtext rounded-xl border border-dashed border-[var(--theme-border)] px-4 py-8 text-center text-sm">
        Coming next — hospitality domain screens (not retail sales).
      </p>
    </CatalogPageShell>
  );
}
