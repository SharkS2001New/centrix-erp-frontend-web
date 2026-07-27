import { createReadStream } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ZIP = "CentrixPrintAgent-win-x64.zip";

function externalZipUrl() {
  return process.env.PRINT_AGENT_DOTNET_URL?.trim() || null;
}

function zipCandidateDirs() {
  const dirs = [];
  const envDir = process.env.PRINT_AGENT_DOTNET_DIR?.trim();
  if (envDir) dirs.push(envDir);
  dirs.push(path.join(process.cwd(), "print-agent-dotnet", "publish"));
  dirs.push("/data/print-agent-dotnet");
  return [...new Set(dirs)];
}

async function resolveLocalZip() {
  const preferred = process.env.PRINT_AGENT_DOTNET_PATH?.trim();
  if (preferred) {
    try {
      await access(preferred);
      const stats = await stat(preferred);
      if (stats.isFile()) {
        return { filePath: preferred, filename: path.basename(preferred), size: stats.size };
      }
    } catch {
      /* fall through */
    }
  }

  for (const dir of zipCandidateDirs()) {
    let files = [];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    const zipFiles = files
      .filter((name) => name.toLowerCase().endsWith(".zip"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const zipName = zipFiles.at(-1);
    if (!zipName) continue;
    const filePath = path.join(dir, zipName);
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) {
        return { filePath, filename: zipName, size: stats.size };
      }
    } catch {
      /* try next */
    }
  }

  return null;
}

function unavailableResponse() {
  return Response.json(
    {
      message:
        "Windows print service zip is not on this server yet. Build print-agent-dotnet on a Windows PC (scripts/publish.ps1) and upload CentrixPrintAgent-win-x64.zip, or set PRINT_AGENT_DOTNET_URL.",
      available: false,
    },
    { status: 404 },
  );
}

async function serveLocalZip(zip) {
  const stream = createReadStream(zip.filePath);
  return new Response(Readable.toWeb(stream), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.filename}"`,
      "Content-Length": String(zip.size),
      "Cache-Control": "no-store",
      "X-Print-Agent-Dotnet": zip.filename,
    },
  });
}

export async function HEAD() {
  if (externalZipUrl()) {
    return new Response(null, {
      status: 200,
      headers: { "X-Print-Agent-Dotnet": "external", "Cache-Control": "no-store" },
    });
  }

  const local = await resolveLocalZip();
  if (!local) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${local.filename}"`,
      "Content-Length": String(local.size),
      "Cache-Control": "no-store",
      "X-Print-Agent-Dotnet": local.filename,
    },
  });
}

export async function GET() {
  const remote = externalZipUrl();
  if (remote) {
    return Response.redirect(remote, 302);
  }

  const local = await resolveLocalZip();
  if (local) {
    return serveLocalZip(local);
  }

  return unavailableResponse();
}
