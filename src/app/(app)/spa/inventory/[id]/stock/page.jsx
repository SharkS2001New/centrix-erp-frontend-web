"use client";

import { useParams } from "next/navigation";
import { StockMovementScreen } from "@/components/spa/screens/inventory";

export default function SpaStockPage() {
  const params = useParams();
  return <StockMovementScreen id={String(params.id || "")} />;
}
