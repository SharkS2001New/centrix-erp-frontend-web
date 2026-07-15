"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { RecordSupplierPaymentForm } from "@/components/suppliers/record-supplier-payment-form";

export function SuppliersPaymentsNewScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const supplierId = searchParams.get("supplier_id") ?? searchParams.get("supplier");
  const lpoNo = searchParams.get("lpo_no") ?? searchParams.get("lpo");
  const returnTo = searchParams.get("return");

  function handleSuccess(id) {
    if (returnTo === "payments") {
      router.push("/suppliers/payments");
      return;
    }
    if (id) {
      router.push(`/suppliers/${id}?tab=payments`);
      return;
    }
    router.push("/suppliers/payments");
  }

  const backHref =
    supplierId && returnTo !== "payments"
      ? `/suppliers/${supplierId}?tab=payments`
      : "/suppliers/payments";

  return (
    <RecordSupplierPaymentForm
      initialSupplierId={supplierId}
      initialLpoNo={lpoNo}
      onSuccess={handleSuccess}
      backHref={backHref}
      backLabel={
        supplierId && returnTo !== "payments"
          ? "← Back to supplier payments"
          : "← Back to supplier payments list"
      }
    />
  );
}
