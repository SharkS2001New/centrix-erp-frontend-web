"use client";

import { Suspense } from "react";
import { WalkInFormScreen } from "@/components/spa/screens/appointments";

export default function SpaWalkInPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading appointments…</p>}>
      <WalkInFormScreen />
    </Suspense>
  );
}
