"use client";

import { FulfillmentDashboardContent } from "@/components/dashboard/fulfillment-dashboard-content";
import { DistributionHelpButton } from "@/components/fulfillment/distribution-help";

export default function FulfillmentDashboardPage() {
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <DistributionHelpButton />
      </div>
      <FulfillmentDashboardContent />
    </div>
  );
}
