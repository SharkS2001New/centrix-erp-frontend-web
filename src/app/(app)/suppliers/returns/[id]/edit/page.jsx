"use client";

import { useParams, useRouter } from "next/navigation";
import { RecordSupplierReturnForm } from "@/components/suppliers/record-supplier-return-form";

export default function EditSupplierReturnPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id;

  return (
    <RecordSupplierReturnForm
      editDocumentId={documentId}
      backHref="/suppliers/returns"
      backLabel="← Back to supplier returns"
      pageTitle={`Edit supplier return #${documentId}`}
      pageSubtitle="Update products, quantities, or return reason. Approved returns recalculate stock when saved."
      onSuccess={() => router.push("/suppliers/returns")}
    />
  );
}
