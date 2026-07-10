"use client";

import { Suspense } from "react";
import { PlatformSettingsScreen } from "@/components/platform/platform-settings-screen";

export default function PlatformSettingsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading settings…</p>}>
      <PlatformSettingsScreen />
    </Suspense>
  );
}
