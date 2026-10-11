"use client";

import { useParams } from "next/navigation";
import { ProductFormScreen } from "@/components/spa/screens/inventory";

export default function SpaProductEditPage() {
  const params = useParams();
  return <ProductFormScreen id={String(params.id || "")} />;
}
