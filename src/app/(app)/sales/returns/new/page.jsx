"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CustomerReturnForm } from "@/components/sales/customer-return-form";

function NewCustomerReturnContent() {
  const searchParams = useSearchParams();
  const initialSaleId = searchParams.get("sale_id") ?? "";

  return (
    <div className="theme-workspace min-h-full">
      <CustomerReturnForm initialSaleId={initialSaleId} />
    </div>
  );
}

export default function NewCustomerReturnPage() {
  return (
    <Suspense fallback={<p className="theme-subtext p-6 text-sm">Loading return form…</p>}>
      <NewCustomerReturnContent />
    </Suspense>
  );
}
