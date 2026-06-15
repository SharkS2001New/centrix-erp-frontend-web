"use client";

import { useSearchParams } from "next/navigation";
import { CustomerReturnForm } from "@/components/sales/customer-return-form";

export default function NewCustomerReturnPage() {
  const searchParams = useSearchParams();
  const initialSaleId = searchParams.get("sale_id") ?? "";

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <CustomerReturnForm initialSaleId={initialSaleId} />
    </div>
  );
}
