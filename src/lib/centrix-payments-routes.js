/** Administration → Finance routes for M-Pesa and Equity configuration. */
export const ADMIN_FINANCE_PATHS = {
  mpesaSettings: "/admin/mpesa-settings",
  mpesaPaybills: "/admin/mpesa-paybills",
  equityAccounts: "/admin/equity-accounts",
};

/** @deprecated Centrix Payments settings routes — configuration lives under Administration → Finance. */
export const CENTRIX_PAYMENTS_FINANCE_PATHS = {
  settingsHub: "/centrix-payments/settings",
  mpesaSettings: ADMIN_FINANCE_PATHS.mpesaSettings,
  mpesaPaybills: ADMIN_FINANCE_PATHS.mpesaPaybills,
  equityAccounts: ADMIN_FINANCE_PATHS.equityAccounts,
};

export function resolveMpesaSettingsHref() {
  return ADMIN_FINANCE_PATHS.mpesaSettings;
}

export function resolveMpesaPaybillsHref() {
  return ADMIN_FINANCE_PATHS.mpesaPaybills;
}

export function resolveEquityAccountsHref() {
  return ADMIN_FINANCE_PATHS.equityAccounts;
}

/** Legacy redirect helper — admin finance is always canonical. */
export function resolveAdminFinanceRedirect() {
  return null;
}

export function resolveFinanceSettingsEntryHref() {
  return ADMIN_FINANCE_PATHS.mpesaSettings;
}
