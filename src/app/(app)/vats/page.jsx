"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { VatsScreen } from "@/components/tab-screens/vats";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <VatsScreen />;
}
