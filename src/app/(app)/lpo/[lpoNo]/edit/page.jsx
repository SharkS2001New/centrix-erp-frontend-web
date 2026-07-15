"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { LpoLpoNoEditScreen } from "@/components/tab-screens/lpo-lpoNo-edit";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <LpoLpoNoEditScreen />;
}
