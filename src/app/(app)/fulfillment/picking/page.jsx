"use client";

import { Suspense } from "react";
import { MobilePickingScreen } from "@/components/fulfillment/mobile-picking-screen";

export default function FulfillmentPickingPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading warehouse picking…</p>}>
      <MobilePickingScreen />
    </Suspense>
  );
}
