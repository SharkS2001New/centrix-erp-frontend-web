/** Hospitality report slugs registered under `hospitality.reports`. */
export const HOSPITALITY_REPORT_DEFS = [
  {
    key: "hospitality-occupancy",
    label: "Room occupancy",
    subtitle: "Current room status by type and floor",
    icon: "hotel",
  },
  {
    key: "hospitality-arrivals-departures",
    label: "Arrivals & departures",
    subtitle: "Reservations arriving or departing in the date range",
    icon: "calendar",
  },
  {
    key: "hospitality-folio-balances",
    label: "Open folio balances",
    subtitle: "In-house guest balances",
    icon: "wallet",
  },
  {
    key: "hospitality-fnb-checks",
    label: "F&B check sales",
    subtitle: "Paid Hotel POS checks in the date range",
    icon: "sales",
  },
  {
    key: "hospitality-profit-loss",
    label: "Hospitality profit & loss",
    subtitle: "F&B + room revenue, COGS, and gross profit",
    icon: "finance",
  },
  {
    key: "hospitality-eod-cashier",
    label: "Hotel POS EOD by cashier",
    subtitle: "End-of-day F&B sales and tender mix per cashier",
    icon: "pos",
  },
];

export const HOSPITALITY_REPORT_KEYS = HOSPITALITY_REPORT_DEFS.map((r) => r.key);

/** @param {string} key */
export function hospitalityReportSubtitle(key) {
  return HOSPITALITY_REPORT_DEFS.find((r) => r.key === key)?.subtitle ?? null;
}
