import { formatOrgCurrency } from "@/lib/format";
import { activeGeneralSettings } from "@/lib/general-settings";

/** Format a sale amount using org currency settings (leaf helper — avoid sales.js cycles). */
export function formatSaleKes(value, settings) {
  if (value == null || value === "") return "—";
  return formatOrgCurrency(value, settings ?? activeGeneralSettings());
}
