"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar } from "@/components/admin/settings-sub-tabs";
import { PlatformEmailDeliveryPanel } from "@/components/platform/platform-email-delivery-panel";
import { PlatformWhatsappScreen } from "@/components/platform/platform-whatsapp-screen";
import { PlatformAlertNotificationsPanel } from "@/components/platform/platform-alert-notifications-panel";
import { PlatformR2BackupSettingsPanel } from "@/components/platform/platform-r2-backup-settings-panel";
import { PlatformAiCredentialsScreen } from "@/components/platform/platform-ai-credentials-screen";
import { PlatformKenyaPayrollSettingsPanel } from "@/components/platform/platform-kenya-payroll-settings-panel";

const TABS = [
  { id: "email", label: "Email delivery" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "ai", label: "AI credentials" },
  { id: "alerts", label: "Alert notifications" },
  { id: "payroll", label: "Kenya payroll" },
  { id: "r2", label: "Cloudflare R2" },
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
    if (requestedTab === "ai-credentials" || requestedTab === "credentials") {
      router.replace("/platform/settings?tab=ai");
    }
  }, [requestedTab, router]);

  const activeTab = resolveTab(requestedTab, resolveTab(initialTab));
  const emailTab = searchParams.get("email_tab");

  function onTabChange(id) {
    if (id === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    if (id !== "email") {
      params.delete("email_tab");
    } else if (!params.get("email_tab")) {
      params.set("email_tab", "smtp");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const emailSubtitles = {
    smtp: "Main outbound SMTP, From address, and test email.",
    auth: "Dedicated sender for 2FA and email verification codes.",
    imap: "Inbox sync for Platform → Mailbox replies.",
    templates: "Contract and quote email subject and body templates.",
    renewals: "Automatic subscription renewal reminders and templates.",
  };

  const subtitle =
    activeTab === "email"
      ? emailSubtitles[emailTab] || "SMTP, IMAP, contract templates, and subscription renewal reminders."
      : activeTab === "whatsapp"
        ? "Shared WhatsApp webhook URL and verify token for all tenants."
        : activeTab === "ai"
          ? "OpenAI API key and model for platform-admin AI tools (email assist, training console)."
          : activeTab === "r2"
            ? "Offsite Cloudflare R2 upload for scheduled and manual database backups."
            : activeTab === "payroll"
              ? "Kenya PAYE bands, personal relief, NSSF, SHIF, and housing levy — platform-wide defaults."
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
      {activeTab === "ai" ? <PlatformAiCredentialsScreen embedded /> : null}
      {activeTab === "alerts" ? <PlatformAlertNotificationsPanel /> : null}
      {activeTab === "payroll" ? <PlatformKenyaPayrollSettingsPanel /> : null}
      {activeTab === "r2" ? <PlatformR2BackupSettingsPanel /> : null}
    </CatalogPageShell>
  );
}
