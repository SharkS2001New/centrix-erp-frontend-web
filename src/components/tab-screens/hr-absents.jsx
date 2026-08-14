"use client";

import { useCallback, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { P } from "@/lib/permission-codes";
import { useAuth } from "@/contexts/auth-context";
import { composeEmployeeDisplayName } from "@/components/hr/hr-shared";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { calendarDateInTimezone, todayCalendarDate } from "@/lib/datetime";

function daysAgo(days) {
  const today = todayCalendarDate();
  const ms = Date.parse(`${today}T12:00:00+03:00`) - days * 86_400_000;
  return calendarDateInTimezone(new Date(ms)) ?? today;
}

export function HrAbsentsScreen() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(P.hr.manage);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fromDate, setFromDate] = useState(daysAgo(14));
  const [toDate, setToDate] = useState(daysAgo(1));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/employee-attendance", {
        searchParams: {
          "filter[status]": "absent",
          from_date: fromDate,
          to_date: toDate,
          per_page: 200,
        },
      });
      setRows(data.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load absents");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useTabAwareDataLoad(load);

  async function markAbsents() {
    setBusy(true);
    try {
      const result = await apiRequest("/employee-attendance/mark-absents", {
        method: "POST",
        body: { from_date: fromDate, to_date: toDate },
      });
      const n = Number(result.created_count ?? result.created ?? 0);
      notifySuccess(n > 0 ? `Marked ${n} absent day${n === 1 ? "" : "s"}.` : "No new absents to mark.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not mark absents");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CatalogPageShell
      title="Absents"
      subtitle="Scheduled work days with no clock-in. Mark absents for past dates, then review the list."
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
          {canManage ? (
            <PrimaryButton type="button" onClick={markAbsents} disabled={busy}>
              Mark absents
            </PrimaryButton>
          ) : null}
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">No absent records in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Employee</th>
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{formatShortDate(r.attendance_date)}</td>
                  <td className="py-2 pr-4">{composeEmployeeDisplayName(r.employee) || "—"}</td>
                  <td className="py-2 pr-4">{r.employee?.employee_code ?? "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CatalogPageShell>
  );
}
