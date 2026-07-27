"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesCreditNotesNewScreen } from "@/components/tab-screens/sales-credit-notes-new";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesCreditNotesNewScreen />;
}
