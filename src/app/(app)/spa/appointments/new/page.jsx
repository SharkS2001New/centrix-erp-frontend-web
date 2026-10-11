"use client";

import { Suspense } from "react";
import { AppointmentFormScreen } from "@/components/spa/screens/appointments";

export default function SpaAppointmentNewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading appointment…</p>}>
      <AppointmentFormScreen />
    </Suspense>
  );
}
