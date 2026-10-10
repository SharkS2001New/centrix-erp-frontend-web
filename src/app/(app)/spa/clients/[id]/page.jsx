"use client";

import { useParams } from "next/navigation";
import { ClientDetailScreen } from "@/components/spa/screens/clients";

export default function SpaClientPage() {
  const params = useParams();
  return <ClientDetailScreen id={String(params.id || "")} />;
}
