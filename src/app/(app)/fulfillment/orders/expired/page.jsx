import SalesOrdersListScreen from "@/components/sales/sales-orders-list-screen";

export default function ExpiredRouteOrdersPage() {
  return <SalesOrdersListScreen routeOrdersOnly queueSlug="expired" />;
}
