"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError } from "@/lib/notify";
import {
  CatalogPageShell,
  SECONDARY_BTN_CLASS,
  formatShortDate,
} from "@/components/catalog/catalog-shared";

function displayField(value) {
  if (value == null) return "—";
  const text = String(value).trim();
  if (!text || text === "undefined" || text === "null") return "—";
  return text;
}

function formatWhen(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const text = String(value);
    return `${formatShortDate(text)} ${text.slice(11, 16)}`;
  }
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export function HrDuplicatePunchesScreen() {
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/attendance/missed-punches");
      setDuplicates(data.duplicate_punches ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load duplicate punches");
      setDuplicates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(load);

  return (
    <CatalogPageShell
      title="Duplicate punches"
      subtitle="Extra terminal scans in the same hour. Only the first successful punch counts for attendance."
    >
      <p className="mb-6 text-sm text-slate-600">
        These scans are logged so HR can see every fingerprint. They do not change{" "}
        <Link href="/hr/attendance" className="font-medium text-[#185FA5] hover:underline">
          Attendance
        </Link>
        . Unmapped scans stay on{" "}
        <Link href="/hr/missed-punches" className="font-medium text-[#185FA5] hover:underline">
          Missed punches
        </Link>
        .
      </p>

      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : duplicates.length === 0 ? (
          <p className="text-sm text-slate-500">No duplicate punches.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Terminal ID</th>
                  <th className="px-3 py-2">Name on device</th>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((row) => (
                  <tr key={row.id ?? row.event_key} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-xs">{formatWhen(row.event_time_local || row.event_time)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{displayField(row.employee_no)}</td>
                    <td className="px-3 py-2 text-xs">{displayField(row.employee_name)}</td>
                    <td className="px-3 py-2 text-xs">
                      {displayField(row.device_no)}
                      {row.device_location ? ` · ${row.device_location}` : ""}
                    </td>
                    <td className="max-w-[320px] px-3 py-2 text-xs text-slate-600">
                      {displayField(row.process_error)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Link href="/hr/attendance" className={SECONDARY_BTN_CLASS}>
            Open attendance
          </Link>
        </div>
      </section>
    </CatalogPageShell>
  );
}
