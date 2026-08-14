"use client";

import { useCallback, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError } from "@/lib/notify";
import { composeEmployeeDisplayName } from "@/components/hr/hr-shared";
import {
  CatalogPageShell,
  SECONDARY_BTN_CLASS,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { calendarDateInTimezone, todayCalendarDate } from "@/lib/datetime";

function daysAgo(days) {
  const today = todayCalendarDate();
  const ms = Date.parse(`${today}T12:00:00+03:00`) - days * 86_400_000;
  return calendarDateInTimezone(new Date(ms)) ?? today;
}

function minutesLabel(value) {
  const n = Number(value ?? 0);
  if (!n) return "—";
  return n >= 60 ? `${(n / 60).toFixed(2)}h` : `${n}m`;
}

export function HrLatenessScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(daysAgo(14));
  const [toDate, setToDate] = useState(todayCalendarDate());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/employee-attendance", {
        searchParams: {
          lateness: 1,
          from_date: fromDate,
          to_date: toDate,
          per_page: 200,
        },
      });
      setRows(data.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load lateness");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useTabAwareDataLoad(load);

  return (
    <CatalogPageShell
      title="Lateness"
      subtitle="Late clock-in (after shift start + grace) and late return from lunch (lunch is 1 hour unless the shift says otherwise)."
      action={
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-600">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="ml-2 rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="text-sm text-slate-600">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="ml-2 rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">No lateness in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Employee</th>
                <th className="py-2 pr-4 font-medium">Clock in</th>
                <th className="py-2 pr-4 font-medium">Late in</th>
                <th className="py-2 pr-4 font-medium">Lunch</th>
                <th className="py-2 pr-4 font-medium">Late from lunch</th>
                <th className="py-2 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{formatShortDate(r.attendance_date)}</td>
                  <td className="py-2 pr-4">{composeEmployeeDisplayName(r.employee) || "—"}</td>
                  <td className="py-2 pr-4">{r.check_in ? String(r.check_in).slice(0, 5) : "—"}</td>
                  <td className="py-2 pr-4">{minutesLabel(r.late_minutes)}</td>
                  <td className="py-2 pr-4">
                    {r.lunch_minutes != null ? `${r.lunch_minutes}m` : r.lunch_status || "—"}
                  </td>
                  <td className="py-2 pr-4">{minutesLabel(r.lunch_late_minutes)}</td>
                  <td className="py-2 pr-4">{r.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CatalogPageShell>
  );
}
