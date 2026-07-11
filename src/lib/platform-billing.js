import { PLATFORM_BILLING_MODULES } from "@/lib/platform-invoices";
import { PROVISIONABLE_WORKSPACES } from "@/lib/workspace-modules";

/** @typedef {"monthly" | "annual"} BillingInterval */
/** @typedef {"org" | "user"} LicenseBasis */
/** @typedef {"draft" | "sent" | "accepted" | "active" | "expired" | "void"} ContractStatus */
/** @typedef {"quote" | "contract"} ContractKind */
/** @typedef {"trialing" | "active" | "past_due" | "cancelled" | "paused" | "expired"} SubscriptionStatus */

export const PLAN_INTERVALS = [
  { id: "monthly", label: "Monthly" },
  { id: "annual", label: "Yearly" },
];

export function billingIntervalLabel(interval) {
  const id = interval === "yearly" ? "annual" : interval;
  return PLAN_INTERVALS.find((row) => row.id === id)?.label?.toLowerCase() ?? (interval || "monthly");
}

/** Org-wide flat fee vs per named user / seat. */
export const LICENSE_BASIS_OPTIONS = [
  {
    id: "org",
    label: "Organization-based",
    description: "One fee for the whole company regardless of how many users sign in.",
  },
  {
    id: "user",
    label: "User-based (per seat)",
    description: "Fee scales with licensed seats / named users.",
  },
];

/** Centrix applications that can be licensed (matches Choose application + External POS). */
export const LICENSABLE_WORKSPACES = PROVISIONABLE_WORKSPACES.map((ws) => ({
  id: ws.id,
  label: ws.label,
  description: ws.description,
}));

export const SUBSCRIPTION_STATUSES = [
  { id: "trialing", label: "Trialing" },
  { id: "active", label: "Active" },
  { id: "past_due", label: "Overdue" },
  { id: "paused", label: "Paused" },
  { id: "expired", label: "Expired" },
  { id: "cancelled", label: "Cancelled" },
];

export const CONTRACT_KINDS = [
  {
    id: "quote",
    label: "Quote",
    description:
      "A priced proposal you send before the customer commits. They can accept it; you then provision and invoice. Not yet a binding long-term agreement.",
  },
  {
    id: "contract",
    label: "Contract",
    description:
      "The signed commercial agreement (terms, licence, renewal). Use after a quote is accepted, or when the customer is already committed.",
  },
];

export function contractKindHelp(kind) {
  return CONTRACT_KINDS.find((row) => row.id === kind)?.description ?? "";
}

export const CONTRACT_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
  { id: "void", label: "Void" },
];

export const SUBSCRIPTION_STATUS_STYLES = {
  trialing: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  past_due: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
  paused: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
  expired: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-100",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export const CONTRACT_STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  accepted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  expired: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
  void: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
};

/**
 * Default SaaS agreement clauses aligned with Kenyan commercial practice:
 * parties & PIN, scope, licence, fees, Data Protection Act 2019, governing law (Kenya).
 * Super-admin can edit freely before send.
 */
export function defaultKenyaPlatformContractTerms({
  licenseBasis = "org",
  interval = "monthly",
  firstPayment = null,
  renewalPayment = null,
  currency = "KES",
} = {}) {
  const intervalLabel =
    interval === "annual" || interval === "yearly" ? "yearly" : "monthly";
  const licenseLine =
    licenseBasis === "user"
      ? "Licence is granted on a named-user / seat basis. The Customer shall not exceed the licensed seat count without a written variation and corresponding fees."
      : "Licence is granted on an organization-wide basis for the Customer’s registered company code, covering authorised users within that organization.";

  const feeLines = [
    firstPayment != null && firstPayment !== ""
      ? `Initial / first-time payment: ${currency} ${Number(firstPayment).toLocaleString("en-KE")}.`
      : "Initial / first-time payment: as stated in the commercial schedule of this agreement.",
    renewalPayment != null && renewalPayment !== ""
      ? `Renewal payment (${intervalLabel}): ${currency} ${Number(renewalPayment).toLocaleString("en-KE")}.`
      : `Renewal payment (${intervalLabel}): as stated in the commercial schedule of this agreement.`,
  ].join("\n");

  return `SOFTWARE AS A SERVICE (SaaS) AGREEMENT — CENTRIX ERP

1. PARTIES
This Agreement is entered into between the Provider (ALPAC SOFTWARE SOLUTIONS, or as named in the “Provider” block) and the Customer named in the “Customer” block, including each party’s Kenya Revenue Authority PIN where stated.

2. DEFINITIONS
“Platform” means the Centrix ERP cloud software and related applications (including Backoffice, External POS, Distribution, Accounting, Human Resources, and Administration, as selected). “Services” means hosted access, standard support, and updates described herein.

3. SCOPE OF SERVICES
The Provider grants the Customer a non-exclusive, non-transferable right to access and use the selected Centrix applications for the Customer’s internal business operations in Kenya, subject to this Agreement and applicable law.

4. LICENCE BASIS
${licenseLine}
Administration workspace access for company setup is included without separate licence fee unless otherwise agreed in writing.

5. FEES AND PAYMENT
${feeLines}
Fees are exclusive of applicable VAT unless expressly stated as inclusive. Invoices are payable in Kenya Shillings (KES) within the period stated on the invoice. Late payment may result in suspension after written notice.

6. TAX COMPLIANCE
Each party shall comply with Kenyan tax obligations. Where the Provider is required to charge VAT, a tax invoice will be issued. The Customer’s KRA PIN shall be stated for invoicing where required.

7. DATA PROTECTION
The parties shall process personal data in accordance with the Data Protection Act, No. 24 of 2019 (Kenya) and any regulations thereunder. The Customer remains the data controller for its business data; the Provider acts as a processor for hosting and support, and shall implement appropriate technical and organisational measures.

8. CONFIDENTIALITY
Each party shall keep confidential the other party’s non-public business and technical information, except where disclosure is required by law or with prior written consent.

9. SERVICE LEVELS AND SUPPORT
The Provider shall use reasonable efforts to maintain Platform availability and provide standard support during agreed business hours. Scheduled maintenance will be notified in advance where practicable.

10. TERM AND TERMINATION
This Agreement runs for the initial term stated herein and renews per the renewal schedule unless either party gives written notice of non-renewal before the renewal date, or terminates for material breach uncured within thirty (30) days of written notice.

11. LIMITATION OF LIABILITY
Except for fraud, wilful misconduct, or death/personal injury caused by negligence, each party’s aggregate liability under this Agreement is limited to the fees paid by the Customer in the twelve (12) months preceding the claim. Neither party is liable for indirect or consequential loss.

12. GOVERNING LAW AND DISPUTES
This Agreement is governed by the laws of Kenya. The parties shall attempt amicable settlement; failing which, disputes shall be subject to the courts of Kenya (Nairobi).

13. ENTIRE AGREEMENT
This document (including schedules, quotes, and invoices referenced herein) constitutes the entire agreement and supersedes prior negotiations on the same subject. Amendments must be in writing and signed or accepted electronically by authorised representatives.

By accepting this quote/contract, the Customer confirms authority to bind the organization and agrees to these terms.`;
}

export function emptyPlanForm(overrides = {}) {
  return {
    name: "",
    code: "",
    description: "",
    interval: "monthly",
    license_basis: "org",
    price: "",
    first_payment_price: "",
    renewal_price: "",
    currency: "KES",
    seat_limit: "",
    workspace_keys: [],
    module_keys: [],
    is_active: true,
    auto_invoice_template_id: "",
    ...overrides,
  };
}

export function planRecordToForm(record) {
  if (!record) return emptyPlanForm();
  const renewal =
    record.renewal_price != null ? record.renewal_price : record.price;
  const first =
    record.first_payment_price != null ? record.first_payment_price : record.price;
  return {
    name: record.name ?? "",
    code: record.code ?? "",
    description: record.description ?? "",
    interval: record.interval ?? "monthly",
    license_basis: record.license_basis === "user" ? "user" : "org",
    price: renewal != null ? String(renewal) : "",
    first_payment_price: first != null ? String(first) : "",
    renewal_price: renewal != null ? String(renewal) : "",
    currency: record.currency ?? "KES",
    seat_limit: record.seat_limit != null ? String(record.seat_limit) : "",
    workspace_keys: Array.isArray(record.workspace_keys)
      ? [...record.workspace_keys]
      : [],
    module_keys: Array.isArray(record.module_keys) ? [...record.module_keys] : [],
    is_active: record.is_active !== false,
    auto_invoice_template_id: record.auto_invoice_template_id
      ? String(record.auto_invoice_template_id)
      : "",
  };
}

export function planFormToPayload(form) {
  const renewal = Number(form.renewal_price || form.price) || 0;
  const first = Number(form.first_payment_price || form.renewal_price || form.price) || 0;
  return {
    name: form.name.trim(),
    code: form.code.trim() || null,
    description: form.description.trim() || null,
    interval: form.interval || "monthly",
    license_basis: form.license_basis === "user" ? "user" : "org",
    price: renewal,
    first_payment_price: first,
    renewal_price: renewal,
    currency: form.currency || "KES",
    seat_limit:
      form.license_basis === "user"
        ? form.seat_limit === ""
          ? null
          : Number(form.seat_limit)
        : form.seat_limit === ""
          ? null
          : Number(form.seat_limit),
    workspace_keys: form.workspace_keys ?? [],
    module_keys: form.module_keys ?? [],
    is_active: form.is_active !== false,
    auto_invoice_template_id: form.auto_invoice_template_id
      ? Number(form.auto_invoice_template_id)
      : null,
  };
}

export function emptyContractForm(overrides = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    kind: "quote",
    status: "draft",
    organization_id: "",
    plan_id: "",
    title: "",
    reference: "",
    valid_until: "",
    start_date: today,
    end_date: "",
    currency: "KES",
    interval: "monthly",
    license_basis: "org",
    amount: "",
    first_payment_price: "",
    renewal_price: "",
    seat_count: "1",
    workspace_keys: [],
    module_keys: [],
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    customer_address: "",
    customer_tax_pin: "",
    terms: defaultKenyaPlatformContractTerms(),
    notes: "",
    ...overrides,
  };
}

export function contractRecordToForm(record) {
  if (!record) return emptyContractForm();
  const renewal =
    record.renewal_price != null ? record.renewal_price : record.amount;
  const first =
    record.first_payment_price != null ? record.first_payment_price : record.amount;
  return {
    kind: record.kind ?? "quote",
    status: record.status ?? "draft",
    organization_id: record.organization_id ? String(record.organization_id) : "",
    plan_id: record.plan_id ? String(record.plan_id) : "",
    title: record.title ?? "",
    reference: record.reference ?? "",
    valid_until: record.valid_until?.slice?.(0, 10) ?? record.valid_until ?? "",
    start_date: record.start_date?.slice?.(0, 10) ?? record.start_date ?? "",
    end_date: record.end_date?.slice?.(0, 10) ?? record.end_date ?? "",
    currency: record.currency ?? "KES",
    interval: record.interval === "annual" || record.interval === "yearly" ? "annual" : "monthly",
    license_basis: record.license_basis === "user" ? "user" : "org",
    amount: renewal != null ? String(renewal) : "",
    first_payment_price: first != null ? String(first) : "",
    renewal_price: renewal != null ? String(renewal) : "",
    seat_count: record.seat_count != null ? String(record.seat_count) : "1",
    workspace_keys: Array.isArray(record.workspace_keys)
      ? [...record.workspace_keys]
      : [],
    module_keys: Array.isArray(record.module_keys) ? [...record.module_keys] : [],
    customer_name: record.customer_name ?? "",
    customer_email: record.customer_email ?? "",
    customer_phone: record.customer_phone ?? "",
    customer_address: record.customer_address ?? "",
    customer_tax_pin: record.customer_tax_pin ?? "",
    terms: record.terms || defaultKenyaPlatformContractTerms(),
    notes: record.notes ?? "",
  };
}

export function contractFormToPayload(form) {
  const renewal = Number(form.renewal_price || form.amount) || 0;
  const first = Number(form.first_payment_price || form.renewal_price || form.amount) || 0;
  return {
    kind: form.kind || "quote",
    status: form.status || "draft",
    organization_id: form.organization_id ? Number(form.organization_id) : null,
    plan_id: form.plan_id ? Number(form.plan_id) : null,
    title: form.title.trim(),
    reference: form.reference.trim() || null,
    valid_until: form.valid_until || null,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    currency: form.currency || "KES",
    interval: form.interval === "annual" || form.interval === "yearly" ? "annual" : "monthly",
    license_basis: form.license_basis === "user" ? "user" : "org",
    amount: renewal,
    first_payment_price: first,
    renewal_price: renewal,
    seat_count: Number(form.seat_count) || 1,
    workspace_keys: form.workspace_keys ?? [],
    module_keys: form.module_keys ?? [],
    customer_name: form.customer_name?.trim() || null,
    customer_email: form.customer_email?.trim() || null,
    customer_phone: form.customer_phone?.trim() || null,
    customer_address: form.customer_address?.trim() || null,
    customer_tax_pin: form.customer_tax_pin?.trim() || null,
    terms: form.terms.trim() || null,
    notes: form.notes.trim() || null,
  };
}

export function formatBillingMoney(amount, currency = "KES") {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  return `${currency} ${value.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatBillingDate(value) {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function planModuleLabels(moduleKeys = []) {
  const byKey = new Map(PLATFORM_BILLING_MODULES.map((m) => [m.key, m.label]));
  return (moduleKeys ?? []).map((key) => byKey.get(key) ?? key);
}

export function workspaceLabels(workspaceKeys = []) {
  const byKey = new Map(LICENSABLE_WORKSPACES.map((w) => [w.id, w.label]));
  return (workspaceKeys ?? []).map((key) => byKey.get(key) ?? key);
}

export function licenseBasisLabel(basis) {
  return LICENSE_BASIS_OPTIONS.find((row) => row.id === basis)?.label ?? basis ?? "—";
}

export function subscriptionStatusLabel(status) {
  return SUBSCRIPTION_STATUSES.find((row) => row.id === status)?.label ?? status ?? "—";
}

export function contractStatusLabel(status) {
  return CONTRACT_STATUSES.find((row) => row.id === status)?.label ?? status ?? "—";
}

export function contractKindLabel(kind) {
  return CONTRACT_KINDS.find((row) => row.id === kind)?.label ?? kind ?? "—";
}

/** Resolve display prices for an org subscription / agreement. */
export function resolveAgreementPrices(source = {}) {
  const currency = source.currency ?? source.plan?.currency ?? "KES";
  const renewal =
    source.renewal_price ??
    source.plan?.renewal_price ??
    source.amount ??
    source.plan?.price ??
    null;
  const first =
    source.first_payment_price ??
    source.plan?.first_payment_price ??
    renewal;
  return {
    currency,
    first_payment_price: first,
    renewal_price: renewal,
    license_basis: source.license_basis ?? source.plan?.license_basis ?? "org",
    interval:
      source.interval === "annual" ||
      source.interval === "yearly" ||
      source.plan?.interval === "annual" ||
      source.plan?.interval === "yearly"
        ? "annual"
        : source.interval ?? source.plan?.interval ?? "monthly",
  };
}

/** True when subscription should show as overdue in UI. */
export function isSubscriptionOverdue(sub) {
  if (!sub) return false;
  if (sub.status === "past_due") return true;
  if (sub.status === "cancelled" || sub.status === "paused") return false;
  if (!sub.current_period_end) return false;
  const end = new Date(`${String(sub.current_period_end).slice(0, 10)}T23:59:59`);
  return end.getTime() < Date.now() && sub.status === "active";
}
