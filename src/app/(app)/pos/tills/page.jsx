"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { PosTillsScreen } from "@/components/tab-screens/pos-tills";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <PosTillsScreen />;
}
