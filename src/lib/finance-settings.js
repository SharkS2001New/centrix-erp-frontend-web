const FINANCE_DEFAULTS = {
  enable_kra_device: false,
  kra_device_ip: "",
  kra_device_hardware_ip: "",
  kra_serial_number: "",
  kra_pin_number: "",
  kra_device_test_mode: false,
  kra_plu_register_path: "/api/upload-plu-data",
  default_submit_kra: true,
  kra_bypass_above_amount: null,
  accounting_mode: "native",
  accounting_provider: null,
  accounting_sync_direction: "export",
};

export const QUICKBOOKS_DEFAULTS = {
  client_id: "",
  client_secret: "",
  redirect_uri: "",
  environment: "sandbox",
};

export const MPESA_DEFAULTS = {
  enable_stk_push: true,
  env: "sandbox",
  consumer_key: "",
  consumer_secret: "",
  shortcode: "",
  till_number: "",
  child_storecode: "",
  passkey: "",
  stk_callback_url: "",
  c2b_confirmation_url: "",
  c2b_validation_url: "",
};

export function mergeFinanceSettings(moduleSettings) {
  const finance = { ...FINANCE_DEFAULTS, ...(moduleSettings?.finance ?? {}) };
  const sales = moduleSettings?.sales ?? {};
  finance.mpesa = { ...MPESA_DEFAULTS, ...(finance.mpesa ?? {}) };
  finance.quickbooks = { ...QUICKBOOKS_DEFAULTS, ...(finance.quickbooks ?? {}) };
  if (finance.default_submit_kra === undefined && sales.default_submit_kra !== undefined) {
    finance.default_submit_kra = sales.default_submit_kra !== false;
  }
  return finance;
}

export function isPlatformMpesaStkEnabled(moduleSettings, capabilities) {
  if (capabilities?.platform_mpesa_stk_enabled === false) return false;
  const finance = mergeFinanceSettings(moduleSettings);
  if (finance.enable_mpesa_stk === false) return false;
  if (capabilities?.platform_mpesa_stk_enabled === true) return true;
  return finance.enable_mpesa_stk !== false;
}

export function isPlatformKraIntegrationEnabled(moduleSettings, capabilities) {
  if (capabilities?.platform_kra_integration_enabled === false) return false;
  const finance = mergeFinanceSettings(moduleSettings);
  return finance.enable_kra_integration !== false;
}

export function isKraDeviceConfigured(moduleSettings, capabilities) {
  if (!isPlatformKraIntegrationEnabled(moduleSettings, capabilities)) return false;
  return Boolean(mergeFinanceSettings(moduleSettings).enable_kra_device);
}

/** @deprecated Use isKraDeviceConfigured */
export function isKraDeviceEnabled(moduleSettings, capabilities) {
  return isKraDeviceConfigured(moduleSettings, capabilities);
}

export function isKraFiscalizationActive(moduleSettings, capabilities) {
  if (!isKraDeviceConfigured(moduleSettings, capabilities)) return false;
  const finance = mergeFinanceSettings(moduleSettings);
  return finance.default_submit_kra !== false;
}

export function kraBypassAboveAmount(moduleSettings) {
  const finance = mergeFinanceSettings(moduleSettings);
  const raw = finance.kra_bypass_above_amount;
  if (raw === null || raw === undefined || raw === "") return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function isKraBypassedForOrderTotal(moduleSettings, orderTotal) {
  const threshold = kraBypassAboveAmount(moduleSettings);
  if (threshold == null) return false;
  return Number(orderTotal) >= threshold;
}

function parseBooleanSetting(value, defaultValue = true) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false" || value === "") {
    return false;
  }
  if (value === undefined || value === null) return defaultValue;
  return Boolean(value);
}

export function isStkPushEnabled(moduleSettings, capabilities = null) {
  if (!isPlatformMpesaStkEnabled(moduleSettings, capabilities)) return false;
  if (moduleSettings == null) return false;
  const finance = mergeFinanceSettings(moduleSettings);
  if (!finance.mpesa) return false;
  return parseBooleanSetting(finance.mpesa.enable_stk_push, true);
}

export function accountingMode(moduleSettings) {
  const finance = mergeFinanceSettings(moduleSettings);
  return finance.accounting_mode === "external" ? "external" : "native";
}

export function usesNativeAccounting(moduleSettings) {
  return accountingMode(moduleSettings) !== "external";
}

export function usesExternalAccounting(moduleSettings) {
  return accountingMode(moduleSettings) === "external";
}

/** Routes that require the built-in general ledger (hidden when external accounting is enabled). */
export const NATIVE_ACCOUNTING_ROUTE_PREFIXES = [
  "/accounting/chart-of-accounts",
  "/accounting/journal-entries",
  "/accounting/general-ledger",
  "/accounting/trial-balance",
  "/accounting/balance-sheet",
  "/accounting/profit-loss",
  "/accounting/cash-flow",
  "/accounting/fiscal-periods",
  "/accounting/settings",
];

/** Routes for external accounting integration (hidden in native ledger mode). */
export const EXTERNAL_ACCOUNTING_ROUTE_PREFIXES = [
  "/accounting/export-queue",
  "/accounting/account-mappings",
];

export function matchesAccountingRoutePrefix(pathname, prefixes) {
  if (!pathname) return false;
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function canAccessAccountingRoute() {
  return true;
}

export function shouldSubmitKraOnCheckout(moduleSettings, capabilities = null, orderTotal = null) {
  const finance = mergeFinanceSettings(moduleSettings);
  if (!isPlatformKraIntegrationEnabled(moduleSettings, capabilities)) {
    return false;
  }
  if (!finance.enable_kra_device) {
    return false;
  }
  if (finance.default_submit_kra === false) {
    return false;
  }
  if (orderTotal != null && isKraBypassedForOrderTotal(moduleSettings, orderTotal)) {
    return false;
  }
  return true;
}

export function financeFormFromApi(res) {
  const finance = mergeFinanceSettings({ finance: res?.finance ?? res });
  const mpesa = finance.mpesa ?? MPESA_DEFAULTS;
  const quickbooks = finance.quickbooks ?? QUICKBOOKS_DEFAULTS;
  return {
    enable_kra_device: Boolean(finance.enable_kra_device),
    kra_device_ip: String(finance.kra_device_ip ?? ""),
    kra_device_hardware_ip: String(finance.kra_device_hardware_ip ?? ""),
    kra_serial_number: String(finance.kra_serial_number ?? ""),
    kra_pin_number: String(finance.kra_pin_number ?? ""),
    kra_device_test_mode: Boolean(finance.kra_device_test_mode),
    kra_plu_register_path: String(finance.kra_plu_register_path ?? "/api/upload-plu-data"),
    default_submit_kra: finance.default_submit_kra !== false,
    kra_bypass_above_amount:
      finance.kra_bypass_above_amount == null || finance.kra_bypass_above_amount === ""
        ? ""
        : String(finance.kra_bypass_above_amount),
    accounting_mode: finance.accounting_mode === "external" ? "external" : "native",
    accounting_provider: finance.accounting_mode === "external" ? "quickbooks" : "",
    accounting_sync_direction: finance.accounting_sync_direction ?? "export",
    mpesa: {
      enable_stk_push: mpesa.enable_stk_push !== false,
      env: mpesa.env === "live" ? "live" : "sandbox",
      consumer_key: String(mpesa.consumer_key ?? ""),
      consumer_secret: String(mpesa.consumer_secret ?? ""),
      shortcode: String(mpesa.shortcode ?? ""),
      till_number: String(mpesa.till_number ?? ""),
      child_storecode: String(mpesa.child_storecode ?? ""),
      passkey: String(mpesa.passkey ?? ""),
      stk_callback_url: String(mpesa.stk_callback_url ?? ""),
      c2b_confirmation_url: String(mpesa.c2b_confirmation_url ?? ""),
      c2b_validation_url: String(mpesa.c2b_validation_url ?? ""),
    },
    mpesa_status: res?.finance?.mpesa_status ?? null,
    quickbooks: {
      client_id: String(quickbooks.client_id ?? ""),
      client_secret: String(quickbooks.client_secret ?? ""),
      redirect_uri: String(quickbooks.redirect_uri ?? ""),
      environment: quickbooks.environment === "production" ? "production" : "sandbox",
    },
    quickbooks_status: res?.finance?.quickbooks_status ?? null,
  };
}

/** Draft KRA device fields for POST /kra/device-* (health, init, restart). */
export function kraDeviceOpsPayloadFromForm(form) {
  return {
    kra_device_ip: String(form.kra_device_ip ?? "").trim(),
    kra_device_hardware_ip: String(form.kra_device_hardware_ip ?? "").trim(),
    kra_serial_number: String(form.kra_serial_number ?? "").trim(),
    kra_device_test_mode: Boolean(form.kra_device_test_mode),
  };
}

/** @deprecated Use kraDeviceOpsPayloadFromForm */
export function kraDeviceHealthPayloadFromForm(form) {
  return kraDeviceOpsPayloadFromForm(form);
}

export function financePayloadFromForm(form, options = {}) {
  const includeMpesa = options.includeMpesa !== false;
  const mpesa = { ...form.mpesa };
  if (mpesa.consumer_secret === "********") delete mpesa.consumer_secret;
  if (mpesa.passkey === "********") delete mpesa.passkey;

  const quickbooks = { ...form.quickbooks };
  if (quickbooks.client_secret === "********") delete quickbooks.client_secret;

  const kraPin = String(form.kra_pin_number ?? "").trim();

  const payload = {
    enable_kra_device: Boolean(form.enable_kra_device),
    kra_device_ip: form.kra_device_ip.trim(),
    kra_device_hardware_ip: form.kra_device_hardware_ip.trim(),
    kra_serial_number: form.kra_serial_number.trim(),
    kra_device_test_mode: Boolean(form.kra_device_test_mode),
    kra_plu_register_path: form.kra_plu_register_path.trim() || "/api/upload-plu-data",
    default_submit_kra: Boolean(form.default_submit_kra),
    kra_bypass_above_amount: (() => {
      const raw = String(form.kra_bypass_above_amount ?? "").trim();
      if (!raw) return null;
      const amount = Number(raw);
      return Number.isFinite(amount) && amount > 0 ? amount : null;
    })(),
    accounting_mode: form.accounting_mode === "external" ? "external" : "native",
    accounting_provider: form.accounting_mode === "external" ? "quickbooks" : null,
    accounting_sync_direction: form.accounting_sync_direction || "export",
    quickbooks: {
      client_id: quickbooks.client_id.trim(),
      redirect_uri: quickbooks.redirect_uri.trim(),
      environment: quickbooks.environment === "production" ? "production" : "sandbox",
      ...(quickbooks.client_secret ? { client_secret: quickbooks.client_secret.trim() } : {}),
    },
  };

  if (kraPin && kraPin !== "********") {
    payload.kra_pin_number = kraPin;
  }

  if (includeMpesa) {
    payload.mpesa = {
      ...mpesa,
      enable_stk_push: Boolean(form.mpesa?.enable_stk_push),
      consumer_key: mpesa.consumer_key.trim(),
      shortcode: mpesa.shortcode.trim(),
      till_number: mpesa.till_number.trim(),
      child_storecode: mpesa.child_storecode.trim(),
      stk_callback_url: mpesa.stk_callback_url.trim(),
      c2b_confirmation_url: mpesa.c2b_confirmation_url.trim(),
      c2b_validation_url: mpesa.c2b_validation_url.trim(),
      ...(mpesa.consumer_secret ? { consumer_secret: mpesa.consumer_secret.trim() } : {}),
      ...(mpesa.passkey ? { passkey: mpesa.passkey.trim() } : {}),
    };
  }

  return payload;
}
