import { describe, expect, it } from "vitest";
import {
  canViewAnySalesOrderQueue,
  canViewOrderQueue,
  orderQueuePermissionCode,
  SALES_ORDERS_VIEW_ALL_QUEUES,
} from "@/lib/order-queue-permissions";

function allow(...codes) {
  const set = new Set(codes);
  return (code) => set.has(code);
}

describe("canViewOrderQueue", () => {
  it("requires the specific queue permission — not sales.orders.view", () => {
    const has = allow(SALES_ORDERS_VIEW_ALL_QUEUES);
    expect(canViewOrderQueue("all", has)).toBe(false);
    expect(canViewOrderQueue("unpaid", has)).toBe(false);
    expect(canViewOrderQueue("mobile", has)).toBe(false);
  });

  it("allows only the granted queue permission", () => {
    const has = allow(orderQueuePermissionCode("unpaid"));
    expect(canViewOrderQueue("unpaid", has)).toBe(true);
    expect(canViewOrderQueue("all", has)).toBe(false);
    expect(canViewOrderQueue("mobile", has)).toBe(false);
  });

  it("does not treat sales.view, analytics, or reports as queue grants", () => {
    const has = allow(
      "sales.view",
      "sales.manage",
      "dashboard.sales.view",
      "reports.daily_sales.view",
      "sales.returns.view",
    );
    expect(canViewOrderQueue("all", has)).toBe(false);
    expect(canViewOrderQueue("unpaid", has)).toBe(false);
    expect(canViewAnySalesOrderQueue(has)).toBe(false);
  });

  it("legacy sales.orders.view still allows opening a sale detail via canViewAny", () => {
    const has = allow(SALES_ORDERS_VIEW_ALL_QUEUES);
    expect(canViewAnySalesOrderQueue(has)).toBe(true);
  });
});
