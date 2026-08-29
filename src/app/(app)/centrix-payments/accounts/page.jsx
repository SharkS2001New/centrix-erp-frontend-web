"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CentrixPaymentsAccountsScreen } from "@/components/tab-screens/centrix-payments-accounts";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CentrixPaymentsAccountsScreen />;
}
