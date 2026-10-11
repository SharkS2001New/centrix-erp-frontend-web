"use client";

import { useParams } from "next/navigation";
import { StaffFormScreen } from "@/components/spa/screens/staff";

export default function SpaStaffEditPage() {
  const params = useParams();
  return <StaffFormScreen id={String(params.id || "")} />;
}
