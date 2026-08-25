"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { InvestorsIdScreen } from "@/components/tab-screens/investors-id";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <InvestorsIdScreen />;
}
