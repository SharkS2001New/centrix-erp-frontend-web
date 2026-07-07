#!/usr/bin/env node
/**
 * Validates that critical frontend permission codes exist in the backend registry export.
 * Run from repo root after syncing permissions on the API:
 *   php ../centrix-erp-backend-api/artisan erp:export-permission-registry > /tmp/registry.json
 *   node scripts/check-permission-codes.mjs /tmp/registry.json
 *
 * Or with committed snapshot (CI):
 *   node scripts/check-permission-codes.mjs scripts/permission-registry.snapshot.json
 *
 * Or with inline registry from artisan (requires API checkout):
 *   node scripts/check-permission-codes.mjs --from-artisan
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** @type {string[]} */
const REQUIRED_CODES = [
  "sales.orders.view",
  "sales.orders.create",
  "sales.orders.edit",
  "sales.orders.approve",
  "sales.discounts.give",
  "admin.discount_approvals.approve",
  "purchasing.lpo.approve",
  "payments.sale_payments.create",
  "payments.customer_invoices.create",
  "payments.customer_payments.create",
  "hr.employees.edit",
  "dashboard.overview.view",
];

function loadRegistryCodes(arg) {
  if (arg === "--from-artisan") {
    const apiRoot = join(root, "..", "centrix-erp-backend-api");
    const result = spawnSync("php", ["artisan", "erp:export-permission-registry"], {
      cwd: apiRoot,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      console.error(result.stderr || result.stdout);
      process.exit(1);
    }
    return JSON.parse(result.stdout);
  }

  const raw = readFileSync(arg, "utf8");
  return JSON.parse(raw);
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/check-permission-codes.mjs <registry.json|--from-artisan>");
  process.exit(1);
}

const registry = new Set(loadRegistryCodes(arg));
const missing = REQUIRED_CODES.filter((code) => !registry.has(code));

if (missing.length) {
  console.error("Missing permission codes in backend registry:");
  for (const code of missing) {
    console.error(`  - ${code}`);
  }
  process.exit(1);
}

console.log(`OK: ${REQUIRED_CODES.length} critical frontend permission codes exist in registry.`);
