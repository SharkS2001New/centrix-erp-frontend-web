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

const MPESA_CODES = new Set(["MPESA", "M-PESA", "M_PESA"]);
const CHEQUE_CODES = new Set(["CHEQUE", "CHECK"]);

function normalizeMethodCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .trim();
}

function tenderKind(code) {
  if (code === "CASH") return "cash";
  if (MPESA_CODES.has(code)) return "mpesa";
  if (CHEQUE_CODES.has(code)) return "cheque";
  return "bank";
}

function addTender(tenders, seen, tender) {
  const code = normalizeMethodCode(tender.code);
  if (!code || seen.has(code)) return;
  seen.add(code);
  tenders.push({
    code,
    label: String(tender.label || code).trim() || code,
    kind: tender.kind || tenderKind(code),
  });
}

/**
 * Build Hotel POS Collect payment tenders.
 * Same sales checkout toggles as retail POS (Cash, M-Pesa, Equity, KCB, Other, Cheque),
 * plus any extra Admin → Payment methods rows (Card, custom banks, etc.).
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
  const catalog = (Array.isArray(options.activePaymentMethods) ? options.activePaymentMethods : [])
    .filter((row) => row && row.is_active !== false)
    .map((row) => ({
      code: normalizeMethodCode(row.method_code),
      name: String(row.method_name ?? "").trim(),
      requiresReference: Boolean(row.requires_reference),
    }))
    .filter((row) => row.code);

  const tenders = [];
  const seen = new Set();
  const mpesaOk = Boolean(base.enableMpesaAmount) && isPlatformMpesaStkEnabled(capabilities);
  const catalogHasMpesa = catalog.some((row) => MPESA_CODES.has(row.code));

  addTender(tenders, seen, { code: "CASH", label: "Cash", kind: "cash" });
  if (mpesaOk || catalogHasMpesa) {
    const mpesaRow = catalog.find((row) => MPESA_CODES.has(row.code));
    addTender(tenders, seen, {
      code: mpesaRow?.code || "MPESA",
      label: mpesaRow?.name || "M-Pesa",
      kind: "mpesa",
    });
  }
  if (base.showEquityBank) {
    const row = catalog.find((r) => r.code === "EQUITY");
    addTender(tenders, seen, { code: "EQUITY", label: row?.name || "Equity Bank", kind: "bank" });
  }
  if (base.showKcbBank) {
    const row = catalog.find((r) => r.code === "KCB");
    addTender(tenders, seen, { code: "KCB", label: row?.name || "KCB", kind: "bank" });
  }
  if (base.showOtherBank) {
    const row = catalog.find((r) => r.code === "OTHER");
    addTender(tenders, seen, {
      code: "OTHER",
      label: row?.name || base.otherBankLabel || "Other bank",
      kind: "bank",
    });
  }
  if (base.showCheque) {
    const row = catalog.find((r) => CHEQUE_CODES.has(r.code));
    addTender(tenders, seen, {
      code: row?.code || "CHEQUE",
      label: row?.name || "Cheque",
      kind: "cheque",
    });
  }

  for (const row of catalog) {
    if (MPESA_CODES.has(row.code) && !mpesaOk && !catalogHasMpesa) continue;
    addTender(tenders, seen, {
      code: row.code,
      label: row.name || row.code,
      kind: tenderKind(row.code),
    });
  }

  const codes = new Set(tenders.map((row) => row.code));
  const otherTender = tenders.find((row) => row.code === "OTHER" || row.code === "CARD" || row.code === "BANK");

  return {
    ...base,
    tenders,
    showCash: codes.has("CASH"),
    enableMpesaAmount: tenders.some((row) => row.kind === "mpesa"),
    enableMpesaCode: tenders.some((row) => row.kind === "mpesa") && base.enableMpesaCode,
    useBankSelect: false,
    showBankAmount: false,
    showEquityBank: codes.has("EQUITY"),
    showKcbBank: codes.has("KCB"),
    showOtherBank: Boolean(otherTender && otherTender.code !== "EQUITY" && otherTender.code !== "KCB"),
    otherBankLabel: otherTender?.label || base.otherBankLabel || "Other bank",
    otherBankMethodCode: otherTender?.code || "OTHER",
    showCheque: tenders.some((row) => row.kind === "cheque"),
    showChequeNumber: tenders.some((row) => row.kind === "cheque") && base.showChequeNumber,
    hasBankPayments: tenders.some((row) => row.kind === "bank"),
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
  const root = moduleSettingsOrCapabilities ?? {};
  const moduleSettings = root.module_settings ?? root;
  const hospitality = moduleSettings?.hospitality ?? root.hospitality ?? {};
  // Platform org config stores hotel_pos_* on sales_platform → module_settings.sales.
  // Hospitality settings may override the same keys when present.
  const sales = moduleSettings?.sales ?? root.sales ?? {};
  const bag = { ...sales, ...hospitality };

  return {
    gridColumns: normalizeHotelPosGridColumns(bag?.hotel_pos_grid_columns),
    collectPayment:
      bag?.hotel_pos_collect_payment === undefined
        ? true
        : Boolean(bag.hotel_pos_collect_payment),
    catalogLimit: normalizeHotelPosCatalogLimit(
      bag?.hotel_pos_catalog_limit ?? HOTEL_POS_CATALOG_LIMIT_DEFAULT,
    ),
    stockDeductOnSettle: Boolean(bag?.stock_deduct_on_settle),
    blockSettleIfInsufficient: bag?.block_settle_if_insufficient !== false,
    themeTemplate: normalizeHotelPosThemeTemplate(
      bag?.hotel_pos_theme_template ?? root?.hotel_pos_theme_template,
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
