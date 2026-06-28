import cors from "cors";
import express from "express";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

const HOST = process.env.PRINT_AGENT_HOST ?? "127.0.0.1";
const PORT = Number(process.env.PRINT_AGENT_PORT ?? 9247);
const VERSION = "0.1.0";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "4mb" }));

async function listPrinters() {
  const platform = process.platform;
  try {
    if (platform === "win32") {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name",
      ]);
      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }
    const { stdout } = await execFileAsync("lpstat", ["-p"]);
    return stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^printer\s+(\S+)/)?.[1])
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function defaultPrinter() {
  const platform = process.platform;
  try {
    if (platform === "win32") {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Printer -Filter 'Default=$true').Name",
      ]);
      return stdout.trim() || null;
    }
    const { stdout } = await execFileAsync("lpstat", ["-d"]);
    return stdout.match(/system default destination:\s*(\S+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function htmlToPdf(html, outputPath) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      path: outputPath,
      width: "80mm",
      printBackground: true,
      margin: { top: "4mm", right: "2mm", bottom: "4mm", left: "2mm" },
    });
  } finally {
    await browser.close();
  }
}

async function printPdf(pdfPath, printerName) {
  const platform = process.platform;
  const printer = printerName?.trim();

  if (platform === "win32") {
    const sumatra =
      process.env.SUMATRA_PATH ??
      "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe";
    try {
      const args = printer
        ? ["-print-to", printer, "-silent", pdfPath]
        : ["-print-to-default", "-silent", pdfPath];
      await execFileAsync(sumatra, args);
      return;
    } catch {
      // Fallback: PowerShell Start-Process print verb (may show brief spooler UI)
      const target = printer ? `-PrinterName '${printer.replace(/'/g, "''")}'` : "";
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Start-Process -FilePath '${pdfPath.replace(/'/g, "''")}' -Verb Print ${target}`,
      ]);
      return;
    }
  }

  const args = printer ? ["-d", printer, pdfPath] : [pdfPath];
  await execFileAsync("lp", args);
}

app.get("/v1/health", async (_req, res) => {
  const printers = await listPrinters();
  const default_printer = await defaultPrinter();
  res.json({
    ok: true,
    version: VERSION,
    platform: process.platform,
    default_printer,
    printers,
  });
});

app.post("/v1/print", async (req, res) => {
  const html = String(req.body?.html ?? "");
  const copies = Math.max(1, Number(req.body?.copies ?? 1) || 1);
  const printer = req.body?.printer ? String(req.body.printer) : null;
  const documentId = req.body?.document_id ? String(req.body.document_id) : "job";

  if (!html.trim()) {
    res.status(400).json({ ok: false, message: "html is required" });
    return;
  }

  const workDir = path.join(os.tmpdir(), "centrix-print-agent");
  await mkdir(workDir, { recursive: true });

  const stamp = Date.now();
  const pdfPath = path.join(workDir, `${documentId}-${stamp}.pdf`);

  try {
    await htmlToPdf(html, pdfPath);
    for (let copy = 0; copy < copies; copy += 1) {
      await printPdf(pdfPath, printer);
    }
    res.json({ ok: true, job_id: `${documentId}-${stamp}` });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Print failed",
    });
  } finally {
    await rm(pdfPath, { force: true }).catch(() => {});
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Centrix Print Agent v${VERSION} listening on http://${HOST}:${PORT}`);
});
