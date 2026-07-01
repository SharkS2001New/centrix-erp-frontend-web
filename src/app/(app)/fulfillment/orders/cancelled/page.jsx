import SalesOrdersListScreen from "@/components/sales/sales-orders-list-screen";

export default function CancelledRouteOrdersPage() {
  return <SalesOrdersListScreen routeOrdersOnly queueSlug="cancelled" />;
}
