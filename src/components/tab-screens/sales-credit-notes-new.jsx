"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CreditNoteForm } from "@/components/sales/credit-note-form";
import { CreditNotesCreateTabs } from "@/components/sales/credit-notes-create-tabs";

function NewCreditNoteContent() {
  const searchParams = useSearchParams();
  const initialSaleId = searchParams.get("sale_id") ?? "";

  return (
    <div className="theme-workspace min-h-full">
      <CreditNotesCreateTabs active="customer" />
      <CreditNoteForm initialSaleId={initialSaleId} />
    </div>
  );
}

export function SalesCreditNotesNewScreen() {
  return (
    <Suspense fallback={<p className="theme-subtext p-6 text-sm">Loading credit note form…</p>}>
      <NewCreditNoteContent />
    </Suspense>
  );
}
