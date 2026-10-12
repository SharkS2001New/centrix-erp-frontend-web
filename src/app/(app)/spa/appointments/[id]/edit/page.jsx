"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { AppointmentFormScreen } from "@/components/spa/screens/appointments";

export default function SpaAppointmentEditPage() {
  const params = useParams();
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading appointment…</p>}>
      <AppointmentFormScreen id={decodeURIComponent(String(params.id || ""))} />
    </Suspense>
  );
}
