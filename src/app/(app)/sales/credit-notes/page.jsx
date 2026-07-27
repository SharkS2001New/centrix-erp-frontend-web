"use client";

import { Suspense } from "react";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesCreditNotesScreen } from "@/components/tab-screens/sales-credit-notes";

function CreditNotesPageContent() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesCreditNotesScreen />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="theme-subtext p-6 text-sm">Loading credit notes…</p>}>
      <CreditNotesPageContent />
    </Suspense>
  );
}
