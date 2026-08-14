"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AttendanceGapsBanner } from "@/components/hr/attendance-gaps-banner";
import { HrTimePickerField } from "@/components/hr/hr-time-picker";
import { P } from "@/lib/permission-codes";
import { useAuth } from "@/contexts/auth-context";
import { formatTimeForApi } from "@/components/hr/hr-shared";
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

function wallParts(value) {
  const text = String(value || "");
  if (text.length >= 16) {
    return { date: text.slice(0, 10), time: text.slice(11, 16) };
  }
  return { date: "", time: "" };
}

function toApiDateTime(date, time24) {
  const time = formatTimeForApi(time24);
  if (!date || !time) return null;
  return `${date} ${time}`;
}

export function HrMissedPunchesScreen() {
  const { hasPermission } = useAuth();
  const canRetry = hasPermission(P.hr.manage);
  const [tab, setTab] = useState("unapplied");
  const [unapplied, setUnapplied] = useState([]);
  const [missingOut, setMissingOut] = useState([]);
  const [gapCounts, setGapCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("tab") === "forgotten") {
      setTab("forgotten");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/attendance/missed-punches");
      setUnapplied(data.unapplied_terminal_punches ?? []);
      setMissingOut(data.missing_clock_out ?? []);
      setGapCounts(data.counts ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load missed punches");
      setUnapplied([]);
      setMissingOut([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(load);

  const unappliedCount = Number(gapCounts?.unapplied_terminal_punches ?? unapplied.length);
  const forgottenCount = Number(gapCounts?.missing_clock_out ?? missingOut.length);

  function startEdit(row) {
    const inn = wallParts(row.clock_in_at);
    const out = wallParts(row.clock_out_at || row.suggested_clock_out_at);
    setEditRow(row);
    setEditIn(inn.time);
    setEditOut(out.time);
  }

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
        notifySuccess("No pending punches were ready to apply. Try Auto-map first.");
      }
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  async function autoMap() {
    setMapping(true);
    try {
      const result = await apiRequest("/attendance/missed-punches/auto-map", { method: "POST" });
      const mapped = Number(result.mapped ?? 0);
      const applied = Number(result.applied ?? result.retried ?? 0);
      notifySuccess(
        `Auto-mapped ${mapped} person${mapped === 1 ? "" : "s"}` +
          (applied ? `, applied ${applied} punch${applied === 1 ? "" : "es"}` : "") +
          ".",
      );
      if (Array.isArray(result.errors) && result.errors.length) {
        notifyError(result.errors[0]);
      }
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Auto-map failed");
    } finally {
      setMapping(false);
    }
  }

  async function saveForgotten(row, { confirmOnly = false } = {}) {
    setSaving(true);
    try {
      const inn = wallParts(row.clock_in_at);
      const body = { confirm_reconciliation: true };
      if (!confirmOnly) {
        const clockIn = toApiDateTime(inn.date, editIn || inn.time);
        const clockOut = toApiDateTime(inn.date, editOut);
        if (clockIn) body.clock_in_at = clockIn;
        if (clockOut) body.clock_out_at = clockOut;
      }
      await apiRequest(`/attendance/missed-punches/${row.id}/clock-out`, {
        method: "POST",
        body,
      });
      notifySuccess(confirmOnly ? "Forgotten clock-out confirmed." : "Punch times saved.");
      setEditRow(null);
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not save clock-out");
    } finally {
      setSaving(false);
    }
  }

  const tabClass = (id) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      tab === id ? "bg-[#185FA5] text-white" : "text-slate-600 hover:bg-slate-50"
    }`;

  const editing = useMemo(
    () => (editRow ? missingOut.find((r) => r.id === editRow.id) ?? editRow : null),
    [editRow, missingOut],
  );

  return (
    <CatalogPageShell
      title="Missed punches"
      subtitle="Unapplied terminal scans and forgotten evening clock-outs for HR to confirm"
      action={
        canRetry && tab === "unapplied" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={mapping || retrying || loading}
              onClick={() => void autoMap()}
              className={SECONDARY_BTN_CLASS}
            >
              {mapping ? "Mapping…" : "Auto-map terminal IDs"}
            </button>
            <PrimaryButton type="button" disabled={retrying || mapping || loading} onClick={() => void retryPending()}>
              {retrying ? "Retrying…" : "Retry pending punches"}
            </PrimaryButton>
          </div>
        ) : null
      }
    >
      <AttendanceGapsBanner counts={gapCounts} />
      <p className="mb-4 text-sm text-slate-600">
        Map terminal person IDs on{" "}
        <Link href="/admin/attendance-clock" className="font-medium text-[#185FA5] hover:underline">
          Attendance clock-in
        </Link>
        . Confirmed days appear on{" "}
        <Link href="/hr/attendance" className="font-medium text-[#185FA5] hover:underline">
          Today's attendance
        </Link>
        {" "}and{" "}
        <Link href="/hr/attendance/history" className="font-medium text-[#185FA5] hover:underline">
          Previous attendance
        </Link>
        . Extra same-hour scans are on{" "}
        <Link href="/hr/duplicate-punches" className="font-medium text-[#185FA5] hover:underline">
          Duplicate punches
        </Link>
        .
      </p>

      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <button type="button" className={tabClass("unapplied")} onClick={() => setTab("unapplied")}>
          Unapplied terminal{unappliedCount ? ` (${unappliedCount})` : ""}
        </button>
        <button type="button" className={tabClass("forgotten")} onClick={() => setTab("forgotten")}>
          Forgotten clock-outs{forgottenCount ? ` (${forgottenCount})` : ""}
        </button>
      </div>

      {tab === "unapplied" ? (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
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
      ) : (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-[15px] font-medium text-slate-900">Forgotten clock-outs</h2>
          <p className="mt-1 text-sm text-slate-500">
            Evening punch missing. At 02:00 Centrix auto-closes the day at the employee’s shift end so hours exist for
            payroll. Confirm that time, or set the real clock-in / clock-out.
          </p>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : missingOut.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No forgotten clock-outs.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Clock in</th>
                    <th className="px-3 py-2">Clock out</th>
                    <th className="px-3 py-2">Hours</th>
                    <th className="px-3 py-2">Status</th>
                    {canRetry ? <th className="px-3 py-2">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {missingOut.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 text-sm">
                        {displayField(row.employee_name)}
                        <span className="ml-2 font-mono text-xs text-slate-500">{displayField(row.employee_code)}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">{formatWhen(row.clock_in_at)}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.clock_out_at ? formatWhen(row.clock_out_at) : "—"}
                        {!row.clock_out_at && row.suggested_clock_out_at ? (
                          <div className="text-[11px] text-slate-500">Shift end {formatWhen(row.suggested_clock_out_at)}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs">{row.hours_open != null ? `${row.hours_open}h` : "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.auto_closed ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                            Auto-closed — confirm
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Still open</span>
                        )}
                      </td>
                      {canRetry ? (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {row.auto_closed ? (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void saveForgotten(row, { confirmOnly: true })}
                                className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
                              >
                                Confirm shift end
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="text-xs font-medium text-[#185FA5] hover:underline"
                            >
                              Set times
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editing && canRetry ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">
                Edit punches for {displayField(editing.employee_name)}
              </p>
              <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
                <HrTimePickerField label="Clock in" value={editIn} onChange={setEditIn} required defaultPeriod="AM" />
                <HrTimePickerField label="Clock out" value={editOut} onChange={setEditOut} required defaultPeriod="PM" />
              </div>
              <div className="mt-3 flex gap-2">
                <PrimaryButton type="button" disabled={saving} onClick={() => void saveForgotten(editing)}>
                  {saving ? "Saving…" : "Save times"}
                </PrimaryButton>
                <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => setEditRow(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <Link href="/hr/attendance" className={SECONDARY_BTN_CLASS}>
              Open attendance records
            </Link>
          </div>
        </section>
      )}
    </CatalogPageShell>
  );
}
