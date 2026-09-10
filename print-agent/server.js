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
const VERSION = "0.2.1";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "4mb" }));

/** @type {{ jobId: string, html: string, copies: number, printer: string | null, documentId: string }[]} */
const printQueue = [];
let queueRunning = false;

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

async function isThermalJob(jobType, html) {
  const t = String(jobType ?? "").trim().toLowerCase();
  if (["receipt", "thermal", "kra", "kra_receipt", "pos_receipt", "hospitality_check"].includes(t)) {
    return true;
  }
  if (
    ["document", "invoice", "a4", "payroll_receipt", "cash_advance", "leave_application", "lpo", "picking_list", "report"].includes(
      t,
    )
  ) {
    return false;
  }
  const src = String(html ?? "");
  if (/centrix-print-thermal/i.test(src)) return true;
  if (/size:\s*A4|210mm\s+297mm|297mm\s+210mm|centrix-edge|has-doc-print-edge-footer/i.test(src)) return false;
  return true;
}

/** Centrix @page mm box — landscape when columns need width; null if undeclared. */
function resolveA4Orientation(html) {
  const src = String(html ?? "");
  if (/297mm\s+210mm/i.test(src)) return "landscape";
  if (/210mm\s+297mm/i.test(src)) return "portrait";
  return null;
}

async function htmlToPdf(html, outputPath, jobType = "receipt") {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const thermal = await isThermalJob(jobType, html);
    if (thermal) {
      await page.pdf({
        path: outputPath,
        width: "80mm",
        printBackground: true,
        margin: { top: "4mm", right: "2mm", bottom: "4mm", left: "2mm" },
      });
    } else {
      await page.pdf({
        path: outputPath,
        format: "A4",
        landscape: resolveA4Orientation(html) === "landscape",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: true,
      });
    }
  } finally {
    await browser.close();
  }
}

async function printPdf(pdfPath, printerName, thermal = true, html = "") {
  const platform = process.platform;
  const printer = printerName?.trim();

  if (platform === "win32") {
    const sumatra =
      process.env.SUMATRA_PATH ??
      "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe";
    try {
      let printSettings = "noscale";
      if (!thermal) {
        const orientation = resolveA4Orientation(html);
        printSettings = orientation
          ? `noscale,paper=A4,${orientation}`
          : "noscale,paper=A4";
      }
      const args = printer
        ? ["-print-to", printer, "-print-settings", printSettings, "-silent", pdfPath]
        : ["-print-to-default", "-print-settings", printSettings, "-silent", pdfPath];
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

async function runPrintJob({ html, copies, printer, documentId, jobId, jobType }) {
  const workDir = path.join(os.tmpdir(), "centrix-print-agent");
  await mkdir(workDir, { recursive: true });
  const pdfPath = path.join(workDir, `${jobId}.pdf`);
  const thermal = await isThermalJob(jobType, html);

  try {
    await htmlToPdf(html, pdfPath, jobType);
    for (let copy = 0; copy < copies; copy += 1) {
      await printPdf(pdfPath, printer, thermal, html);
    }
    return jobId;
  } finally {
    await rm(pdfPath, { force: true }).catch(() => {});
  }
}

async function drainPrintQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (printQueue.length > 0) {
      const job = printQueue.shift();
      if (!job) continue;
      try {
        await runPrintJob(job);
      } catch (error) {
        console.error(`Background print failed for ${job.jobId}:`, error);
      }
    }
  } finally {
    queueRunning = false;
    if (printQueue.length > 0) {
      void drainPrintQueue();
    }
  }
}

function enqueuePrintJob({ html, copies, printer, documentId, jobType }) {
  const stamp = Date.now();
  const jobId = `${String(documentId || "job").replace(/[^\w.-]+/g, "_")}-${stamp}`;
  printQueue.push({ jobId, html, copies, printer, documentId, jobType });
  void drainPrintQueue();
  return jobId;
}

app.get("/v1/health", async (_req, res) => {
  const printers = await listPrinters();
  const default_printer = await defaultPrinter();
  res.json({
    ok: true,
    version: VERSION,
    platform: process.platform,
    async_print: true,
    default_printer,
    printers,
  });
});

app.post("/v1/print", async (req, res) => {
  const html = String(req.body?.html ?? "");
  const copies = Math.max(1, Number(req.body?.copies ?? 1) || 1);
  const printer = req.body?.printer ? String(req.body.printer) : null;
  const documentId = req.body?.document_id ? String(req.body.document_id) : "job";
  const jobType = req.body?.job_type ? String(req.body.job_type) : "receipt";
  const wait = req.body?.wait === true || req.body?.wait === 1 || req.body?.wait === "1";

  if (!html.trim()) {
    res.status(400).json({ ok: false, message: "html is required" });
    return;
  }

  try {
    if (!wait) {
      const jobId = enqueuePrintJob({ html, copies, printer, documentId, jobType });
      res.json({ ok: true, queued: true, job_id: jobId, printer });
      return;
    }

    const stamp = Date.now();
    const jobId = `${String(documentId).replace(/[^\w.-]+/g, "_")}-${stamp}`;
    await runPrintJob({ html, copies, printer, documentId, jobId, jobType });
    res.json({ ok: true, queued: false, job_id: jobId, printer });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Print failed",
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Centrix Print Agent v${VERSION} listening on http://${HOST}:${PORT}`);
});
