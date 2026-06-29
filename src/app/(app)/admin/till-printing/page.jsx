"use client";

import dynamic from "next/dynamic";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

const PrintAgentSettingsPanel = dynamic(
  () =>
    import("@/components/pos/print-agent-settings-panel").then((mod) => mod.PrintAgentSettingsPanel),
  {
    loading: () => (
      <div className="theme-panel rounded-xl border p-6 shadow-sm">
        <p className="theme-subtext text-sm">Loading till printing settings…</p>
      </div>
    ),
  },
);

export default function AdminTillPrintingPage() {
  return (
    <CatalogPageShell
      title="Till printing"
      subtitle="Install the print agent MSI and configure silent receipt printing on each till computer"
      banner={
        <AdminBreadcrumb
          items={[
            { label: "Administration", href: "/admin" },
            { label: "Till printing" },
          ]}
        />
      }
    >
      <PrintAgentSettingsPanel />
    </CatalogPageShell>
  );
}
