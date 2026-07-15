"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { UsersScreen } from "@/components/tab-screens/users";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <UsersScreen />;
}
