"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { PlatformMailboxPanel } from "@/components/platform/platform-mailbox-panel";

export default function PlatformMailboxPage() {
  return (
    <CatalogPageShell
      title="Mailbox"
      subtitle="Send mail to clients, sync replies, and respond from one inbox."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Mailbox" }]} />
      <PlatformMailboxPanel />
    </CatalogPageShell>
  );
}
