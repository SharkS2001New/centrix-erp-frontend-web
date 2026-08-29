"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CentrixPaymentsSettingsScreen } from "@/components/tab-screens/centrix-payments-settings";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CentrixPaymentsSettingsScreen />;
}
