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
  watermark_text: "CentrixERP",
  watermark_logo_url: "",
  brand_mode: "name",
  brand_name: "CentrixERP",
  brand_logo_url: "",
};

export const DEFAULT_PLATFORM_SELLER = {
  name: "CentrixERP",
  email: "",
  phone: "",
  address: "",
  tax_pin: "",
};

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
  return {
    module_key: summary.key,
    description: summary.description || summary.label,
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
    seller: normalizeSeller(record.seller),
    invoice_options: normalizeInvoiceOptions(record.invoice_options),
    line_items: Array.isArray(record.line_items) ? record.line_items.map((row) => ({ ...row })) : [],
    selected_modules: record.selected_modules ?? [],
    tax_rate: Number(record.tax_rate ?? 0),
    notes: record.notes ?? "",
    terms: record.terms ?? "",
  };
}
