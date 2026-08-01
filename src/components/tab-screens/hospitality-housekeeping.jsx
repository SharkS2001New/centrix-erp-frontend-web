"use client";

import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";

export function HospitalityHousekeepingScreen() {
  return (
    <HospitalityPlaceholderScreen
      title="Housekeeping"
      description="Room status board (clean / dirty / OOO)."
      serviceKey="housekeeping"
    />
  );
}
