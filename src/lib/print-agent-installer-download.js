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

function filenameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").filter(Boolean).at(-1);
    return base && base.toLowerCase().endsWith(".msi") ? base : "CentrixPrintAgent.msi";
  } catch {
    return "CentrixPrintAgent.msi";
  }
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

  if (publicUrl) {
    const res = await fetch(publicUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(
        `Could not download MSI from the configured URL (${res.status}). Check Platform → Print Agent MSI.`,
      );
    }
    const blob = await res.blob();
    const filename = filenameFromUrl(publicUrl);
    triggerBrowserDownload(blob, filename);
    return { filename, source: "r2" };
  }

  const res = await fetch("/api/print-agent/msi", { cache: "no-store", redirect: "follow" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.message ??
        "MSI installer is not configured yet. Open Platform → Print Agent MSI to set the R2 path or build/upload the installer.",
    );
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "MSI installer is not available on this server.");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const headerName = res.headers.get("X-Print-Agent-Msi");
  const filename =
    match?.[1] ??
    (headerName && headerName !== "external" ? headerName : null) ??
    "CentrixPrintAgent.msi";

  triggerBrowserDownload(blob, filename);
  return { filename, source: "local" };
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
    return "Open the downloaded centrix-install-print-agent.bat file (double-click). Node.js 20+ is installed automatically if needed. Run once on each till PC.";
  }
  return "Run the downloaded centrix-install-print-agent.sh in Terminal (chmod +x first). Node.js 20+ is installed automatically if needed.";
}
