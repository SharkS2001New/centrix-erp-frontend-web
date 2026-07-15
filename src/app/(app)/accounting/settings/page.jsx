"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingSettingsScreen } from "@/components/tab-screens/accounting-settings";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingSettingsScreen />;
}
