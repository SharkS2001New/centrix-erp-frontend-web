"use client";

import { useParams } from "next/navigation";
import SalesOrdersListScreen from "@/components/sales/sales-orders-list-screen";

export default function SalesOrderQueuePage() {
  const params = useParams();
  return <SalesOrdersListScreen queueSlug={String(params.slug ?? "")} />;
}
