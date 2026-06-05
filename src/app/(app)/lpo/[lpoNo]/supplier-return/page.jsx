"use client";

import { useRouter, useParams } from "next/navigation";
import { RecordSupplierReturnForm } from "@/components/suppliers/record-supplier-return-form";

export default function LpoSupplierReturnPage() {
  const params = useParams();
  const router = useRouter();
  const lpoNo = params.lpoNo;

  return (
    <RecordSupplierReturnForm
      initialLpoNo={lpoNo}
      initialMode="lpo"
      backHref={`/lpo/${lpoNo}`}
      backLabel="← Back to LPO"
      pageTitle={`Supplier return — LPO ${lpoNo}`}
      pageSubtitle="Return products from this purchase order. Stock is reduced only for quantities that were received."
      onSuccess={() => router.push(`/lpo/${lpoNo}`)}
    />
  );
}
