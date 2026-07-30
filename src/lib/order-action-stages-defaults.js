/** Stages excluded from Order actions by stage (not cancellable pipeline steps). */
const ORDER_ACTION_EXCLUDED_STATUSES = new Set(["cancelled", "expired", "draft"]);

const DEFAULT_PIPELINE_STATUSES = [
  "booked",
  "pending",
  "unpaid",
  "pending_payment",
  "paid",
  "processed",
  "delivered",
  "completed",
];

function pipelineKeysFromWorkflow(workflow) {
  if (workflow?.pipeline?.length) {
    return workflow.pipeline.map((step) => step.key).filter(Boolean);
  }
  if (workflow?.steps?.length) {
    return workflow.steps
      .filter((step) => step.enabled !== false)
      .map((step) => step.status)
      .filter(Boolean);
  }
  return DEFAULT_PIPELINE_STATUSES;
}

/** Default cancel stages: all enabled workflow pipeline steps. */
export function defaultCancelOrderStatusesFromWorkflow(workflow) {
  return pipelineKeysFromWorkflow(workflow).filter(
    (key) => key && !ORDER_ACTION_EXCLUDED_STATUSES.has(key),
  );
}

/** Keep custom cancel selections when workflow changes; reset when still on full default. */
export function syncCancelOrderStatusesForWorkflowChange(currentCancel, oldWorkflow, newWorkflow) {
  const oldDefault = defaultCancelOrderStatusesFromWorkflow(oldWorkflow);
  const newDefault = defaultCancelOrderStatusesFromWorkflow(newWorkflow);
  const newPipeline = new Set(newDefault);
  const current = Array.isArray(currentCancel) ? currentCancel : [];
  const workflowSelections = current.filter((status) => status !== "mobile");
  const includeMobile = current.includes("mobile");

  const hadFullDefault =
    workflowSelections.length > 0 &&
    workflowSelections.every((status) => oldDefault.includes(status)) &&
    oldDefault.every((status) => workflowSelections.includes(status));

  let next = hadFullDefault
    ? newDefault
    : workflowSelections.filter((status) => newPipeline.has(status));

  if (next.length === 0) {
    next = newDefault;
  }

  return includeMobile ? [...next, "mobile"] : next;
}
