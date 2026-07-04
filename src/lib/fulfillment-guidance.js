import { mergeDistributionModuleSettings } from "@/lib/distribution-settings";
import { tripWorkflowIndex } from "@/lib/trip-status";

export const FULFILLMENT_WORKFLOW_SCREENS = [
  {
    id: "routes",
    screen: "Routes",
    path: "/fulfillment/routes",
    description: "Create delivery routes and review order counts per route.",
    step: 1,
  },
  {
    id: "orders",
    screen: "Route orders",
    path: "/fulfillment/orders",
    description: "All route orders waiting for a trip or already assigned to one.",
    step: 2,
  },
  {
    id: "dispatch",
    screen: "Dispatch board",
    path: "/fulfillment/dispatch",
    description: "Select orders by date and route, then create or add to trip charts.",
    step: 3,
  },
  {
    id: "picking",
    screen: "Warehouse picking",
    path: "/fulfillment/picking",
    description: "Mobile-friendly picking workflow for warehouse staff — record picked quantities by shelf.",
    step: 4,
  },
  {
    id: "trips",
    screen: "Trips",
    path: "/fulfillment/trips",
    description: "Trip charts — lock loading lists, dispatch vehicles, and close runs.",
    step: 5,
  },
  {
    id: "loading-lists",
    screen: "Loading lists",
    path: "/fulfillment/loading-lists",
    description: "Preview and print picking and loading lists for any trip.",
    step: 6,
  },
];

export function isFulfillmentGuidanceEnabled(capabilities) {
  return Boolean(mergeDistributionModuleSettings(capabilities?.module_settings).enable_fulfillment_guidance);
}

/** @returns {'not_dispatched'|'dispatched'|'completed'|'cancelled'} */
export function tripDispatchPhase(status) {
  const key = String(status ?? "");
  if (key === "cancelled") return "cancelled";
  if (key === "completed") return "completed";
  if (key === "in_transit") return "dispatched";
  return "not_dispatched";
}

export function tripDispatchStatusCopy(status) {
  switch (tripDispatchPhase(status)) {
    case "dispatched":
      return { label: "Dispatched", tone: "info" };
    case "completed":
      return { label: "Run completed", tone: "success" };
    case "cancelled":
      return { label: "Cancelled", tone: "danger" };
    default:
      return { label: "Not dispatched yet", tone: "warning" };
  }
}

/**
 * Interactive guidance steps for a trip detail page.
 * @returns {{ steps: Array<{id:string,label:string,state:'done'|'current'|'next'|'upcoming',hint:string,actionLabel?:string}>, nextStep: object|null }}
 */
export function resolveTripDetailGuidance({ trip, loadingList, pickingList, distributionSettings = {} }) {
  const status = String(trip?.status ?? "draft");
  const orders = loadingList?.orders ?? [];
  const lineCount =
    loadingList?.line_count ??
    orders.reduce((sum, order) => sum + (order.lines?.length ?? 0), 0) ??
    loadingList?.lines?.length ??
    0;
  const pickLines = pickingList?.lines ?? [];
  const loadingLocked = loadingList?.status && loadingList.status !== "open";
  const pickingComplete =
    pickingList?.status === "completed" || pickingList?.status === "locked" || loadingLocked;
  const orderCount =
    trip?.financial_summary?.order_count ??
    trip?.sales?.length ??
    loadingList?.order_count ??
    orders.length ??
    0;
  const workflowIndex = tripWorkflowIndex(status);

  const steps = [
    {
      id: "assign",
      label: "Assign orders",
      hint: "Add route orders from the dispatch board or when creating the trip chart.",
      done: orderCount > 0,
    },
    {
      id: "pick",
      label: "Warehouse picking",
      hint: "Print the picking list, collect stock from shelves, and record picked quantities or shortages.",
      done: pickingComplete || (pickLines.length > 0 && workflowIndex >= 1),
      skipWhen: pickLines.length === 0,
    },
    {
      id: "review",
      label: "Review loading list",
      hint: "Check the vehicle load manifest matches what was picked.",
      done: lineCount > 0 || workflowIndex >= 1,
    },
    {
      id: "lock",
      label: "Lock loading list",
      hint: "Enter prepared by and checked by to confirm loading is ready.",
      done: loadingLocked || workflowIndex >= 2,
      skipWhen: lineCount === 0,
    },
    {
      id: "dispatch",
      label: "Dispatch trip",
      hint: "Vehicle leaves the depot — status becomes In transit. This is when dispatch happens.",
      done: workflowIndex >= 2,
    },
    {
      id: "deliver",
      label: "Deliver orders",
      hint: "Mark stops delivered and capture proof of delivery when required.",
      done: workflowIndex >= 3,
    },
    {
      id: "close",
      label: "Close trip",
      hint: distributionSettings.requireTripCashSettlement
        ? "Reconcile COD, record cash collected, then complete the trip."
        : "Reconcile deliveries and cash, then complete the trip.",
      done: status === "completed",
    },
  ].filter((step) => !(step.skipWhen && !step.done));

  const enriched = steps.map((step, index) => {
    const firstIncomplete = steps.findIndex((item) => !item.done);
    let state = "upcoming";
    if (step.done) state = "done";
    else if (index === firstIncomplete) state = "next";
    return { ...step, state };
  });

  const nextStep = enriched.find((step) => step.state === "next") ?? null;

  if (status === "cancelled") {
    return { steps: enriched, nextStep: null };
  }

  if (nextStep) {
    if (nextStep.id === "assign") {
      nextStep.actionLabel = "Go to dispatch board";
      nextStep.href = "/fulfillment/dispatch";
    } else if (nextStep.id === "pick") {
      nextStep.actionLabel = "Open warehouse picking";
      nextStep.href = trip?.id ? `/fulfillment/picking?trip_id=${trip.id}` : "/fulfillment/picking";
    } else if (nextStep.id === "lock") {
      nextStep.actionLabel = "Lock loading list below";
      nextStep.scrollTo = "trip-lock-loading";
    } else if (nextStep.id === "dispatch") {
      nextStep.actionLabel = "Dispatch trip below";
      nextStep.scrollTo = "trip-dispatch";
    } else if (nextStep.id === "close") {
      nextStep.actionLabel = "Open close trip";
      nextStep.href = trip?.id ? `/fulfillment/trips/${trip.id}/close` : null;
    }
  }

  return { steps: enriched, nextStep };
}
