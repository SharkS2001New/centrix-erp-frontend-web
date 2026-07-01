/** Fixed preview timestamps — no runtime date math on each preview click. */
export const SAMPLE_SALE_AT = "2026-01-30T10:30:00.000Z";

export const SAMPLE_RECEIPT_SALE_ITEMS = [
  {
    product_name: "THAI RICE BIRIYANI 25KG",
    product_code: "RICE-25",
    quantity: 2,
    unit_price: 2250,
    amount: 4500,
    discount_given: 0,
  },
  {
    product_name: "SUGAR 50 KG",
    product_code: "SUGAR-50",
    quantity: 1,
    unit_price: 6000,
    amount: 6000,
    discount_given: 0,
  },
  {
    product_name: "MT. KENYA ESL 500ML",
    product_code: "MTK-500",
    quantity: 4,
    unit_price: 580,
    amount: 2320,
    discount_given: 0,
  },
];

export const SAMPLE_RECEIPT_SALE = {
  id: 1001,
  order_num: 1001,
  status: "completed",
  channel: "pos",
  route_id: null,
  order_total: 12820,
  total_vat: 1768.28,
  cash: 5000,
  mpesa_amount: 7820,
  completed_at: SAMPLE_SALE_AT,
  created_at: SAMPLE_SALE_AT,
  cashier_name: "Preview cashier",
  items: SAMPLE_RECEIPT_SALE_ITEMS,
};

export const SAMPLE_PREVIEW_CUSTOMER = {
  customer_name: "Sample Customer Ltd",
  phone_number: "0712 000 111",
  kra_pin: "P051234567X",
  town: "Nairobi",
  terms_of_payment: "30 DAYS",
};

export const SAMPLE_PREVIEW_SELLER = {
  name: "Preview Company",
  address: "Sample Street, Nairobi",
  email: "info@preview.example",
  phone: "0712 345 678",
  secondary_phone: "",
  tax_pin: "P051234567X",
};

/** Example branch for thermal receipt previews when branch details are enabled. */
export const SAMPLE_PREVIEW_BRANCH = {
  id: 2,
  name: "Westlands Branch",
  address: "Ring Road, Westlands, Nairobi",
  phone: "0712 111 222",
};

/** Static sale payload for receipt and invoice print previews. */
export function sampleReceiptPreviewSale({ channel = "pos", routeId = null, branchId = 2 } = {}) {
  return {
    ...SAMPLE_RECEIPT_SALE,
    channel,
    route_id: routeId,
    branch_id: branchId,
  };
}
