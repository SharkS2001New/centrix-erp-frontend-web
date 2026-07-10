/** Built-in platform invoice design templates (super admin billing). */

export const PLATFORM_INVOICE_DESIGN_TEMPLATES = [
  { id: "modern", label: "Modern", description: "Clean layout with accent header — Stripe-inspired." },
  { id: "classic", label: "Classic", description: "Traditional bordered invoice with formal typography." },
  { id: "minimal", label: "Minimal", description: "Generous whitespace and subtle dividers." },
  { id: "corporate", label: "Corporate", description: "Navy header band suited for enterprise clients." },
  { id: "bold", label: "Bold", description: "Large headings and high-contrast totals." },
  { id: "elegant", label: "Elegant", description: "Refined serif accents — FreshBooks style." },
  { id: "stripe", label: "Stripe", description: "Purple accent sidebar — popular SaaS billing look." },
  { id: "compact", label: "Compact", description: "Dense layout for printing multiple copies." },
];

export const PLATFORM_INVOICE_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "paid", label: "Paid" },
  { id: "void", label: "Void" },
];

/** Print font presets — super admin can override template typography. */
export const PLATFORM_INVOICE_FONT_FAMILIES = [
  { id: "template", label: "Match design template" },
  { id: "system", label: "System sans-serif", css: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: "arial", label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { id: "helvetica", label: "Helvetica", css: "Helvetica, Arial, sans-serif" },
  { id: "verdana", label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { id: "georgia", label: "Georgia", css: "Georgia, 'Times New Roman', serif" },
  { id: "times", label: "Times New Roman", css: "'Times New Roman', Times, serif" },
];

/** Body text scale for screen preview and A4 print. */
export const PLATFORM_INVOICE_FONT_SCALES = [
  { id: "compact", label: "Compact", screenPx: 13, printPx: 14 },
  { id: "standard", label: "Standard (recommended)", screenPx: 14, printPx: 16 },
  { id: "large", label: "Large", screenPx: 16, printPx: 18 },
  { id: "extra_large", label: "Extra large", screenPx: 18, printPx: 20 },
];

export function invoiceFontFamilyCss(fontId, templateFont) {
  if (!fontId || fontId === "template") {
    return templateFont;
  }
  return PLATFORM_INVOICE_FONT_FAMILIES.find((row) => row.id === fontId)?.css ?? templateFont;
}

export function invoiceFontScale(scaleId) {
  return (
    PLATFORM_INVOICE_FONT_SCALES.find((row) => row.id === scaleId)
    ?? PLATFORM_INVOICE_FONT_SCALES.find((row) => row.id === "standard")
  );
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export const DEFAULT_INVOICE_OPTIONS = {
  show_quantity: true,
  show_payment_details: false,
  payment_details: "",
  show_etims_invoice_no: false,
  etims_invoice_no: "",
  watermark_enabled: true,
  watermark_mode: "name",
  watermark_text: "ALPAC SOFTWARE SOLUTIONS",
  watermark_logo_url: "",
  brand_mode: "name",
  brand_name: "ALPAC SOFTWARE SOLUTIONS",
  brand_logo_url: "",
  print_font_family: "template",
  print_font_scale: "standard",
};

/** Default Bill from — Alpac Software Solutions (platform operator). */
export const DEFAULT_PLATFORM_SELLER = {
  name: "ALPAC SOFTWARE SOLUTIONS",
  email: "alpacke.tech@gmail.com",
  phone: "0748956677",
  address: "Kasarani, Nairobi Kenya",
  tax_pin: "A008933545E",
};

/**
 * Billable modules aligned to Centrix workspaces.
 * Backoffice is billed as Sales + Inventory + Customers/suppliers (not one line).
 * Suggested amounts are mid-market Kenya SaaS ERP add-on prices (KES / month).
 */
export const PLATFORM_BILLING_MODULE_GROUPS = [
  { id: "backoffice", label: "Backoffice" },
  { id: "workspaces", label: "Workspaces" },
  { id: "integrations", label: "Integrations" },
  { id: "platform", label: "Platform" },
];

export const PLATFORM_BILLING_MODULES = [
  {
    key: "sales",
    group: "backoffice",
    label: "Sales",
    description: "Backoffice sales orders, quotations, pricing, and sales reporting.",
    default_amount: 12000,
    billing_period: "monthly",
    moduleKeys: ["sales.backend", "sales.dashboard", "sales.reports"],
  },
  {
    key: "inventory",
    group: "backoffice",
    label: "Inventory & stock",
    description: "Stock control, transfers, valuations, and inventory reporting.",
    default_amount: 10000,
    billing_period: "monthly",
    moduleKeys: ["inventory", "inventory.dashboard", "inventory.reports"],
  },
  {
    key: "customers_suppliers",
    group: "backoffice",
    label: "Customers, suppliers & purchasing",
    description: "Customer and supplier master data, LPOs, purchases, and routes.",
    default_amount: 8000,
    billing_period: "monthly",
    moduleKeys: ["customers_suppliers", "customers_suppliers.reports"],
  },
  {
    key: "mobile_apps",
    group: "workspaces",
    label: "Mobile, Drivers & Manager apps",
    description: "Centrix Mobile field sales, Drivers, Manager apps, and External POS terminal.",
    default_amount: 15000,
    billing_period: "monthly",
    moduleKeys: ["sales.mobile", "sales.pos"],
  },
  {
    key: "accounting",
    group: "workspaces",
    label: "Accounting & finance",
    description: "General ledger, receivables, expenses, and financial statements.",
    default_amount: 15000,
    billing_period: "monthly",
    moduleKeys: ["accounting", "accounting.reports"],
  },
  {
    key: "hr_payroll",
    group: "workspaces",
    label: "Human resources & payroll",
    description: "Employees, attendance, payroll runs, and HR compliance reports.",
    default_amount: 12000,
    billing_period: "monthly",
    moduleKeys: ["hr_payroll", "hr_payroll.reports"],
  },
  {
    key: "distribution",
    group: "workspaces",
    label: "Distribution & logistics",
    description: "Dispatch board, trips, fleet, proof of delivery, and logistics KPIs.",
    default_amount: 12000,
    billing_period: "monthly",
    moduleKeys: ["distribution", "distribution.dashboard", "distribution.reports"],
  },
  {
    key: "kra_etims",
    group: "integrations",
    label: "KRA integrations via eTIMS",
    description: "Kenya Revenue Authority eTIMS receipt submission, device setup, and compliance onboarding.",
    default_amount: 5000,
    billing_period: "monthly",
    financeFlags: ["enable_kra_integration", "enable_kra_device"],
  },
  {
    key: "mpesa",
    group: "integrations",
    label: "M-Pesa integrations & onboarding",
    description: "Lipa na M-Pesa STK checkout, C2B reconciliation, and payment onboarding for POS and mobile.",
    default_amount: 4000,
    billing_period: "monthly",
    financeFlags: ["enable_mpesa_stk"],
    salesFlags: ["enable_mpesa_stk"],
  },
  {
    key: "hosting_support",
    group: "platform",
    label: "Platform hosting & support",
    description: "Cloud hosting, backups, security updates, and standard support SLA.",
    default_amount: 25000,
    billing_period: "monthly",
    alwaysWhenOrgSelected: true,
  },
  {
    key: "admin",
    group: "platform",
    label: "Administration",
    description: "Users, roles, branches, company setup, and audit. Included free with every tenant.",
    default_amount: 0,
    billing_period: "monthly",
    free: true,
    moduleKeys: ["admin"],
    alwaysWhenOrgSelected: true,
  },
];

function modulesOn(enabledModules, keys = []) {
  return (keys ?? []).some((key) => Boolean(enabledModules?.[key]));
}

/** Build display summaries (catalog wins; API can override amounts). */
export function buildPlatformBillingSummaries(apiSummaries = []) {
  const byKey = new Map((apiSummaries ?? []).map((row) => [row.key, row]));
  return PLATFORM_BILLING_MODULES.map((mod) => {
    const api = byKey.get(mod.key);
    return {
      key: mod.key,
      group: mod.group,
      label: mod.label,
      description: mod.description,
      default_amount: api?.default_amount != null ? Number(api.default_amount) : mod.default_amount,
      billing_period: api?.billing_period ?? mod.billing_period ?? "monthly",
      free: Boolean(mod.free),
    };
  });
}

const LEGACY_BILLING_KEY_MAP = {
  sales: "sales",
  mobile: "mobile_apps",
  mobile_field_sales: "mobile_apps",
  "mobile-field-sales": "mobile_apps",
  inventory: "inventory",
  inventory_stock: "inventory",
  customers_suppliers: "customers_suppliers",
  purchasing: "customers_suppliers",
  accounting: "accounting",
  hr: "hr_payroll",
  hr_payroll: "hr_payroll",
  distribution: "distribution",
  kra: "kra_etims",
  kra_etims: "kra_etims",
  etims: "kra_etims",
  mpesa: "mpesa",
  hosting: "hosting_support",
  hosting_support: "hosting_support",
  platform_hosting: "hosting_support",
  admin: "admin",
  administration: "admin",
};

/**
 * Which billing modules should be ticked for a tenant from billing-context / org payload.
 */
export function resolveEnabledBillingModuleKeys(context = {}) {
  const selected = new Set();

  const push = (key) => {
    if (!key) return;
    const mapped = LEGACY_BILLING_KEY_MAP[key] ?? key;
    if (PLATFORM_BILLING_MODULES.some((mod) => mod.key === mapped)) {
      selected.add(mapped);
    }
  };

  for (const key of context.enabled_billing_keys ?? context.selected_modules ?? []) {
    push(key);
  }

  for (const row of context.module_summaries ?? []) {
    if (row?.enabled || row?.is_enabled || row?.selected) {
      push(row.key);
    }
  }

  const enabledModules =
    context.enabled_modules ??
    context.organization?.enabled_modules ??
    context.modules ??
    {};
  const moduleSettings =
    context.module_settings ?? context.organization?.module_settings ?? {};
  const finance = moduleSettings.finance ?? context.finance ?? {};
  const sales = moduleSettings.sales ?? context.sales ?? {};

  for (const mod of PLATFORM_BILLING_MODULES) {
    let on = false;
    if (mod.alwaysWhenOrgSelected) on = true;
    if (mod.moduleKeys?.length && modulesOn(enabledModules, mod.moduleKeys)) on = true;
    if (mod.financeFlags?.length) {
      on =
        on ||
        mod.financeFlags.some((key) => {
          if (finance && Object.prototype.hasOwnProperty.call(finance, key)) {
            return finance[key] !== false;
          }
          return false;
        });
    }
    if (mod.salesFlags?.length) {
      on =
        on ||
        mod.salesFlags.some((key) => {
          if (sales && Object.prototype.hasOwnProperty.call(sales, key)) {
            return sales[key] !== false;
          }
          return false;
        });
    }
    if (mod.free && mod.key === "admin") on = true;
    if (on) selected.add(mod.key);
  }

  return [...selected];
}

export function lineItemsFromBillingKeys(keys, summaries) {
  const byKey = new Map((summaries ?? []).map((row) => [row.key, row]));
  return (keys ?? [])
    .map((key) => byKey.get(key))
    .filter(Boolean)
    .map((summary) => lineItemFromModuleSummary(summary, true));
}

export function normalizeInvoiceOptions(options) {
  return { ...DEFAULT_INVOICE_OPTIONS, ...(options ?? {}) };
}

export function normalizeSeller(seller) {
  return { ...DEFAULT_PLATFORM_SELLER, ...(seller ?? {}) };
}

export function addDaysIsoDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function emptyPlatformInvoiceForm(overrides = {}) {
  const issueDate = todayIsoDate();
  return {
    invoice_number: "",
    organization_id: "",
    status: "draft",
    template_id: "modern",
    currency: "KES",
    issue_date: issueDate,
    due_date: addDaysIsoDate(issueDate, 30),
    bill_to_name: "",
    bill_to_email: "",
    bill_to_phone: "",
    bill_to_address: "",
    bill_to_tax_pin: "",
    bill_to_company_code: "",
    seller: { ...DEFAULT_PLATFORM_SELLER },
    invoice_options: { ...DEFAULT_INVOICE_OPTIONS },
    line_items: [],
    selected_modules: [],
    tax_rate: 16,
    notes: "Thank you for your business.",
    terms: "Payment is due within 30 days. Please include the invoice number on your remittance.",
    ...overrides,
  };
}

export function lineItemFromModuleSummary(summary, included = true) {
  const qty = 1;
  const unitPrice = Number(summary.default_amount ?? 0);
  const period = summary.billing_period ? ` (${summary.billing_period})` : "";
  return {
    module_key: summary.key,
    description: `${summary.label ?? summary.description ?? "Module"}${period}`,
    quantity: qty,
    unit_price: unitPrice,
    amount: qty * unitPrice,
    included,
  };
}

export function calculateInvoiceTotals(lineItems, taxRate = 0) {
  let subtotal = 0;
  for (const item of lineItems ?? []) {
    if (item.included === false) continue;
    const qty = Number(item.quantity ?? 1);
    const unit = Number(item.unit_price ?? 0);
    const amount = item.amount != null ? Number(item.amount) : qty * unit;
    subtotal += Number.isFinite(amount) ? amount : 0;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  const taxAmount = Math.round(subtotal * (Number(taxRate) / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, tax_amount: taxAmount, total };
}

export function recalcLineItemAmount(item) {
  const qty = Number(item.quantity ?? 1);
  const unit = Number(item.unit_price ?? 0);
  return { ...item, amount: Math.round(qty * unit * 100) / 100 };
}

export function invoiceFormToPayload(form) {
  const lineItems = (form.line_items ?? []).map(recalcLineItemAmount);
  const totals = calculateInvoiceTotals(lineItems, form.tax_rate);
  const payload = {
    ...form,
    organization_id: form.organization_id ? Number(form.organization_id) : null,
    seller: normalizeSeller(form.seller),
    invoice_options: normalizeInvoiceOptions(form.invoice_options),
    line_items: lineItems,
    selected_modules: form.selected_modules ?? [],
    tax_rate: Number(form.tax_rate ?? 0),
    ...totals,
  };
  if (!payload.invoice_number) delete payload.invoice_number;
  if (!payload.organization_id) payload.organization_id = null;
  return payload;
}

export function invoiceRecordToForm(record) {
  if (!record) return emptyPlatformInvoiceForm();
  return {
    invoice_number: record.invoice_number ?? "",
    organization_id: record.organization_id ? String(record.organization_id) : "",
    status: record.status ?? "draft",
    template_id: record.template_id ?? "modern",
    currency: record.currency ?? "KES",
    issue_date: record.issue_date?.slice?.(0, 10) ?? record.issue_date ?? todayIsoDate(),
    due_date: record.due_date?.slice?.(0, 10) ?? record.due_date ?? "",
    bill_to_name: record.bill_to_name ?? "",
    bill_to_email: record.bill_to_email ?? "",
    bill_to_phone: record.bill_to_phone ?? "",
    bill_to_address: record.bill_to_address ?? "",
    bill_to_tax_pin: record.bill_to_tax_pin ?? "",
    bill_to_company_code: record.bill_to_company_code ?? "",
    seller: normalizeSeller(record.seller ?? record.bill_from),
    invoice_options: normalizeInvoiceOptions(record.invoice_options),
    line_items: Array.isArray(record.line_items) ? record.line_items.map((row) => ({ ...row })) : [],
    selected_modules: record.selected_modules ?? [],
    tax_rate: Number(record.tax_rate ?? 0),
    notes: record.notes ?? "",
    terms: record.terms ?? "",
  };
}
