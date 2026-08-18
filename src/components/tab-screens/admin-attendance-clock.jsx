"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AttendanceClockSettingsPanel } from "@/components/admin/attendance-clock-settings-panel";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { SettingsApiProvider } from "@/contexts/settings-api-context";

export function AdminAttendanceClockScreen() {
  return (
    <CatalogPageShell
      title="Attendance clock-in"
      subtitle="Attendance method, fingerprint terminals, and Centrix Attendance Agent"
      banner={
        <AdminBreadcrumb
          items={[
            { label: "Administration", href: "/admin" },
            { label: "Attendance clock-in" },
          ]}
        />
      }
    >
      <SettingsApiProvider>
        <AttendanceClockSettingsPanel />
      </SettingsApiProvider>
    </CatalogPageShell>
  );
}
