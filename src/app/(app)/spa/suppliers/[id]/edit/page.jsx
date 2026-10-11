"use client";

import { useParams } from "next/navigation";
import { SupplierFormScreen } from "@/components/spa/screens/suppliers";

export default function SpaSupplierEditPage() {
  const params = useParams();
  return <SupplierFormScreen id={String(params.id || "")} />;
}
