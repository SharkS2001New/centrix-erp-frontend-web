/** Default workflow mirrors config/erp.php default_order_workflow. */
import {
  isOrderCancellationEnabled,
  ORDER_CANCELLABLE_STATUSES,
} from "@/lib/platform-org-features";

export const DEFAULT_ORDER_WORKFLOW = {
  steps: [
    { status: "booked", label: "Booked", enabled: true },
    { status: "pending", label: "Pending", enabled: true },
    { status: "unpaid", label: "Unpaid", enabled: true },
    { status: "pending_payment", label: "Partially paid", enabled: true },
    { status: "paid", label: "Paid", enabled: true },
    { status: "processed", label: "Processed", enabled: true },
    { status: "delivered", label: "Delivered", enabled: true },
    { status: "completed", label: "Completed", enabled: true },
  ],
  transitions: {
    booked: ["pending", "unpaid", "processed", "cancelled"],
    pending: ["unpaid", "pending_payment", "processed", "cancelled"],
    unpaid: ["pending_payment", "paid", "processed", "cancelled"],
    pending_payment: ["paid", "cancelled"],
    paid: ["processed", "delivered", "completed"],
    processed: ["delivered", "completed"],
    delivered: ["completed"],
    draft: ["held", "completed", "booked", "cancelled"],
    held: ["draft", "booked", "completed", "cancelled"],
  },
  save_status: {
    pos: "unpaid",
    mobile: "unpaid",
    backend: "unpaid",
  },
  checkout: {
    full_paid: { pos: "completed", mobile: "paid", backend: "paid" },
    partial: "pending_payment",
    unpaid: { pos: "unpaid", mobile: "unpaid", backend: "unpaid" },
  },
  deduct_stock_on: {
    pos: "completed",
    mobile: "completed",
    backend: "completed",
  },
  reserve_stock_on: {
    pos: "unpaid",
    mobile: "unpaid",
    backend: "unpaid",
  },
};

export const ORDER_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "held", label: "Held" },
  { value: "booked", label: "Booked" },
  { value: "pending", label: "Pending" },
  { value: "unpaid", label: "Unpaid" },
  { value: "pending_payment", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "processed", label: "Processed" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

const STOCK_CHANNELS = ["pos", "mobile", "backend"];

/** Normalize legacy string or partial map to per-channel status map. */
export function normalizeChannelStatusMap(value, fallback = "unpaid") {
  const defaults = {};
  for (const ch of STOCK_CHANNELS) {
    defaults[ch] = typeof fallback === "object" ? (fallback[ch] ?? fallback.backend ?? "unpaid") : fallback;
  }
  if (typeof value === "string" && value) {
    return { pos: value, mobile: value, backend: value };
  }
  if (value && typeof value === "object") {
    return { ...defaults, ...value };
  }
  return defaults;
}

/** Drop transitions and status references that no longer exist in the pipeline. */
export function sanitizeWorkflowReferences(workflow) {
  const wf = workflow ?? DEFAULT_ORDER_WORKFLOW;
  const enabledStatuses = new Set(
    wf.steps.filter((s) => s.enabled !== false).map((s) => s.status),
  );
  const firstEnabled = [...enabledStatuses][0] ?? "unpaid";

  function pickRef(status) {
    if (!status) return status;
    if (enabledStatuses.has(status)) return status;
    return firstEnabled;
  }

  const save_status = { ...wf.save_status };
  for (const ch of ["pos", "mobile", "backend"]) {
    if (save_status[ch]) save_status[ch] = pickRef(save_status[ch]);
  }

  const checkout = { ...wf.checkout, full_paid: { ...wf.checkout?.full_paid }, unpaid: { ...wf.checkout?.unpaid } };
  if (checkout.partial) checkout.partial = pickRef(checkout.partial);
  for (const ch of ["pos", "mobile", "backend"]) {
    if (checkout.full_paid?.[ch]) checkout.full_paid[ch] = pickRef(checkout.full_paid[ch]);
    if (checkout.unpaid?.[ch]) checkout.unpaid[ch] = pickRef(checkout.unpaid[ch]);
  }

  const reserve_stock_on = normalizeChannelStatusMap(
    wf.reserve_stock_on,
    DEFAULT_ORDER_WORKFLOW.reserve_stock_on,
  );
  const deduct_stock_on = normalizeChannelStatusMap(
    wf.deduct_stock_on,
    DEFAULT_ORDER_WORKFLOW.deduct_stock_on,
  );
  for (const ch of STOCK_CHANNELS) {
    reserve_stock_on[ch] = pickRef(reserve_stock_on[ch]);
    deduct_stock_on[ch] = pickRef(deduct_stock_on[ch]);
  }

  return {
    ...wf,
    save_status,
    checkout,
    reserve_stock_on,
    deduct_stock_on,
  };
}

function deepMergeWorkflow(base, custom) {
  if (!custom || typeof custom !== "object") return structuredClone(base);
  const out = structuredClone(base);
  if (Array.isArray(custom.steps) && custom.steps.length > 0) {
    out.steps = custom.steps.map((s) => ({
      status: s.status,
      label: s.label ?? s.status,
      enabled: s.enabled !== false,
    }));
  }
  if (custom.transitions) out.transitions = { ...out.transitions, ...custom.transitions };
  if (custom.save_status) out.save_status = { ...out.save_status, ...custom.save_status };
  if (custom.checkout) {
    out.checkout = { ...out.checkout, ...custom.checkout };
    if (custom.checkout.full_paid) {
      out.checkout.full_paid = { ...out.checkout.full_paid, ...custom.checkout.full_paid };
    }
    if (custom.checkout.unpaid) {
      out.checkout.unpaid = { ...out.checkout.unpaid, ...custom.checkout.unpaid };
    }
  }
  if (custom.deduct_stock_on) {
    out.deduct_stock_on = normalizeChannelStatusMap(
      custom.deduct_stock_on,
      out.deduct_stock_on,
    );
  }
  if (custom.reserve_stock_on) {
    out.reserve_stock_on = normalizeChannelStatusMap(
      custom.reserve_stock_on,
      out.reserve_stock_on,
    );
  }
  return out;
}

export function mergeOrderWorkflow(salesSettings) {
  const merged = deepMergeWorkflow(DEFAULT_ORDER_WORKFLOW, salesSettings?.order_workflow);
  return salesSettings?.order_workflow?.steps?.length
    ? sanitizeWorkflowReferences(merged)
    : merged;
}

function applySavedWorkflowLabels(workflow, savedConfig) {
  if (!savedConfig?.steps?.length || !workflow) return workflow;
  const labels = { ...(workflow.labels ?? {}) };
  for (const step of savedConfig.steps) {
    if (step.status) {
      labels[step.status] = step.label || step.status;
    }
  }
  const pipeline = dedupePipelineSteps(
    (workflow.pipeline ?? []).map((step) => ({
      ...step,
      label: labels[step.key] ?? step.label,
    })),
  );
  return { ...workflow, labels, pipeline };
}

/** Resolve the sales channel key for an order record. */
export function resolveOrderChannel(order, fallback = "backend") {
  const channel = String(order?.channel ?? fallback).toLowerCase();
  return ["pos", "mobile", "backend"].includes(channel) ? channel : fallback;
}

/** Resolved per-channel workflow from /erp/capabilities workflows. */
export function getChannelWorkflow(capabilities, channel = "backend") {
  const saved = mergeOrderWorkflow(capabilities?.module_settings?.sales);
  const fromCaps = capabilities?.workflows?.[channel];
  if (fromCaps?.pipeline?.length) {
    return applySavedWorkflowLabels(fromCaps, saved);
  }
  if (saved?.steps?.length) {
    return buildChannelWorkflow(saved, channel);
  }
  return buildChannelWorkflow(DEFAULT_ORDER_WORKFLOW, channel);
}

/** Sidebar + queue pages — pipeline step order from saved org workflow config. */
export function getSalesOrderQueueWorkflow(capabilities, channel = "backend") {
  const sales = capabilities?.module_settings?.sales;
  const saved = mergeOrderWorkflow(sales);
  if (sales?.order_workflow?.steps?.length) {
    return buildChannelWorkflow(saved, channel);
  }
  return getChannelWorkflow(capabilities, channel);
}

/** Workflow for a specific order — prefers API payload, then saved org config. */
export function getOrderWorkflow(capabilities, order, fallbackChannel = "backend") {
  if (order?.workflow?.pipeline?.length) {
    return order.workflow;
  }
  return getChannelWorkflow(capabilities, resolveOrderChannel(order, fallbackChannel));
}

function dedupePipelineSteps(steps) {
  const seen = new Set();
  const out = [];
  for (const step of steps ?? []) {
    const key = step?.key ?? step?.status;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(
      step.key
        ? step
        : { key, label: step.label ?? key },
    );
  }
  return out;
}

function buildPipelineTransitions(pipeline) {
  const keys = pipeline.map((s) => s.key);
  const transitions = {};
  keys.forEach((from, index) => {
    const targets = [];
    if (index > 0) targets.push(keys[index - 1]);
    if (index < keys.length - 1) targets.push(keys[index + 1]);
    transitions[from] = targets;
  });

  const processedIdx = keys.indexOf("processed");
  if (processedIdx >= 0) {
    const skipFrom = new Set(["cancelled", "expired", "draft", "held", "processed", "delivered", "completed"]);
    keys.forEach((from, index) => {
      if (index >= processedIdx || skipFrom.has(from)) return;
      transitions[from] = [...new Set([...(transitions[from] ?? []), "processed"])];
    });
  }

  return transitions;
}

function buildChannelWorkflow(config, channel) {
  const enabled = config.steps.filter((s) => s.enabled !== false).map((s) => s.status);
  const labels = Object.fromEntries(config.steps.map((s) => [s.status, s.label || s.status]));
  const pipeline = dedupePipelineSteps(
    config.steps
      .filter((s) => s.enabled !== false)
      .map((s) => ({ key: s.status, label: s.label || s.status })),
  );

  return {
    statuses: enabled,
    labels,
    pipeline,
    transitions: buildPipelineTransitions(pipeline),
    save_status: config.save_status?.[channel] ?? config.save_status?.default ?? "unpaid",
    checkout: {
      full_paid: config.checkout?.full_paid?.[channel] ?? config.checkout?.full_paid?.default ?? "paid",
      partial: config.checkout?.partial ?? "pending_payment",
      unpaid: config.checkout?.unpaid?.[channel] ?? config.checkout?.unpaid?.default ?? "unpaid",
    },
  };
}

export function workflowStatusLabel(workflow, status) {
  const key = String(status ?? "").toLowerCase();
  const aligned = workflow ? alignStatusToWorkflow(key, workflow) : key;
  return workflow?.labels?.[aligned] ?? DEFAULT_ORDER_WORKFLOW.steps.find((s) => s.status === aligned)?.label ?? aligned;
}

export function workflowPipelineSteps(workflow) {
  if (workflow?.pipeline?.length) return dedupePipelineSteps(workflow.pipeline);
  return dedupePipelineSteps(
    DEFAULT_ORDER_WORKFLOW.steps.map((s) => ({ key: s.status, label: s.label })),
  );
}

/** Last enabled pipeline step for this org/channel — orders here are "finished". */
export function lastPipelineStatus(workflow) {
  const steps = workflowPipelineSteps(workflow);
  return steps.length ? steps[steps.length - 1].key : null;
}

export function isTerminalStatus(status, workflow) {
  const key = String(status ?? "").toLowerCase();
  if (!key || key === "cancelled" || key === "held" || key === "draft") return false;
  const last = lastPipelineStatus(workflow);
  return last != null && alignStatusToWorkflow(key, workflow) === last;
}

export function normalizeSalesChannel(channel = "backend") {
  const key = String(channel ?? "backend").toLowerCase();
  return key === "backoffice" ? "backend" : key;
}

/** Statuses stored on sales after a fully-paid checkout for this org/channel workflow. */
export function checkoutCompleteStatuses(workflow, channel = "backend") {
  const normalized = normalizeSalesChannel(channel);
  const wf = workflow ?? buildChannelWorkflow(DEFAULT_ORDER_WORKFLOW, normalized);
  const fullPaid = pickEnabledStatus(wf.checkout?.full_paid ?? "paid", wf);
  const terminal = lastPipelineStatus(wf);
  const statuses = new Set([fullPaid]);

  if (terminal) {
    statuses.add(terminal);
    for (const alias of ["completed", "delivered", "processed", "paid"]) {
      if (alignStatusToWorkflow(alias, wf) === terminal) {
        statuses.add(alias);
      }
    }
  }

  return [...statuses];
}

/** Statuses an order may have to be restored back into a cart for editing. */
export function restorableToCartStatuses(workflow, { allowCheckoutReEdit = false } = {}) {
  const allowed = workflow?.statuses ?? [];
  const terminal = lastPipelineStatus(workflow);
  const restorable = new Set(["held", "draft"]);

  for (const status of allowed) {
    if (status === "cancelled") continue;
    if (terminal && status === terminal && !allowCheckoutReEdit) continue;
    restorable.add(status);
  }

  return [...restorable];
}

export function isCheckoutCompleteStatus(status, workflow, channel = "pos") {
  const key = String(status ?? "").toLowerCase();
  if (!key) return false;
  const completeStatuses = checkoutCompleteStatuses(workflow, channel);
  const aligned = alignStatusToWorkflow(key, workflow);
  return completeStatuses.includes(key) || completeStatuses.includes(aligned);
}

export function isRestorableToCartStatus(status, workflow, { allowCheckoutReEdit = false } = {}) {
  const key = String(status ?? "").toLowerCase();
  const restorable = restorableToCartStatuses(workflow, { allowCheckoutReEdit });
  const aligned = alignStatusToWorkflow(key, workflow);
  return restorable.includes(key) || restorable.includes(aligned);
}

/** Map stored statuses (e.g. completed) to the nearest org pipeline step for display. */
export function alignStatusToWorkflow(status, workflow) {
  const key = String(status ?? "").toLowerCase();
  if (!key || key === "cancelled" || key === "held" || key === "draft") return key;
  const steps = workflowPipelineSteps(workflow);
  if (steps.some((step) => step.key === key)) return key;
  return pickEnabledStatus(key, workflow);
}

/** Whether this pipeline status may be cancelled (booked, pending, unpaid only). */
export function canCancelOrderStatus(status, workflow) {
  const key = String(status ?? "").toLowerCase();
  if (!key || key === "cancelled" || key === "expired" || key === "held" || key === "draft") {
    return false;
  }
  const aligned = alignStatusToWorkflow(key, workflow);
  return ORDER_CANCELLABLE_STATUSES.has(aligned);
}

/** Whether staff should be offered cancel for this order (settings + status). */
export function canCancelOrder(saleOrStatus, workflow, capabilities) {
  if (capabilities && !isOrderCancellationEnabled(capabilities)) return false;
  const status = typeof saleOrStatus === "object" ? saleOrStatus?.status : saleOrStatus;
  return canCancelOrderStatus(status, workflow);
}

export function workflowTransitions(workflow) {
  return workflow?.transitions ?? DEFAULT_ORDER_WORKFLOW.transitions;
}

export function pipelineStatusIndex(status, workflow) {
  const aligned = alignStatusToWorkflow(status, workflow);
  const steps = workflowPipelineSteps(workflow);
  return steps.findIndex((s) => s.key === aligned);
}

export function pipelineStepIndex(status, workflow) {
  const idx = pipelineStatusIndex(status, workflow);
  return idx >= 0 ? idx : 0;
}

/** Adjacent pipeline steps only — move one stage up or down. */
export function pipelineAdjacentTransitions(status, workflow) {
  const explicit = workflow?.transitions?.[status];
  if (Array.isArray(explicit) && explicit.length > 0) {
    const options = [...explicit];
    if (canCancelOrderStatus(status, workflow) && !options.includes("cancelled")) {
      options.push("cancelled");
    }
    return [...new Set(options)];
  }

  const steps = workflowPipelineSteps(workflow);
  const keys = steps.map((s) => s.key);
  const idx = keys.indexOf(status);
  const options = [];

  if (idx >= 0) {
    if (idx > 0) options.push(keys[idx - 1]);
    if (idx < keys.length - 1) options.push(keys[idx + 1]);
  } else if (status === "held" || status === "draft") {
    if (keys.length) options.push(keys[0]);
  }

  const processedIdx = keys.indexOf("processed");
  if (processedIdx >= 0 && idx >= 0 && idx < processedIdx) {
    options.push("processed");
  }

  if (canCancelOrderStatus(status, workflow)) {
    options.push("cancelled");
  }
  return [...new Set(options)];
}

const STATUS_FALLBACKS = {
  completed: ["completed", "delivered", "paid", "processed"],
  delivered: ["delivered", "completed", "processed", "paid"],
  paid: ["paid", "completed", "delivered", "processed"],
  processed: ["processed", "delivered", "paid", "completed"],
  pending_payment: ["pending_payment", "unpaid", "pending"],
  unpaid: ["unpaid", "pending", "booked"],
  pending: ["pending", "booked", "unpaid"],
  booked: ["booked", "pending", "unpaid"],
};

export function isImmediatePaymentMethod(paymentMethodCode, isCredit = false) {
  if (isCredit) return false;
  const code = String(paymentMethodCode ?? "").toUpperCase();
  if (!code || code.includes("CREDIT")) return false;
  return (
    code.includes("CASH") ||
    code.includes("MPESA") ||
    code.includes("M-PESA") ||
    code.includes("EQUITY") ||
    code.includes("KCB") ||
    code.includes("BANK") ||
    code.includes("CHEQUE") ||
    code.includes("OTHER")
  );
}

export function pickEnabledStatus(preferred, workflow) {
  const enabled = new Set(
    workflow?.statuses ?? workflowPipelineSteps(workflow).map((s) => s.key),
  );
  const candidates = STATUS_FALLBACKS[preferred] ?? [preferred];
  for (const status of candidates) {
    if (enabled.has(status)) return status;
  }
  const pipeline = workflowPipelineSteps(workflow);
  if (pipeline.length) return pipeline[pipeline.length - 1].key;
  return preferred;
}

export function nextTransitionOptions(status, workflow) {
  return pipelineAdjacentTransitions(status, workflow).filter((s) => s !== status);
}

/** Next forward workflow step for list-row confirm actions. */
export function primaryWorkflowAdvanceStatus(status, workflow) {
  if (!status || status === "cancelled" || isTerminalStatus(status, workflow)) return null;

  const steps = workflowPipelineSteps(workflow);
  const currentIdx = pipelineStatusIndex(status, workflow);
  const allowed = new Set(
    pipelineAdjacentTransitions(status, workflow).filter((s) => s !== status && s !== "cancelled"),
  );
  if (!allowed.size) return null;

  if ((status === "held" || status === "draft") && steps[0]?.key && allowed.has(steps[0].key)) {
    return steps[0].key;
  }

  if (currentIdx >= 0 && currentIdx < steps.length - 1) {
    const next = steps[currentIdx + 1]?.key;
    if (next && allowed.has(next)) return next;
  }

  for (let i = currentIdx + 1; i < steps.length; i += 1) {
    const key = steps[i]?.key;
    if (key && allowed.has(key)) return key;
  }

  return [...allowed][0] ?? null;
}

/**
 * Resolve order status from payment amount — uses the org workflow checkout mapping.
 */
export function resolveCheckoutStatus({
  channel = "pos",
  isCredit = false,
  payNow = 0,
  total = 0,
  workflow,
  paymentMethodCode = "CASH",
  allowPartialPayment = false,
}) {
  const wf = workflow ?? buildChannelWorkflow(DEFAULT_ORDER_WORKFLOW, channel);
  const checkout = wf.checkout ?? {};
  const paid = Number(payNow) || 0;
  const orderTotal = Number(total) || 0;
  const fullyPaid = paid + 0.01 >= orderTotal && orderTotal > 0;
  const partialPay = paid > 0.01 && !fullyPaid;

  if (fullyPaid) {
    return pickEnabledStatus(checkout.full_paid ?? "paid", wf);
  }
  if (partialPay) {
    return pickEnabledStatus(checkout.partial ?? "pending_payment", wf);
  }
  if (isCredit || allowPartialPayment) {
    return pickEnabledStatus(checkout.unpaid ?? "unpaid", wf);
  }
  return pickEnabledStatus(checkout.unpaid ?? "unpaid", wf);
}

export function firstPipelineStatus(workflow) {
  const steps = workflowPipelineSteps(workflow);
  return steps[0]?.key ?? null;
}

export function resolveSaveOrderStatus({ channel, workflow, hold = false }) {
  if (hold) return "held";
  const wf = workflow ?? buildChannelWorkflow(DEFAULT_ORDER_WORKFLOW, channel);
  const configured = wf.save_status ?? firstPipelineStatus(wf) ?? "unpaid";
  return pickEnabledStatus(configured, wf);
}

export function resolveSaveOrderStatusLabel({ channel, workflow, hold = false }) {
  const status = resolveSaveOrderStatus({ channel, workflow, hold });
  return workflowStatusLabel(workflow, status);
}

export function workflowStatusFilterOptions(workflow) {
  const options = [{ value: "all", label: "All statuses" }];
  const seen = new Set(["all"]);
  for (const step of workflowPipelineSteps(workflow)) {
    if (seen.has(step.key)) continue;
    seen.add(step.key);
    options.push({ value: step.key, label: step.label });
  }
  if (!seen.has("cancelled")) {
    options.push({ value: "cancelled", label: "Cancelled" });
  }
  return options;
}

/** Enabled pipeline statuses (+ cancelled) shown when the filter is "All statuses". */
export function workflowListableStatusKeys(workflow) {
  const keys = new Set();
  for (const step of workflowPipelineSteps(workflow)) {
    const key = step.key;
    if (key && !["draft", "held"].includes(key)) {
      keys.add(key);
    }
  }
  keys.add("cancelled");
  keys.add("expired");
  return keys;
}

export function matchesWorkflowStatusFilter(sale, statusFilter, workflow) {
  const status = String(sale?.status ?? "").toLowerCase();
  if (statusFilter && statusFilter !== "all") {
    return status === statusFilter;
  }
  return workflowListableStatusKeys(workflow).has(status);
}

/** Orders excluded from pipeline queues and active-order metrics. */
export const ORDER_METRICS_EXCLUDED_STATUSES = new Set(["cancelled", "expired"]);

const QUEUE_EXCLUDED_STATUSES = new Set(["draft", "held", "cancelled", "expired"]);

export function salesOrderQueueTitle(pageName) {
  const trimmed = String(pageName ?? "").trim();
  if (!trimmed) return "Orders";
  if (trimmed.toLowerCase().endsWith(" orders")) return trimmed;
  return `${trimmed} Orders`;
}

/** Sidebar order links — shorter labels; mobile queue is injected under Field sales. */
export function salesOrderSidebarNavItems(workflow, { excludeMobile = true } = {}) {
  return salesOrderQueueNavItems(workflow, { includeMobile: !excludeMobile })
    .filter((item) => (excludeMobile ? item.slug !== "mobile" : true))
    .map((item) => ({
      ...item,
      label:
        item.slug === "all"
          ? "All orders"
          : item.slug === "mobile"
            ? "Mobile orders"
            : String(item.label).replace(/ Orders$/i, ""),
    }));
}

/** Full order queue list (filters, routes, search). */
export function salesOrderQueueNavItems(workflow, { includeMobile = false } = {}) {
  const items = [
    { slug: "all", label: salesOrderQueueTitle("View All"), href: "/sales/orders" },
  ];
  for (const step of workflowPipelineSteps(workflow)) {
    if (QUEUE_EXCLUDED_STATUSES.has(step.key)) continue;
    items.push({
      slug: step.key,
      label: salesOrderQueueTitle(step.label),
      href: `/sales/orders/queues/${step.key}`,
    });
  }
  if (includeMobile) {
    items.push({
      slug: "mobile",
      label: salesOrderQueueTitle("Mobile"),
      href: "/sales/orders/queues/mobile",
    });
  }
  return items;
}

/** Backoffice sales sidebar — terminal order queues (cancelled / expired). */
export function salesTerminalOrderQueueNavItems({ showCancelled = false, showExpired = false } = {}) {
  const items = [];
  if (showCancelled) {
    items.push({
      slug: "cancelled",
      label: salesOrderQueueTitle("Cancelled"),
      href: "/sales/orders/queues/cancelled",
    });
  }
  if (showExpired) {
    items.push({
      slug: "expired",
      label: salesOrderQueueTitle("Expired"),
      href: "/sales/orders/queues/expired",
    });
  }
  return items;
}

/** Distribution workspace — route orders only (terminal queues live under backoffice Sales). */
export function distributionOrderQueueNavItems() {
  return [
    { slug: "all", label: "Route orders", href: "/fulfillment/orders" },
  ];
}

export function resolveSalesOrderQueue(slug, workflow, { includeMobile = true } = {}) {
  if (!slug || slug === "all") {
    return {
      slug: "all",
      title: salesOrderQueueTitle("View All"),
      subtitle: "Browse and manage every sales order in your workflow",
      fixedStatusFilter: null,
      fixedSourceFilter: null,
      showRouteColumn: false,
      showDeliveryDateColumn: false,
      lockStatusFilter: false,
      lockSourceFilter: false,
    };
  }
  if (slug === "mobile") {
    if (!includeMobile) return null;
    return {
      slug: "mobile",
      title: salesOrderQueueTitle("Mobile"),
      subtitle: "Orders placed via the mobile sales channel",
      fixedStatusFilter: null,
      fixedSourceFilter: "mobile",
      showRouteColumn: true,
      showDeliveryDateColumn: true,
      showConnectivityColumn: true,
      lockStatusFilter: false,
      lockSourceFilter: true,
    };
  }
  if (slug === "cancelled") {
    return {
      slug: "cancelled",
      title: salesOrderQueueTitle("Cancelled"),
      subtitle: "Orders cancelled manually or voided before completion",
      fixedStatusFilter: "cancelled",
      fixedSourceFilter: null,
      showRouteColumn: true,
      showDeliveryDateColumn: true,
      lockStatusFilter: true,
      lockSourceFilter: false,
      dateRangeDays: 30,
      excludeFromMetrics: true,
    };
  }
  if (slug === "expired") {
    return {
      slug: "expired",
      title: salesOrderQueueTitle("Expired"),
      subtitle: "Orders auto-closed after sitting too long without being processed",
      fixedStatusFilter: "expired",
      fixedSourceFilter: null,
      showRouteColumn: true,
      showDeliveryDateColumn: true,
      lockStatusFilter: true,
      lockSourceFilter: false,
      dateRangeDays: 30,
      excludeFromMetrics: true,
    };
  }
  const step = workflowPipelineSteps(workflow).find((s) => s.key === slug);
  if (!step) return null;

  const paymentStatusFilter = paymentStatusForCollectionQueue(step.key);
  if (paymentStatusFilter) {
    return {
      slug: step.key,
      title: salesOrderQueueTitle(step.label),
      subtitle:
        step.key === "unpaid"
          ? "Orders with an outstanding balance (any workflow step)"
          : "Orders with a partial payment recorded (any workflow step)",
      fixedStatusFilter: null,
      fixedPaymentStatusFilter: paymentStatusFilter,
      fixedSourceFilter: null,
      showRouteColumn: true,
      showDeliveryDateColumn: true,
      lockStatusFilter: true,
      lockSourceFilter: false,
      excludeTerminalStatuses: true,
    };
  }

  return {
    slug: step.key,
    title: salesOrderQueueTitle(step.label),
    subtitle: `Orders currently in ${step.label.toLowerCase()} status`,
    fixedStatusFilter: step.key,
    fixedSourceFilter: null,
    showRouteColumn: false,
    showDeliveryDateColumn: false,
    lockStatusFilter: true,
    lockSourceFilter: false,
  };
}

/** Status filter options from admin order workflow settings (enabled pipeline steps). */
export function workflowStatusFilterOptionsFromConfig(config) {
  const options = [{ value: "all", label: "All statuses" }];
  const seen = new Set(["all"]);
  for (const step of config?.steps ?? []) {
    if (step.enabled === false || !step.status || seen.has(step.status)) continue;
    seen.add(step.status);
    options.push({
      value: step.status,
      label: step.label || workflowStatusLabel(null, step.status),
    });
  }
  if (!seen.has("cancelled")) {
    options.push({ value: "cancelled", label: "Cancelled" });
  }
  if (!seen.has("expired")) {
    options.push({ value: "expired", label: "Expired" });
  }
  return options;
}

const PAYMENT_STEP_KEYS = new Set(["unpaid", "pending_payment", "paid"]);

/** Workflow steps where payment collection is the primary action (Unpaid / Partially paid). */
export const PAYMENT_COLLECT_WORKFLOW_STATUSES = new Set(["unpaid", "pending_payment"]);

export function isPaymentCollectWorkflowStatus(status) {
  return PAYMENT_COLLECT_WORKFLOW_STATUSES.has(String(status ?? "").toLowerCase());
}

export function saleBalanceDue(sale, totalPaid = null) {
  const paid = totalPaid ?? Number(sale?.amount_paid ?? 0);
  return Math.max(0, Number(sale?.order_total ?? 0) - paid);
}

/**
 * Whether staff should be offered "Collect payment" for this order.
 * Only on Unpaid / Partially paid workflow steps while balance remains.
 */
export function saleNeedsPaymentCollection(sale, totalPaid = null) {
  if (!sale || sale.status === "cancelled" || sale.status === "expired" || sale.status === "completed") {
    return false;
  }
  if (!isPaymentCollectWorkflowStatus(sale.status)) return false;

  const balance = saleBalanceDue(sale, totalPaid);
  if (balance <= 0.01) return false;

  const paymentStatus = String(sale.payment_status ?? "unpaid").toLowerCase();
  return paymentStatus === "unpaid" || paymentStatus === "partial";
}

/** Whether payment can be recorded from order summary / AR (any active workflow step). */
export function canRecordOrderPayment(sale, totalPaid = null) {
  if (!sale || sale.status === "cancelled" || sale.status === "expired") return false;
  const balance = saleBalanceDue(sale, totalPaid);
  if (balance <= 0.01) return false;
  const paymentStatus = String(sale.payment_status ?? "unpaid").toLowerCase();
  return paymentStatus === "unpaid" || paymentStatus === "partial";
}

/** Block manual workflow moves that skip recording payment. */
export function isPaymentGatedWorkflowTransition(sale, targetStatus, totalPaid = null) {
  if (!sale || sale.status === "cancelled" || sale.status === "expired") return false;
  const target = String(targetStatus ?? "").toLowerCase();
  const balance = saleBalanceDue(sale, totalPaid);
  const paid = totalPaid ?? Number(sale.amount_paid ?? 0);
  if (balance <= 0.01) return false;
  if (target === "paid") return true;
  if (target === "pending_payment" && paid <= 0.01) return true;
  return false;
}

/** Next fulfillment step when payment can be collected later (e.g. unpaid → processed). */
function primaryFulfillmentAdvanceStatus(status, workflow, sale, totalPaid) {
  const allowed = new Set(
    pipelineAdjacentTransitions(status, workflow).filter((s) => s !== status && s !== "cancelled"),
  );
  const steps = workflowPipelineSteps(workflow);
  const processedIdx = steps.findIndex((s) => s.key === "processed");
  if (processedIdx < 0) return null;
  const currentIdx = pipelineStatusIndex(status, workflow);
  if (currentIdx < 0 || currentIdx >= processedIdx) return null;

  for (let i = processedIdx; i < steps.length; i += 1) {
    const key = steps[i].key;
    if (!allowed.has(key)) continue;
    if (PAYMENT_STEP_KEYS.has(key)) continue;
    if (isPaymentGatedWorkflowTransition(sale, key, totalPaid)) continue;
    return key;
  }

  return null;
}

/** Map payment-collection queue slugs to sales.payment_status values. */
export const PAYMENT_COLLECTION_QUEUE_FILTERS = {
  unpaid: "unpaid",
  pending_payment: "partial",
};

export function isPaymentCollectionQueueSlug(slug) {
  return Object.prototype.hasOwnProperty.call(PAYMENT_COLLECTION_QUEUE_FILTERS, String(slug ?? ""));
}

export function paymentStatusForCollectionQueue(slug) {
  return PAYMENT_COLLECTION_QUEUE_FILTERS[String(slug ?? "")] ?? null;
}

/**
 * Decide whether to show Collect payment vs advance workflow — never both at once.
 */
export function resolveOrderWorkflowActions(sale, workflow, totalPaid = null) {
  const status = String(sale?.status ?? "").toLowerCase();
  if (!sale || status === "cancelled" || status === "expired" || status === "completed") {
    return { showCollectPayment: false, advanceStatus: null, balanceDue: 0 };
  }

  const balanceDue = saleBalanceDue(sale, totalPaid);
  const onPaymentStep = isPaymentCollectWorkflowStatus(status);
  const isCredit = Boolean(sale.is_credit_sale);
  let advanceStatus = primaryWorkflowAdvanceStatus(status, workflow);

  if (advanceStatus && isPaymentGatedWorkflowTransition(sale, advanceStatus, totalPaid)) {
    const fulfillmentAdvance = primaryFulfillmentAdvanceStatus(status, workflow, sale, totalPaid);
    advanceStatus = fulfillmentAdvance ?? null;
  }

  const advanceIsPaymentStep =
    advanceStatus && PAYMENT_STEP_KEYS.has(String(advanceStatus).toLowerCase());
  const canFulfillWithoutPayment =
    isCredit && onPaymentStep && advanceStatus && !advanceIsPaymentStep;

  let showCollectPayment = saleNeedsPaymentCollection(sale, totalPaid);
  if (canFulfillWithoutPayment) {
    showCollectPayment = false;
  }

  let resolvedAdvance = null;
  if (advanceStatus && !isPaymentGatedWorkflowTransition(sale, advanceStatus, totalPaid)) {
    if (canFulfillWithoutPayment || !showCollectPayment) {
      resolvedAdvance = advanceStatus;
    }
  }

  return {
    showCollectPayment,
    advanceStatus: resolvedAdvance,
    balanceDue,
  };
}

/** Timeline events from the org workflow pipeline (backend labels + step order). */
export function buildOrderWorkflowTimeline(sale, workflow, options = {}) {
  const { actor = "System", payments = [], stepDetail = null } = options;
  const events = [];
  const currentStatus = String(sale?.status ?? "").toLowerCase();
  const steps = workflowPipelineSteps(workflow);
  const currentIdx = pipelineStatusIndex(currentStatus, workflow);

  function resolveDetail(step) {
    if (typeof stepDetail === "function") {
      return stepDetail(sale, step, payments, workflow);
    }
    return `Order marked as ${step.label.toLowerCase()}.`;
  }

  function resolveTimestamp(stepIndex, isCurrent) {
    if (isCurrent) {
      return sale.completed_at ?? sale.updated_at ?? sale.created_at;
    }
    if (stepIndex === 0) return sale.created_at;
    return sale.updated_at ?? sale.created_at;
  }

  if (currentStatus === "draft" || currentStatus === "held") {
    events.push({
      key: currentStatus,
      title: workflowStatusLabel(workflow, currentStatus),
      detail: currentStatus === "held" ? "Order is on hold." : "Order is saved as a draft.",
      at: sale.updated_at ?? sale.created_at,
      actor,
      complete: currentStatus === "held",
      current: true,
    });
  }

  if (currentIdx >= 0) {
    for (let i = 0; i <= currentIdx; i += 1) {
      const step = steps[i];
      const isCurrent = i === currentIdx && currentStatus !== "cancelled";
      events.push({
        key: step.key,
        title: step.label,
        detail: resolveDetail(step),
        at: resolveTimestamp(i, isCurrent),
        actor: payments[0]?.recorded_by_name ?? actor,
        complete: !isCurrent || isTerminalStatus(currentStatus, workflow),
        current: isCurrent && !isTerminalStatus(currentStatus, workflow),
      });
    }
  }

  if (sale?.created_at) {
    events.push({
      key: "created",
      title: "Order created",
      detail: "Order has been created.",
      at: sale.created_at,
      actor,
      complete: true,
    });
  }

  if (currentStatus === "cancelled") {
    events.push({
      key: "cancelled",
      title: workflowStatusLabel(workflow, "cancelled"),
      detail: "This order was cancelled.",
      at: sale.cancelled_at ?? sale.updated_at ?? sale.created_at,
      actor,
      complete: false,
      cancelled: true,
    });
  }

  if (currentStatus === "expired") {
    events.push({
      key: "expired",
      title: workflowStatusLabel(workflow, "expired"),
      detail: "This order expired automatically after sitting too long without being processed.",
      at: sale.expired_at ?? sale.updated_at ?? sale.created_at,
      actor,
      complete: false,
      cancelled: true,
    });
  }

  return events.sort(
    (a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime(),
  );
}

export { PAYMENT_STEP_KEYS };
