"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesLegacyReturnsScreen } from "@/components/tab-screens/sales-legacy-returns";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesLegacyReturnsScreen />;
}
