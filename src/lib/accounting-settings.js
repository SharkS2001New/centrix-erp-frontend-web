export const ACCOUNTING_AUTO_POST_DEFAULTS = {
  auto_post_sales: true,
  auto_post_expenses: true,
  auto_post_purchases: true,
  auto_post_payments: true,
  auto_post_payroll: true,
  auto_post_returns: true,
  post_till_variance: true,
};

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
  const accounting = { ...ACCOUNTING_AUTO_POST_DEFAULTS, ...(res?.accounting ?? res ?? {}) };

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
  return payload;
}
