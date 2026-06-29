import { hasOperationalModule } from "@/lib/admin-scope";
import {
  isPlatformAiEnabled,
  isPlatformKraIntegrationEnabled,
  isPlatformMobileOrdersEnabled,
  isPlatformMpesaStkEnabled,
} from "@/lib/platform-org-features";

/** Map organization settings tabs to ERP module keys (platform super-admin controlled). */
export const ORG_SETTINGS_TAB_MODULES = {
  general: ["admin"],
  printouts: [
    "admin",
    "sales",
    "inventory",
    "customers_suppliers",
    "accounting",
    "payments",
    "hr_payroll",
    "distribution",
  ],
  sales: ["sales"],
  mobile: ["sales.mobile"],
  distribution: ["distribution"],
  inventory: ["inventory"],
  procurement: ["customers_suppliers"],
  finance: ["accounting", "payments"],
  ai: ["admin"],
  hr: ["hr_payroll"],
  notifications: ["admin"],
  security: ["admin"],
  "legacy-archive": ["admin"],
};

/** Tabs only shown when platform manages settings on behalf of a tenant without Administration. */
export const PLATFORM_MANAGED_ADMIN_TABS = new Set(["general", "notifications", "security"]);

/** Tabs only platform super-admins may configure (not exposed on tenant /admin/settings). */
export const PLATFORM_ONLY_ORG_SETTINGS_TABS = new Set(["legacy-archive"]);

function moduleEnabled(capabilities, moduleKey) {
  return Boolean(capabilities?.modules?.[moduleKey]);
}

/** @param {object} capabilities erp/capabilities payload */
export function isOrgSettingsTabVisible(tabId, capabilities, { platformManaged = false } = {}) {
  switch (tabId) {
    case "general":
    case "notifications":
    case "security":
      if (platformManaged && PLATFORM_MANAGED_ADMIN_TABS.has(tabId)) {
        return true;
      }
      return moduleEnabled(capabilities, "admin");

    case "printouts":
      return hasOperationalModule(capabilities);

    case "sales":
      return moduleEnabled(capabilities, "sales");

    case "mobile":
      return moduleEnabled(capabilities, "sales.mobile") && isPlatformMobileOrdersEnabled(capabilities);

    case "distribution":
      return moduleEnabled(capabilities, "distribution");

    case "inventory":
      return moduleEnabled(capabilities, "inventory");

    case "procurement":
      return moduleEnabled(capabilities, "customers_suppliers");

    case "finance":
      if (moduleEnabled(capabilities, "accounting")) {
        return true;
      }
      if (!moduleEnabled(capabilities, "payments")) {
        return false;
      }
      return isPlatformMpesaStkEnabled(capabilities) || isPlatformKraIntegrationEnabled(capabilities);

    case "ai":
      if (!isPlatformAiEnabled(capabilities)) {
        return false;
      }
      if (platformManaged) {
        return true;
      }
      return moduleEnabled(capabilities, "admin");

    case "hr":
      return moduleEnabled(capabilities, "hr_payroll");

    case "legacy-archive":
      return platformManaged;

    default: {
      const required = ORG_SETTINGS_TAB_MODULES[tabId] ?? ["admin"];
      return required.some((key) => moduleEnabled(capabilities, key));
    }
  }
}

/** @param {object} capabilities */
export function visibleOrgSettingsTabs(allTabs, capabilities, options = {}) {
  const { platformManaged = false, tenantSelfService = false } = options;
  let tabs = allTabs.filter((tab) => isOrgSettingsTabVisible(tab.id, capabilities, { platformManaged }));
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
  const ai = moduleSettings.ai ?? {};
  const sales = moduleSettings.sales ?? {};

  return {
    modules,
    module_settings: moduleSettings,
    screen_lock_minutes: security.screen_lock_minutes ?? 5,
    session_idle_minutes: security.session_idle_minutes ?? 60,
    mobile_orders_enabled: sales.enable_mobile_orders !== false,
    platform_mpesa_stk_enabled: finance.enable_mpesa_stk !== false,
    platform_kra_integration_enabled: finance.enable_kra_integration !== false,
    platform_ai_enabled: ai.enable_ai !== false,
    ai_assistant: {
      platform_enabled: ai.enable_ai !== false,
      enabled: Boolean(ai.enabled),
      available: false,
    },
  };
}
