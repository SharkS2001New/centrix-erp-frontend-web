"use client";

import { DistributionHelpDialog } from "@/components/fulfillment/distribution-help";

export function FulfillmentModuleShell({ children }) {
  return (
    <>
      {children}
      <DistributionHelpDialog />
    </>
  );
}
