"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar } from "@/components/admin/settings-sub-tabs";
import { PlatformEmailDeliveryPanel } from "@/components/platform/platform-email-delivery-panel";
import { PlatformWhatsappScreen } from "@/components/platform/platform-whatsapp-screen";
import { PlatformAlertNotificationsPanel } from "@/components/platform/platform-alert-notifications-panel";

const TABS = [
  { id: "email", label: "Email delivery" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "alerts", label: "Alert notifications" },
];

function resolveTab(tabId, fallback = "email") {
  return TABS.some((t) => t.id === tabId) ? tabId : fallback;
}

export function PlatformSettingsScreen({ initialTab = "email" }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requestedTab = searchParams.get("tab");

  useEffect(() => {
    if (requestedTab === "mailbox") {
      router.replace("/platform/mailbox");
    }
  }, [requestedTab, router]);

  const activeTab = resolveTab(requestedTab, resolveTab(initialTab));

  function onTabChange(id) {
    if (id === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const subtitle =
    activeTab === "email"
      ? "SMTP, IMAP, contract templates, and subscription renewal reminders."
      : activeTab === "whatsapp"
        ? "Shared WhatsApp webhook for all tenant organizations."
        : "Email digest and instant WhatsApp/email alerts for system errors & reports.";

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

      {activeTab === "email" ? <PlatformEmailDeliveryPanel /> : null}
      {activeTab === "whatsapp" ? <PlatformWhatsappScreen embedded /> : null}
      {activeTab === "alerts" ? <PlatformAlertNotificationsPanel /> : null}
    </CatalogPageShell>
  );
}
