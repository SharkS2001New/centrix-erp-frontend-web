import { describe, expect, it } from "vitest";
import { notificationBelongsToWorkspace } from "@/lib/notification-workspace";

describe("notificationBelongsToWorkspace", () => {
  it("keeps discount approvals in backoffice, not distribution", () => {
    const discount = {
      type: "approval",
      title: "Discount approval requested",
      action_url: "/sales/orders/queues/pending-approval",
      action_request: { type: "discount", module: "sales" },
    };

    expect(notificationBelongsToWorkspace(discount, "backoffice")).toBe(true);
    expect(notificationBelongsToWorkspace(discount, "distribution")).toBe(false);
    expect(notificationBelongsToWorkspace(discount, "accounting")).toBe(false);
  });

  it("keeps fulfillment trip alerts in distribution only", () => {
    const trip = {
      type: "info",
      title: "Trip updated",
      action_url: "/fulfillment/trips/12",
    };

    expect(notificationBelongsToWorkspace(trip, "distribution")).toBe(true);
    expect(notificationBelongsToWorkspace(trip, "backoffice")).toBe(false);
  });

  it("does not treat sales order deep-links as distribution notifications", () => {
    const orderLink = {
      type: "info",
      title: "Order ready",
      action_url: "/sales/orders/99",
    };

    expect(notificationBelongsToWorkspace(orderLink, "distribution")).toBe(false);
    expect(notificationBelongsToWorkspace(orderLink, "backoffice")).toBe(true);
  });
});
