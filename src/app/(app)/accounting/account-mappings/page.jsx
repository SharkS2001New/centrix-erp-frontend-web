"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingAccountMappingsScreen } from "@/components/tab-screens/accounting-account-mappings";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingAccountMappingsScreen />;
}
