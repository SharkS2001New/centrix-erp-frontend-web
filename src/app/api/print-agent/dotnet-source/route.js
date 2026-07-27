import path from "node:path";
import { ensureSourceRootExists, zipDirectoryStore } from "@/lib/print-agent-source-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_ZIP_NAME = "CentrixPrintAgent-source.zip";

function sourceRoot() {
  return path.join(process.cwd(), "print-agent-dotnet");
}

/**
 * Always available when the frontend repo is deployed — packages source + BUILD.md
 * so a Windows PC can build CentrixPrintAgent-win-x64.zip.
 */
export async function HEAD() {
  try {
    await ensureSourceRootExists(sourceRoot());
    return new Response(null, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Print-Agent-Source": SOURCE_ZIP_NAME,
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
    const body = await zipDirectoryStore(root, "print-agent-dotnet");

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${SOURCE_ZIP_NAME}"`,
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
        "X-Print-Agent-Source": SOURCE_ZIP_NAME,
      },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Could not package print-agent-dotnet source on this server.",
        available: false,
      },
      { status: 404 },
    );
  }
}
