import { P } from "@/lib/permission-codes";

/** Read explicit approval flags from capabilities (preferred over alias expansion). */
function approvalFlag(capabilities, key, fallback = false) {
  const map = capabilities?.approval_permissions;
  if (map && typeof map[key] === "boolean") {
    return map[key];
  }
  return fallback;
}

/** HR leave requests — approver role or HR manage capability. */
export function canApproveLeaveRequests({ hasPermission = () => false, capabilities } = {}) {
  return (
    approvalFlag(capabilities, "leave_requests") ||
    hasPermission(P.hr.leave.approve) ||
    hasPermission(P.hr.manage)
  );
}

/** Payroll run approval — approver role or HR manage capability. */
export function canApprovePayrollRuns({ hasPermission = () => false, capabilities } = {}) {
  return (
    approvalFlag(capabilities, "payroll_runs") ||
    hasPermission(P.hr.payroll.approve) ||
    hasPermission(P.hr.manage)
  );
}

/** Cash advance approval — approver role or HR manage capability. */
export function canApproveCashAdvances({ hasPermission = () => false, capabilities } = {}) {
  return (
    approvalFlag(capabilities, "cash_advances") ||
    hasPermission(P.hr.cash_advances.approve) ||
    hasPermission(P.hr.manage)
  );
}

/** Direct order cancellation without approval workflow. */
export function canDirectCancelOrders({ hasPermission = () => false, capabilities } = {}) {
  return approvalFlag(capabilities, "direct_cancel_orders") || hasPermission("sales.manage");
}

/** Approve or reject order cancellation requests. */
export function canApproveOrderCancellations({ hasPermission = () => false, capabilities } = {}) {
  return (
    approvalFlag(capabilities, "order_cancellations") ||
    hasPermission(P.sales.orders.approve) ||
    hasPermission("sales.manage")
  );
}

export function canApproveSupplierReturns({ hasPermission = () => false, capabilities } = {}) {
  return approvalFlag(capabilities, "supplier_returns") || hasPermission("purchasing.manage");
}

export function canApproveCustomerReturns({ hasPermission = () => false, capabilities } = {}) {
  return approvalFlag(capabilities, "customer_returns") || hasPermission("sales.manage");
}

export function canApproveInventoryOperations({ hasPermission = () => false, capabilities } = {}) {
  return approvalFlag(capabilities, "inventory_operations") || hasPermission("inventory.manage");
}

export function canDirectInventoryAction({ hasPermission = () => false, capabilities } = {}) {
  return approvalFlag(capabilities, "direct_inventory_actions") || hasPermission("inventory.manage");
}

export function canApproveStockTakeCompletions({ hasPermission = () => false, capabilities } = {}) {
  return (
    approvalFlag(capabilities, "stock_take_completions") ||
    hasPermission("inventory.stock_take.approve") ||
    hasPermission("inventory.manage")
  );
}

export function canApproveJournalEntries({ hasPermission = () => false, capabilities } = {}) {
  return (
    approvalFlag(capabilities, "journal_entries") ||
    hasPermission("accounting.journal_entries.approve") ||
    hasPermission("accounting.manage")
  );
}

export function canApproveExpenses({ hasPermission = () => false, capabilities } = {}) {
  return approvalFlag(capabilities, "expenses") || hasPermission("accounting.manage");
}

export function canApproveLpoRequests({ hasPermission = () => false, capabilities } = {}) {
  return (
    approvalFlag(capabilities, "lpo_requests") ||
    hasPermission(P.purchasing.lpo.approve) ||
    hasPermission("purchasing.manage")
  );
}

export function canManageSalesReturns({ hasPermission = () => false, capabilities } = {}) {
  return canApproveCustomerReturns({ hasPermission, capabilities });
}
