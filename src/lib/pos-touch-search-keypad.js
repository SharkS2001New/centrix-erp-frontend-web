/** Platform-controlled on-screen search keypad for Hotel POS. */

/**
 * When true, POS search fields open a tap keypad instead of the device keyboard.
 * The keypad is only available to hospitality organizations.
 * @param {object|null|undefined} capabilitiesOrSettings
 */
export function isPosTouchSearchKeypadEnabled(capabilitiesOrSettings = null) {
  const root = capabilitiesOrSettings ?? {};
  const industry = String(root.industry ?? "").toLowerCase();
  const deploymentProfile = String(root.deployment_profile ?? "").toLowerCase();
  if (industry !== "hospitality" && deploymentProfile !== "hotel_bar") return false;

  const moduleSettings = root.module_settings ?? root;
  const sales = moduleSettings?.sales ?? root.sales ?? {};
  const hospitality = moduleSettings?.hospitality ?? root.hospitality ?? {};
  if (Object.prototype.hasOwnProperty.call(sales, "pos_touch_search_keypad")) {
    return Boolean(sales.pos_touch_search_keypad);
  }
  if (Object.prototype.hasOwnProperty.call(hospitality, "pos_touch_search_keypad")) {
    return Boolean(hospitality.pos_touch_search_keypad);
  }
  return true;
}
