const SALES_DEFAULTS = {
  allow_sell_from_shop: true,
  allow_sell_from_store: false,
  enable_retail_pricing: false,
  allow_discounts: true,
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
};

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
    retailShopWholesaleStoreStock,
    enableRetailPricing,
    allowDiscounts: Boolean(sales.allow_discounts),
    allowEditUnitPrice: Boolean(sales.allow_edit_unit_price),
    enableBarcodeScanner: Boolean(sales.enable_barcode_scanner),
    addRouteMarkupPrices: Boolean(sales.add_route_markup_prices),
    posOrderTypeMode: sales.add_route_markup_prices
      ? resolvePosOrderTypeMode(sales)
      : "normal",
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

/** Resolve sale status after checkout from channel and payment. */
export function resolveCheckoutStatus({ channel, isCredit, payNow, total }) {
  if (payNow + 0.01 >= total) {
    return channel === "pos" ? "completed" : "paid";
  }
  if (isCredit || payNow > 0) {
    return "pending_payment";
  }
  return channel === "mobile" ? "pending" : "booked";
}

/** Status when saving order without checkout popup. */
export function resolveSaveOrderStatus(channel) {
  return channel === "mobile" ? "pending" : "booked";
}
