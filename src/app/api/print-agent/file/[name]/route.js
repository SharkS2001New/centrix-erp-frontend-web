import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/** Files that may be served for remote till installer bootstrap. */
const ALLOWED_FILES = new Set([
  "server.js",
  "package.json",
  "install.ps1",
  "install.sh",
  "install-windows.bat",
  "node-version.txt",
  "README.md",
]);

export async function GET(_request, { params }) {
  const name = params?.name;
  if (!name || !ALLOWED_FILES.has(name)) {
    return Response.json({ message: "File not found" }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "print-agent", name);
  try {
    const body = await readFile(filePath, "utf8");
    const contentType =
      name.endsWith(".json") ? "application/json" :
      name.endsWith(".md") ? "text/markdown; charset=utf-8" :
      "text/plain; charset=utf-8";

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return Response.json({ message: "Installer files unavailable on this server" }, { status: 404 });
  }
}
