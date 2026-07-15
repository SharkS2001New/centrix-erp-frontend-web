"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { RoutesNewScreen } from "@/components/tab-screens/routes-new";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <RoutesNewScreen />;
}
