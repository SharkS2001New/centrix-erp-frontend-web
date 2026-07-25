import { createReadStream } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELEASE_TAG = process.env.PRINT_AGENT_MSI_RELEASE_TAG?.trim() || "print-agent-msi";

/**
 * Preferred order (none of these bake the ~400MB MSI into the Docker image):
 * 1. PRINT_AGENT_MSI_URL — public CDN / object storage (302 redirect)
 * 2. Local mount via PRINT_AGENT_MSI_PATH / PRINT_AGENT_MSI_DIR / print-agent/dist
 * 3. GitHub Release asset (server-side proxy with a contents:read token)
 */

function externalMsiUrl() {
  return process.env.PRINT_AGENT_MSI_URL?.trim() || null;
}

function githubToken() {
  return (
    process.env.PRINT_AGENT_MSI_GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    null
  );
}

function githubRepo() {
  return (
    process.env.PRINT_AGENT_MSI_GITHUB_REPO?.trim() ||
    process.env.GITHUB_REPOSITORY?.trim() ||
    null
  );
}

function msiCandidateDirs() {
  const dirs = [];
  const envDir = process.env.PRINT_AGENT_MSI_DIR?.trim();
  if (envDir) dirs.push(envDir);
  const envPath = process.env.PRINT_AGENT_MSI_PATH?.trim();
  if (envPath) dirs.push(path.dirname(envPath));
  dirs.push(path.join(process.cwd(), "print-agent", "dist"));
  dirs.push("/data/print-agent");
  return [...new Set(dirs)];
}

async function resolveLocalMsi() {
  const preferredPath = process.env.PRINT_AGENT_MSI_PATH?.trim();
  if (preferredPath) {
    try {
      await access(preferredPath);
      const stats = await stat(preferredPath);
      if (stats.isFile()) {
        return { filePath: preferredPath, filename: path.basename(preferredPath), size: stats.size };
      }
    } catch {
      /* fall through */
    }
  }

  for (const distDir of msiCandidateDirs()) {
    let files = [];
    try {
      files = await readdir(distDir);
    } catch {
      continue;
    }
    const msiFiles = files
      .filter((name) => name.toLowerCase().endsWith(".msi"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const msiName = msiFiles.at(-1);
    if (!msiName) continue;
    const filePath = path.join(distDir, msiName);
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) {
        return { filePath, filename: msiName, size: stats.size };
      }
    } catch {
      /* try next */
    }
  }

  return null;
}

async function resolveGithubReleaseAsset() {
  const token = githubToken();
  const repo = githubRepo();
  if (!token || !repo) return null;

  const releaseRes = await fetch(
    `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(RELEASE_TAG)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "centrix-erp-frontend-web",
      },
      cache: "no-store",
    },
  );
  if (!releaseRes.ok) return null;

  const release = await releaseRes.json();
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const asset = assets
    .filter((item) => String(item?.name || "").toLowerCase().endsWith(".msi"))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }))
    .at(-1);
  if (!asset?.id || !asset?.name) return null;

  return {
    filename: String(asset.name),
    size: Number(asset.size) || undefined,
    apiUrl: `https://api.github.com/repos/${repo}/releases/assets/${asset.id}`,
    token,
  };
}

function unavailableResponse() {
  return Response.json(
    {
      message:
        "Windows MSI is not configured on this server. Set PRINT_AGENT_MSI_URL to a public CDN link (recommended), mount the file, or provide a GitHub token + PRINT_AGENT_MSI_GITHUB_REPO for the print-agent-msi release. Until then, use the script installer.",
      available: false,
    },
    { status: 404 },
  );
}

async function serveLocalMsi(msi) {
  const stream = createReadStream(msi.filePath);
  return new Response(Readable.toWeb(stream), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${msi.filename}"`,
      "Content-Length": String(msi.size),
      "Cache-Control": "no-store",
      "X-Print-Agent-Msi": msi.filename,
    },
  });
}

async function proxyGithubMsi(asset) {
  const upstream = await fetch(asset.apiUrl, {
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${asset.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "centrix-erp-frontend-web",
    },
    cache: "no-store",
    redirect: "follow",
  });
  if (!upstream.ok || !upstream.body) {
    return unavailableResponse();
  }

  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${asset.filename}"`,
    "Cache-Control": "no-store",
    "X-Print-Agent-Msi": asset.filename,
  };
  if (asset.size) headers["Content-Length"] = String(asset.size);
  const upstreamLength = upstream.headers.get("content-length");
  if (upstreamLength) headers["Content-Length"] = upstreamLength;

  return new Response(upstream.body, { headers });
}

/** HEAD — UI can probe whether the MSI is available without downloading it. */
export async function HEAD() {
  if (externalMsiUrl()) {
    return new Response(null, {
      status: 200,
      headers: { "X-Print-Agent-Msi": "external", "Cache-Control": "no-store" },
    });
  }

  const local = await resolveLocalMsi();
  if (local) {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${local.filename}"`,
        "Content-Length": String(local.size),
        "Cache-Control": "no-store",
        "X-Print-Agent-Msi": local.filename,
      },
    });
  }

  try {
    const asset = await resolveGithubReleaseAsset();
    if (asset) {
      return new Response(null, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${asset.filename}"`,
          ...(asset.size ? { "Content-Length": String(asset.size) } : {}),
          "Cache-Control": "no-store",
          "X-Print-Agent-Msi": asset.filename,
        },
      });
    }
  } catch {
    /* ignore */
  }

  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

/**
 * Serve / redirect the CentrixPrintAgent MSI without requiring it in the Docker image.
 */
export async function GET() {
  const remote = externalMsiUrl();
  if (remote) {
    return Response.redirect(remote, 302);
  }

  const local = await resolveLocalMsi();
  if (local) {
    return serveLocalMsi(local);
  }

  try {
    const asset = await resolveGithubReleaseAsset();
    if (asset) {
      return proxyGithubMsi(asset);
    }
  } catch {
    /* fall through */
  }

  return unavailableResponse();
}
