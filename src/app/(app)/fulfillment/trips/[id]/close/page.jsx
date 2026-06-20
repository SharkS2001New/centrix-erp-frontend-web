"use client";

import { useParams } from "next/navigation";
import { TripCloseReconciliation } from "@/components/fulfillment/trip-close-reconciliation";

export default function TripClosePage() {
  const { id } = useParams();
  return <TripCloseReconciliation tripId={id} />;
}
