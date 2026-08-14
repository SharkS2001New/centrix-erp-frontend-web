"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { P } from "@/lib/permission-codes";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  PrimaryButton,
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

export function HrMissedPunchesScreen() {
  const { hasPermission } = useAuth();
  const canRetry = hasPermission(P.hr.manage);
  const [unapplied, setUnapplied] = useState([]);
  const [missingOut, setMissingOut] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/attendance/missed-punches");
      setUnapplied(data.unapplied_terminal_punches ?? []);
      setMissingOut(data.missing_clock_out ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load missed punches");
      setUnapplied([]);
      setMissingOut([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(load);

  async function retryPending() {
    setRetrying(true);
    try {
      const result = await apiRequest("/attendance/missed-punches/retry", { method: "POST" });
      const applied = Number(result.applied ?? result.retried ?? 0);
      if (applied > 0) {
        notifySuccess(`Applied ${applied} pending punch${applied === 1 ? "" : "es"} to attendance.`);
      } else if (Array.isArray(result.errors) && result.errors.length) {
        notifyError(result.errors[0]);
      } else {
        notifySuccess("No pending punches were ready to apply. Map the terminal employee ID first.");
      }
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <CatalogPageShell
      title="Missed punches"
      subtitle="Terminal scans that did not create HR attendance, and shifts still waiting for a clock-out"
      action={
        canRetry ? (
          <PrimaryButton type="button" disabled={retrying || loading} onClick={() => void retryPending()}>
            {retrying ? "Retrying…" : "Retry pending punches"}
          </PrimaryButton>
        ) : null
      }
    >
      <p className="mb-6 text-sm text-slate-600">
        Map the terminal person ID on{" "}
        <Link href="/admin/attendance-clock" className="font-medium text-[#185FA5] hover:underline">
          Attendance clock-in
        </Link>{" "}
        (Hikvision → Employees), then retry. Successful punches appear on{" "}
        <Link href="/hr/attendance" className="font-medium text-[#185FA5] hover:underline">
          Attendance
        </Link>
        .
      </p>

      <section className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-[15px] font-medium text-slate-900">Unapplied terminal punches</h2>
        <p className="mt-1 text-sm text-slate-500">
          The agent stored these scans, but Centrix could not match them to an employee or apply clock in/out.
        </p>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : unapplied.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No unapplied terminal punches.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Terminal ID</th>
                  <th className="px-3 py-2">Name on device</th>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {unapplied.map((row) => (
                  <tr key={row.id ?? row.event_key} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-xs">{formatWhen(row.event_time_local || row.event_time)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{displayField(row.employee_no)}</td>
                    <td className="px-3 py-2 text-xs">{displayField(row.employee_name)}</td>
                    <td className="px-3 py-2 text-xs">
                      {displayField(row.device_no)}
                      {row.device_location ? ` · ${row.device_location}` : ""}
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-2 text-xs text-red-700" title={row.process_error || ""}>
                      {displayField(row.process_error)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-[15px] font-medium text-slate-900">Missing clock-out</h2>
        <p className="mt-1 text-sm text-slate-500">
          Open premises sessions from a previous day, or still open after 12 hours. Add clock-out on Attendance records if the person left without punching.
        </p>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : missingOut.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No forgotten clock-outs.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Clock in</th>
                  <th className="px-3 py-2">Hours open</th>
                  <th className="px-3 py-2">Device</th>
                </tr>
              </thead>
              <tbody>
                {missingOut.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-sm">
                      {displayField(row.employee_name)}
                      <span className="ml-2 font-mono text-xs text-slate-500">{displayField(row.employee_code)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{formatWhen(row.clock_in_at)}</td>
                    <td className="px-3 py-2 text-xs">{row.hours_open != null ? `${row.hours_open}h` : "—"}</td>
                    <td className="px-3 py-2 text-xs">{displayField(row.device_identifier)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Link href="/hr/attendance" className={SECONDARY_BTN_CLASS}>
            Open attendance records
          </Link>
        </div>
      </section>
    </CatalogPageShell>
  );
}
