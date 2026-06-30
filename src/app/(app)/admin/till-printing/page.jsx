"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { PrintAgentSettingsPanel } from "@/components/pos/print-agent-settings-panel";

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
