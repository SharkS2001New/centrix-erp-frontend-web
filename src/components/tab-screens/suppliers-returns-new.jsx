"use client";

import { useSearchParams } from "next/navigation";
import { tabAddTitle, useTabFormExit } from "@/hooks/use-tab-form-exit";
import { RecordSupplierReturnForm } from "@/components/suppliers/record-supplier-return-form";

export function SuppliersReturnsNewScreen() {
  const { exitTo } = useTabFormExit(tabAddTitle("supplier return"));
  const searchParams = useSearchParams();
  const supplierId = searchParams.get("supplier_id") ?? searchParams.get("supplier");
  const returnTo = searchParams.get("return");

  const backHref =
    supplierId && returnTo !== "returns"
      ? `/suppliers/${supplierId}`
      : "/suppliers/returns";

  return (
    <RecordSupplierReturnForm
      initialSupplierId={supplierId}
      backHref={backHref}
      backLabel={
        supplierId && returnTo !== "returns"
          ? "← Back to supplier"
          : "← Back to supplier returns"
      }
      onSuccess={() => {
        if (returnTo === "returns" || !supplierId) {
          exitTo("/suppliers/returns");
          return;
        }
        exitTo(`/suppliers/${supplierId}`);
      }}
    />
  );
}
