import {
  DEFAULT_INVOICE_DELIVERY_TERMS,
  DEFAULT_INVOICE_FOOTER_LINES,
  invoicePrintFormFromApi,
} from "@/lib/invoice-print-settings";
import { defaultDateRange } from "@/components/inventory/inventory-shared";
import {
  DEFAULT_POS_RECEIPT_PAYMENT_LINES,
  receiptPaymentDetailsFromApi,
} from "@/lib/receipt-payment-details";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";

const SALES_DEFAULTS = {
  allow_sell_from_shop: true,
  allow_sell_from_store: false,
  enable_retail_pricing: false,
  allow_discounts: true,
  allow_edit_line_discount: false,
  enable_order_discount: false,
  discount_approval_enabled: false,
  discount_approval_threshold_percent: 10,
  order_cancellation_approval_enabled: false,
  enable_vouchers: false,
  enable_redeemable_points: false,
  point_cash_value: 1,
  points_earn_per_kes: 1000,
  allow_edit_unit_price: true,
  allow_pos_edit_unit_price: false,
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
  backoffice_order_type_mode: "toggle",
  pos_order_type_mode: "normal",
  enable_mobile_orders: true,
  mobile_enable_checkout_location_verification: false,
  mobile_allow_offline_orders: false,
  mobile_checkout_location_radius_metres: 5,
  mobile_checkout_mode: 'save_only',
  mobile_product_list_mode: 'in_stock_only',
  mobile_enable_field_attendance: false,
  mobile_show_customer_phone: false,
  require_pos_till_float: false,
  require_backoffice_till_float: false,
  blind_till_close: false,
  enable_pos_order_edit: false,
  enable_backoffice_order_edit: true,
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
  stock_deduct_on: {
    pos: "order_created",
    mobile: "order_completed",
    backend: "order_completed",
  },
  orders_list_default_days: 5,
  orders_list_sort: "-created_at",
};

export const ORDERS_LIST_SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first (order date)" },
  { value: "created_at", label: "Oldest first (order date)" },
  { value: "-order_num", label: "Highest order number first" },
  { value: "order_num", label: "Lowest order number first" },
];

const ORDERS_LIST_SORT_VALUES = new Set(ORDERS_LIST_SORT_OPTIONS.map((option) => option.value));

export function normalizeOrdersListDefaultDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) return SALES_DEFAULTS.orders_list_default_days;
  return Math.min(90, Math.max(1, Math.round(days)));
}

export function normalizeOrdersListSort(value) {
  const sort = String(value ?? "").trim();
  return ORDERS_LIST_SORT_VALUES.has(sort) ? sort : SALES_DEFAULTS.orders_list_sort;
}

export function getOrdersListDefaultDateRange(moduleSettings) {
  const sales = mergeSalesSettings(moduleSettings);
  return defaultDateRange(normalizeOrdersListDefaultDays(sales.orders_list_default_days));
}

export function getOrdersListSort(moduleSettings) {
  const sales = mergeSalesSettings(moduleSettings);
  return normalizeOrdersListSort(sales.orders_list_sort);
}

export function sortOrdersForList(orders, sortKey = "-created_at") {
  const sort = normalizeOrdersListSort(sortKey);
  const items = [...(orders ?? [])];

  if (sort === "created_at") {
    return items.sort(
      (a, b) =>
        new Date(a.completed_at ?? a.created_at ?? 0).getTime() -
        new Date(b.completed_at ?? b.created_at ?? 0).getTime(),
    );
  }

  if (sort === "-order_num") {
    return items.sort(
      (a, b) => Number(b.order_num ?? b.id ?? 0) - Number(a.order_num ?? a.id ?? 0),
    );
  }

  if (sort === "order_num") {
    return items.sort(
      (a, b) => Number(a.order_num ?? a.id ?? 0) - Number(b.order_num ?? b.id ?? 0),
    );
  }

  return items.sort((a, b) => {
    const aTime = new Date(a.completed_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.completed_at ?? b.created_at ?? 0).getTime();
    if (bTime !== aTime) return bTime - aTime;
    return Number(b.order_num ?? b.id ?? 0) - Number(a.order_num ?? a.id ?? 0);
  });
}

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

export const MOBILE_CHECKOUT_MODES = [
  {
    value: "save_only",
    label: "Save order only",
    description:
      "Reps save orders without collecting payment on the app. Payment is recorded later in the ERP.",
  },
  {
    value: "payment",
    label: "Collect payment at checkout",
    description:
      "Reps must enter payment details when completing an order on the mobile app.",
  },
  {
    value: "ask",
    label: "Ask rep each time",
    description:
      "Reps choose whether the customer is paying now (payment form) or the order is saved for later payment.",
  },
];

export function normalizeMobileCheckoutMode(value) {
  const mode = String(value ?? "save_only");
  return MOBILE_CHECKOUT_MODES.some((option) => option.value === mode) ? mode : "save_only";
}

export const MOBILE_PRODUCT_LIST_MODES = [
  {
    value: "in_stock_only",
    label: "Show only products in stock",
    description:
      "Reps only see products with available quantity at their branch. Out-of-stock items are hidden from search and browse.",
  },
  {
    value: "all_products",
    label: "Show all products",
    description:
      "Reps can browse and search the full catalogue. Stock levels are still shown; out-of-stock items can be ordered if your sales rules allow it.",
  },
];

export function normalizeMobileProductListMode(value) {
  const mode = String(value ?? "in_stock_only");
  return MOBILE_PRODUCT_LIST_MODES.some((option) => option.value === mode) ? mode : "in_stock_only";
}

export const EMPTY_MOBILE_APPLICATION_FORM = {
  mobile_enable_checkout_location_verification: false,
  mobile_allow_offline_orders: false,
  mobile_checkout_location_radius_metres: "5",
  mobile_checkout_mode: "save_only",
  mobile_product_list_mode: "in_stock_only",
  mobile_show_customer_phone: false,
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
    mobile_checkout_mode: normalizeMobileCheckoutMode(sales.mobile_checkout_mode),
    mobile_product_list_mode: normalizeMobileProductListMode(sales.mobile_product_list_mode),
    mobile_show_customer_phone: sales.mobile_show_customer_phone === true,
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
    mobile_checkout_mode: normalizeMobileCheckoutMode(form.mobile_checkout_mode),
    mobile_product_list_mode: normalizeMobileProductListMode(form.mobile_product_list_mode),
    mobile_show_customer_phone: form.mobile_show_customer_phone === true,
  };
}

/** Whether the mobile app should display customer phone numbers (off by default). */
export function isMobileCustomerPhoneVisible(moduleSettings) {
  return mergeSalesSettings(moduleSettings).mobile_show_customer_phone === true;
}

/** Org-admin sales settings form (excludes mobile application keys — see Mobile application tab). */
export const EMPTY_SALES_ORGANIZATION_FORM = {
  allow_discounts: true,
  allow_edit_line_discount: false,
  enable_order_discount: false,
  discount_approval_enabled: false,
  discount_approval_threshold_percent: "10",
  order_cancellation_approval_enabled: false,
  enable_vouchers: false,
  enable_redeemable_points: false,
  point_cash_value: "1",
  points_earn_per_kes: "1000",
  allow_edit_unit_price: true,
  allow_pos_edit_unit_price: false,
  enable_barcode_scanner: false,
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
  backoffice_order_type_mode: "toggle",
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
  orders_list_default_days: "5",
  orders_list_sort: "-created_at",
};

export function salesOrganizationFormFromApi(res) {
  const sales = mergeSalesSettings({ sales: res?.sales ?? res });
  return {
    allow_discounts: Boolean(sales.allow_discounts),
    allow_edit_line_discount: Boolean(sales.allow_edit_line_discount),
    enable_order_discount: Boolean(sales.enable_order_discount),
    discount_approval_enabled: Boolean(sales.discount_approval_enabled),
    discount_approval_threshold_percent: String(sales.discount_approval_threshold_percent ?? 10),
    order_cancellation_approval_enabled: Boolean(sales.order_cancellation_approval_enabled),
    enable_vouchers: Boolean(sales.enable_vouchers),
    enable_redeemable_points: Boolean(sales.enable_redeemable_points),
    point_cash_value: String(sales.point_cash_value ?? 1),
    points_earn_per_kes: String(sales.points_earn_per_kes ?? 1000),
    allow_edit_unit_price: Boolean(sales.allow_edit_unit_price),
    allow_pos_edit_unit_price: Boolean(sales.allow_pos_edit_unit_price),
    enable_barcode_scanner: Boolean(sales.enable_barcode_scanner),
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
    backoffice_order_type_mode: resolveBackofficeOrderTypeMode(sales),
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
    orders_list_default_days: String(normalizeOrdersListDefaultDays(sales.orders_list_default_days)),
    orders_list_sort: normalizeOrdersListSort(sales.orders_list_sort),
  };
}

/** Clear sales form keys that do not apply to the organization's enabled modules. */
export function sanitizeSalesOrganizationFormForModules(form, capabilities) {
  const modules = capabilities?.modules ?? {};
  const hasPosSales = Boolean(modules["sales.pos"]);
  const hasCustomers = Boolean(modules.customers_suppliers);
  const next = { ...form };

  if (!hasPosSales) {
    next.enable_credit_payment = false;
    next.enable_checkout_customer_name = false;
    next.allow_edit_line_discount = false;
    next.allow_pos_edit_unit_price = false;
    next.enable_barcode_scanner = false;
    next.blind_till_close = false;
    next.pos_order_type_mode = "normal";
  }

  if (!hasCustomers) {
    next.enable_credit_payment = false;
    next.add_route_markup_prices = false;
    next.enable_redeemable_points = false;
  }

  if (next.allow_credit_pay_now && next.enable_credit_payment) {
    next.enable_credit_payment = false;
  }

  return next;
}

export function salesOrganizationPayloadFromForm(form, capabilities = null) {
  const sanitized = capabilities ? sanitizeSalesOrganizationFormForModules(form, capabilities) : form;
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
  } = sanitized;

  return {
    ...checkoutForm,
    default_tax_rate: Number(sanitized.default_tax_rate) || 0,
    point_cash_value: Number(sanitized.point_cash_value) || 0,
    points_earn_per_kes: Number(sanitized.points_earn_per_kes) || 0,
    orders_list_default_days: normalizeOrdersListDefaultDays(sanitized.orders_list_default_days),
    orders_list_sort: normalizeOrdersListSort(sanitized.orders_list_sort),
    discount_approval_threshold_percent:
      Number(sanitized.discount_approval_threshold_percent) || 10,
  };
}

/**
 * Backoffice loading list for mobile route orders when Distribution is not enabled.
 * When Distribution is on, loading lists live under Distribution → Loading list.
 */
export function shouldShowMobileLoadingSheets(capabilities) {
  if (!capabilities?.modules?.["sales.mobile"]) return false;
  if (!isOrgMobileSalesEnabled(capabilities)) return false;
  if (capabilities?.modules?.distribution) return false;
  return true;
}

/** Loading list hub for dispatch trips when Distribution operations are enabled. */
export function shouldShowDistributionLoadingLists(capabilities) {
  return isDistributionOpsEnabled(capabilities);
}

/** Sidebar entry for either mobile loading sheets or distribution trip loading lists. */
export function shouldShowLoadingListNav(capabilities) {
  return shouldShowMobileLoadingSheets(capabilities) || shouldShowDistributionLoadingLists(capabilities);
}

/** Preferred route for the loading list nav item. */
export function loadingListNavHref(capabilities) {
  if (shouldShowDistributionLoadingLists(capabilities)) {
    return "/fulfillment/loading-lists";
  }
  return "/sales/loading-sheets";
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

export function isVouchersEnabled(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).enable_vouchers);
}

export function isRedeemablePointsEnabled(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).enable_redeemable_points);
}

export function isDiscountApprovalEnabled(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).discount_approval_enabled);
}

export function discountApprovalThresholdPercent(moduleSettings) {
  const value = Number(mergeSalesSettings(moduleSettings).discount_approval_threshold_percent ?? 10);
  if (!Number.isFinite(value)) return 10;
  return Math.min(100, Math.max(0, value));
}

export function isOrderCancellationApprovalEnabled(moduleSettings) {
  return Boolean(mergeSalesSettings(moduleSettings).order_cancellation_approval_enabled);
}

export function isJournalEntryApprovalEnabled(moduleSettings) {
  return Boolean(moduleSettings?.accounting?.journal_entry_approval_enabled);
}

export function isStockAdjustmentApprovalEnabled(moduleSettings) {
  return Boolean(moduleSettings?.inventory?.stock_adjustment_approval_enabled);
}

export function isStockTransferApprovalEnabled(moduleSettings) {
  return Boolean(moduleSettings?.inventory?.stock_transfer_approval_enabled);
}

export function isDamageWriteOffApprovalEnabled(moduleSettings) {
  return Boolean(moduleSettings?.inventory?.damage_write_off_approval_enabled);
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

export function orderDocumentPrintLabel(moduleSettings, capabilities = null) {
  const hasExternalPos = Boolean(capabilities?.modules?.["sales.pos"]);
  if (!hasExternalPos) {
    return "Print";
  }
  const type = getOrderDocumentType(moduleSettings);
  if (type === "both") return "Print";
  if (type === "invoice") return "Print invoice";
  return "Print receipt";
}

/** Orders list / row print — A4 invoice unless External POS is enabled. */
export function defaultOrderListPrintDocumentType(moduleSettings, capabilities) {
  if (!capabilities?.modules?.["sales.pos"]) {
    return "invoice";
  }
  return resolveOrderPrintDocumentType(moduleSettings) ?? "receipt";
}

export function orderListPrintAriaLabel(capabilities) {
  return capabilities?.modules?.["sales.pos"] ? "Print receipt" : "Print";
}

export function orderDocumentTitle(moduleSettings, documentType = null) {
  const type = documentType ?? getOrderDocumentType(moduleSettings);
  if (type === "invoice") return "INVOICE RECEIPT";
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

/** Backoffice create order (/sales/pos) — route markup applies here when enabled. */
export function resolveBackofficeOrderTypeMode(sales) {
  if (!sales?.add_route_markup_prices) {
    return "normal";
  }
  const mode = sales?.backoffice_order_type_mode;
  if (POS_ORDER_TYPE_MODES.includes(mode)) {
    return mode;
  }
  return "toggle";
}

export function resolveAllowEditUnitPrice(sales, { standalone = false } = {}) {
  if (standalone) {
    return Boolean(sales?.allow_pos_edit_unit_price);
  }
  return Boolean(sales?.allow_edit_unit_price);
}

export function resolveRouteOrderTypeMode(sales, { standalone = false } = {}) {
  if (!sales?.add_route_markup_prices) {
    return "normal";
  }
  return standalone ? resolvePosOrderTypeMode(sales) : resolveBackofficeOrderTypeMode(sales);
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

/** Stock deduction timing — per channel on sales settings; legacy string applies to all channels. */
export function normalizeStockDeductOn(value, { hasPosSales = false, showCheckoutOnCreate = true } = {}) {
  const allowed = new Set(STOCK_DEDUCT_TIMING_OPTIONS.map((o) => o.value));
  const defaults = { ...SALES_DEFAULTS.stock_deduct_on };

  let map;
  if (typeof value === "string" && allowed.has(value)) {
    map = { pos: value, mobile: value, backend: value };
  } else if (value && typeof value === "object") {
    map = { ...defaults, ...value };
  } else {
    map = { ...defaults };
  }

  for (const ch of ["pos", "mobile", "backend"]) {
    if (!allowed.has(map[ch])) {
      map[ch] = defaults[ch];
    }
  }

  if (hasPosSales && showCheckoutOnCreate) {
    map.pos = "order_created";
  }

  return map;
}

export function resolveStockDeductTiming(moduleSettings, channel = "backend") {
  const sales = mergeSalesSettings(moduleSettings);
  const normalized = normalizeStockDeductOn(sales.stock_deduct_on);
  const key = channel === "backoffice" ? "backend" : channel;
  if (normalized[key]) {
    return normalized[key];
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
    allowEditUnitPrice: resolveAllowEditUnitPrice(sales, {
      standalone: Boolean(options.standalone),
    }),
    enableBarcodeScanner: Boolean(sales.enable_barcode_scanner),
    addRouteMarkupPrices: Boolean(sales.add_route_markup_prices),
    posOrderTypeMode: resolveRouteOrderTypeMode(sales, {
      standalone: Boolean(options.standalone),
    }),
    requirePosTillFloat: Boolean(sales.require_pos_till_float),
    requireBackofficeTillFloat: Boolean(sales.require_backoffice_till_float),
    /** @deprecated Use requirePosTillFloat or requireBackofficeTillFloat for the active workspace. */
    requireTillFloat: Boolean(sales.require_pos_till_float),
    enablePosOrderEdit: isPosOrderEditEnabled(moduleSettings, options.capabilities ?? null),
    blindTillClose: Boolean(sales.blind_till_close),
    receiptCopies: Number(sales.receipt_copies ?? 1),
    showBranchOnReceipt: Boolean(sales.show_branch_on_receipt),
    payment: getCheckoutPaymentConfig(moduleSettings, {
      checkoutContext: "pos",
      capabilities: options.capabilities ?? null,
    }),
  };
}

export function getCheckoutPaymentConfig(moduleSettings, options = {}) {
  const sales = mergeSalesSettings(moduleSettings);
  const modules = options.modules ?? options.capabilities?.modules ?? {};
  const hasPosSales = Boolean(modules["sales.pos"]);
  const hasCustomers = Boolean(modules.customers_suppliers);
  const checkoutContext = options.checkoutContext ?? "pos";
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
    enableCreditPayment:
      checkoutContext === "pos" &&
      hasPosSales &&
      hasCustomers &&
      Boolean(sales.enable_credit_payment),
    allowPartialPayment:
      checkoutContext === "order_payment" &&
      Boolean(modules.sales) &&
      Boolean(sales.allow_credit_pay_now),
    enableCheckoutCustomerName:
      checkoutContext === "pos" &&
      hasPosSales &&
      Boolean(sales.enable_checkout_customer_name),
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

/** Sales cart channel for the active workspace — backoffice create order always uses backend. */
export function salesCartChannelForWorkspace({ standalone, sellFromShop, config }) {
  if (!standalone) return "backend";
  return posChannelFromStockSource(sellFromShop, config);
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
