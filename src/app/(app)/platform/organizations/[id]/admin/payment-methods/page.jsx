"use client";

import PaymentMethodsPage from "@/app/(app)/admin/payment-methods/page";
import { PlatformAdminScreen } from "@/components/platform/platform-admin-screen";

export default function PlatformAdminPaymentMethodsPage() {
  return (
    <PlatformAdminScreen breadcrumbTail={[{ label: "Payment methods" }]}>
      <PaymentMethodsPage />
    </PlatformAdminScreen>
  );
}
