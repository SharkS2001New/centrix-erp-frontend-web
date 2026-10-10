"use client";

import { Suspense } from "react";
import { ClientsScreen } from "@/components/spa/screens/clients";

export default function SpaClientsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading clients…</p>}>
      <ClientsScreen />
    </Suspense>
  );
}
