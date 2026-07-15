"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { FulfillmentOrdersExpiredScreen } from "@/components/tab-screens/fulfillment-orders-expired";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <FulfillmentOrdersExpiredScreen />;
}
