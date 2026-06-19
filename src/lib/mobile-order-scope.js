export const MOBILE_ORDER_SCOPES = [
  {
    value: "both",
    label: "Route and normal orders",
    description: "Can take route orders and normal mobile orders; sees all of their orders.",
  },
  {
    value: "route_only",
    label: "Route orders only",
    description: "Mobile app shows route orders only and can create route customers.",
  },
  {
    value: "normal_only",
    label: "Normal orders only",
    description: "Mobile app shows normal (non-route) orders and debtor/regular customers only.",
  },
];

export function userHasMobileChannel(loginChannels) {
  return Array.isArray(loginChannels) && loginChannels.includes("mobile");
}

export function formatMobileOrderScope(scope) {
  const row = MOBILE_ORDER_SCOPES.find((item) => item.value === scope);
  return row?.label ?? "Route and normal orders";
}

export const DEFAULT_MOBILE_ORDER_SCOPE = "both";
