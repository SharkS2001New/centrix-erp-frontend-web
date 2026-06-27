import {
  DEFAULT_INVOICE_DELIVERY_TERMS,
  DEFAULT_INVOICE_FOOTER_LINES,
  invoicePrintFormFromApi,
} from "@/lib/invoice-print-settings";
import {
  DEFAULT_POS_RECEIPT_PAYMENT_LINES,
  receiptPaymentDetailsFromApi,
} from "@/lib/receipt-payment-details";

const SALES_DEFAULTS = {
  allow_sell_from_shop: true,
  allow_sell_from_store: false,
  enable_retail_pricing: false,
  allow_discounts: true,
  allow_edit_line_discount: false,
  enable_order_discount: false,
  enable_vouchers: false,
  enable_redeemable_points: false,
  point_cash_value: 1,
  points_earn_per_kes: 1000,
  allow_edit_unit_price: true,
  enable_barcode_scanner: false,
  default_tax_rate: 16,
  enable_mpesa_amount: true,
  enable_mpesa_code: false,
  enable_bank_select: false,
  enable_equity_bank: true,
  enable_kcb_bank: true,
  enable_other_bank: false,
  other_bank_name: "Other bank",
  enable_bank_amount: true,
  enable_cheque: true,
  enable_cheque_number: false,
  enable_payment_date: false,
  enable_credit_payment: true,
  allow_credit_pay_now: false,
  show_checkout_on_create_order: true,
  enable_checkout_customer_name: false,
  retail_shop_wholesale_store_stock: false,
  add_route_markup_prices: false,
  pos_order_type_mode: "normal",
  enable_mobile_orders: true,
  mobile_enable_checkout_location_verification: false,
  mobile_allow_offline_orders: false,
  mobile_checkout_location_radius_metres: 5,
  mobile_enable_field_attendance: false,
  require_pos_till_float: false,
  require_backoffice_till_float: false,
  blind_till_close: false,
  enable_pos_order_edit: false,
  order_document_type: "receipt",
  invoice_valid_days: 7,
  receipt_copies: 1,
  show_branch_on_receipt: true,
  show_receipt_payment_details: true,
  show_invoice_payment_details: true,
  use_same_payment_details_for_routes: true,
  pos_receipt_payment_details: {
    title: "Payment details",
    lines: [],
    note: "",
  },
  route_receipt_payment_details: {
    title: "Payment details",
    lines: [],
    note: "",
  },
  invoice_print_delivery_terms: DEFAULT_INVOICE_DELIVERY_TERMS.join("\n"),
  invoice_print_footer_lines: DEFAULT_INVOICE_FOOTER_LINES.join("\n"),
  stock_deduct_on: "order_created",
};

export const STOCK_DEDUCT_TIMING_OPTIONS = [
  { value: "order_created", label: "When order is placed (checkout)" },
  { value: "order_completed", label: "When order reaches workflow status" },
  { value: "trip_load", label: "When loading list is locked (distribution)" },
  { value: "trip_depart", label: "When trip departs (distribution)" },
];

/** Whether org has mobile sales enabled at platform level. */
export function isOrgMobileSalesEnabled(capabilities) {
  if (capabilities?.mobile_orders_enabled === false) return false;
  if (!capabilities?.modules?.["sales.mobile"]) return false;
  return isMobileOrdersEnabled(capabilities?.module_settings);
}

/** Whether Mobile Orders appears in the sales sidebar and queue routes. */
export function isMobileOrdersEnabled(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).enable_mobile_orders);
}

/** Mobile checkout GPS verification settings for the field sales app. */
export function getMobileCheckoutLocationConfig(moduleSettings) {
  const sales = mergeSalesSettings(moduleSettings);
  const enabled = Boolean(sales.mobile_enable_checkout_location_verification);
  const radius = Number(sales.mobile_checkout_location_radius_metres ?? 5);

  return {
    enabled,
    allowOfflineOrders: enabled && Boolean(sales.mobile_allow_offline_orders),
    radiusMetres: Number.isFinite(radius) ? Math.min(500, Math.max(1, radius)) : 5,
  };
}

export const EMPTY_MOBILE_APPLICATION_FORM = {
  mobile_enable_checkout_location_verification: false,
  mobile_allow_offline_orders: false,
  mobile_checkout_location_radius_metres: "5",
  mobile_enable_field_attendance: false,
};

export function mobileApplicationFormFromApi(res) {
  const sales = mergeSalesSettings({ sales: res?.sales ?? res });
  return {
    mobile_enable_checkout_location_verification: Boolean(
      sales.mobile_enable_checkout_location_verification,
    ),
    mobile_allow_offline_orders: Boolean(sales.mobile_allow_offline_orders),
    mobile_checkout_location_radius_metres: String(
      sales.mobile_checkout_location_radius_metres ?? 5,
    ),
    mobile_enable_field_attendance: Boolean(sales.mobile_enable_field_attendance),
  };
}

export function mobileApplicationPayloadFromForm(form) {
  return {
    mobile_enable_checkout_location_verification: Boolean(
      form.mobile_enable_checkout_location_verification,
    ),
    mobile_allow_offline_orders: Boolean(form.mobile_allow_offline_orders),
    mobile_checkout_location_radius_metres:
      Number(form.mobile_checkout_location_radius_metres) || 5,
    mobile_enable_field_attendance: Boolean(form.mobile_enable_field_attendance),
  };
}

/** Org-admin sales settings form (excludes mobile application keys — see Mobile application tab). */
export const EMPTY_SALES_ORGANIZATION_FORM = {
  allow_discounts: true,
  allow_edit_line_discount: false,
  enable_order_discount: false,
  enable_vouchers: false,
  enable_redeemable_points: false,
  point_cash_value: "1",
  points_earn_per_kes: "1000",
  allow_edit_unit_price: true,
  default_tax_rate: "16",
  enable_mpesa_amount: true,
  enable_mpesa_code: false,
  enable_bank_select: false,
  enable_equity_bank: true,
  enable_kcb_bank: true,
  enable_other_bank: false,
  other_bank_name: "Other bank",
  enable_bank_amount: true,
  enable_cheque: true,
  enable_cheque_number: false,
  enable_payment_date: false,
  enable_credit_payment: true,
  allow_credit_pay_now: false,
  show_checkout_on_create_order: true,
  enable_checkout_customer_name: false,
  add_route_markup_prices: false,
  pos_order_type_mode: "normal",
  blind_till_close: false,
  require_backoffice_till_float: false,
  order_document_type: "receipt",
  invoice_valid_days: "7",
  show_branch_on_receipt: true,
  receipt_copies: "1",
  show_receipt_payment_details: true,
  show_invoice_payment_details: true,
  use_same_payment_details_for_routes: true,
  pos_receipt_payment_details: {
    title: "Payment details",
    lines: [{ label: "M-Pesa Paybill", value: "" }, { label: "Account no.", value: "" }],
    note: "",
  },
  route_receipt_payment_details: {
    title: "Payment details",
    lines: [{ label: "M-Pesa Paybill", value: "" }, { label: "Account no.", value: "" }],
    note: "",
  },
  invoice_print_delivery_terms: DEFAULT_INVOICE_DELIVERY_TERMS.join("\n"),
  invoice_print_footer_lines: DEFAULT_INVOICE_FOOTER_LINES.join("\n"),
  stock_deduct_on: "order_created",
};

export function salesOrganizationFormFromApi(res) {
  const sales = mergeSalesSettings({ sales: res?.sales ?? res });
  return {
    allow_discounts: Boolean(sales.allow_discounts),
    allow_edit_line_discount: Boolean(sales.allow_edit_line_discount),
    enable_order_discount: Boolean(sales.enable_order_discount),
    enable_vouchers: Boolean(sales.enable_vouchers),
    enable_redeemable_points: Boolean(sales.enable_redeemable_points),
    point_cash_value: String(sales.point_cash_value ?? 1),
    points_earn_per_kes: String(sales.points_earn_per_kes ?? 1000),
    allow_edit_unit_price: Boolean(sales.allow_edit_unit_price),
    default_tax_rate: String(sales.default_tax_rate ?? 16),
    enable_mpesa_amount: Boolean(sales.enable_mpesa_amount),
    enable_mpesa_code: Boolean(sales.enable_mpesa_code),
    enable_bank_select: Boolean(sales.enable_bank_select),
    enable_equity_bank: Boolean(sales.enable_equity_bank),
    enable_kcb_bank: Boolean(sales.enable_kcb_bank),
    enable_other_bank: Boolean(sales.enable_other_bank),
    other_bank_name: String(sales.other_bank_name ?? "Other bank"),
    enable_bank_amount: Boolean(sales.enable_bank_amount),
    enable_cheque: Boolean(sales.enable_cheque),
    enable_cheque_number: Boolean(sales.enable_cheque_number),
    enable_payment_date: Boolean(sales.enable_payment_date),
    enable_credit_payment: Boolean(sales.enable_credit_payment),
    allow_credit_pay_now: Boolean(sales.allow_credit_pay_now),
    show_checkout_on_create_order: Boolean(sales.show_checkout_on_create_order),
    enable_checkout_customer_name: Boolean(sales.enable_checkout_customer_name),
    add_route_markup_prices: Boolean(sales.add_route_markup_prices),
    pos_order_type_mode: resolvePosOrderTypeMode(sales),
    blind_till_close: Boolean(sales.blind_till_close),
    require_backoffice_till_float: Boolean(sales.require_backoffice_till_float),
    order_document_type: ["receipt", "invoice", "both"].includes(sales.order_document_type)
      ? sales.order_document_type
      : "receipt",
    invoice_valid_days: String(sales.invoice_valid_days ?? 7),
    show_branch_on_receipt: Boolean(sales.show_branch_on_receipt),
    receipt_copies: String(sales.receipt_copies ?? 1),
    show_receipt_payment_details: sales.show_receipt_payment_details !== false,
    show_invoice_payment_details: sales.show_invoice_payment_details !== false,
    use_same_payment_details_for_routes: sales.use_same_payment_details_for_routes !== false,
    pos_receipt_payment_details: receiptPaymentDetailsFromApi(
      sales.pos_receipt_payment_details ?? {
        title: "Payment details",
        lines: DEFAULT_POS_RECEIPT_PAYMENT_LINES,
        note: "",
      },
    ),
    route_receipt_payment_details: receiptPaymentDetailsFromApi(
      sales.route_receipt_payment_details ?? {
        title: "Payment details",
        lines: DEFAULT_POS_RECEIPT_PAYMENT_LINES.map((line) => ({ ...line })),
        note: "",
      },
    ),
    ...invoicePrintFormFromApi(sales),
    stock_deduct_on: sales.stock_deduct_on || "order_created",
  };
}

export function salesOrganizationPayloadFromForm(form) {
  const {
    order_document_type: _orderDocumentType,
    receipt_copies: _receiptCopies,
    show_branch_on_receipt: _showBranchOnReceipt,
    show_receipt_payment_details: _showReceiptPaymentDetails,
    show_invoice_payment_details: _showInvoicePaymentDetails,
    use_same_payment_details_for_routes: _useSamePaymentDetailsForRoutes,
    pos_receipt_payment_details: _posReceiptPaymentDetails,
    route_receipt_payment_details: _routeReceiptPaymentDetails,
    invoice_valid_days: _invoiceValidDays,
    invoice_print_delivery_terms: _invoicePrintDeliveryTerms,
    invoice_print_footer_lines: _invoicePrintFooterLines,
    ...checkoutForm
  } = form;

  return {
    ...checkoutForm,
    default_tax_rate: Number(form.default_tax_rate) || 0,
    point_cash_value: Number(form.point_cash_value) || 0,
    points_earn_per_kes: Number(form.points_earn_per_kes) || 0,
  };
}

/**
 * Backoffice loading list for mobile route orders when Distribution is not enabled.
 * When Distribution is on, loading lists live under Distribution → Trips.
 */
export function shouldShowMobileLoadingSheets(capabilities) {
  if (!capabilities?.modules?.["sales.mobile"]) return false;
  if (!isOrgMobileSalesEnabled(capabilities)) return false;
  if (capabilities?.modules?.distribution) return false;
  return true;
}

/** Field attendance sessions for mobile sales reps (sign-in photo + GPS). */
export function shouldShowMobileFieldAttendance(capabilities) {
  if (!capabilities?.modules?.["sales.mobile"]) return false;
  if (!isOrgMobileSalesEnabled(capabilities)) return false;
  const sales = mergeSalesSettings(capabilities?.module_settings);
  return Boolean(sales.mobile_enable_field_attendance);
}

/** When true, cashiers must open a till session with operating float before external POS sales. */
export function isPosTillFloatRequired(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).require_pos_till_float);
}

/** When true, backoffice create order requires an open till session with operating float. */
export function isBackofficeTillFloatRequired(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).require_backoffice_till_float);
}

/**
 * Till float for the active sales UI — external POS (/pos) and backoffice create order (/sales/pos)
 * use separate admin settings and must not be conflated.
 */
export function isWorkspaceTillFloatRequired(moduleSettings, { standalone = false } = {}) {
  return standalone
    ? isPosTillFloatRequired(moduleSettings)
    : isBackofficeTillFloatRequired(moduleSettings);
}

/** Nav + till admin screens when either external POS or backoffice float workflow is enabled. */
export function isTillFloatWorkflowEnabled(moduleSettings) {
  return isPosTillFloatRequired(moduleSettings) || isBackofficeTillFloatRequired(moduleSettings);
}

/** When true, cashiers count cash without seeing expected amount during close. */
export function isBlindTillCloseEnabled(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).blind_till_close);
}

/** True when any sales discount feature is enabled in settings. */
export function areSalesDiscountsEnabled(moduleSettings) {
  const sales = mergeSalesSettings(moduleSettings);
  return Boolean(sales.allow_discounts || sales.enable_order_discount);
}

export const ORDER_DOCUMENT_TYPES = ["receipt", "invoice", "both"];

export const ORDER_DOCUMENT_TYPE_OPTIONS = [
  { value: "receipt", label: "Thermal receipt only" },
  { value: "invoice", label: "A4 sales invoice only" },
  { value: "both", label: "Both — choose at print time" },
];

/** Configured order print format from sales settings. */
export function getOrderDocumentType(moduleSettings) {
  const type = mergeSalesSettings(moduleSettings).order_document_type;
  return ORDER_DOCUMENT_TYPES.includes(type) ? type : "receipt";
}

/** True when staff must pick thermal vs A4 before printing. */
export function orderDocumentPrintNeedsChoice(moduleSettings) {
  return getOrderDocumentType(moduleSettings) === "both";
}

/** Whether A4 invoice settings (valid days, etc.) apply for this org. */
export function orderDocumentIncludesInvoice(moduleSettings) {
  const type = getOrderDocumentType(moduleSettings);
  return type === "invoice" || type === "both";
}

/**
 * Resolve the document type to print. Returns null when user choice is required.
 * @param {object} moduleSettings
 * @param {"receipt"|"invoice"|null|undefined} explicitType
 */
export function resolveOrderPrintDocumentType(moduleSettings, explicitType) {
  if (explicitType === "receipt" || explicitType === "invoice") return explicitType;
  const configured = getOrderDocumentType(moduleSettings);
  if (configured === "both") return null;
  return configured;
}

export function orderDocumentPrintLabel(moduleSettings) {
  const type = getOrderDocumentType(moduleSettings);
  if (type === "both") return "Print";
  if (type === "invoice") return "Print invoice";
  return "Print receipt";
}

export function orderDocumentTitle(moduleSettings, documentType = null) {
  const type = documentType ?? getOrderDocumentType(moduleSettings);
  if (type === "invoice") return "TAX INVOICE";
  if (type === "receipt") return "RECEIPT";
  return "ORDER DOCUMENT";
}

export const POS_ORDER_TYPE_MODES = ["normal", "route", "toggle"];

/** @returns {'normal'|'route'|'toggle'} */
export function resolvePosOrderTypeMode(sales) {
  const mode = sales?.pos_order_type_mode;
  if (POS_ORDER_TYPE_MODES.includes(mode)) {
    return mode;
  }
  if (sales?.lock_order_to_normal === false) {
    return "toggle";
  }
  return "normal";
}

export function isPosOrderEditEnabled(moduleSettings, capabilities = null) {
  const fromModule = Boolean(mergeSalesSettings(moduleSettings).enable_pos_order_edit);
  if (capabilities?.pos_order_edit_enabled === true || fromModule) {
    return true;
  }
  if (capabilities?.pos_order_edit_enabled === false) {
    return false;
  }
  return fromModule;
}

export function mergeSalesSettings(moduleSettings) {
  const sales = { ...SALES_DEFAULTS, ...(moduleSettings?.sales ?? {}) };
  sales.pos_order_type_mode = resolvePosOrderTypeMode(sales);
  if (sales.enable_retail_pricing == null && sales.allow_wholesale != null) {
    sales.enable_retail_pricing = Boolean(sales.allow_wholesale);
  }
  if (sales.allow_credit_pay_now == null && sales.allow_partial_payment != null) {
    sales.allow_credit_pay_now = Boolean(sales.allow_partial_payment);
  }
  if (sales.allow_credit_pay_now && sales.enable_credit_payment) {
    sales.enable_credit_payment = false;
  }
  if (
    !sales.enable_retail_pricing &&
    !sales.retail_shop_wholesale_store_stock &&
    !sales.allow_sell_from_shop &&
    !sales.allow_sell_from_store
  ) {
    sales.allow_sell_from_shop = true;
    sales.allow_sell_from_store = false;
  }
  return sales;
}

/** Stock deduction timing — lives on sales settings; legacy distribution key is fallback. */
export function resolveStockDeductTiming(moduleSettings) {
  const sales = mergeSalesSettings(moduleSettings);
  if (sales.stock_deduct_on) {
    return sales.stock_deduct_on;
  }
  const legacy = moduleSettings?.distribution?.deduct_stock_on;
  return legacy || "order_created";
}

export function getPosSalesConfig(moduleSettings, options = {}) {
  const sales = mergeSalesSettings(moduleSettings);
  const allowShop = Boolean(sales.allow_sell_from_shop);
  const allowStore = Boolean(sales.allow_sell_from_store);
  const retailShopWholesaleStoreStock =
    Boolean(sales.enable_retail_pricing) && Boolean(sales.retail_shop_wholesale_store_stock);
  const enableRetailPricing = Boolean(sales.enable_retail_pricing);

  return {
    sales,
    allowShop,
    allowStore,
    allowNegativeStock: Boolean(options.allowNegativeStock),
    canChooseStockSource:
      allowShop && allowStore && !retailShopWholesaleStoreStock,
    defaultSellFromShop: retailShopWholesaleStoreStock
      ? false
      : allowShop || !allowStore,
    stockSourceLabel: retailShopWholesaleStoreStock
      ? "Retail → shop · Wholesale → store"
      : allowShop && !allowStore
        ? "Shop stock"
        : !allowShop && allowStore
          ? "Store stock"
          : null,
    perLineStockRouting: retailShopWholesaleStoreStock,
    showCheckoutOnCreate: Boolean(sales.show_checkout_on_create_order),
    enableCheckoutCustomerName: Boolean(sales.enable_checkout_customer_name),
    retailShopWholesaleStoreStock,
    enableRetailPricing,
    allowDiscounts: Boolean(sales.allow_discounts),
    allowEditLineDiscount: Boolean(sales.allow_edit_line_discount),
    enableOrderDiscount: Boolean(sales.enable_order_discount),
    enableVouchers: Boolean(sales.enable_vouchers),
    enableRedeemablePoints: Boolean(sales.enable_redeemable_points),
    pointCashValue: Number(sales.point_cash_value ?? 1),
    pointsEarnPerKes: Number(sales.points_earn_per_kes ?? 1000),
    allowEditUnitPrice: Boolean(sales.allow_edit_unit_price),
    enableBarcodeScanner: Boolean(sales.enable_barcode_scanner),
    addRouteMarkupPrices: Boolean(sales.add_route_markup_prices),
    posOrderTypeMode: sales.add_route_markup_prices
      ? resolvePosOrderTypeMode(sales)
      : "normal",
    requirePosTillFloat: Boolean(sales.require_pos_till_float),
    requireBackofficeTillFloat: Boolean(sales.require_backoffice_till_float),
    /** @deprecated Use requirePosTillFloat or requireBackofficeTillFloat for the active workspace. */
    requireTillFloat: Boolean(sales.require_pos_till_float),
    enablePosOrderEdit: isPosOrderEditEnabled(moduleSettings, options.capabilities ?? null),
    blindTillClose: Boolean(sales.blind_till_close),
    receiptCopies: Number(sales.receipt_copies ?? 1),
    showBranchOnReceipt: Boolean(sales.show_branch_on_receipt),
    payment: getCheckoutPaymentConfig(moduleSettings),
  };
}

export function getCheckoutPaymentConfig(moduleSettings) {
  const sales = mergeSalesSettings(moduleSettings);
  const useBankSelect = Boolean(sales.enable_bank_select);
  const individualBanks = !useBankSelect && (
    sales.enable_equity_bank || sales.enable_kcb_bank || sales.enable_other_bank
  );

  const otherBankLabel =
    (sales.other_bank_name && String(sales.other_bank_name).trim()) || "Other bank";

  const bankOptions = [];
  if (useBankSelect) {
    bankOptions.push({ value: "", label: "— Select bank —" });
    if (sales.enable_equity_bank) bankOptions.push({ value: "EQUITY", label: "Equity Bank" });
    if (sales.enable_kcb_bank) bankOptions.push({ value: "KCB", label: "KCB" });
    if (sales.enable_other_bank) bankOptions.push({ value: "OTHER", label: otherBankLabel });
  }

  return {
    enableMpesaAmount: Boolean(sales.enable_mpesa_amount),
    enableMpesaCode: Boolean(sales.enable_mpesa_code),
    useBankSelect,
    showBankAmount: useBankSelect && Boolean(sales.enable_bank_amount),
    requireBankRef: useBankSelect && Boolean(sales.enable_bank_amount),
    showEquityBank: !useBankSelect && Boolean(sales.enable_equity_bank),
    showKcbBank: !useBankSelect && Boolean(sales.enable_kcb_bank),
    showOtherBank: !useBankSelect && Boolean(sales.enable_other_bank),
    showCheque: Boolean(sales.enable_cheque),
    showChequeNumber: Boolean(sales.enable_cheque_number),
    enablePaymentDate: Boolean(sales.enable_payment_date),
    enableCreditPayment: Boolean(sales.enable_credit_payment),
    allowPartialPayment: Boolean(sales.allow_credit_pay_now),
    enableCheckoutCustomerName: Boolean(sales.enable_checkout_customer_name),
    otherBankLabel,
    bankOptions,
    hasBankPayments: useBankSelect
      ? sales.enable_bank_amount && bankOptions.length > 1
      : individualBanks,
  };
}

export function posChannelFromStockSource(sellFromShop, config) {
  if (config.perLineStockRouting || config.retailShopWholesaleStoreStock) {
    return "pos";
  }
  if (config.allowShop && !config.allowStore) return "pos";
  if (!config.allowShop && config.allowStore) return "backend";
  return sellFromShop ? "pos" : "backend";
}

export {
  getChannelWorkflow,
  getOrderWorkflow,
  isImmediatePaymentMethod,
  pickEnabledStatus,
  resolveCheckoutStatus,
  resolveOrderChannel,
  resolveSaveOrderStatus,
  resolveSaveOrderStatusLabel,
  sanitizeWorkflowReferences,
  workflowPipelineSteps,
} from "@/lib/order-workflow";
