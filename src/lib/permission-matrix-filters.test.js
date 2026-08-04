import { describe, expect, it } from "vitest";
import {
  filterPermissionMatrixForCapabilities,
  visibleOrderQueueFeatureKeys,
} from "@/lib/permission-matrix-filters";

const unpaidPaidWorkflowCaps = {
  modules: { sales: true, "sales.backend": true },
  module_settings: {
    sales: {
      enable_mobile_orders: false,
      order_workflow: {
        steps: [
          { status: "unpaid", label: "Unpaid", enabled: true },
          { status: "pending_payment", label: "Partially paid", enabled: true },
          { status: "paid", label: "Paid", enabled: true },
          { status: "booked", label: "Booked", enabled: false },
        ],
      },
    },
  },
};

const mobileOnCaps = {
  ...unpaidPaidWorkflowCaps,
  mobile_orders_enabled: true,
  modules: {
    ...unpaidPaidWorkflowCaps.modules,
    "sales.mobile": true,
  },
  module_settings: {
    sales: {
      ...unpaidPaidWorkflowCaps.module_settings.sales,
      enable_mobile_orders: true,
    },
  },
};

const sampleMatrix = {
  applications: [
    {
      id: "backoffice",
      label: "Backoffice",
      modules: [
        {
          module: "sales",
          label: "Sales",
          features: [
            {
              key: "order_queue_all",
              label: "All orders",
              permissions: [{ id: 1, action: "view", code: "sales.order_queue_all.view" }],
            },
            {
              key: "order_queue_booked",
              label: "Booked orders",
              permissions: [{ id: 2, action: "view", code: "sales.order_queue_booked.view" }],
            },
            {
              key: "order_queue_unpaid",
              label: "Unpaid orders",
              permissions: [{ id: 3, action: "view", code: "sales.order_queue_unpaid.view" }],
            },
            {
              key: "order_queue_pending_payment",
              label: "Partially paid",
              permissions: [{ id: 4, action: "view", code: "sales.order_queue_pending_payment.view" }],
            },
            {
              key: "order_queue_paid",
              label: "Paid orders",
              permissions: [{ id: 5, action: "view", code: "sales.order_queue_paid.view" }],
            },
            {
              key: "order_queue_mobile",
              label: "Mobile orders",
              permissions: [{ id: 6, action: "view", code: "sales.order_queue_mobile.view" }],
            },
            {
              key: "orders",
              label: "Orders",
              permissions: [{ id: 7, action: "view", code: "sales.orders.view" }],
            },
          ],
        },
        {
          module: "mobile_sales",
          label: "Mobile sales",
          features: [
            {
              key: "routes",
              label: "Routes",
              permissions: [{ id: 8, action: "view", code: "mobile_sales.routes.view" }],
            },
          ],
        },
      ],
    },
  ],
  groups: [],
};

describe("permission matrix workflow filter", () => {
  it("hides Booked when the org workflow is unpaid / partially paid / paid only", () => {
    const keys = visibleOrderQueueFeatureKeys(unpaidPaidWorkflowCaps);
    expect(keys.has("order_queue_unpaid")).toBe(true);
    expect(keys.has("order_queue_pending_payment")).toBe(true);
    expect(keys.has("order_queue_paid")).toBe(true);
    expect(keys.has("order_queue_booked")).toBe(false);
    expect(keys.has("order_queue_mobile")).toBe(false);

    const filtered = filterPermissionMatrixForCapabilities(sampleMatrix, unpaidPaidWorkflowCaps);
    const featureKeys = filtered.applications[0].modules[0].features.map((f) => f.key);
    expect(featureKeys).toContain("order_queue_unpaid");
    expect(featureKeys).toContain("orders");
    expect(featureKeys).not.toContain("order_queue_booked");
    expect(featureKeys).not.toContain("order_queue_mobile");
    expect(filtered.applications[0].modules.some((m) => m.module === "mobile_sales")).toBe(false);
  });

  it("shows Mobile orders / mobile_sales when mobile orders are enabled", () => {
    const keys = visibleOrderQueueFeatureKeys(mobileOnCaps);
    expect(keys.has("order_queue_mobile")).toBe(true);

    const filtered = filterPermissionMatrixForCapabilities(sampleMatrix, mobileOnCaps);
    const featureKeys = filtered.applications[0].modules[0].features.map((f) => f.key);
    expect(featureKeys).toContain("order_queue_mobile");
    expect(filtered.applications[0].modules.some((m) => m.module === "mobile_sales")).toBe(true);
  });

  it("hides in-app Notifications inbox permission (bell + View all is enough)", () => {
    const withNotifications = {
      applications: [
        {
          id: "backoffice",
          label: "Backoffice",
          modules: [
            {
              module: "admin",
              label: "Admin",
              features: [
                {
                  key: "notifications",
                  label: "Notifications",
                  permissions: [{ id: 9, action: "view", code: "admin.notifications.view" }],
                },
                {
                  key: "users",
                  label: "Users",
                  permissions: [{ id: 10, action: "view", code: "admin.users.view" }],
                },
              ],
            },
          ],
        },
      ],
      groups: [],
    };
    const filtered = filterPermissionMatrixForCapabilities(withNotifications, unpaidPaidWorkflowCaps);
    const featureKeys = filtered.applications[0].modules[0].features.map((f) => f.key);
    expect(featureKeys).toContain("users");
    expect(featureKeys).not.toContain("notifications");
  });
});
