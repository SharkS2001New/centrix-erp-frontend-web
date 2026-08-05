"use client";

import { useParams } from "next/navigation";
import { tabEditTitle, useTabFormExit } from "@/hooks/use-tab-form-exit";
import { RecordSupplierReturnForm } from "@/components/suppliers/record-supplier-return-form";

export function SuppliersReturnsIdEditScreen() {
  const params = useParams();
  const documentId = params.id;
  const { exitTo } = useTabFormExit(tabEditTitle("supplier return", `#${documentId}`));

  return (
    <RecordSupplierReturnForm
      editDocumentId={documentId}
      backHref="/suppliers/returns"
      backLabel="← Back to supplier returns"
      pageTitle={`Edit supplier return #${documentId}`}
      pageSubtitle="Update products, quantities, or return reason. Approved returns recalculate stock when saved."
      onSuccess={() => exitTo("/suppliers/returns")}
    />
  );
}
