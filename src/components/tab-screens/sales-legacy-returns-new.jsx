"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LegacyReturnForm } from "@/components/sales/legacy-return-form";

function NewLegacyReturnContent() {
  const searchParams = useSearchParams();
  const saleId = searchParams.get("sale_id") ?? "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New legacy return</h1>
        <p className="mt-1 text-sm text-slate-600">
          Issue a KRA credit note against a materialized legacy order. Centrix stock will not change.
        </p>
      </div>
      <LegacyReturnForm initialSaleId={saleId} />
    </div>
  );
}

export function SalesLegacyReturnsNewScreen() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading legacy return…</p>}>
      <NewLegacyReturnContent />
    </Suspense>
  );
}
