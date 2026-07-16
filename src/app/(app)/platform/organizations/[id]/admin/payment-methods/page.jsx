"use client";

import { AdminPaymentMethodsScreen } from "@/components/tab-screens/admin-payment-methods";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminPaymentMethodsPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Payment methods" }]}>
      <AdminPaymentMethodsScreen />
    </PlatformAdminScreen>
  );
}
