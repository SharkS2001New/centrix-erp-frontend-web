"use client";

import { useSearchParams } from "next/navigation";
import { CustomerReturnForm } from "@/components/sales/customer-return-form";

export default function NewCustomerReturnPage() {
  const searchParams = useSearchParams();
  const initialSaleId = searchParams.get("sale_id") ?? "";

  return (
    <div className="theme-workspace min-h-full">
      <CustomerReturnForm initialSaleId={initialSaleId} />
    </div>
  );
}
