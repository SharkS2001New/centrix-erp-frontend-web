"use client";

import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { useAuth } from "@/contexts/auth-context";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";

export { HotelBarPosScreen } from "@/components/hospitality/hotel-bar-pos-screen";
export { HospitalityDashboardContent as HospitalityDashboardScreen } from "@/components/hospitality/hospitality-dashboard-content";

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
