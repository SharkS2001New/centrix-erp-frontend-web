"use client";

import { useParams } from "next/navigation";
import { TripCloseReconciliation } from "@/components/fulfillment/trip-close-reconciliation";

export function FulfillmentTripsIdCloseScreen() {
  const { id } = useParams();
  return <TripCloseReconciliation tripId={id} />;
}
