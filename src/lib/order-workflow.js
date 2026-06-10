/** Default workflow mirrors config/erp.php default_order_workflow. */
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
    booked: ["pending", "unpaid", "cancelled"],
    pending: ["unpaid", "pending_payment", "cancelled"],
    unpaid: ["pending_payment", "paid", "cancelled"],
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
  deduct_stock_on: "completed",
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
];

/** Drop transitions and status references that no longer exist in the pipeline. */
export function sanitizeWorkflowReferences(workflow) {
  const wf = workflow ?? DEFAULT_ORDER_WORKFLOW;
  const enabledStatuses = wf.steps.filter((s) => s.enabled !== false).map((s) => s.status);
  const firstEnabled = enabledStatuses[0] ?? "unpaid";
  const configurableStatuses = new Set(
    ORDER_STATUS_OPTIONS.filter(
      (o) => !["draft", "held", "cancelled"].includes(o.value),
    ).map((o) => o.value),
  );

  function pickRef(status) {
    if (!status) return status;
    if (configurableStatuses.has(status)) return status;
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

  return {
    ...wf,
    save_status,
    checkout,
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
  if (custom.deduct_stock_on) out.deduct_stock_on = custom.deduct_stock_on;
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
  return workflow?.labels?.[key] ?? DEFAULT_ORDER_WORKFLOW.steps.find((s) => s.status === key)?.label ?? key;
}

export function workflowPipelineSteps(workflow) {
  if (workflow?.pipeline?.length) return dedupePipelineSteps(workflow.pipeline);
  return dedupePipelineSteps(
    DEFAULT_ORDER_WORKFLOW.steps.map((s) => ({ key: s.status, label: s.label })),
  );
}

export function workflowTransitions(workflow) {
  return workflow?.transitions ?? DEFAULT_ORDER_WORKFLOW.transitions;
}

export function pipelineStatusIndex(status, workflow) {
  const steps = workflowPipelineSteps(workflow);
  return steps.findIndex((s) => s.key === status);
}

export function pipelineStepIndex(status, workflow) {
  const idx = pipelineStatusIndex(status, workflow);
  return idx >= 0 ? idx : 0;
}

/** Adjacent pipeline steps only — move one stage up or down. */
export function pipelineAdjacentTransitions(status, workflow) {
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

  if (status !== "cancelled") options.push("cancelled");
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
  if (!status || status === "cancelled" || status === "completed") return null;

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
 * Resolve order status from payment amount — applies to all orders (save or checkout).
 * POS immediate pay (cash/M-Pesa/banks) with full payment → completed.
 * Credit / partial-payment settings → unpaid | partially paid | paid/completed.
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
  const immediate = isImmediatePaymentMethod(paymentMethodCode, isCredit);

  if (fullyPaid) {
    if (isCredit) {
      return pickEnabledStatus(checkout.full_paid ?? "paid", wf);
    }
    if (immediate && channel === "pos") {
      return pickEnabledStatus("completed", wf);
    }
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
  return keys;
}

export function matchesWorkflowStatusFilter(sale, statusFilter, workflow) {
  const status = String(sale?.status ?? "").toLowerCase();
  if (statusFilter && statusFilter !== "all") {
    return status === statusFilter;
  }
  return workflowListableStatusKeys(workflow).has(status);
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
  return options;
}
