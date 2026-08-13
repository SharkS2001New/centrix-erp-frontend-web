"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HikvisionDeviceScreen } from "@/components/hr/hikvision-device-screen";
import { SettingsApiProvider } from "@/contexts/settings-api-context";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return (
    <SettingsApiProvider>
      <HikvisionDeviceScreen />
    </SettingsApiProvider>
  );
}
