/**
 * Shared helpers to assemble Hotel check print options from org / capabilities / POS settings.
 */

import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  receiptPaymentDetailsFromApi,
  receiptPaymentDetailsToPayload,
} from "@/lib/receipt-payment-details";
import { resolveSaleDocumentBranding } from "@/lib/sale-document-print-shared";

/**
 * Normalize hospitality check print settings from Hotel POS settings API / capabilities.
 * @param {object|null} settings
 */
export function normalizeHospitalityCheckPrintSettings(settings = null) {
  const h = settings ?? {};
  return {
    check_receipt_copies: h.check_receipt_copies ?? 1,
    show_outlet_on_check_receipt: h.show_outlet_on_check_receipt !== false,
    show_organization_on_check_receipt: h.show_organization_on_check_receipt !== false,
    enable_check_guest_name: Boolean(h.enable_check_guest_name),
    show_address_on_check_receipt: h.show_address_on_check_receipt !== false,
    show_tax_pin_on_check_receipt: h.show_tax_pin_on_check_receipt !== false,
    show_unit_price_on_check_receipt: h.show_unit_price_on_check_receipt !== false,
    show_cashier_on_check_receipt: h.show_cashier_on_check_receipt !== false,
    show_datetime_on_check_receipt: h.show_datetime_on_check_receipt !== false,
    show_check_payment_details: h.show_check_payment_details !== false,
    use_same_payment_details_for_check: h.use_same_payment_details_for_check !== false,
    check_receipt_show_all_payment_methods: Boolean(h.check_receipt_show_all_payment_methods),
    check_receipt_footer:
      h.check_receipt_footer ??
      "You were served by: {username}\nThank you for dining with us\nPlease check your bill carefully",
    check_receipt_payment_details: h.check_receipt_payment_details ?? null,
    use_same_print_phones_for_check: h.use_same_print_phones_for_check !== false,
    check_print_phones: h.check_print_phones ?? { tel1: "", tel2: "" },
    hospitality_check_document_template: h.hospitality_check_document_template ?? "default",
  };
}

/**
 * Build options for printHospitalityCheckReceipt / buildHospitalityCheckReceiptHtml.
 *
 * @param {object} args
 * @param {object|null} args.checkPrintSettings
 * @param {object|null} args.organization
 * @param {object|null} args.capabilities
 * @param {object|null} args.user
 * @param {string} [args.title]
 */
export function buildHospitalityCheckPrintOptions({
  checkPrintSettings = null,
  organization = null,
  capabilities = null,
  user = null,
  title = "Order receipt",
} = {}) {
  const printSettings = normalizeHospitalityCheckPrintSettings(checkPrintSettings);
  const generalSettings = mergeGeneralSettings({
    general: capabilities?.module_settings?.general ?? {},
  });
  const salesSettings = capabilities?.module_settings?.sales ?? {};

  const useSamePay = printSettings.use_same_payment_details_for_check !== false;
  const rawPayment = useSamePay
    ? salesSettings.pos_receipt_payment_details
    : printSettings.check_receipt_payment_details;
  const paymentInstructions = receiptPaymentDetailsToPayload(
    receiptPaymentDetailsFromApi(rawPayment ?? null),
  );

  const seller = organization
    ? {
        name: organization.org_name ?? "",
        address: organization.org_address ?? organization.address ?? "",
        phone: organization.primary_tel ?? "",
        secondary_phone: organization.secondary_tel ?? "",
        tax_pin: organization.org_pin ?? "",
      }
    : null;

  const branding = resolveSaleDocumentBranding({
    organization,
    generalSettings,
  });

  return {
    title,
    organization,
    seller,
    branding,
    generalSettings,
    printSettings,
    paymentInstructions,
    showPaymentInstructions: printSettings.show_check_payment_details !== false,
    user,
  };
}
