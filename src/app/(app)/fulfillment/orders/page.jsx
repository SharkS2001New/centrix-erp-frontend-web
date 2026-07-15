"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import SalesOrdersListScreen from "@/components/sales/sales-orders-list-screen";
import { normalizeOrdersListDefaultDays } from "@/lib/sales-settings";

/** Route/distribution orders — date window comes from platform orders list settings. */
export default function FulfillmentRouteOrdersPage() {
  const { capabilities } = useAuth();
  const rangeDays = useMemo(
    () =>
      normalizeOrdersListDefaultDays(
        capabilities?.module_settings?.sales?.orders_list_default_days,
      ),
    [capabilities?.module_settings],
  );

  return <SalesOrdersListScreen routeOrdersOnly routeOrdersDateRangeDays={rangeDays} />;
}
