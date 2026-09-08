import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ensureSourceRootExists, zipDirectoryStore } from "@/lib/print-agent-source-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZIP_NAME = "CentrixKraAgent.zip";
const ZIP_ROOT = "CentrixKraAgent";

function releaseCandidateDirs() {
  const dirs = [];
  const envDir = process.env.KRA_AGENT_RELEASE_DIR?.trim();
  if (envDir) dirs.push(envDir);
  dirs.push(path.join(process.cwd(), "kra-agent-dotnet", "release", "win-x64"));
  dirs.push("/data/kra-agent-dotnet/release/win-x64");
  return [...new Set(dirs)];
}

async function resolveReleaseRoot() {
  for (const dir of releaseCandidateDirs()) {
    try {
      const exe = path.join(dir, "Centrix.KraAgent.exe");
      await access(exe);
      const stats = await stat(dir);
      if (stats.isDirectory()) {
        return dir;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function installReadme() {
  return `# Centrix KRA Agent

Preconfigured installer from Centrix → Finance → KRA.

## Install (Windows shop PC)

1. Unzip this folder (e.g. C:\\Centrix\\CentrixKraAgent).
2. Right-click INSTALL.bat → Run as administrator.
   - Installs the CentrixKraAgent Windows service (Automatic start).
   - No .NET SDK and no source code — this zip is the binary only.
3. Configure Comstore to start with Windows (its own service / startup).
4. Open http://127.0.0.1:9261 → Test connection.
5. In Centrix Finance, click Refresh agent status / Test connection.

The agent keeps pinging Centrix and the fiscal hardware IP. It does not start Comstore.
Remove: uninstall.bat (Administrator).
Keep this folder private — config.json includes a non-expiring Centrix API token for this organization.
`;
}

function normalizeConfig(config) {
  return {
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
    autoStartComstore: false,
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
    deviceHardwareIp: String(config.deviceHardwareIp || "").trim(),
  };
}

function missingReleaseResponse() {
  return Response.json(
    {
      message:
        "Centrix KRA Agent installer is not on this server yet. On a Windows PC run kra-agent-dotnet\\scripts\\stage-release.ps1, then copy release\\win-x64 onto the web host (or set KRA_AGENT_RELEASE_DIR).",
      available: false,
    },
    { status: 404 },
  );
}

export async function HEAD() {
  const remote = process.env.KRA_AGENT_RELEASE_URL?.trim();
  if (remote) {
    return new Response(null, {
      status: 200,
      headers: { "Cache-Control": "no-store", "X-Kra-Agent-Package": "external" },
    });
  }

  const root = await resolveReleaseRoot();
  if (!root) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Kra-Agent-Package": ZIP_NAME,
    },
  });
}

export async function GET() {
  const remote = process.env.KRA_AGENT_RELEASE_URL?.trim();
  if (remote) {
    return Response.redirect(remote, 302);
  }

  const root = await resolveReleaseRoot();
  if (!root) {
    return missingReleaseResponse();
  }

  try {
    await ensureSourceRootExists(root);
    const body = await zipDirectoryStore(root, ZIP_ROOT, {
      skipFiles: ["config.json", "state.json", "config.example.json"],
      extraFiles: [{ name: "INSTALL.txt", content: installReadme() }],
    });

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${ZIP_NAME}"`,
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        message: error instanceof Error ? error.message : "Could not package Centrix KRA Agent.",
        available: false,
      },
      { status: 404 },
    );
  }
}

export async function POST(request) {
  const root = await resolveReleaseRoot();
  if (!root) {
    return missingReleaseResponse();
  }

  try {
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

    const normalized = normalizeConfig(config);

    // Ensure INSTALL.bat exists even if an older staged folder omitted it.
    let hasInstallBat = false;
    try {
      const files = await readdir(root);
      hasInstallBat = files.some((f) => f.toLowerCase() === "install.bat");
    } catch {
      hasInstallBat = false;
    }

    const extraFiles = [
      { name: "config.json", content: `${JSON.stringify(normalized, null, 2)}\n` },
      { name: "INSTALL.txt", content: installReadme() },
    ];
    if (!hasInstallBat) {
      extraFiles.push({
        name: "INSTALL.bat",
        content:
          '@echo off\r\ncd /d "%~dp0"\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows-service.ps1"\r\nif errorlevel 1 pause\r\n',
      });
    }

    const body = await zipDirectoryStore(root, ZIP_ROOT, {
      skipFiles: ["config.json", "state.json", "config.example.json"],
      extraFiles,
    });

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${ZIP_NAME}"`,
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        message: error instanceof Error ? error.message : "Could not package Centrix KRA Agent.",
        available: false,
      },
      { status: 500 },
    );
  }
}
