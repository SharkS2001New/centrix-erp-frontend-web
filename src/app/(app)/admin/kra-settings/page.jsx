"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AdminKraSettingsScreen } from "@/components/tab-screens/admin-kra-settings";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AdminKraSettingsScreen />;
}
