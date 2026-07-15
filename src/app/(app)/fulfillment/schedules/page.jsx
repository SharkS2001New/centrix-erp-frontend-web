"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { FulfillmentSchedulesScreen } from "@/components/tab-screens/fulfillment-schedules";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <FulfillmentSchedulesScreen />;
}
