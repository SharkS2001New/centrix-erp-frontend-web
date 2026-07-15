"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SuppliersIdEditScreen } from "@/components/tab-screens/suppliers-id-edit";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SuppliersIdEditScreen />;
}
