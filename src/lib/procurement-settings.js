import {
  DEFAULT_LPO_DELIVERY_NOTES,
  DEFAULT_LPO_KEBS_WARNING,
  DEFAULT_LPO_VAT_NOTE,
  lpoPrintFormFromApi,
} from "@/lib/lpo-print-settings";
import { P } from "@/lib/permission-codes";

export function canApproveLpoRequests({ hasPermission = () => false } = {}) {
  return hasPermission(P.purchasing.lpo.approve);
}

export const PROCUREMENT_DEFAULTS = {
  default_payment_terms_days: 30,
  require_lpo_approval: true,
  default_receive_location: "store",
  auto_email_supplier_on_lpo: false,
  lpo_print_delivery_notes: DEFAULT_LPO_DELIVERY_NOTES.join("\n"),
  lpo_print_kebs_warning: DEFAULT_LPO_KEBS_WARNING,
  lpo_print_vat_note: DEFAULT_LPO_VAT_NOTE,
};

export function mergeProcurementSettings(moduleSettings) {
  return { ...PROCUREMENT_DEFAULTS, ...(moduleSettings?.procurement ?? {}) };
}

export function procurementFormFromApi(res) {
  const procurement = mergeProcurementSettings({ procurement: res?.procurement ?? res });
  const printForm = lpoPrintFormFromApi(res);
  return {
    default_payment_terms_days: String(procurement.default_payment_terms_days ?? 30),
    require_lpo_approval: Boolean(procurement.require_lpo_approval),
    default_receive_location: procurement.default_receive_location === "shop" ? "shop" : "store",
    auto_email_supplier_on_lpo: Boolean(procurement.auto_email_supplier_on_lpo),
    ...printForm,
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
