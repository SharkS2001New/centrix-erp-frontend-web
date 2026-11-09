#!/usr/bin/env node
/**
 * Run the Critical vitest suite and fail if any test is skipped.
 * Mirrors PHPUnit --fail-on-skipped used by the backend Critical gate.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "critical-results.json");

if (existsSync(reportPath)) {
  unlinkSync(reportPath);
}

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "vitest",
    "run",
    "--config",
    "vitest.critical.mjs",
    "--reporter=default",
    "--reporter=json",
    `--outputFile=${reportPath}`,
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!existsSync(reportPath)) {
  console.error("Critical suite produced no JSON report; refusing to pass.");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (error) {
  console.error("Failed to parse Critical JSON report:", error.message);
  process.exit(1);
} finally {
  try {
    unlinkSync(reportPath);
  } catch {
    /* ignore */
  }
}

const skipped = [];

function walk(suite, file = "") {
  if (!suite || typeof suite !== "object") return;
  const nextFile = suite.file || file;
  if (Array.isArray(suite.assertionResults)) {
    for (const assertion of suite.assertionResults) {
      if (assertion.status === "pending" || assertion.status === "skipped") {
        skipped.push(`${nextFile}: ${assertion.title || assertion.fullName || "(unnamed)"}`);
      }
    }
  }
  if (Array.isArray(suite.testResults)) {
    for (const child of suite.testResults) {
      walk(child, nextFile);
    }
  }
  if (Array.isArray(suite.tests)) {
    for (const test of suite.tests) {
      const mode = test.mode || test.result?.state;
      if (mode === "skip" || mode === "todo" || test.result?.state === "skip") {
        skipped.push(`${nextFile}: ${test.name || test.fullName || "(unnamed)"}`);
      }
    }
  }
}

if (Array.isArray(report.testResults)) {
  for (const fileResult of report.testResults) {
    walk(fileResult, fileResult.name || fileResult.file || "");
    if (Array.isArray(fileResult.assertionResults)) {
      for (const assertion of fileResult.assertionResults) {
        if (assertion.status === "pending" || assertion.status === "skipped") {
          skipped.push(
            `${fileResult.name || fileResult.file || "?"}: ${assertion.title || assertion.fullName || "(unnamed)"}`,
          );
        }
      }
    }
  }
}

const numTotal = report.numTotalTests ?? report.testResults?.length ?? 0;
if (!numTotal && !report.testResults?.length) {
  console.error("Critical suite ran zero tests; refusing to pass.");
  process.exit(1);
}

if (skipped.length > 0) {
  console.error(`Critical suite has ${skipped.length} skipped test(s) — not allowed:`);
  for (const line of skipped) {
    console.error(`  - ${line}`);
  }
  process.exit(1);
}

console.log("Critical suite passed with no skipped tests.");
