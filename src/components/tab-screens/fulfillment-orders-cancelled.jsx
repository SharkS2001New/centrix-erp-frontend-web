"use client";

import SalesOrdersListScreen from "@/components/sales/sales-orders-list-screen";

export function FulfillmentOrdersCancelledScreen() {
  return <SalesOrdersListScreen routeOrdersOnly queueSlug="cancelled" />;
}
