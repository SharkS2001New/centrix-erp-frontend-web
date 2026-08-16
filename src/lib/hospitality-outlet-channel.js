/**
 * Hotel POS cashiers are locked to a Bar or Hotel menu via outlet_type.
 * API still stores restaurant for Hotel outlets.
 */

export function hospitalityOutletCashierChannel(outlet) {
  const type = String(outlet?.outlet_type ?? "").toLowerCase();
  if (type === "bar") return "Bar";
  if (type === "restaurant" || type === "hotel") return "Hotel";
  return null;
}

export function hospitalityOutletAssignmentLabel(outlet) {
  if (!outlet) return "Unassigned";
  const channel = hospitalityOutletCashierChannel(outlet);
  const name = String(outlet.name || outlet.code || "Outlet").trim() || "Outlet";
  return channel ? `${name} · ${channel}` : name;
}

export function hospitalityOutletSelectOptions(outlets = []) {
  return [
    { value: "", label: "Unassigned — pick Hotel or Bar" },
    ...outlets
      .filter((outlet) => outlet?.is_active !== false)
      .map((outlet) => ({
        value: String(outlet.id),
        label: hospitalityOutletAssignmentLabel(outlet),
      })),
  ];
}

export function hospitalityOutletTypeLabel(outletType) {
  const type = String(outletType ?? "").toLowerCase();
  if (type === "bar") return "Bar";
  if (type === "restaurant" || type === "hotel") return "Hotel";
  if (type === "other") return "Other";
  return outletType || "—";
}
