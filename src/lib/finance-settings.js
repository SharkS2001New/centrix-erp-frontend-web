const FINANCE_DEFAULTS = {
  enable_kra_device: false,
  kra_device_ip: "",
  kra_serial_number: "",
  kra_pin_number: "",
  kra_device_test_mode: false,
  kra_plu_register_path: "/api/register-plu",
  default_submit_kra: true,
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

export function isKraDeviceEnabled(moduleSettings) {
  return Boolean(mergeFinanceSettings(moduleSettings).enable_kra_device);
}

export function shouldSubmitKraOnCheckout(moduleSettings) {
  const finance = mergeFinanceSettings(moduleSettings);
  if (!finance.enable_kra_device) {
    return false;
  }
  return finance.default_submit_kra !== false;
}

export function financeFormFromApi(res) {
  const finance = mergeFinanceSettings({ finance: res?.finance ?? res });
  const mpesa = finance.mpesa ?? MPESA_DEFAULTS;
  const quickbooks = finance.quickbooks ?? QUICKBOOKS_DEFAULTS;
  return {
    enable_kra_device: Boolean(finance.enable_kra_device),
    kra_device_ip: String(finance.kra_device_ip ?? ""),
    kra_serial_number: String(finance.kra_serial_number ?? ""),
    kra_pin_number: String(finance.kra_pin_number ?? ""),
    kra_device_test_mode: Boolean(finance.kra_device_test_mode),
    kra_plu_register_path: String(finance.kra_plu_register_path ?? "/api/register-plu"),
    default_submit_kra: finance.default_submit_kra !== false,
    accounting_mode: finance.accounting_mode === "external" ? "external" : "native",
    accounting_provider: finance.accounting_provider ?? "",
    accounting_sync_direction: finance.accounting_sync_direction ?? "export",
    mpesa: {
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

export function financePayloadFromForm(form) {
  const mpesa = { ...form.mpesa };
  if (mpesa.consumer_secret === "********") delete mpesa.consumer_secret;
  if (mpesa.passkey === "********") delete mpesa.passkey;

  const quickbooks = { ...form.quickbooks };
  if (quickbooks.client_secret === "********") delete quickbooks.client_secret;

  return {
    enable_kra_device: Boolean(form.enable_kra_device),
    kra_device_ip: form.kra_device_ip.trim(),
    kra_serial_number: form.kra_serial_number.trim(),
    kra_pin_number: form.kra_pin_number.trim(),
    kra_device_test_mode: Boolean(form.kra_device_test_mode),
    kra_plu_register_path: form.kra_plu_register_path.trim() || "/api/register-plu",
    default_submit_kra: Boolean(form.default_submit_kra),
    accounting_mode: form.accounting_mode === "external" ? "external" : "native",
    accounting_provider: form.accounting_mode === "external" ? form.accounting_provider || null : null,
    accounting_sync_direction: form.accounting_sync_direction || "export",
    mpesa: {
      ...mpesa,
      consumer_key: mpesa.consumer_key.trim(),
      shortcode: mpesa.shortcode.trim(),
      till_number: mpesa.till_number.trim(),
      child_storecode: mpesa.child_storecode.trim(),
      stk_callback_url: mpesa.stk_callback_url.trim(),
      c2b_confirmation_url: mpesa.c2b_confirmation_url.trim(),
      c2b_validation_url: mpesa.c2b_validation_url.trim(),
      ...(mpesa.consumer_secret ? { consumer_secret: mpesa.consumer_secret.trim() } : {}),
      ...(mpesa.passkey ? { passkey: mpesa.passkey.trim() } : {}),
    },
    quickbooks: {
      client_id: quickbooks.client_id.trim(),
      redirect_uri: quickbooks.redirect_uri.trim(),
      environment: quickbooks.environment === "production" ? "production" : "sandbox",
      ...(quickbooks.client_secret ? { client_secret: quickbooks.client_secret.trim() } : {}),
    },
  };
}
