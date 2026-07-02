export const LOADING_SHEET_PRINT_DEFAULTS = {
  loading_sheet_footer_lines: "",
  loading_sheet_show_signatures: true,
  loading_sheet_show_qty_column: true,
  loading_sheet_show_price_columns: true,
  loading_sheet_show_total: true,
  loading_sheet_default_checked_by: "",
};

export function resolveLoadingSheetPrintSettings(distribution = {}) {
  return mergeLoadingSheetPrintSettings(distribution);
}

export function resolveLoadingSheetColumnFlags(printSettings = {}) {
  const settings = mergeLoadingSheetPrintSettings(printSettings);
  return {
    showQtyColumn: settings.loading_sheet_show_qty_column !== false,
    showPriceColumns: settings.loading_sheet_show_price_columns !== false,
    showSignatures: settings.loading_sheet_show_signatures !== false,
    showTotal: settings.loading_sheet_show_total !== false,
  };
}

export function linesFromMultilineText(text) {
  return String(text ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function mergeLoadingSheetPrintSettings(distribution = {}) {
  return {
    ...LOADING_SHEET_PRINT_DEFAULTS,
    ...distribution,
  };
}

export function loadingSheetPrintFormFromApi(res) {
  const distribution = mergeLoadingSheetPrintSettings(res?.distribution ?? res);
  return {
    loading_sheet_footer_lines: String(distribution.loading_sheet_footer_lines ?? ""),
    loading_sheet_show_signatures: distribution.loading_sheet_show_signatures !== false,
    loading_sheet_show_qty_column: distribution.loading_sheet_show_qty_column !== false,
    loading_sheet_show_price_columns: distribution.loading_sheet_show_price_columns !== false,
    loading_sheet_show_total: distribution.loading_sheet_show_total !== false,
    loading_sheet_default_checked_by: String(distribution.loading_sheet_default_checked_by ?? ""),
  };
}

export function loadingSheetPrintPayloadFromForm(form) {
  return {
    loading_sheet_footer_lines: String(form.loading_sheet_footer_lines ?? ""),
    loading_sheet_show_signatures: Boolean(form.loading_sheet_show_signatures),
    loading_sheet_show_qty_column: Boolean(form.loading_sheet_show_qty_column),
    loading_sheet_show_price_columns: Boolean(form.loading_sheet_show_price_columns),
    loading_sheet_show_total: Boolean(form.loading_sheet_show_total),
    loading_sheet_default_checked_by: String(form.loading_sheet_default_checked_by ?? "").trim(),
  };
}

export function resolveLoadingSheetFooterLines(printSettings = {}) {
  return linesFromMultilineText(printSettings.loading_sheet_footer_lines);
}
