"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TillManagementScreen } from "@/components/pos/till-management-screen";
import { useAuth } from "@/contexts/auth-context";
import { isTillFloatWorkflowEnabled } from "@/lib/sales-settings";

function TillManagementGate() {
  const router = useRouter();
  const { capabilities } = useAuth();
  const requireTillFloat = isTillFloatWorkflowEnabled(capabilities?.module_settings);

  useEffect(() => {
    if (capabilities && !requireTillFloat) {
      router.replace("/sales");
    }
  }, [capabilities, requireTillFloat, router]);

  if (!capabilities || !requireTillFloat) {
    return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  }

  return <TillManagementScreen />;
}

export default function TillManagementPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading till management…</p>}>
      <TillManagementGate />
    </Suspense>
  );
}
