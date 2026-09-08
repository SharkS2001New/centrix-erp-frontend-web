import path from "node:path";
import { ensureSourceRootExists, zipDirectoryStore } from "@/lib/print-agent-source-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_ZIP_NAME = "CentrixKraAgent.zip";
const ZIP_ROOT = "kra-agent-dotnet";

function sourceRoot() {
  return path.join(process.cwd(), "kra-agent-dotnet");
}

function installReadme() {
  return `# Centrix KRA Agent

Preconfigured from Centrix → Finance → KRA device.

## Quick start (Windows shop PC with Comstore)

1. Unzip (e.g. C:\\Centrix\\kra-agent-dotnet).
2. Install .NET 8 SDK once if needed:
   https://dotnet.microsoft.com/download/dotnet/8.0
3. Right-click BUILD-AND-INSTALL.bat → Run as administrator.
   - Builds a self-contained Windows exe (no Node.js at runtime).
   - Installs the CentrixKraAgent Windows service.
4. Open http://127.0.0.1:9261 → Test connection.
5. In Centrix Finance, enable Centrix KRA Agent and Test connection.

Comstore default: http://127.0.0.1:4000 (config.json comstoreBaseUrl).
autoStartComstore=true starts the Comstore Windows service/exe if /api/health fails.
Optional: set comstoreWindowsServiceNames or comstoreExecutablePath in config.json.
Keep this folder private — config.json includes a Centrix API token.
`;
}

export async function HEAD() {
  try {
    await ensureSourceRootExists(sourceRoot());
    return new Response(null, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Kra-Agent-Package": SOURCE_ZIP_NAME,
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
      skipFiles: ["config.json", "state.json", "publish"],
      extraFiles: [{ name: "INSTALL.txt", content: installReadme() }],
    });

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${SOURCE_ZIP_NAME}"`,
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        message: error instanceof Error ? error.message : "Could not package kra-agent-dotnet.",
        available: false,
      },
      { status: 404 },
    );
  }
}

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
        { message: "Request body must include a config object for the KRA agent." },
        { status: 400 },
      );
    }

    for (const key of ["centrixApiUrl", "centrixToken"]) {
      if (!String(config[key] ?? "").trim()) {
        return Response.json({ message: `config.${key} is required.` }, { status: 400 });
      }
    }

    const normalized = {
      centrixApiUrl: String(config.centrixApiUrl).trim().replace(/\/$/, ""),
      centrixToken: String(config.centrixToken).trim(),
      organizationId: Number(config.organizationId) || 0,
      agentId: Number(config.agentId) || 0,
      comstoreBaseUrl: String(config.comstoreBaseUrl || "http://localhost:4000")
        .trim()
        .replace(/\/$/, ""),
      longPollMs: Number(config.longPollMs) > 0 ? Number(config.longPollMs) : 2000,
      heartbeatIntervalSeconds:
        Number(config.heartbeatIntervalSeconds) > 0 ? Number(config.heartbeatIntervalSeconds) : 60,
      commandTimeoutSeconds:
        Number(config.commandTimeoutSeconds) > 0 ? Number(config.commandTimeoutSeconds) : 50,
      autoStartComstore:
        config.autoStartComstore === undefined ? true : Boolean(config.autoStartComstore),
      comstoreWindowsServiceNames: Array.isArray(config.comstoreWindowsServiceNames)
        ? config.comstoreWindowsServiceNames.map((n) => String(n).trim()).filter(Boolean)
        : [],
      comstoreExecutablePath: String(config.comstoreExecutablePath || "").trim(),
      comstoreExecutableArgs: String(config.comstoreExecutableArgs || "").trim(),
      comstoreStartCommand: String(config.comstoreStartCommand || "").trim(),
      comstoreStartWorkingDirectory: String(config.comstoreStartWorkingDirectory || "").trim(),
      comstoreReadyTimeoutSeconds:
        Number(config.comstoreReadyTimeoutSeconds) > 0
          ? Number(config.comstoreReadyTimeoutSeconds)
          : 45,
    };

    const body = await zipDirectoryStore(root, ZIP_ROOT, {
      skipFiles: ["config.json", "state.json", "config.example.json", "publish"],
      extraFiles: [
        { name: "config.json", content: `${JSON.stringify(normalized, null, 2)}\n` },
        { name: "INSTALL.txt", content: installReadme() },
      ],
    });

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${SOURCE_ZIP_NAME}"`,
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        message: error instanceof Error ? error.message : "Could not package kra-agent-dotnet.",
        available: false,
      },
      { status: 500 },
    );
  }
}
