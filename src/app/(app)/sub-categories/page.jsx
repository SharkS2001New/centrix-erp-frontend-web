"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SubCategoriesScreen } from "@/components/tab-screens/sub-categories";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SubCategoriesScreen />;
}
