/**
 * Download and run the till print-agent bootstrap installer on this PC.
 * Browsers cannot execute installers directly — user opens the downloaded file once.
 */

import { apiRequest } from "@/lib/api";

function detectInstallerPlatform() {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? "";
  if (platform.includes("mac") || ua.includes("mac os")) return "mac";
  if (platform.includes("linux") || ua.includes("linux")) return "linux";
  return "windows";
}

function installerFilename(platform) {
  return platform === "windows"
    ? "centrix-install-print-agent.bat"
    : "centrix-install-print-agent.sh";
}

function triggerBrowserDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Cross-origin R2/CDN — avoid fetch+blob (CORS). Let the browser navigate/download. */
function triggerExternalDownload(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function filenameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").filter(Boolean).at(-1);
    return base && base.toLowerCase().endsWith(".msi") ? base : "CentrixPrintAgent.msi";
  } catch {
    return "CentrixPrintAgent.msi";
  }
}

const DEFAULT_DOTNET_ZIP = "CentrixPrintAgent-win-x64.zip";
const DEFAULT_SOURCE_ZIP = "CentrixPrintAgent-source.zip";

/** @returns {Promise<{ available: boolean, filename?: string, publicUrl?: string }>} */
export async function checkPrintAgentDotnetAvailable() {
  try {
    const res = await fetch("/api/print-agent/dotnet", { method: "HEAD", cache: "no-store" });
    if (!res.ok) return { available: false };
    const filename = res.headers.get("X-Print-Agent-Dotnet") || undefined;
    return { available: true, filename: filename === "external" ? DEFAULT_DOTNET_ZIP : filename };
  } catch {
    return { available: false };
  }
}

/** Source package is built from the deployed frontend repo — should always be available. */
export async function checkPrintAgentSourceAvailable() {
  try {
    const res = await fetch("/api/print-agent/dotnet-source", { method: "HEAD", cache: "no-store" });
    if (!res.ok) return { available: false };
    return { available: true, filename: DEFAULT_SOURCE_ZIP };
  } catch {
    return { available: false };
  }
}

/**
 * Download the .NET Windows print service zip (recommended for Windows tills).
 * Falls back to the source build package when the ready zip is not hosted yet.
 */
export async function downloadPrintAgentDotnet({ allowSourceFallback = true } = {}) {
  const res = await fetch("/api/print-agent/dotnet", { cache: "no-store", redirect: "follow" });
  if (!res.ok) {
    if (allowSourceFallback) {
      return downloadPrintAgentSource();
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.message ??
        "Ready-made Windows print service is not on this server yet. Use Download build package (source) and follow BUILD.md.",
    );
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    if (allowSourceFallback) {
      return downloadPrintAgentSource();
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Windows print service is not available.");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const headerName = res.headers.get("X-Print-Agent-Dotnet");
  const filename =
    match?.[1] ??
    (headerName && headerName !== "external" ? headerName : null) ??
    DEFAULT_DOTNET_ZIP;

  triggerBrowserDownload(blob, filename);
  return { filename, source: "dotnet" };
}

/** Download source + BUILD.md so a Windows PC can build the installer. */
export async function downloadPrintAgentSource() {
  const res = await fetch("/api/print-agent/dotnet-source", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Could not download the print agent build package.");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] ?? DEFAULT_SOURCE_ZIP;
  triggerBrowserDownload(blob, filename);
  return { filename, source: "dotnet-source" };
}

/** @returns {Promise<{ available: boolean, filename?: string, publicUrl?: string }>} */
export async function checkPrintAgentMsiAvailable() {
  try {
    const settings = await apiRequest("/print-agent-msi", { loading: false, reportIssues: false });
    const publicUrl = String(settings?.public_url || "").trim();
    if (publicUrl) {
      return { available: true, publicUrl, filename: filenameFromUrl(publicUrl) };
    }
  } catch {
    /* fall through to local Next route */
  }

  try {
    const res = await fetch("/api/print-agent/msi", { method: "HEAD", cache: "no-store" });
    if (!res.ok) return { available: false };
    const filename = res.headers.get("X-Print-Agent-Msi") || undefined;
    return { available: true, filename: filename === "external" ? undefined : filename };
  } catch {
    return { available: false };
  }
}

/**
 * Download the Windows MSI installer from the platform-configured R2 URL (preferred),
 * or the local Next.js /api/print-agent/msi fallback.
 */
export async function downloadPrintAgentMsi() {
  let publicUrl = "";
  try {
    const settings = await apiRequest("/print-agent-msi", { loading: false, reportIssues: false });
    publicUrl = String(settings?.public_url || "").trim();
  } catch {
    publicUrl = "";
  }

  // Prefer same-origin Next proxy (handles PRINT_AGENT_MSI_URL / local / GitHub).
  // Direct browser fetch of R2 often fails CORS even when the public URL is valid.
  const res = await fetch("/api/print-agent/msi", { cache: "no-store", redirect: "follow" });
  if (res.ok) {
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const headerName = res.headers.get("X-Print-Agent-Msi");
      const filename =
        match?.[1] ??
        (headerName && headerName !== "external" ? headerName : null) ??
        (publicUrl ? filenameFromUrl(publicUrl) : "CentrixPrintAgent.msi");
      triggerBrowserDownload(blob, filename);
      return { filename, source: publicUrl ? "r2-proxy" : "local" };
    }
  }

  if (publicUrl) {
    const filename = filenameFromUrl(publicUrl);
    triggerExternalDownload(publicUrl, filename);
    return { filename, source: "r2-direct" };
  }

  const body = await res.json().catch(() => ({}));
  throw new Error(
    body.message ??
      "MSI installer is not available. Use Download build package or Download ready installer under Administration → Local printing instead.",
  );
}

/**
 * @param {{ platform?: "windows" | "mac" | "linux" }} [opts]
 */
export async function downloadPrintAgentInstaller(opts = {}) {
  const platform = opts.platform ?? detectInstallerPlatform();
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const searchParams = new URLSearchParams({ platform });
  if (origin) {
    searchParams.set("origin", origin);
  }
  const res = await fetch(`/api/print-agent/bootstrap?${searchParams.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Could not download the till installer.");
  }

  const blob = await res.blob();
  const filename = installerFilename(platform);
  triggerBrowserDownload(blob, filename);

  return { platform, filename };
}

export function printAgentInstallerHelp(platform = detectInstallerPlatform()) {
  if (platform === "windows") {
    return "Unzip CentrixPrintAgent-win-x64.zip, then run install-windows-service.ps1 as Administrator. Optional: install SumatraPDF for fully silent thermal printing.";
  }
  return "Run the downloaded centrix-install-print-agent.sh in Terminal (chmod +x first). Node.js 20+ is installed automatically if needed.";
}
