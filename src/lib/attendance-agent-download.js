/**
 * Download Centrix Attendance Agent zip (preconfigured from Admin / Clock devices).
 */

const DEFAULT_ZIP = "CentrixAttendanceAgent.zip";

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

/** @returns {Promise<{ available: boolean, filename?: string }>} */
export async function checkAttendanceAgentPackageAvailable() {
  try {
    const res = await fetch("/api/attendance-agent/package", { method: "HEAD", cache: "no-store" });
    if (!res.ok) return { available: false };
    return {
      available: true,
      filename: res.headers.get("X-Attendance-Agent-Package") || DEFAULT_ZIP,
    };
  } catch {
    return { available: false };
  }
}

/** Blank source package (no Centrix token). Prefer downloadAttendanceAgentPackage. */
export async function downloadAttendanceAgentSource() {
  const res = await fetch("/api/attendance-agent/package", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Could not download the attendance agent package.");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] ?? DEFAULT_ZIP;
  triggerBrowserDownload(blob, filename);
  return { filename };
}

/**
 * Prefill config.json inside the zip (API URL, token, device, Hikvision).
 * @param {Record<string, unknown>} config
 */
export async function downloadAttendanceAgentPackage(config) {
  const res = await fetch("/api/attendance-agent/package", {
    method: "POST",
    headers: { Accept: "application/zip", "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Could not build the attendance agent package.");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] ?? DEFAULT_ZIP;
  triggerBrowserDownload(blob, filename);
  return { filename };
}
