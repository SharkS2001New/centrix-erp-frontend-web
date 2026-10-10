"use client";

import { Suspense } from "react";
import { AppointmentsScreen } from "@/components/spa/screens/appointments";

export default function SpaAppointmentsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading appointments…</p>}>
      <AppointmentsScreen />
    </Suspense>
  );
}
