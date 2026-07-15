"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AdminAuditScreen } from "@/components/tab-screens/admin-audit";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AdminAuditScreen />;
}
