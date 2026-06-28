/**
 * Download and run the till print-agent bootstrap installer on this PC.
 * Browsers cannot execute installers directly — user opens the downloaded file once.
 */

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

/**
 * Download the Windows MSI installer when deployed on the server.
 */
export async function downloadPrintAgentMsi() {
  const res = await fetch("/api/print-agent/msi", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "MSI installer is not available on this server.");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] ?? "CentrixPrintAgent.msi";

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);

  return { filename };
}

/**
 * @param {{ platform?: "windows" | "mac" | "linux" }} [opts]
 */
export async function downloadPrintAgentInstaller(opts = {}) {
  const platform = opts.platform ?? detectInstallerPlatform();
  const res = await fetch(`/api/print-agent/bootstrap?platform=${platform}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Could not download the till installer.");
  }

  const blob = await res.blob();
  const filename = installerFilename(platform);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);

  return { platform, filename };
}

export function printAgentInstallerHelp(platform = detectInstallerPlatform()) {
  if (platform === "windows") {
    return "Open the downloaded centrix-install-print-agent.bat file (double-click). Node.js 20+ is installed automatically if needed. Run once on each till PC.";
  }
  return "Run the downloaded centrix-install-print-agent.sh in Terminal (chmod +x first). Node.js 20+ is installed automatically if needed.";
}
