"use client";

import { Suspense } from "react";
import { WhatsappAdminScreen } from "@/components/sales/whatsapp-admin-screen";

export default function SalesWhatsappPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading…</p>}>
      <WhatsappAdminScreen />
    </Suspense>
  );
}
