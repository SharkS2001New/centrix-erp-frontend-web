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
  enable_mpesa_code: true,
  enable_bank_select: false,
  enable_equity_bank: true,
  enable_kcb_bank: true,
  enable_other_bank: false,
  other_bank_name: "Other bank",
  enable_bank_amount: true,
  enable_cheque: true,
  enable_payment_date: true,
  enable_credit_payment: true,
  allow_credit_pay_now: false,
  show_checkout_on_create_order: true,
  enable_checkout_customer_name: false,
  retail_shop_wholesale_store_stock: false,
  add_route_markup_prices: false,
  pos_order_type_mode: "normal",
  enable_mobile_orders: false,
  enable_pos_orders: false,
  require_pos_till_float: false,
  order_document_type: "receipt",
  invoice_valid_days: 7,
  receipt_copies: 1,
  show_branch_on_receipt: true,
};

/** Whether Mobile Orders appears in the sales sidebar and queue routes. */
export function isMobileOrdersEnabled(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).enable_mobile_orders);
}

export function isPosOrdersEnabled(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).enable_pos_orders);
}

/** When true, cashiers must open a till session with operating float before POS sales. */
export function isPosTillFloatRequired(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).require_pos_till_float);
}

/** True when any sales discount feature is enabled in settings. */
export function areSalesDiscountsEnabled(moduleSettings) {
  const sales = mergeSalesSettings(moduleSettings);
  return Boolean(sales.allow_discounts || sales.enable_order_discount);
}

export const ORDER_DOCUMENT_TYPES = ["receipt", "invoice"];

/** Order print format from sales settings — receipt (compact) or invoice (A4). */
export function getOrderDocumentType(moduleSettings) {
  const type = mergeSalesSettings(moduleSettings).order_document_type;
  return ORDER_DOCUMENT_TYPES.includes(type) ? type : "receipt";
}

export function orderDocumentPrintLabel(moduleSettings) {
  return getOrderDocumentType(moduleSettings) === "invoice" ? "Print invoice" : "Print receipt";
}

export function orderDocumentTitle(moduleSettings) {
  return getOrderDocumentType(moduleSettings) === "invoice" ? "TAX INVOICE" : "RECEIPT";
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
    showChequeNumber: Boolean(sales.enable_cheque),
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
