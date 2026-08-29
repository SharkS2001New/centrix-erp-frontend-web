"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CentrixPaymentsPaybillsSettingsScreen } from "@/components/tab-screens/centrix-payments-settings-paybills";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CentrixPaymentsPaybillsSettingsScreen />;
}
