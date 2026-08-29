"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CentrixPaymentsReconciliationScreen } from "@/components/tab-screens/centrix-payments-reconciliation";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CentrixPaymentsReconciliationScreen />;
}
