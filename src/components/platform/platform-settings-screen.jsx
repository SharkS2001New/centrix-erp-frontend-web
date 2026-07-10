"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar } from "@/components/admin/settings-sub-tabs";
import { PlatformMailboxPanel } from "@/components/platform/platform-mailbox-panel";
import { PlatformEmailDeliveryPanel } from "@/components/platform/platform-email-delivery-panel";
import { PlatformWhatsappScreen } from "@/components/platform/platform-whatsapp-screen";

const TABS = [
  { id: "mailbox", label: "Mailbox" },
  { id: "email", label: "Email delivery" },
  { id: "whatsapp", label: "WhatsApp" },
];

function resolveTab(tabId, fallback = "mailbox") {
  return TABS.some((t) => t.id === tabId) ? tabId : fallback;
}

export function PlatformSettingsScreen({ initialTab = "mailbox" }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = resolveTab(searchParams.get("tab"), resolveTab(initialTab));

  function onTabChange(id) {
    if (id === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const subtitle =
    activeTab === "mailbox"
      ? "Send mail to clients, sync replies, and respond from one inbox."
      : activeTab === "email"
        ? "SMTP, IMAP, and contract email templates for platform outbound mail."
        : "Shared WhatsApp webhook for all tenant organizations.";

  return (
    <CatalogPageShell title="Platform settings" subtitle={subtitle}>
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Settings" }]} />

      <div className="mb-4">
        <SettingsSubTabBar
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={onTabChange}
          ariaLabel="Platform settings"
        />
      </div>

      {activeTab === "mailbox" ? <PlatformMailboxPanel /> : null}
      {activeTab === "email" ? <PlatformEmailDeliveryPanel /> : null}
      {activeTab === "whatsapp" ? <PlatformWhatsappScreen embedded /> : null}
    </CatalogPageShell>
  );
}
