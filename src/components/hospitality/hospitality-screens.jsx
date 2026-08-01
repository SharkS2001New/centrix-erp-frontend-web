"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { apiRequest, ApiError } from "@/lib/api";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { notifyError } from "@/lib/notify";

export { HotelBarPosScreen } from "@/components/hospitality/hotel-bar-pos-screen";

const DASHBOARD_LINKS = [
  { href: "/hospitality/rooms", label: "Rooms & rate plans", service: "rooms" },
  { href: "/hospitality/reservations", label: "Reservations", service: "reservations" },
  { href: "/hospitality/front-desk", label: "Front desk", service: "front_desk" },
  { href: "/hospitality/folios", label: "Guest folios", service: "folios" },
  { href: "/hospitality/housekeeping", label: "Housekeeping", service: "housekeeping" },
  { href: "/hospitality/outlets", label: "Outlets & tables", service: null },
  { href: "/hospitality/night-audit", label: "Night audit", service: "night_audit" },
  { href: "/hospitality/settings", label: "Settings & F&B stock", service: null },
];

function Kpi({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3">
      <p className="theme-subtext text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <p className="theme-heading mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="theme-subtext mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}

export function HospitalityDashboardScreen() {
  const { capabilities } = useAuth();
  const [summary, setSummary] = useState(null);
  const links = DASHBOARD_LINKS.filter(
    (item) => !item.service || isHospitalityServiceEnabled(capabilities, item.service),
  );

  const load = useCallback(async () => {
    try {
      const res = await apiRequest("/hospitality/dashboard", { loading: false });
      setSummary(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load dashboard");
    }
  }, []);

  useTabAwareDataLoad(load);

  const rooms = summary?.rooms ?? {};
  const fnb = summary?.fnb_today ?? {};

  return (
    <CatalogPageShell
      title="Hospitality"
      subtitle="Rooms, front desk, folios, and Hotel POS — separate from retail sales."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Occupancy"
            value={`${rooms.occupancy_pct ?? 0}%`}
            hint={`${rooms.occupied ?? 0} / ${rooms.total ?? 0} rooms`}
          />
          <Kpi label="Arrivals today" value={summary?.arrivals_today ?? 0} />
          <Kpi label="Departures today" value={summary?.departures_today ?? 0} />
          <Kpi
            label="Open folios"
            value={summary?.open_folios ?? 0}
            hint={`Balance ${Number(summary?.open_folio_balance ?? 0).toFixed(2)}`}
          />
          <Kpi label="Rooms dirty" value={rooms.dirty ?? 0} />
          <Kpi
            label="F&B today"
            value={Number(fnb.revenue ?? 0).toFixed(0)}
            hint={`${fnb.checks ?? 0} paid checks`}
          />
        </div>

        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-5 py-4 text-sm text-amber-950">
          <p className="font-semibold">F&amp;B stock balancing</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            Configure recipes and enable deduct on Hotel POS settle under Settings.
          </p>
          <Link
            href="/hospitality/settings"
            className="mt-3 inline-block text-xs font-semibold uppercase tracking-wide underline"
          >
            Open setup guide &amp; recipes →
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 text-sm">
          <p className="theme-heading font-medium">Quick links</p>
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
