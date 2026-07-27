"use client";

import { Suspense } from "react";
import { SupplierCreditNoteForm } from "@/components/suppliers/supplier-credit-note-form";
import { CreditNotesCreateTabs } from "@/components/sales/credit-notes-create-tabs";

export function SalesSupplierCreditNotesNewScreen() {
  return (
    <div className="theme-workspace min-h-full">
      <CreditNotesCreateTabs active="supplier" />
      <SupplierCreditNoteForm />
    </div>
  );
}
