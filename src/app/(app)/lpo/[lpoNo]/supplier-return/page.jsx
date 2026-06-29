"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { lpoDisplayNumber } from "@/components/lpo/lpo-shared";
import { RecordSupplierReturnForm } from "@/components/suppliers/record-supplier-return-form";

export default function LpoSupplierReturnPage() {
  const params = useParams();
  const router = useRouter();
  const lpoNo = params.lpoNo;
  const [pageTitle, setPageTitle] = useState(`Supplier return — LPO ${lpoNo}`);

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/lpo-mst/${lpoNo}/summary`)
      .then((res) => {
        if (!cancelled) {
          setPageTitle(`Supplier return — ${lpoDisplayNumber(res?.lpo ?? {})}`);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lpoNo]);

  return (
    <RecordSupplierReturnForm
      initialLpoNo={lpoNo}
      initialMode="lpo"
      backHref={`/lpo/${lpoNo}`}
      backLabel="← Back to LPO"
      pageTitle={pageTitle}
      pageSubtitle="Return products from this purchase order. Stock is reduced only for quantities that were received."
      onSuccess={() => router.push(`/lpo/${lpoNo}`)}
    />
  );
}
