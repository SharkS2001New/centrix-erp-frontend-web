"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CentrixPaymentsAdminFinanceRedirect } from "@/components/centrix-payments/centrix-payments-admin-finance-redirect";
import { AdminEquityAccountsScreen } from "@/components/tab-screens/admin-equity-accounts";
import { ADMIN_FINANCE_PATHS } from "@/lib/centrix-payments-routes";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return (
    <CentrixPaymentsAdminFinanceRedirect adminPath={ADMIN_FINANCE_PATHS.equityAccounts}>
      <AdminEquityAccountsScreen />
    </CentrixPaymentsAdminFinanceRedirect>
  );
}
