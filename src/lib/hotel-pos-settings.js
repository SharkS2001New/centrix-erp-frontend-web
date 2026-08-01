/** Hotel & Bar POS layout helpers — platform-controlled grid density. */

export const HOTEL_POS_GRID_COLUMNS_DEFAULT = 4;
export const HOTEL_POS_GRID_COLUMNS_ALLOWED = [4, 5];

export function normalizeHotelPosGridColumns(value) {
  const n = Number(value);
  return HOTEL_POS_GRID_COLUMNS_ALLOWED.includes(n) ? n : HOTEL_POS_GRID_COLUMNS_DEFAULT;
}

export function resolveHotelPosGridColumns(moduleSettingsOrCapabilities = null) {
  const hospitality =
    moduleSettingsOrCapabilities?.module_settings?.hospitality ??
    moduleSettingsOrCapabilities?.hospitality ??
    moduleSettingsOrCapabilities?.module_settings ??
    moduleSettingsOrCapabilities;
  return normalizeHotelPosGridColumns(hospitality?.hotel_pos_grid_columns);
}

export function formatHotelMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
