import path from "node:path";
import { ensureSourceRootExists, zipDirectoryStore } from "@/lib/print-agent-source-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_ZIP_NAME = "CentrixAttendanceAgent.zip";
const ZIP_ROOT = "centrix-attendance-agent";

function sourceRoot() {
  return path.join(process.cwd(), "attendance-agent");
}

function installReadme() {
  return `# Centrix Attendance Agent

Preconfigured package from Centrix → Administration → Attendance clock-in.

## Quick start (Windows office PC on same LAN as Hikvision)

1. Unzip this folder anywhere (e.g. C:\\Centrix\\attendance-agent).
2. Install Node.js 20+ if needed: https://nodejs.org/
3. Double-click **open-settings.bat** (first-run UI) — confirm device LAN IP / password, Save & test.
4. Double-click **install-windows.bat** (registers Task Scheduler every 5 minutes).
   If settings are incomplete, the installer opens the settings UI first.
5. Optional continuous mode: \`npm start\` (also opens settings UI on first run if needed).

Punches appear under HR → Attendance after a successful poll.
Re-open settings anytime: **open-settings.bat** or \`npm run setup\`.
Keep this folder private — config.json includes a Centrix API token.
`;
}

/**
 * Plain source zip (no secrets). Prefer POST with a prefilled config from Admin.
 */
export async function HEAD() {
  try {
    await ensureSourceRootExists(sourceRoot());
    return new Response(null, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Attendance-Agent-Package": SOURCE_ZIP_NAME,
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET() {
  try {
    const root = sourceRoot();
    await ensureSourceRootExists(root);
    const body = await zipDirectoryStore(root, ZIP_ROOT, {
      skipFiles: ["config.json", "state.json"],
      extraFiles: [{ name: "INSTALL.txt", content: installReadme() }],
    });

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${SOURCE_ZIP_NAME}"`,
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
        "X-Attendance-Agent-Package": SOURCE_ZIP_NAME,
      },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Could not package attendance-agent on this server.",
        available: false,
      },
      { status: 404 },
    );
  }
}

/**
 * Prefills config.json (API URL, token, device, Hikvision LAN settings) into the zip.
 * Body: { config: { centrixApiUrl, centrixToken, deviceNo, hikvision, ... } }
 */
export async function POST(request) {
  try {
    const root = sourceRoot();
    await ensureSourceRootExists(root);

    let payload = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const config = payload?.config;
    if (!config || typeof config !== "object") {
      return Response.json(
        { message: "Request body must include a config object for the attendance agent." },
        { status: 400 },
      );
    }

    const required = ["centrixApiUrl", "centrixToken", "deviceNo"];
    for (const key of required) {
      if (!String(config[key] ?? "").trim()) {
        return Response.json({ message: `config.${key} is required.` }, { status: 400 });
      }
    }

    const hik = config.hikvision && typeof config.hikvision === "object" ? config.hikvision : {};
    const normalized = {
      centrixApiUrl: String(config.centrixApiUrl).trim().replace(/\/$/, ""),
      centrixToken: String(config.centrixToken).trim(),
      deviceNo: String(config.deviceNo).trim(),
      hikvision: {
        host: String(hik.host ?? "").trim(),
        port: Number(hik.port) > 0 ? Number(hik.port) : 80,
        username: String(hik.username ?? "admin").trim() || "admin",
        password: String(hik.password ?? ""),
        useHttps: Boolean(hik.useHttps),
      },
      pollIntervalSeconds:
        Number(config.pollIntervalSeconds) > 0 ? Number(config.pollIntervalSeconds) : 300,
      lookbackMinutes: Number(config.lookbackMinutes) > 0 ? Number(config.lookbackMinutes) : 360,
    };

    const body = await zipDirectoryStore(root, ZIP_ROOT, {
      skipFiles: ["config.json", "state.json"],
      extraFiles: [
        { name: "config.json", content: `${JSON.stringify(normalized, null, 2)}\n` },
        { name: "INSTALL.txt", content: installReadme() },
      ],
    });

    const safeDevice = normalized.deviceNo.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40);
    const filename = `CentrixAttendanceAgent-${safeDevice || "device"}.zip`;

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
        "X-Attendance-Agent-Package": filename,
      },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Could not package attendance-agent on this server.",
      },
      { status: 500 },
    );
  }
}
