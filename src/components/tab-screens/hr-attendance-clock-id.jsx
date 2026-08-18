"use client";

import { HikvisionDeviceScreen } from "@/components/hr/hikvision-device-screen";
import { SettingsApiProvider } from "@/contexts/settings-api-context";

export function HrAttendanceClockIdScreen() {
  return (
    <SettingsApiProvider>
      <HikvisionDeviceScreen />
    </SettingsApiProvider>
  );
}
