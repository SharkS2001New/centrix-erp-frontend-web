import { hasOperationalModule } from "@/lib/admin-scope";
import { hasManagerApprovalsSettingsTab } from "@/lib/manager-approvals-settings";
import { resolveSalesChannelsFromModules } from "@/lib/sales-channels";
import {
  isPlatformAiEnabled,
  isPlatformKraIntegrationEnabled,
  isPlatformMobileOrdersEnabled,
  isPlatformMpesaStkEnabled,
  isPlatformWhatsappEnabled,
} from "@/lib/platform-org-features";

/** Map organization settings tabs to ERP module keys (platform super-admin controlled). */
export const ORG_SETTINGS_TAB_MODULES = {
  general: ["admin"],
  printouts: [
    "admin",
    "sales",
    "hospitality",
    "hospitality.bar_pos",
    "hospitality.backend",
    "inventory",
    "customers_suppliers",
    "accounting",
    "payments",
    "hr_payroll",
    "distribution",
  ],
  sales: ["sales"],
  "external-pos": ["sales.pos", "sales", "admin"],
  themes: ["sales.pos", "sales", "admin"],
  mobile: ["sales.mobile"],
  distribution: ["distribution"],
  "manager-approvals": ["sales", "inventory", "customers_suppliers", "hr_payroll", "accounting", "admin"],
  inventory: ["inventory"],
  procurement: ["customers_suppliers"],
  finance: ["accounting", "payments"],
  accounting: ["accounting"],
  ai: ["admin"],
  whatsapp: ["sales"],
  hr: ["hr_payroll"],
  notifications: ["admin"],
  security: ["admin"],
};

/** Tabs always available on tenant Administration → Organization settings. */
export const TENANT_CORE_SETTINGS_TABS = new Set(["general", "printouts", "notifications", "security"]);

/** Tabs only shown when platform manages settings on behalf of a tenant without Administration. */
export const PLATFORM_MANAGED_ADMIN_TABS = new Set(["general", "printouts", "notifications", "security"]);

/** Tabs only platform super-admins may configure (not exposed on tenant /admin/settings). */
export const PLATFORM_ONLY_ORG_SETTINGS_TABS = new Set();

function moduleEnabled(capabilities, moduleKey) {
  return Boolean(capabilities?.modules?.[moduleKey]);
}

/** @param {object} capabilities erp/capabilities payload */
export function isHospitalityIndustry(capabilities) {
  return (
    capabilities?.industry === "hospitality" ||
    capabilities?.deployment_profile === "hotel_bar"
  );
}

/** @param {object} capabilities erp/capabilities payload */
export function isOrgSettingsTabVisible(tabId, capabilities, { platformManaged = false, tenantSelfService = false } = {}) {
  const hospitality = isHospitalityIndustry(capabilities);

  // Retail / distribution settings are not used on Hotel deployments.
  if (
    hospitality &&
    ["sales", "external-pos", "mobile", "distribution", "whatsapp"].includes(tabId)
  ) {
    return false;
  }

  switch (tabId) {
    case "general":
    case "notifications":
    case "security":
      if (tenantSelfService && TENANT_CORE_SETTINGS_TABS.has(tabId)) {
        return true;
      }
      if (platformManaged && PLATFORM_MANAGED_ADMIN_TABS.has(tabId)) {
        return true;
      }
      return moduleEnabled(capabilities, "admin");

    case "printouts":
      return hasOperationalModule(capabilities);

    case "sales":
      return moduleEnabled(capabilities, "sales");

    case "external-pos":
    case "themes":
      // Themes live on /admin/themes. Hide retail External POS tab for hotels;
      // keep themes only when sales.pos is on (commerce) — hotel uses Themes page for sidebar colors.
      if (tabId === "themes") {
        return false;
      }
      return (
        moduleEnabled(capabilities, "sales.pos") ||
        moduleEnabled(capabilities, "sales")
      );

    case "mobile":
      return moduleEnabled(capabilities, "sales.mobile") && isPlatformMobileOrdersEnabled(capabilities);

    case "distribution":
      return moduleEnabled(capabilities, "distribution");

    case "manager-approvals":
      return hasManagerApprovalsSettingsTab(capabilities);

    case "inventory":
      return moduleEnabled(capabilities, "inventory");

    case "procurement":
      return moduleEnabled(capabilities, "customers_suppliers");

    case "finance":
      if (!moduleEnabled(capabilities, "payments")) {
        return false;
      }
      return isPlatformMpesaStkEnabled(capabilities) || isPlatformKraIntegrationEnabled(capabilities);

    case "accounting":
      return platformManaged && moduleEnabled(capabilities, "accounting");

    case "ai":
      if (!isPlatformAiEnabled(capabilities)) {
        return false;
      }
      if (platformManaged) {
        return true;
      }
      return moduleEnabled(capabilities, "admin");

    case "whatsapp":
      if (!moduleEnabled(capabilities, "sales")) {
        return false;
      }
      if (!isPlatformWhatsappEnabled(capabilities)) {
        return false;
      }
      if (platformManaged) {
        return true;
      }
      return moduleEnabled(capabilities, "admin") || moduleEnabled(capabilities, "sales");

    case "hr":
      return moduleEnabled(capabilities, "hr_payroll");

    default: {
      const required = ORG_SETTINGS_TAB_MODULES[tabId] ?? ["admin"];
      return required.some((key) => moduleEnabled(capabilities, key));
    }
  }
}

/** @param {object} capabilities */
export function visibleOrgSettingsTabs(allTabs, capabilities, options = {}) {
  const { platformManaged = false, tenantSelfService = false } = options;
  let tabs = allTabs.filter((tab) =>
    isOrgSettingsTabVisible(tab.id, capabilities, { platformManaged, tenantSelfService }),
  );
  if (tenantSelfService) {
    tabs = tabs.filter((tab) => !PLATFORM_ONLY_ORG_SETTINGS_TABS.has(tab.id));
  }
  return tabs;
}

/** Build a capabilities-shaped object from platform organization show payload. */
export function capabilitiesFromOrganizationPayload(payload) {
  const capabilities = payload?.capabilities;
  if (capabilities?.modules && capabilities.screen_lock_minutes != null) {
    return capabilities;
  }

  const moduleSettings = capabilities?.module_settings ?? payload?.organization?.module_settings ?? {};
  const security = moduleSettings.security ?? {};
  const modules = payload?.effective_modules ?? payload?.capabilities?.modules ?? {};
  const finance = moduleSettings.finance ?? {};
  const general = moduleSettings.general ?? {};
  const ai = moduleSettings.ai ?? {};
  const whatsapp = moduleSettings.whatsapp ?? {};
  const sales = moduleSettings.sales ?? {};
  const distribution = moduleSettings.distribution ?? {};
  const driverMobileEnabled = Boolean(modules.distribution)
    && distribution.enable_distribution_ops !== false
    && distribution.mobile_enable_driver_app !== false
    && Boolean(modules["sales.mobile"]);

  return {
    modules,
    module_settings: moduleSettings,
    industry: capabilities?.industry ?? payload?.organization?.industry ?? null,
    deployment_profile:
      capabilities?.deployment_profile ?? payload?.organization?.deployment_profile ?? null,
    channels: resolveSalesChannelsFromModules(modules, {
      mobileOrdersEnabled: sales.enable_mobile_orders !== false,
    }),
    screen_lock_minutes: security.screen_lock_minutes ?? 5,
    session_idle_minutes: security.session_idle_minutes ?? 60,
    mobile_orders_enabled: sales.enable_mobile_orders !== false,
    driver_mobile_enabled: driverMobileEnabled,
    allowed_login_channels: [
      ...(modules["sales.backend"] ? ["backoffice"] : []),
      ...(modules["sales.pos"] ? ["pos"] : []),
      ...((sales.enable_mobile_orders !== false && modules["sales.mobile"]) || driverMobileEnabled ? ["mobile"] : []),
    ],
    platform_mpesa_stk_enabled: finance.enable_mpesa_stk !== false,
    platform_kra_integration_enabled: finance.enable_kra_integration !== false,
    platform_ai_enabled: ai.enable_ai !== false,
    platform_whatsapp_enabled: Boolean(whatsapp.enable_whatsapp_orders),
    platform_tab_workspace_enabled: general.enable_tab_workspace !== false,
    ai_assistant: {
      platform_enabled: ai.enable_ai !== false,
      enabled: Boolean(ai.enabled),
      available: false,
    },
    whatsapp_orders: {
      platform_enabled: Boolean(whatsapp.enable_whatsapp_orders),
      enabled: Boolean(whatsapp.enabled),
      configured: false,
    },
  };
}
