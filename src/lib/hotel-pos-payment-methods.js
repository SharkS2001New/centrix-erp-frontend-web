/** Platform-controlled Hotel POS Collect payment tenders. */

export const HOTEL_POS_PAYMENT_METHOD_DEFAULTS = {
  cash: true,
  mpesa: true,
  equity: false,
  kcb: false,
  other_bank: false,
  cheque: false,
  extra: false,
};

export const HOTEL_POS_PAYMENT_METHOD_CATALOG = [
  {
    key: "cash",
    label: "Cash",
    description: "Cash tender on Collect payment.",
  },
  {
    key: "mpesa",
    label: "M-Pesa",
    description: "M-Pesa amount. STK Push still follows the organization M-Pesa STK setting.",
  },
  {
    key: "equity",
    label: "Equity Bank",
    description: "Equity bank transfer / deposit.",
  },
  {
    key: "kcb",
    label: "KCB",
    description: "KCB bank transfer / deposit.",
  },
  {
    key: "other_bank",
    label: "Other bank",
    description: "A third bank tender. Rename it under Sales payment fields if needed.",
  },
  {
    key: "cheque",
    label: "Cheque",
    description: "Cheque tender.",
  },
  {
    key: "extra",
    label: "Other active payment methods",
    description:
      "Also show extra rows from Admin → Payment methods (Card, custom banks, and so on).",
  },
];

function isOn(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

export function hotelPosPaymentMethodsFromSales(sales = {}) {
  return {
    cash: true,
    mpesa: sales.enable_mpesa_amount !== false,
    equity: isOn(sales.enable_equity_bank, true),
    kcb: isOn(sales.enable_kcb_bank, true),
    other_bank: Boolean(sales.enable_other_bank),
    cheque: sales.enable_cheque !== false,
    extra: false,
  };
}

export function normalizeHotelPosPaymentMethods(raw, salesFallback = null) {
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) {
    return hotelPosPaymentMethodsFromSales(salesFallback ?? {});
  }
  const out = { ...HOTEL_POS_PAYMENT_METHOD_DEFAULTS };
  for (const key of Object.keys(out)) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = Boolean(raw[key]);
    }
  }
  return out;
}

export function resolveHotelPosPaymentMethods(moduleSettingsOrCapabilities = null) {
  const root = moduleSettingsOrCapabilities ?? {};
  const moduleSettings = root.module_settings ?? root;
  const hospitality = moduleSettings?.hospitality ?? root.hospitality ?? {};
  const sales = moduleSettings?.sales ?? root.sales ?? {};
  const fromPlatform = root.hotel_pos_payment_methods ?? sales.hotel_pos_payment_methods;
  const raw = fromPlatform ?? hospitality.payment_methods ?? null;
  return normalizeHotelPosPaymentMethods(raw, sales);
}
