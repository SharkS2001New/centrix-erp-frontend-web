"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { PrintAgentSettingsPanel } from "@/components/pos/print-agent-settings-panel";
import { LOCAL_PRINTING_ADMIN_LABEL } from "@/lib/local-printing";

export default function AdminTillPrintingPage() {
  return (
    <CatalogPageShell
      title={LOCAL_PRINTING_ADMIN_LABEL}
      subtitle="Install Centrix Print Agent and configure silent printing for receipts and thermal printers on this computer or any checkout workstation"
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
