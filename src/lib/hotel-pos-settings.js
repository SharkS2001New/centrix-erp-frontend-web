/** Hotel & Bar POS layout helpers — platform-controlled grid density. */

export const HOTEL_POS_GRID_COLUMNS_DEFAULT = 4;
export const HOTEL_POS_GRID_COLUMNS_ALLOWED = [4, 5];
export const HOTEL_POS_CATALOG_LIMIT_DEFAULT = 30;

export function normalizeHotelPosGridColumns(value) {
  const n = Number(value);
  return HOTEL_POS_GRID_COLUMNS_ALLOWED.includes(n) ? n : HOTEL_POS_GRID_COLUMNS_DEFAULT;
}

export function normalizeHotelPosCatalogLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 8) return HOTEL_POS_CATALOG_LIMIT_DEFAULT;
  return Math.min(60, Math.max(8, Math.round(n)));
}

export function resolveHotelPosSettings(moduleSettingsOrCapabilities = null) {
  const hospitality =
    moduleSettingsOrCapabilities?.module_settings?.hospitality ??
    moduleSettingsOrCapabilities?.hospitality ??
    moduleSettingsOrCapabilities?.module_settings ??
    moduleSettingsOrCapabilities ??
    {};

  return {
    gridColumns: normalizeHotelPosGridColumns(hospitality?.hotel_pos_grid_columns),
    collectPayment:
      hospitality?.hotel_pos_collect_payment === undefined
        ? true
        : Boolean(hospitality.hotel_pos_collect_payment),
    catalogLimit: normalizeHotelPosCatalogLimit(
      hospitality?.hotel_pos_catalog_limit ?? HOTEL_POS_CATALOG_LIMIT_DEFAULT,
    ),
    stockDeductOnSettle: Boolean(hospitality?.stock_deduct_on_settle),
    blockSettleIfInsufficient: hospitality?.block_settle_if_insufficient !== false,
  };
}

export function resolveHotelPosGridColumns(moduleSettingsOrCapabilities = null) {
  return resolveHotelPosSettings(moduleSettingsOrCapabilities).gridColumns;
}

export function formatHotelMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
