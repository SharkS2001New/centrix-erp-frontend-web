/**
 * Column definitions for PosProductSearch dropdowns.
 * Mirrors Light Stores repositoryItemSearchLookUp grid columns.
 */

/**
 * @param {{
 *   variant?: "modern" | "classic",
 *   stockDisplayMode?: "both" | "shop" | "store" | "none",
 * }} [options]
 * @returns {Array<{ id: string, label: string, align?: "left" | "right" }>}
 */
export function posProductSearchColumnDefs({
  variant = "modern",
  stockDisplayMode = "both",
} = {}) {
  if (variant === "classic") {
    return [
      { id: "product_code", label: "Product code" },
      { id: "product_name", label: "Product name" },
      { id: "unit_price", label: "Unit price", align: "right" },
      { id: "available", label: "Available", align: "right" },
    ];
  }

  const cols = [
    { id: "product_code", label: "Product code" },
    { id: "product_name", label: "Product name" },
    { id: "unit_price", label: "Unit price", align: "right" },
  ];

  const mode = String(stockDisplayMode ?? "both");
  if (mode === "both" || mode === "shop") {
    cols.push({ id: "shop", label: "Available in shop", align: "right" });
  }
  if (mode === "both" || mode === "store") {
    cols.push({ id: "store", label: "Available in store", align: "right" });
  }

  return cols;
}
