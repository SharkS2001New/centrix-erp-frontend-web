"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesReservationsScreen } from "@/components/tab-screens/sales-reservations";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesReservationsScreen />;
}
