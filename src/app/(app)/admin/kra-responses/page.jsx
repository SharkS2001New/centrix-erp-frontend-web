"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AdminKraResponsesScreen } from "@/components/tab-screens/admin-kra-responses";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AdminKraResponsesScreen />;
}
