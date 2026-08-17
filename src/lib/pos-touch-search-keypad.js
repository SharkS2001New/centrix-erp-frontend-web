/** Platform-controlled on-screen search keypad for touch POS desks. */

/**
 * When true, POS search fields open a tap keypad instead of the device keyboard.
 * @param {object|null|undefined} capabilitiesOrSettings
 */
export function isPosTouchSearchKeypadEnabled(capabilitiesOrSettings = null) {
  const root = capabilitiesOrSettings ?? {};
  const moduleSettings = root.module_settings ?? root;
  const sales = moduleSettings?.sales ?? root.sales ?? {};
  const hospitality = moduleSettings?.hospitality ?? root.hospitality ?? {};
  if (Object.prototype.hasOwnProperty.call(sales, "pos_touch_search_keypad")) {
    return Boolean(sales.pos_touch_search_keypad);
  }
  if (Object.prototype.hasOwnProperty.call(hospitality, "pos_touch_search_keypad")) {
    return Boolean(hospitality.pos_touch_search_keypad);
  }
  return false;
}
