"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AdminRolesScreen } from "@/components/tab-screens/admin-roles";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AdminRolesScreen />;
}
