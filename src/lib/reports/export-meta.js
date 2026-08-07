import { formatAppDateTime } from "@/lib/datetime";

export function reportPrintedAt() {
  return formatAppDateTime(new Date());
}

export function slugifyReportFilename(value) {
  return String(value ?? "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
