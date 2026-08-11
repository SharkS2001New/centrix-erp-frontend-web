#!/usr/bin/env node
/**
 * First-run / repair setup.
 * Default: opens the local settings UI in a browser.
 * CLI: node setup.js --cli
 */

import { ensureConfigFile, isConfigReady, SETTINGS_UI_URL } from "./config-lib.js";
import { runSettingsUi } from "./settings-ui.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { saveConfig, normalizeConfig } from "./config-lib.js";

async function runCli() {
  const config = normalizeConfig(ensureConfigFile());
  const rl = createInterface({ input, output });
  try {
    console.log("Centrix Attendance Agent setup (CLI)");
    console.log("Leave blank to keep the current/prefilled value.\n");

    async function ask(label, defaultValue = "") {
      const hint = defaultValue ? ` [${defaultValue}]` : "";
      const answer = await rl.question(`${label}${hint}: `);
      return String(answer ?? "").trim() || defaultValue;
    }

    config.deviceNo = await ask("Centrix device number", config.deviceNo);
    config.hikvision.host = await ask("Hikvision LAN IP", config.hikvision.host);
    config.hikvision.port = Number(await ask("Hikvision port", String(config.hikvision.port || 80)));
    config.hikvision.username = await ask("Hikvision username", config.hikvision.username || "admin");
    const nextPassword = await ask("Hikvision password", config.hikvision.password || "");
    if (nextPassword) config.hikvision.password = nextPassword;
    const httpsAns = await ask("Use HTTPS? (y/N)", config.hikvision.useHttps ? "y" : "n");
    config.hikvision.useHttps = /^y(es)?$/i.test(httpsAns);
    saveConfig(config);
    console.log("\nSaved. Next: npm run doctor  then  npm start");
  } finally {
    rl.close();
  }
}

async function main() {
  if (process.argv.includes("--cli")) {
    await runCli();
    return;
  }

  ensureConfigFile();
  console.log("Opening Centrix Attendance Agent settings UI…");
  console.log(`If the browser does not open, visit ${SETTINGS_UI_URL}`);
  const result = await runSettingsUi({ openBrowser: true, waitUntilReady: true });
  if (result.alreadyRunning) {
    process.exit(isConfigReady(ensureConfigFile()) ? 0 : 1);
    return;
  }
  process.exit(result.ready ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
