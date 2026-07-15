"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CustomersListScreen } from "@/components/customers/customers-list-screen";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CustomersListScreen />;
}
