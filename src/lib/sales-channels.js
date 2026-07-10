/** Sales and login channel helpers — POS only when external POS (`sales.pos`) is enabled. */

export function resolveSalesChannelsFromModules(
  modules = {},
  { mobileOrdersEnabled = true } = {},
) {
  const channels = [];
  if (modules["sales.pos"]) channels.push("pos");
  if (mobileOrdersEnabled && modules["sales.mobile"]) channels.push("mobile");
  if (modules["sales.backend"]) channels.push("backend");
  return channels;
}

export function resolveSalesChannelsFromCapabilities(capabilities) {
  if (Array.isArray(capabilities?.channels)) {
    return capabilities.channels;
  }

  const sales = capabilities?.module_settings?.sales ?? {};
  return resolveSalesChannelsFromModules(capabilities?.modules ?? {}, {
    mobileOrdersEnabled:
      capabilities?.mobile_orders_enabled !== false && sales.enable_mobile_orders !== false,
  });
}

export function platformCapabilitiesFromOrgConfig({
  enabledModules = {},
  mobileOrdersEnabled = true,
  salesPlatform = {},
} = {}) {
  return {
    modules: enabledModules,
    mobile_orders_enabled: mobileOrdersEnabled,
    module_settings: { sales: salesPlatform },
  };
}
