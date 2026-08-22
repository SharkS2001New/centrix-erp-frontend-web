"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { FinanceSettingsPanel } from "@/components/admin/finance-settings-panel";
import { AiSettingsPanel } from "@/components/admin/ai-settings-panel";
import { WhatsappSettingsPanel } from "@/components/admin/whatsapp-settings-panel";
import { InventorySettingsPanel } from "@/components/admin/inventory-settings-panel";
import { DistributionSettingsPanel } from "@/components/admin/distribution-settings-panel";
import { MobileApplicationSettingsPanel } from "@/components/admin/mobile-application-settings-panel";
import { GeneralSettingsPanel } from "@/components/admin/general-settings-panel";
import { NotificationsSettingsPanel } from "@/components/admin/notifications-settings-panel";
import { ProcurementSettingsPanel } from "@/components/admin/procurement-settings-panel";
import { PrintoutsSettingsPanel } from "@/components/admin/printouts-settings-panel";
import { HrSettingsPanel } from "@/components/admin/hr-settings-panel";
import { SecuritySettingsPanel } from "@/components/admin/security-settings-panel";
import { SalesSettingsPanel } from "@/components/admin/sales-settings-panel";
import { ManagerApprovalsSettingsPanel } from "@/components/admin/manager-approvals-settings-panel";
import { PlatformAccountingSettingsPanel } from "@/components/admin/platform-accounting-settings-panel";
import { RbacHelpDialog } from "@/components/admin/rbac-help";
import { visibleOrgSettingsTabs } from "@/lib/org-settings-tabs";
import {
  ORG_SETTINGS_PLATFORM_MESSAGE,
  TENANT_ORG_SETTINGS_SUBTITLE,
  TENANT_ORG_SETTINGS_TAB_REDIRECTS,
} from "@/lib/org-settings-access";
import {
  isPlatformKraIntegrationEnabled,
  isPlatformMpesaStkEnabled,
} from "@/lib/platform-org-features";
import { toastErrorSetter, toastMessageSetter } from "@/lib/notify";
import {
  CatalogPageShell,
} from "@/components/catalog/catalog-shared";

const TABS = [
  { id: "general", label: "General" },
  { id: "printouts", label: "Printouts" },
  { id: "sales", label: "Sales" },
  { id: "mobile", label: "Mobile application" },
  { id: "distribution", label: "Distribution" },
  { id: "manager-approvals", label: "Manager approvals" },
  { id: "inventory", label: "Inventory" },
  { id: "procurement", label: "Procurement" },
  { id: "finance", label: "Finance" },
  { id: "accounting", label: "Accounting" },
  { id: "ai", label: "AI" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "hr", label: "HR & Payroll" },
  { id: "notifications", label: "Messaging" },
  { id: "security", label: "Security" },
];

const LEGACY_THEMES_TAB_IDS = new Set(["external-pos", "themes", "centrix-erp-themes"]);

function normalizeSettingsTabId(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

export function OrganizationSettingsContent({
  capabilities,
  platformManaged = false,
  tenantSelfService = false,
  onAfterSave,
  breadcrumbItems,
  showShell = true,
  title = "Organization settings",
  subtitle = tenantSelfService
    ? TENANT_ORG_SETTINGS_SUBTITLE
    : "Platform configuration for module provisioning, workflows, accounting books setup, and integration gates. Tenants manage day-to-day module preferences under Administration → Organization settings.",
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabFromUrl = normalizeSettingsTabId(searchParams?.get("tab"));
  const [tab, setTab] = useState(
    tabFromUrl && !LEGACY_THEMES_TAB_IDS.has(tabFromUrl) ? tabFromUrl : "general",
  );
  const [saving, setSaving] = useState(false);
  const setMessage = toastMessageSetter;
  const setError = toastErrorSetter;

  const visibleTabs = useMemo(
    () => visibleOrgSettingsTabs(TABS, capabilities, { platformManaged, tenantSelfService }),
    [capabilities, platformManaged, tenantSelfService],
  );

  useEffect(() => {
    if (!LEGACY_THEMES_TAB_IDS.has(tabFromUrl)) return;
    // Platform org settings keep themes on the org profile; tenant bookmarks go to the standalone page.
    if (platformManaged) return;
    router.replace("/admin/themes");
  }, [tabFromUrl, router, platformManaged]);

  useEffect(() => {
    if (!tenantSelfService || !tabFromUrl) return;
    const redirect = TENANT_ORG_SETTINGS_TAB_REDIRECTS[tabFromUrl];
    if (!redirect) return;
    if (tabFromUrl === "finance") {
      if (isPlatformKraIntegrationEnabled(capabilities)) {
        router.replace("/admin/kra-settings");
        return;
      }
      if (isPlatformMpesaStkEnabled(capabilities)) {
        router.replace("/admin/mpesa-settings");
        return;
      }
    }
    router.replace(redirect);
  }, [tabFromUrl, tenantSelfService, router, capabilities]);

  useEffect(() => {
    if (!tabFromUrl || LEGACY_THEMES_TAB_IDS.has(tabFromUrl)) return;
    if (tenantSelfService && TENANT_ORG_SETTINGS_TAB_REDIRECTS[tabFromUrl]) return;
    if (visibleTabs.some((item) => item.id === tabFromUrl)) {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl, visibleTabs, tenantSelfService]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((item) => item.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  const selectTab = (nextTab) => {
    setTab(nextTab);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", nextTab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const panelProps = {
    saving,
    setSaving,
    setError,
    setMessage,
    onAfterSave,
    capabilities,
    platformManaged,
  };

  const body = (
    <>
      {breadcrumbItems ? <AdminBreadcrumb items={breadcrumbItems} /> : null}

      {tenantSelfService ? (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Your organization preferences</p>
          <p className="mt-1 text-xs text-slate-600">
            Configure sales, inventory, HR, and other module preferences for your company. KRA, M-Pesa, and
            Paybills are under Finance & tax in the sidebar. {ORG_SETTINGS_PLATFORM_MESSAGE}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {visibleTabs.length === 0 ? (
          <p className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-950">
            No organization settings are available for this company. Enable at least one operational module
            (sales, inventory, procurement, and so on) to configure printouts and other preferences.
          </p>
        ) : (
          <>
        <nav className="theme-panel rounded-xl border p-2 shadow-sm">
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                tab === item.id
                  ? "bg-[#E6F1FB] font-medium text-[#185FA5]"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div>
          {tab === "general" ? <GeneralSettingsPanel {...panelProps} /> : null}

          {tab === "printouts" ? <PrintoutsSettingsPanel {...panelProps} /> : null}

          {tab === "sales" ? <SalesSettingsPanel {...panelProps} /> : null}

          {tab === "mobile" ? <MobileApplicationSettingsPanel {...panelProps} /> : null}
          {tab === "distribution" ? <DistributionSettingsPanel {...panelProps} /> : null}
          {tab === "manager-approvals" ? <ManagerApprovalsSettingsPanel {...panelProps} /> : null}
          {tab === "inventory" ? <InventorySettingsPanel {...panelProps} /> : null}
          {tab === "procurement" ? <ProcurementSettingsPanel {...panelProps} /> : null}
          {tab === "finance" ? <FinanceSettingsPanel {...panelProps} /> : null}
          {tab === "accounting" ? <PlatformAccountingSettingsPanel {...panelProps} /> : null}
          {tab === "ai" ? <AiSettingsPanel {...panelProps} /> : null}
          {tab === "whatsapp" ? <WhatsappSettingsPanel {...panelProps} /> : null}
          {tab === "hr" ? <HrSettingsPanel {...panelProps} /> : null}
          {tab === "notifications" ? <NotificationsSettingsPanel {...panelProps} /> : null}
          {tab === "security" ? <SecuritySettingsPanel {...panelProps} /> : null}
        </div>
          </>
        )}
      </div>
      <RbacHelpDialog />
    </>
  );

  if (!showShell) {
    return body;
  }

  return (
    <CatalogPageShell title={title} subtitle={subtitle}>
      {body}
    </CatalogPageShell>
  );
}
