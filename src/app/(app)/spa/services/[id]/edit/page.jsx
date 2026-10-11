"use client";

import { useParams } from "next/navigation";
import { ServiceFormScreen } from "@/components/spa/screens/services";

export default function SpaServiceEditPage() {
  const params = useParams();
  return <ServiceFormScreen id={String(params.id || "")} />;
}
