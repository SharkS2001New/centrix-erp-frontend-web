"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { FulfillmentDriversIdScreen } from "@/components/tab-screens/fulfillment-drivers-id";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <FulfillmentDriversIdScreen />;
}
