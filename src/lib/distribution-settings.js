export const DISTRIBUTION_DEFAULTS = {
  enable_distribution_ops: true,
  inherit_customer_route: true,
  assign_on_status: "processed",
  auto_assign_truck: true,
  auto_assign_driver: true,
  auto_create_trips: true,
  require_weight_on_load: false,
  set_delivery_date_on: "delivered",
  require_pod_on_delivered: false,
  enforce_vehicle_capacity: true,
  enable_cod_reconciliation: true,
  require_trip_cash_settlement: false,
  include_normal_orders_in_loading_list: true,
};

export const DISTRIBUTION_ASSIGN_STATUS_OPTIONS = [
  { value: "processed", label: "Processed (ready to load)" },
  { value: "paid", label: "Paid" },
  { value: "delivered", label: "Delivered" },
];

export const DISTRIBUTION_DELIVERY_DATE_OPTIONS = [
  { value: "delivered", label: "When marked delivered" },
  { value: "completed", label: "When completed" },
  { value: "processed", label: "When processed" },
];

export function mergeDistributionModuleSettings(moduleSettings) {
  const custom = moduleSettings?.distribution;
  const merged = { ...DISTRIBUTION_DEFAULTS, ...(custom && typeof custom === "object" ? custom : {}) };

  const legacyKeys = Object.keys(DISTRIBUTION_DEFAULTS);
  const sales = moduleSettings?.sales;
  if (sales && typeof sales === "object") {
    for (const key of legacyKeys) {
      if (custom?.[key] == null && sales[key] != null) {
        merged[key] = sales[key];
      }
    }
  }

  return merged;
}

export function isDistributionOpsEnabled(capabilities) {
  if (!capabilities?.modules?.distribution) {
    return false;
  }
  if (capabilities?.distribution_ops_enabled != null) {
    return Boolean(capabilities.distribution_ops_enabled);
  }
  return true;
}

/** Distribution orgs only use route customers (every customer belongs to a route). */
export function isRouteOnlyCustomers(capabilities) {
  return Boolean(capabilities?.modules?.distribution);
}

export function mergeDistributionSettings(capabilities) {
  const distribution = mergeDistributionModuleSettings(capabilities?.module_settings);
  const enabled = isDistributionOpsEnabled(capabilities);

  return {
    enabled,
    inheritCustomerRoute: distribution.inherit_customer_route !== false,
    assignOnStatus: distribution.assign_on_status || "processed",
    autoAssignDriver: distribution.auto_assign_driver !== false,
    autoAssignTruck: distribution.auto_assign_truck !== false,
    autoCreateTrips: distribution.auto_create_trips !== false,
    requireWeightOnLoad: Boolean(distribution.require_weight_on_load),
    setDeliveryDateOn: distribution.set_delivery_date_on || "delivered",
    requirePodOnDelivered: Boolean(distribution.require_pod_on_delivered),
    enforceVehicleCapacity: distribution.enforce_vehicle_capacity !== false,
    enableCodReconciliation: Boolean(distribution.enable_cod_reconciliation),
    requireTripCashSettlement: Boolean(distribution.require_trip_cash_settlement),
    includeNormalOrdersInLoadingList: distribution.include_normal_orders_in_loading_list !== false,
  };
}

export function distributionFormFromApi(res) {
  const distribution = mergeDistributionModuleSettings({ distribution: res?.distribution ?? res });
  return {
    enable_distribution_ops: Boolean(distribution.enable_distribution_ops),
    inherit_customer_route: distribution.inherit_customer_route !== false,
    assign_on_status: distribution.assign_on_status || "processed",
    auto_assign_truck: distribution.auto_assign_truck !== false,
    auto_assign_driver: distribution.auto_assign_driver !== false,
    auto_create_trips: distribution.auto_create_trips !== false,
    require_weight_on_load: Boolean(distribution.require_weight_on_load),
    set_delivery_date_on: distribution.set_delivery_date_on || "delivered",
    require_pod_on_delivered: Boolean(distribution.require_pod_on_delivered),
    enforce_vehicle_capacity: distribution.enforce_vehicle_capacity !== false,
    enable_cod_reconciliation: Boolean(distribution.enable_cod_reconciliation),
    require_trip_cash_settlement: Boolean(distribution.require_trip_cash_settlement),
    include_normal_orders_in_loading_list: distribution.include_normal_orders_in_loading_list !== false,
  };
}

export function distributionPayloadFromForm(form) {
  return {
    enable_distribution_ops: Boolean(form.enable_distribution_ops),
    inherit_customer_route: Boolean(form.inherit_customer_route),
    assign_on_status: form.assign_on_status || "processed",
    auto_assign_truck: Boolean(form.auto_assign_truck),
    auto_assign_driver: Boolean(form.auto_assign_driver),
    auto_create_trips: Boolean(form.auto_create_trips),
    require_weight_on_load: Boolean(form.require_weight_on_load),
    set_delivery_date_on: form.set_delivery_date_on || "delivered",
    require_pod_on_delivered: Boolean(form.require_pod_on_delivered),
    enforce_vehicle_capacity: Boolean(form.enforce_vehicle_capacity),
    enable_cod_reconciliation: Boolean(form.enable_cod_reconciliation),
    require_trip_cash_settlement: Boolean(form.require_trip_cash_settlement),
    include_normal_orders_in_loading_list: Boolean(form.include_normal_orders_in_loading_list),
  };
}

/** Statuses that typically mean an order is ready for dispatch planning. */
export const DISPATCH_READY_STATUSES = ["paid", "processed", "pending_payment"];

export function orderNeedsDriverAssignment(sale) {
  const meta = sale?.fulfillment_meta;
  if (!meta || typeof meta !== "object") return true;
  const driverId = meta.driver_id ?? meta.driver?.id;
  return driverId == null || driverId === "";
}

export function shouldShowOrderAssignAction(sale, distributionSettings) {
  if (!distributionSettings?.enabled) return false;

  const status = String(sale?.status ?? "").toLowerCase();
  if (["cancelled", "completed", "delivered"].includes(status)) return false;

  const assignStatus = distributionSettings.assignOnStatus || "processed";
  if (status === assignStatus) return true;

  return DISPATCH_READY_STATUSES.includes(status) && status !== assignStatus;
}

export function assignActionLabel(sale, distributionSettings) {
  const status = String(sale?.status ?? "").toLowerCase();
  const assignStatus = distributionSettings.assignOnStatus || "processed";

  if (status === assignStatus) {
    return orderNeedsDriverAssignment(sale) ? "Assign driver" : "Change driver";
  }

  return "Process & assign";
}

export function shouldPromptFulfillmentAssignment(targetStatus, distributionSettings, sale = null) {
  if (!distributionSettings?.enabled) return false;
  if (distributionSettings.autoAssignDriver) return false;

  const assignStatus = distributionSettings.assignOnStatus || "processed";
  if (targetStatus !== assignStatus) return false;

  if (sale && String(sale.status ?? "").toLowerCase() === assignStatus) {
    return orderNeedsDriverAssignment(sale);
  }

  return true;
}

export function shouldPromptPodCapture(targetStatus, distributionSettings) {
  if (!distributionSettings?.enabled) return false;
  if (!distributionSettings.requirePodOnDelivered) return false;
  return targetStatus === "delivered";
}

export function buildFulfillmentTransitionBody(targetStatus, fulfillmentMeta = {}) {
  const body = { status: targetStatus };
  if (fulfillmentMeta && Object.keys(fulfillmentMeta).length > 0) {
    body.fulfillment_meta = fulfillmentMeta;
  }
  return body;
}
