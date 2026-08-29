import { isCentrixPaymentsEnabled } from "@/lib/platform-org-features";

/** Legacy Administration finance routes (before Centrix Payments app). */
export const ADMIN_FINANCE_PATHS = {
  mpesaSettings: "/admin/mpesa-settings",
  mpesaPaybills: "/admin/mpesa-paybills",
  equityAccounts: "/admin/equity-accounts",
};

/** Centrix Payments settings routes. */
export const CENTRIX_PAYMENTS_FINANCE_PATHS = {
  settingsHub: "/centrix-payments/settings",
  mpesaSettings: "/centrix-payments/settings/mpesa",
  mpesaPaybills: "/centrix-payments/settings/paybills",
  equityAccounts: "/centrix-payments/settings/equity",
};

const ADMIN_TO_PAYMENTS = {
  [ADMIN_FINANCE_PATHS.mpesaSettings]: CENTRIX_PAYMENTS_FINANCE_PATHS.mpesaSettings,
  [ADMIN_FINANCE_PATHS.mpesaPaybills]: CENTRIX_PAYMENTS_FINANCE_PATHS.mpesaPaybills,
  [ADMIN_FINANCE_PATHS.equityAccounts]: CENTRIX_PAYMENTS_FINANCE_PATHS.equityAccounts,
};

/** Resolve M-Pesa settings link for the active product shell. */
export function resolveMpesaSettingsHref(capabilities) {
  return isCentrixPaymentsEnabled(capabilities)
    ? CENTRIX_PAYMENTS_FINANCE_PATHS.mpesaSettings
    : ADMIN_FINANCE_PATHS.mpesaSettings;
}

/** Resolve paybills settings link for the active product shell. */
export function resolveMpesaPaybillsHref(capabilities) {
  return isCentrixPaymentsEnabled(capabilities)
    ? CENTRIX_PAYMENTS_FINANCE_PATHS.mpesaPaybills
    : ADMIN_FINANCE_PATHS.mpesaPaybills;
}

/** Resolve Equity accounts link for the active product shell. */
export function resolveEquityAccountsHref(capabilities) {
  return isCentrixPaymentsEnabled(capabilities)
    ? CENTRIX_PAYMENTS_FINANCE_PATHS.equityAccounts
    : ADMIN_FINANCE_PATHS.equityAccounts;
}

/** When Centrix Payments is enabled, map legacy admin finance URLs to the payments app. */
export function resolveAdminFinanceRedirect(adminPath, capabilities) {
  if (!isCentrixPaymentsEnabled(capabilities)) return null;
  return ADMIN_TO_PAYMENTS[adminPath] ?? null;
}

/** Preferred finance settings entry when Centrix Payments is the payments product. */
export function resolveFinanceSettingsEntryHref(capabilities) {
  if (isCentrixPaymentsEnabled(capabilities)) {
    return CENTRIX_PAYMENTS_FINANCE_PATHS.settingsHub;
  }
  return ADMIN_FINANCE_PATHS.mpesaSettings;
}
