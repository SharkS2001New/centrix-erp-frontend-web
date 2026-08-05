/** Hotel & Bar POS layout helpers — platform-controlled grid density + theme. */

import {
  normalizeHotelPosThemeTemplate,
  resolveHotelPosThemeTemplate,
} from "@/lib/hotel-pos-theme-templates";
import { getCheckoutPaymentConfig } from "@/lib/sales-settings";
import { isPlatformMpesaStkEnabled } from "@/lib/platform-org-features";

export const HOTEL_POS_GRID_COLUMNS_DEFAULT = 4;
export const HOTEL_POS_GRID_COLUMNS_ALLOWED = [4, 5];
export const HOTEL_POS_CATALOG_LIMIT_DEFAULT = 30;

/**
 * Build Hotel POS Collect payment UI flags from org-active payment methods
 * (Admin / Platform → Payment methods). Only enabled tenders appear in the popup.
 *
 * @param {object|null} moduleSettings
 * @param {object} options
 * @param {object|null} [options.capabilities]
 * @param {Array<{ method_code?: string, method_name?: string, requires_reference?: boolean, is_active?: boolean }>} [options.activePaymentMethods]
 */
export function resolveHotelPosPaymentConfig(moduleSettings, options = {}) {
  const base = getCheckoutPaymentConfig(moduleSettings, {
    checkoutContext: "pos",
    capabilities: options.capabilities ?? null,
  });
  const capabilities = options.capabilities ?? null;
  const active = (Array.isArray(options.activePaymentMethods) ? options.activePaymentMethods : [])
    .filter((row) => row && row.is_active !== false)
    .map((row) => ({
      code: String(row.method_code ?? "")
        .toUpperCase()
        .trim(),
      name: String(row.method_name ?? "").trim(),
      requiresReference: Boolean(row.requires_reference),
    }))
    .filter((row) => row.code);

  // Until methods load (or org has none yet), fall back to sales defaults without flooding banks.
  if (active.length === 0) {
    const mpesaOk = isPlatformMpesaStkEnabled(capabilities) && base.enableMpesaAmount;
    return {
      ...base,
      showCash: true,
      enableMpesaAmount: mpesaOk,
      enableMpesaCode: mpesaOk && base.enableMpesaCode,
      useBankSelect: false,
      showBankAmount: false,
      showEquityBank: false,
      showKcbBank: false,
      showOtherBank: false,
      showCheque: false,
      showChequeNumber: false,
      hasBankPayments: false,
      otherBankMethodCode: "OTHER",
      bankOptions: [],
    };
  }

  const codes = new Set(active.map((row) => row.code));
  const byCode = Object.fromEntries(active.map((row) => [row.code, row]));
  const mpesaActive = codes.has("MPESA") && isPlatformMpesaStkEnabled(capabilities);
  const showEquity = codes.has("EQUITY");
  const showKcb = codes.has("KCB");
  const showBank = codes.has("BANK");
  const showCard = codes.has("CARD");
  const showOther = codes.has("OTHER");
  const showCheque = codes.has("CHEQUE");

  let otherBankLabel = base.otherBankLabel || "Other bank";
  let otherBankMethodCode = "OTHER";
  if (showCard && !showBank && !showOther) {
    otherBankLabel = byCode.CARD?.name || "Card";
    otherBankMethodCode = "CARD";
  } else if (showBank && !showCard && !showOther) {
    otherBankLabel = byCode.BANK?.name || "Bank";
    otherBankMethodCode = "BANK";
  } else if (showOther) {
    otherBankLabel = byCode.OTHER?.name || otherBankLabel;
    otherBankMethodCode = "OTHER";
  } else if (showCard) {
    otherBankLabel = byCode.CARD?.name || "Card";
    otherBankMethodCode = "CARD";
  } else if (showBank) {
    otherBankLabel = byCode.BANK?.name || "Bank";
    otherBankMethodCode = "BANK";
  }

  const showOtherBank = showBank || showCard || showOther;

  return {
    ...base,
    showCash: codes.has("CASH"),
    enableMpesaAmount: mpesaActive,
    enableMpesaCode: mpesaActive && (base.enableMpesaCode || byCode.MPESA?.requiresReference),
    useBankSelect: false,
    showBankAmount: false,
    showEquityBank: showEquity,
    showKcbBank: showKcb,
    showOtherBank,
    otherBankLabel,
    otherBankMethodCode,
    showCheque,
    showChequeNumber: showCheque && (base.showChequeNumber || byCode.CHEQUE?.requiresReference),
    hasBankPayments: showEquity || showKcb || showOtherBank,
    bankOptions: [],
  };
}

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
    themeTemplate: normalizeHotelPosThemeTemplate(
      hospitality?.hotel_pos_theme_template ??
        moduleSettingsOrCapabilities?.hotel_pos_theme_template,
    ),
  };
}

export function resolveHotelPosGridColumns(moduleSettingsOrCapabilities = null) {
  return resolveHotelPosSettings(moduleSettingsOrCapabilities).gridColumns;
}

export { resolveHotelPosThemeTemplate };

export function formatHotelMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
