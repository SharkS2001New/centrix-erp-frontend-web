const TRIP_STATUS_LABELS = {
  draft: "Draft",
  loading: "Loading",
  in_transit: "In transit",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TRIP_WORKFLOW_STEPS = [
  { key: "draft", label: "Draft", hint: "Trip chart created; assign orders and review the loading list." },
  { key: "loading", label: "Loading", hint: "Picking complete; loading list locked and vehicle being loaded." },
  { key: "in_transit", label: "Dispatched", hint: "Vehicle has departed — deliveries are in progress." },
  { key: "completed", label: "Completed", hint: "All deliveries and cash reconciliation are done." },
];

export function tripStatusLabel(status) {
  const key = String(status ?? "");
  return TRIP_STATUS_LABELS[key] ?? key.replace(/_/g, " ");
}

export function tripWorkflowSteps() {
  return TRIP_WORKFLOW_STEPS;
}

export function tripWorkflowIndex(status) {
  const key = String(status ?? "");
  if (key === "cancelled") return -1;
  const index = TRIP_WORKFLOW_STEPS.findIndex((step) => step.key === key);
  return index >= 0 ? index : 0;
}

export function formatTripProfitMargin(percent) {
  if (percent == null || Number.isNaN(Number(percent))) return "—";
  return `${Number(percent).toFixed(1)}%`;
}
