#!/usr/bin/env node
/**
 * Opens the local Test connection page (config comes from the Centrix download).
 */

import { ensureConfigFile, isConfigReady, SETTINGS_UI_URL } from "./config-lib.js";
import { runSettingsUi } from "./settings-ui.js";

async function main() {
  const config = ensureConfigFile();
  if (!isConfigReady(config)) {
    console.error("config.json is incomplete. Re-download CentrixAttendanceAgent from HR → Attendance clock-in.");
    process.exit(1);
  }
  console.log("Opening Test connection…");
  console.log(`If the browser does not open, visit ${SETTINGS_UI_URL}`);
  await runSettingsUi({ openBrowser: true, keepOpen: true });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
