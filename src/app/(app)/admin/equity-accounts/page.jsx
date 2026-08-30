"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AdminEquityAccountsScreen } from "@/components/tab-screens/admin-equity-accounts";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AdminEquityAccountsScreen />;
}
