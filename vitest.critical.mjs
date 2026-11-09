import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Critical: always-on deploy gate for POS / offline / hotel / KRA / RBAC / checkout.
 * Must not use test.skip — CI fails on any skipped Critical test.
 * Full unit suite remains `npm test` (also run on every Web CI push).
 */
export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: false,
    include: [
      "src/lib/route-access.test.js",
      "src/lib/approval-permissions.test.js",
      "src/lib/order-queue-permissions.test.js",
      "src/lib/permission-matrix-filters.test.js",
      "src/lib/checkout-payment-splits.test.js",
      "src/lib/collect-sale-payment.test.js",
      "src/lib/pos-ticket-checkout.test.js",
      "src/lib/pos-checkout-credit-sale.test.js",
      "src/lib/pos-cart-merge.test.js",
      "src/lib/pos-line.test.js",
      "src/lib/pos-stock.test.js",
      "src/lib/pos-offline-db.test.js",
      "src/lib/pos-offline-outbox-guard.test.js",
      "src/lib/pos-offline-wipe-cart.test.js",
      "src/lib/pos-offline-sync-collect.test.js",
      "src/lib/pos-offline-sale-cache.test.js",
      "src/lib/pos-offline-till-isolation.test.js",
      "src/lib/pos-offline-continue.test.js",
      "src/lib/pos-offline-pay-now-heal.test.js",
      "src/lib/hotel-pos-offline.test.js",
      "src/lib/hotel-pos-settings.test.js",
      "src/lib/hotel-pos-menu.test.js",
      "src/lib/kra-device-errors.test.js",
      "src/lib/kra-receipt-qr.test.js",
      "src/lib/kra-fiscal-receipt-print.test.js",
      "src/lib/sales.test.js",
      "src/lib/order-workflow-balance.test.js",
      "src/lib/nav-feature-gates.attendance.test.js",
      "src/lib/nav-feature-gates.shop-debtors.test.js",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
