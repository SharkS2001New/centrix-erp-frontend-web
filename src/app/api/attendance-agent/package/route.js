import path from "node:path";
import { ensureSourceRootExists, zipDirectoryStore } from "@/lib/print-agent-source-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_ZIP_NAME = "CentrixAttendanceAgent.zip";
const ZIP_ROOT = "attendance-agent-dotnet";

function sourceRoot() {
  return path.join(process.cwd(), "attendance-agent-dotnet");
}

function installReadme() {
  return `# Centrix Attendance Agent (.NET)

Preconfigured package from Centrix → HR → Attendance clock-in.

## Quick start (Windows office PC on same LAN as Hikvision)

1. Unzip this folder (e.g. C:\\Centrix\\attendance-agent-dotnet).
2. Install .NET 8 SDK once if needed:
   https://dotnet.microsoft.com/download/dotnet/8.0
3. Right-click **BUILD-AND-INSTALL.bat** → Run as administrator.
   - Builds a self-contained Windows exe (no Node.js).
   - Installs the **CentrixAttendanceAgent** Windows service.
4. Open http://127.0.0.1:9251 → Test connection.
5. Change IP or password in Centrix, then download the agent again.
6. Remove: **uninstall-windows.bat** (Administrator).

This replaces the older Node.js attendance agent.
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
            : "Could not package attendance-agent-dotnet on this server.",
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

    const required = ["centrixApiUrl", "centrixToken", "deviceId", "deviceNo"];
    for (const key of required) {
      if (key === "deviceId") {
        const id = Number(config.deviceId);
        if (!Number.isFinite(id) || id <= 0) {
          return Response.json({ message: "config.deviceId is required." }, { status: 400 });
        }
        continue;
      }
      if (!String(config[key] ?? "").trim()) {
        return Response.json({ message: `config.${key} is required.` }, { status: 400 });
      }
    }

    const hik = config.hikvision && typeof config.hikvision === "object" ? config.hikvision : {};
    const hikHost = String(hik.host ?? "").trim();
    if (!hikHost) {
      return Response.json(
        { message: "config.hikvision.host (device LAN IP) is required." },
        { status: 400 },
      );
    }
    const hikPassword = String(hik.password ?? "");
    if (!hikPassword) {
      return Response.json(
        { message: "config.hikvision.password is required. Save it on the device, then download again." },
        { status: 400 },
      );
    }

    const normalized = {
      centrixApiUrl: String(config.centrixApiUrl).trim().replace(/\/$/, ""),
      centrixToken: String(config.centrixToken).trim(),
      deviceId: Number(config.deviceId),
      deviceNo: String(config.deviceNo).trim(),
      hikvision: {
        host: hikHost,
        port: Number(hik.port) > 0 ? Number(hik.port) : 80,
        username: String(hik.username ?? "admin").trim() || "admin",
        password: hikPassword,
        useHttps: Boolean(hik.useHttps),
      },
      pollIntervalSeconds:
        Number(config.pollIntervalSeconds) > 0 ? Number(config.pollIntervalSeconds) : 600,
      heartbeatIntervalSeconds:
        Number(config.heartbeatIntervalSeconds) > 0
          ? Number(config.heartbeatIntervalSeconds)
          : Number(config.pollIntervalSeconds) > 0
            ? Number(config.pollIntervalSeconds)
            : 600,
      punchPollSeconds: Number(config.punchPollSeconds) > 0 ? Number(config.punchPollSeconds) : 30,
      punchLeadMinutes: Number.isFinite(Number(config.punchLeadMinutes))
        ? Number(config.punchLeadMinutes)
        : 10,
      punchLagMinutes: Number.isFinite(Number(config.punchLagMinutes))
        ? Number(config.punchLagMinutes)
        : 20,
      punchWindows: Array.isArray(config.punchWindows) ? config.punchWindows : undefined,
      timezone: String(config.timezone ?? "Africa/Nairobi"),
      lookbackMinutes: Number(config.lookbackMinutes) > 0 ? Number(config.lookbackMinutes) : 10080,
    };

    const body = await zipDirectoryStore(root, ZIP_ROOT, {
      skipFiles: ["config.json", "state.json", "config.example.json"],
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
            : "Could not package attendance-agent-dotnet on this server.",
      },
      { status: 500 },
    );
  }
}
