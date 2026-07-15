"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { FulfillmentTripsIdCloseScreen } from "@/components/tab-screens/fulfillment-trips-id-close";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <FulfillmentTripsIdCloseScreen />;
}
