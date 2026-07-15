"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingJournalEntriesNewScreen } from "@/components/tab-screens/accounting-journal-entries-new";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingJournalEntriesNewScreen />;
}
