export const PROCUREMENT_DEFAULTS = {
  default_payment_terms_days: 30,
  require_lpo_approval: true,
  default_receive_location: "store",
  auto_email_supplier_on_lpo: false,
};

export function mergeProcurementSettings(moduleSettings) {
  return { ...PROCUREMENT_DEFAULTS, ...(moduleSettings?.procurement ?? {}) };
}

export function procurementFormFromApi(res) {
  const procurement = mergeProcurementSettings({ procurement: res?.procurement ?? res });
  return {
    default_payment_terms_days: String(procurement.default_payment_terms_days ?? 30),
    require_lpo_approval: Boolean(procurement.require_lpo_approval),
    default_receive_location: procurement.default_receive_location === "shop" ? "shop" : "store",
    auto_email_supplier_on_lpo: Boolean(procurement.auto_email_supplier_on_lpo),
  };
}

export function procurementPayloadFromForm(form) {
  return {
    default_payment_terms_days: Number(form.default_payment_terms_days) || 0,
    require_lpo_approval: Boolean(form.require_lpo_approval),
    default_receive_location: form.default_receive_location === "shop" ? "shop" : "store",
    auto_email_supplier_on_lpo: Boolean(form.auto_email_supplier_on_lpo),
  };
}
