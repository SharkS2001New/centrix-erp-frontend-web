"use client";

import { useParams } from "next/navigation";
import { BankReconciliationWorkspace } from "@/components/accounting/bank-reconciliation-workspace";

export function AccountingBankReconciliationIdScreen() {
  const params = useParams();

  return <BankReconciliationWorkspace reconciliationId={params.id} />;
}
