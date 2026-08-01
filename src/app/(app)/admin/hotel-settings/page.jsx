"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HospitalitySettingsScreen } from "@/components/tab-screens/hospitality-settings";

/** Hotel F&B / POS settings — lives under Administration for hospitality tenants. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HospitalitySettingsScreen />;
}
