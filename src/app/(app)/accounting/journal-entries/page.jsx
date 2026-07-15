"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingJournalEntriesScreen } from "@/components/tab-screens/accounting-journal-entries";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingJournalEntriesScreen />;
}
