/** Hospitality report slugs registered in the API catalog under `hospitality`. */
export const HOSPITALITY_REPORT_DEFS = [
  {
    key: "hospitality-kpi-occupancy",
    label: "Occupancy, ADR & RevPAR",
    subtitle: "Rooms sold, occupancy %, ADR, and RevPAR for the period",
    icon: "hotel",
  },
  {
    key: "hospitality-occupancy",
    label: "Room status",
    subtitle: "Live room inventory by type and housekeeping status",
    icon: "hotel",
  },
  {
    key: "hospitality-arrivals-departures",
    label: "Arrivals & departures",
    subtitle: "Expected check-ins and check-outs for the date range",
    icon: "swap",
  },
  {
    key: "hospitality-folio-balances",
    label: "Open folio balances",
    subtitle: "In-house guest accounts with outstanding balances",
    icon: "wallet",
  },
  {
    key: "hospitality-room-revenue",
    label: "Room revenue by type",
    subtitle: "Room charges posted by room type with ADR",
    icon: "receipt",
  },
  {
    key: "hospitality-manager-flash",
    label: "Manager flash",
    subtitle: "Daily flash: occupancy, ADR, RevPAR, food & drink, tenders, open balances",
    icon: "dashboard",
  },
  {
    key: "hospitality-fnb-checks",
    label: "Food & drink check sales",
    subtitle: "Hotel POS check-level restaurant and bar sales detail",
    icon: "receipt",
  },
  {
    key: "hospitality-fnb-by-outlet",
    label: "Food & drink by outlet",
    subtitle: "Restaurant and bar sales by outlet",
    icon: "receipt",
  },
  {
    key: "hospitality-fnb-by-hour",
    label: "Food & drink by hour",
    subtitle: "Hourly restaurant and bar sales for staffing and peak analysis",
    icon: "clipboard",
  },
  {
    key: "hospitality-fnb-by-category",
    label: "Food & drink by category",
    subtitle: "Menu category mix from checks",
    icon: "clipboard",
  },
  {
    key: "hospitality-open-checks",
    label: "Unpaid & partial checks",
    subtitle: "Open balances aging for unpaid and partially paid orders",
    icon: "alert",
  },
  {
    key: "hospitality-voids",
    label: "Voids & comps control",
    subtitle: "Voided checks for manager review",
    icon: "alert",
  },
  {
    key: "hospitality-eod-cashier",
    label: "End of day — cashier",
    subtitle: "Daily totals by cashier — food & drink sales, room stays, tenders, and charge-to-room",
    icon: "wallet",
  },
  {
    key: "hospitality-profit-loss",
    label: "Hospitality P&L",
    subtitle: "Room and food & drink contribution summary",
    icon: "percent",
  },
  {
    key: "hospitality-consumption-variance",
    label: "Consumption vs sales",
    subtitle: "Recipe-expected vs actual stock movements for hotel restaurant and bar",
    icon: "swap",
  },
];

export const HOSPITALITY_REPORT_KEYS = HOSPITALITY_REPORT_DEFS.map((r) => r.key);

/** @param {string} key */
export function hospitalityReportSubtitle(key) {
  return HOSPITALITY_REPORT_DEFS.find((r) => r.key === key)?.subtitle ?? null;
}
