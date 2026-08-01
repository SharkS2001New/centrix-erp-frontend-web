"use client";

import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";

export function HospitalityNightAuditScreen() {
  return (
    <HospitalityPlaceholderScreen
      title="Night audit"
      description="End-of-day close and room charge posting."
      serviceKey="night_audit"
    />
  );
}
