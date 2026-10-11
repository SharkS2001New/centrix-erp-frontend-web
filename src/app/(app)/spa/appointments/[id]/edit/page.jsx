"use client";

import { useParams } from "next/navigation";
import { AppointmentFormScreen } from "@/components/spa/screens/appointments";

export default function SpaAppointmentEditPage() {
  const params = useParams();
  return <AppointmentFormScreen id={decodeURIComponent(String(params.id || ""))} />;
}
