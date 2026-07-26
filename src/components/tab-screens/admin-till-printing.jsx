"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { PrintAgentSettingsPanel } from "@/components/pos/print-agent-settings-panel";
import { LOCAL_PRINTING_ADMIN_LABEL } from "@/lib/local-printing";

export function AdminTillPrintingScreen() {
  return (
    <CatalogPageShell
      title={LOCAL_PRINTING_ADMIN_LABEL}
      subtitle="Organization-wide browser print or QZ Tray for silent receipts and thermal printing"
      banner={
        <AdminBreadcrumb
          items={[
            { label: "Administration", href: "/admin" },
            { label: LOCAL_PRINTING_ADMIN_LABEL },
          ]}
        />
      }
    >
      <PrintAgentSettingsPanel />
    </CatalogPageShell>
  );
}
