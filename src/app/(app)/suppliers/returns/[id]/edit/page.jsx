"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SuppliersReturnsIdEditScreen } from "@/components/tab-screens/suppliers-returns-id-edit";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SuppliersReturnsIdEditScreen />;
}
