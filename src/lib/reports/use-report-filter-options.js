import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  INVENTORY_LOCATION_OPTIONS,
  INVENTORY_TXN_TYPE_OPTIONS,
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  salesChannelOptionsForCapabilities,
  STOCK_LOCATION_FILTER_OPTIONS,
} from "@/lib/reports/report-filter-config";

/**
 * Static report filter option lists. Long lists (routes, products, subcategories, etc.)
 * are searched on demand via report-filter-search.js.
 *
 * @param {string | undefined} reportKey
 */
export function useReportFilterOptions(reportKey) {
  const { capabilities } = useAuth();

  const optionsByKey = useMemo(
    () => ({
      channels: salesChannelOptionsForCapabilities(capabilities),
      paymentStatuses: PAYMENT_STATUS_OPTIONS,
      orderStatuses: ORDER_STATUS_OPTIONS,
      stockLocations: STOCK_LOCATION_FILTER_OPTIONS,
      inventoryLocations: INVENTORY_LOCATION_OPTIONS,
      transactionTypes: INVENTORY_TXN_TYPE_OPTIONS,
    }),
    [capabilities],
  );

  return optionsByKey;
}
