import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/** Serve the latest built CentrixPrintAgent MSI from print-agent/dist/ */
export async function GET() {
  const distDir = path.join(process.cwd(), "print-agent", "dist");

  let files = [];
  try {
    files = await readdir(distDir);
  } catch {
    return Response.json(
      {
        message:
          "MSI not available on this server. Build it on Windows with print-agent/scripts/build-msi.ps1, then deploy the .msi file.",
      },
      { status: 404 },
    );
  }

  const msiFiles = files.filter((name) => name.toLowerCase().endsWith(".msi")).sort();
  const msiName = msiFiles.at(-1);

  if (!msiName) {
    return Response.json(
      {
        message:
          "MSI not built yet. On a Windows machine with WiX Toolset: cd print-agent && powershell -File scripts/build-msi.ps1",
      },
      { status: 404 },
    );
  }

  const filePath = path.join(distDir, msiName);
  const body = await readFile(filePath);

  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${msiName}"`,
      "Cache-Control": "no-store",
    },
  });
}
