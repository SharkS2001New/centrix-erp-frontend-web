"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesReturnsScreen } from "@/components/tab-screens/sales-returns";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesReturnsScreen />;
}
