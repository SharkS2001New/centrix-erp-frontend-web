"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingCustomerInvoicesIdScreen } from "@/components/tab-screens/accounting-customer-invoices-id";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingCustomerInvoicesIdScreen />;
}
