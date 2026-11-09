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

function filenameFromRemoteUrl(url) {
  try {
    const base = new URL(url).pathname.split("/").filter(Boolean).at(-1);
    if (base && base.toLowerCase().endsWith(".zip")) return base;
  } catch {
    /* ignore */
  }
  return DEFAULT_ZIP;
}

async function proxyRemoteZip(url) {
  const upstream = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      {
        message: `Configured PRINT_AGENT_DOTNET_URL is not reachable (${upstream.status}). Fix the R2/public URL or remove it so source download can be used.`,
        available: false,
      },
      { status: 502 },
    );
  }

  const filename = filenameFromRemoteUrl(url);
  const headers = {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "X-Print-Agent-Dotnet": filename,
  };
  const length = upstream.headers.get("content-length");
  if (length) headers["Content-Length"] = length;

  // Proxy through this origin so the browser never hits R2 CORS on fetch+blob.
  return new Response(upstream.body, { headers });
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
  const remote = externalZipUrl();
  if (remote) {
    try {
      const probe = await fetch(remote, { method: "HEAD", cache: "no-store", redirect: "follow" });
      if (!probe.ok) {
        return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
      }
    } catch {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
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
    return proxyRemoteZip(remote);
  }

  const local = await resolveLocalZip();
  if (local) {
    return serveLocalZip(local);
  }

  return unavailableResponse();
}
