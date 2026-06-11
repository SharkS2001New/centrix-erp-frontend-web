"use client";

import { useSearchParams } from "next/navigation";
import { useParams } from "next/navigation";
import { OrderSummaryScreen } from "@/components/sales/order-summary-screen";

export default function SaleOrderDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const saleId = params.id;
  const backHref = searchParams.get("from") || "/sales/orders";

  return <OrderSummaryScreen saleId={saleId} backHref={backHref} />;
}
