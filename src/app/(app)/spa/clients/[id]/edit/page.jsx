"use client";

import { useParams } from "next/navigation";
import { ClientFormScreen } from "@/components/spa/screens/clients";

export default function SpaClientEditPage() {
  const params = useParams();
  return <ClientFormScreen id={String(params.id || "")} />;
}
