"use client";

import SalesOrdersListScreen from "@/components/sales/sales-orders-list-screen";

export function FulfillmentOrdersExpiredScreen() {
  return <SalesOrdersListScreen routeOrdersOnly queueSlug="expired" />;
}
