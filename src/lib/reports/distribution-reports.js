/** Distribution report slugs registered under `distribution.reports`. */
export const DISTRIBUTION_REPORT_DEFS = [
  {
    key: "mobile-route-sales",
    label: "Route order sales",
    subtitle: "Mobile and POS route orders by route and loading date",
    icon: "logistics",
  },
  {
    key: "dispatch-trips",
    label: "Dispatch trips",
    subtitle: "Trips by route, driver, vehicle, and status",
    icon: "truck",
  },
  {
    key: "trip-cash-settlement",
    label: "Trip cash settlement",
    subtitle: "Expected vs collected cash and variance by trip",
    icon: "wallet",
  },
  {
    key: "pod-compliance",
    label: "Proof of delivery",
    subtitle: "POD capture counts by route and driver",
    icon: "check",
  },
  {
    key: "driver-deliveries",
    label: "Driver deliveries",
    subtitle: "Completed deliveries and value by driver and route",
    icon: "users",
  },
];

export const DISTRIBUTION_REPORT_KEYS = DISTRIBUTION_REPORT_DEFS.map((r) => r.key);

/** @param {string} key */
export function distributionReportSubtitle(key) {
  return DISTRIBUTION_REPORT_DEFS.find((r) => r.key === key)?.subtitle ?? null;
}
