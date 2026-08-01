"use client";

import Link from "next/link";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

export { HotelBarPosScreen } from "@/components/hospitality/hotel-bar-pos-screen";

export function HospitalityDashboardScreen() {
  return (
    <CatalogPageShell
      title="Hospitality"
      subtitle="Rooms, front desk, folios, and hotel operations — separate from retail backoffice sales."
    >
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 text-sm">
        <p className="theme-heading font-medium">Hospitality Backoffice</p>
        <p className="theme-subtext mt-2 leading-relaxed">
          Module scaffold is live. Domain data uses <code className="text-xs">hospitality_*</code> tables
          (outlets, checks, rooms, folios). Shared with the rest of Centrix: products, stock, users,
          branches, VAT, and payment methods.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            ["/hospitality/rooms", "Rooms"],
            ["/hospitality/reservations", "Reservations"],
            ["/hospitality/front-desk", "Front desk"],
            ["/hospitality/folios", "Guest folios"],
            ["/hospitality/housekeeping", "Housekeeping"],
            ["/hospitality/outlets", "Outlets & floor"],
            ["/hospitality/night-audit", "Night audit"],
            ["/hospitality/settings", "Settings"],
          ].map(([href, label]) => (
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

export function HospitalityPlaceholderScreen({ title, description }) {
  return (
    <CatalogPageShell title={title} subtitle={description}>
      <p className="theme-subtext rounded-xl border border-dashed border-[var(--theme-border)] px-4 py-8 text-center text-sm">
        Coming next — hospitality domain screens (not retail sales).
      </p>
    </CatalogPageShell>
  );
}
