"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AdminSettingsScreen } from "@/components/tab-screens/admin-settings";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AdminSettingsScreen />;
}
