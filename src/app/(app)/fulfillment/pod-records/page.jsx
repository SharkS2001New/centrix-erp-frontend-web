"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { FulfillmentPodRecordsScreen } from "@/components/tab-screens/fulfillment-pod-records";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <FulfillmentPodRecordsScreen />;
}
