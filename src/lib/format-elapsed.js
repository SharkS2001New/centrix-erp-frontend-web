/**
 * Human-readable elapsed time for live POS status (e.g. "12m 05s", "1h 23m").
 * @param {number} ms
 */
export function formatElapsedDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hours = Math.floor(totalMin / 60);
  if (hours > 0) {
    return `${hours}h ${String(min).padStart(2, "0")}m`;
  }
  if (min > 0) {
    return `${min}m ${String(sec).padStart(2, "0")}s`;
  }
  return `${sec}s`;
}
