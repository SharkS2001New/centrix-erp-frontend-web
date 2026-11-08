"use client";

import { Suspense } from "react";
import { PosScreen } from "@/components/spa/screens/pos";

export default function SpaPosPage() {
  return (
    <Suspense fallback={<p className="theme-subtext text-sm">Loading till…</p>}>
      <PosScreen />
    </Suspense>
  );
}
