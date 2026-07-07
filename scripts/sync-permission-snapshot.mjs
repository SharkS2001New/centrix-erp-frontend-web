#!/usr/bin/env node
/**
 * Refresh scripts/permission-registry.snapshot.json from the sibling API checkout.
 * Run after changing config/permission_registry.php on centrix-erp-backend-api.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const apiRoot = join(root, "..", "centrix-erp-backend-api");
const outPath = join(__dirname, "permission-registry.snapshot.json");

const script = `
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
$codes = App\\Services\\Erp\\PermissionMatrixService::allRegistryCodes();
sort($codes);
echo json_encode($codes, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
`;

const result = spawnSync("php", ["-r", script], { cwd: apiRoot, encoding: "utf8" });

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "Failed to export permission registry.");
  process.exit(1);
}

writeFileSync(outPath, `${result.stdout.trim()}\n`, "utf8");
console.log(`Wrote ${outPath}`);
