"use client";

import Link from "next/link";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

/** Empty Hotel & Bar POS shell — checks use hospitality_* tables, not sales/carts. */
export function HotelBarPosScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-text-subtle)]">
          Hotel &amp; Bar POS
        </p>
        <h1 className="theme-heading mt-2 text-2xl font-semibold">Front terminal</h1>
        <p className="theme-subtext mt-2 text-sm leading-relaxed">
          Kenya-ready hospitality POS scaffold. Open checks, outlets, and room charges will live here —
          stored in <code className="text-xs">hospitality_checks</code>, not retail{" "}
          <code className="text-xs">sales</code> / <code className="text-xs">temporary_carts</code>.
        </p>
        <ul className="theme-subtext mt-4 list-disc space-y-1 pl-5 text-sm">
          <li>Counter, table, takeaway, and room-service modes (capability toggles)</li>
          <li>Cash, M-Pesa, card, and folio posting</li>
          <li>Shared products / VAT / payment methods only — no sales-order reuse</li>
        </ul>
        <div className="mt-6">
          <Link
            href="/choose-workspace"
            className="text-sm font-medium text-[#185FA5] hover:underline"
          >
            Switch workspace
          </Link>
        </div>
      </div>
    </div>
  );
}

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
