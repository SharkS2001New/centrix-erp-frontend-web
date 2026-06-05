/** Source locations for stock transfers. */
export const TRANSFER_FROM_OPTIONS = [
  { value: "shop", label: "Shop" },
  { value: "store", label: "Store / warehouse" },
];

/** Destination: another location or a consumption purpose. */
export const TRANSFER_TO_OPTIONS = [
  { value: "store", label: "Store / warehouse", location: true },
  { value: "shop", label: "Shop", location: true },
  { value: "internal_use", label: "For internal use" },
  { value: "donations", label: "Donations" },
  { value: "staff_consumption", label: "Staff consumption" },
  { value: "charity", label: "Charity" },
  { value: "sample", label: "Sample / demo" },
  { value: "production", label: "Production / manufacturing" },
  { value: "display", label: "Display / merchandising" },
];

export function transferToOptionsFor(from) {
  return TRANSFER_TO_OPTIONS.filter((opt) => {
    if (opt.location) return opt.value !== from;
    return true;
  });
}

export function transferRouteLabel(from, to) {
  const fromLabel =
    TRANSFER_FROM_OPTIONS.find((o) => o.value === from)?.label ?? from;
  const toLabel =
    TRANSFER_TO_OPTIONS.find((o) => o.value === to)?.label ??
    String(to).replace(/_/g, " ");
  return `${fromLabel} → ${toLabel}`;
}
