import SalesOrdersListScreen from "@/components/sales/sales-orders-list-screen";

export default function FulfillmentRouteOrdersPage() {
  return <SalesOrdersListScreen routeOrdersOnly routeOrdersDateRangeDays={30} />;
}
