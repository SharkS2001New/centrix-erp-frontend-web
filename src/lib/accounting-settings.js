export const ACCOUNTING_AUTO_POST_DEFAULTS = {
  auto_post_sales: true,
  auto_post_expenses: true,
  auto_post_purchases: true,
  auto_post_payments: true,
  auto_post_payroll: true,
  auto_post_returns: true,
  post_till_variance: true,
  account_codes: {
    cash: "1000",
    bank: "1100",
    ar: "1200",
    inventory: "1300",
    ap: "2000",
    vat_payable: "2100",
    retained_earnings: "3100",
    sales_revenue: "4000",
    cogs: "5000",
    till_variance: "5100",
    payroll_expense: "5200",
    operating_expense: "5300",
  },
  payment_method_accounts: {
    CASH: "1000",
    MPESA: "1100",
    CARD: "1100",
    BANK: "1100",
    TRANSFER: "1100",
    VOUCHER: "1000",
    POINTS: "1000",
  },
};

export const ACCOUNT_CODE_FIELDS = [
  { key: "cash", label: "Cash" },
  { key: "bank", label: "Bank" },
  { key: "ar", label: "Accounts receivable" },
  { key: "inventory", label: "Inventory" },
  { key: "ap", label: "Accounts payable" },
  { key: "vat_payable", label: "VAT payable" },
  { key: "retained_earnings", label: "Retained earnings" },
  { key: "sales_revenue", label: "Sales revenue" },
  { key: "cogs", label: "Cost of goods sold" },
  { key: "till_variance", label: "Till variance" },
  { key: "payroll_expense", label: "Payroll expense" },
  { key: "operating_expense", label: "Operating expense" },
];

export const PAYMENT_METHOD_ACCOUNT_FIELDS = [
  { key: "CASH", label: "Cash" },
  { key: "MPESA", label: "M-Pesa" },
  { key: "CARD", label: "Card" },
  { key: "BANK", label: "Bank" },
  { key: "TRANSFER", label: "Transfer" },
  { key: "VOUCHER", label: "Voucher" },
  { key: "POINTS", label: "Points" },
];

export const AUTO_POST_TOGGLES = [
  {
    key: "auto_post_sales",
    label: "Auto-post sales",
    description: "Post journal entries when checkout completes.",
  },
  {
    key: "auto_post_expenses",
    label: "Auto-post expenses",
    description: "Dr operating expense, Cr cash/bank when an expense is recorded.",
  },
  {
    key: "auto_post_purchases",
    label: "Auto-post stock receipts",
    description: "Dr inventory, Cr accounts payable when stock is received.",
  },
  {
    key: "auto_post_payments",
    label: "Auto-post customer payments",
    description: "Dr cash/bank, Cr AR when credit customers pay.",
  },
  {
    key: "auto_post_payroll",
    label: "Auto-post payroll",
    description: "Post payroll expense and liabilities when a run is processed.",
  },
  {
    key: "auto_post_returns",
    label: "Auto-post returns",
    description: "Reverse revenue when a customer return is approved.",
  },
  {
    key: "post_till_variance",
    label: "Post till variance",
    description: "Post cash over/short when a till session is closed.",
  },
];

export function accountingSettingsFromApi(res) {
  const defaults = ACCOUNTING_AUTO_POST_DEFAULTS;
  const accounting = { ...defaults, ...(res?.accounting ?? res ?? {}) };
  accounting.account_codes = { ...defaults.account_codes, ...(accounting.account_codes ?? {}) };
  accounting.payment_method_accounts = {
    ...defaults.payment_method_accounts,
    ...(accounting.payment_method_accounts ?? {}),
  };

  return {
    ...accounting,
    chart_seeded: Boolean(res?.chart_seeded),
  };
}

export function accountingSettingsPayload(form) {
  const payload = {};
  for (const toggle of AUTO_POST_TOGGLES) {
    payload[toggle.key] = Boolean(form[toggle.key]);
  }
  if (form.account_codes) {
    payload.account_codes = { ...form.account_codes };
  }
  if (form.payment_method_accounts) {
    payload.payment_method_accounts = { ...form.payment_method_accounts };
  }
  return payload;
}
