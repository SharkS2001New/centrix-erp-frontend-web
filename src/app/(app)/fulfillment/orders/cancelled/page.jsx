"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { FulfillmentOrdersCancelledScreen } from "@/components/tab-screens/fulfillment-orders-cancelled";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <FulfillmentOrdersCancelledScreen />;
}
