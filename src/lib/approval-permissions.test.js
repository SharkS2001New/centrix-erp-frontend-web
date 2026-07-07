import { describe, expect, it } from "vitest";
import {
  canApproveCashAdvances,
  canApproveExpenses,
  canApproveInventoryOperations,
  canApproveJournalEntries,
  canApproveLeaveRequests,
  canApproveLpoRequests,
  canApproveOrderCancellations,
  canApprovePayrollRuns,
  canApproveStockTakeCompletions,
  canApproveSupplierReturns,
  canDirectCancelOrders,
  canDirectInventoryAction,
} from "@/lib/approval-permissions";

const caps = (map) => ({ approval_permissions: map });
const denyAll = () => ({ hasPermission: () => false, capabilities: caps({}) });

describe("approval-permissions", () => {
  it("uses explicit approval_permissions from capabilities when present", () => {
    expect(canApproveLeaveRequests({ ...denyAll(), capabilities: caps({ leave_requests: true }) })).toBe(true);
    expect(canApprovePayrollRuns({ ...denyAll(), capabilities: caps({ payroll_runs: true }) })).toBe(true);
    expect(canApproveCashAdvances({ ...denyAll(), capabilities: caps({ cash_advances: true }) })).toBe(true);
  });

  it("falls back to role permission codes", () => {
    const hasPermission = (code) => code === "hr.leave.approve";
    expect(canApproveLeaveRequests({ hasPermission })).toBe(true);
    expect(canApprovePayrollRuns({ hasPermission: (code) => code === "hr.payroll.approve" })).toBe(true);
    expect(canApproveCashAdvances({ hasPermission: (code) => code === "hr.cash_advances.approve" })).toBe(true);
  });

  it("separates direct cancel from cancellation approval", () => {
    const hasPermission = (code) => code === "sales.orders.approve";
    expect(canDirectCancelOrders({ hasPermission })).toBe(false);
    expect(canApproveOrderCancellations({ hasPermission })).toBe(true);
  });

  it("maps procurement and inventory approval flags", () => {
    expect(canApproveLpoRequests({ ...denyAll(), capabilities: caps({ lpo_requests: true }) })).toBe(true);
    expect(canApproveSupplierReturns({ ...denyAll(), capabilities: caps({ supplier_returns: true }) })).toBe(true);
    expect(canApproveInventoryOperations({ ...denyAll(), capabilities: caps({ inventory_operations: true }) })).toBe(
      true,
    );
    expect(
      canApproveStockTakeCompletions({ ...denyAll(), capabilities: caps({ stock_take_completions: true }) }),
    ).toBe(true);
    expect(canDirectInventoryAction({ ...denyAll(), capabilities: caps({ direct_inventory_actions: true }) })).toBe(
      true,
    );
  });

  it("maps accounting approval flags", () => {
    expect(canApproveJournalEntries({ ...denyAll(), capabilities: caps({ journal_entries: true }) })).toBe(true);
    expect(canApproveExpenses({ ...denyAll(), capabilities: caps({ expenses: true }) })).toBe(true);
  });

  it("prefers capabilities map when explicitly true", () => {
    expect(
      canApproveLeaveRequests({
        hasPermission: () => false,
        capabilities: caps({ leave_requests: true }),
      }),
    ).toBe(true);
  });
});
