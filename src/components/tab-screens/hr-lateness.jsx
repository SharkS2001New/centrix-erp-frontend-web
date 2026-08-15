"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError } from "@/lib/notify";
import { composeEmployeeDisplayName, formatAttendanceLateness, formatHoursWorked } from "@/components/hr/hr-shared";
import {
  CatalogPageShell,
  PaginationBar,
  SECONDARY_BTN_CLASS,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { HrDateField, HrFilterButton, HrFilterToolbar, HrPageActions } from "@/components/hr/hr-list-toolbar";
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

function mapLatenessExportRow(r) {
  return {
    attendance_date: formatShortDate(r.attendance_date),
    employee: composeEmployeeDisplayName(r.employee) || "",
    check_in: r.check_in ? String(r.check_in).slice(0, 5) : "",
    hours_worked: formatHoursWorked(r.hours_worked),
    late_in: minutesLabel(r.late_minutes),
    lunch: r.lunch_minutes != null ? `${r.lunch_minutes}m` : r.lunch_status || "",
    lunch_late: minutesLabel(r.lunch_late_minutes),
    overall_late: formatAttendanceLateness(r),
    status: r.status || "",
  };
}

const LATENESS_EXPORT_COLUMNS = [
  { key: "attendance_date", label: "Date" },
  { key: "employee", label: "Employee" },
  { key: "check_in", label: "Clock in" },
  { key: "hours_worked", label: "No of hours worked", align: "right" },
  { key: "late_in", label: "Late in" },
  { key: "lunch", label: "Lunch" },
  { key: "lunch_late", label: "Late from lunch" },
  { key: "overall_late", label: "Overall late" },
  { key: "status", label: "Status" },
];

export function HrLatenessScreen() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(daysAgo(14));
  const [toDate, setToDate] = useState(todayCalendarDate());
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(14));
  const [appliedTo, setAppliedTo] = useState(todayCalendarDate());

  useEffect(() => {
    setPage(1);
  }, [appliedFrom, appliedTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/employee-attendance", {
        searchParams: {
          lateness: 1,
          from_date: appliedFrom,
          to_date: appliedTo,
          per_page: pageSize,
          page,
        },
      });
      setRows(data.data ?? []);
      setTotal(Number(data.meta?.total ?? data.total ?? data.data?.length ?? 0));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load lateness");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [appliedFrom, appliedTo, page, pageSize]);

  useTabAwareDataLoad(load);

  async function fetchAllLatenessRows() {
    const all = [];
    let p = 1;
    for (;;) {
      const data = await apiRequest("/employee-attendance", {
        searchParams: {
          lateness: 1,
          from_date: appliedFrom,
          to_date: appliedTo,
          per_page: 200,
          page: p,
        },
      });
      const batch = data.data ?? [];
      all.push(...batch);
      const n = Number(data.meta?.total ?? all.length);
      if (all.length >= n || batch.length === 0) break;
      p += 1;
      if (p > 100) break;
    }
    return all.map(mapLatenessExportRow);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  return (
    <CatalogPageShell
      title="Lateness"
      subtitle="Late clock-in (after shift start + grace), late return from lunch, and overall lateness deducted on payroll."
      action={
        <HrPageActions>
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={load} disabled={loading}>
            Refresh
          </button>
          <CatalogListExport
            title="Lateness"
            filename="lateness"
            columns={LATENESS_EXPORT_COLUMNS}
            totalCount={total}
            getInlineRows={fetchAllLatenessRows}
            disabled={loading}
          />
        </HrPageActions>
      }
      toolbar={
        <HrFilterToolbar>
          <HrDateField label="From" value={fromDate} onChange={setFromDate} />
          <HrDateField label="To" value={toDate} onChange={setToDate} />
          <HrFilterButton
            loading={loading}
            onClick={() => {
              setAppliedFrom(fromDate);
              setAppliedTo(toDate);
              setPage(1);
              if (fromDate === appliedFrom && toDate === appliedTo) void load();
            }}
          />
        </HrFilterToolbar>
      }
    >
      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">No lateness in this range.</p>
      ) : (
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Employee</th>
                <th className="py-2 pr-4 font-medium">Clock in</th>
                <th className="py-2 pr-4 font-medium">No of hours worked</th>
                <th className="py-2 pr-4 font-medium">Late in</th>
                <th className="py-2 pr-4 font-medium">Lunch</th>
                <th className="py-2 pr-4 font-medium">Late from lunch</th>
                <th className="py-2 pr-4 font-medium">Overall late</th>
                <th className="py-2 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{formatShortDate(r.attendance_date)}</td>
                  <td className="py-2 pr-4">{composeEmployeeDisplayName(r.employee) || "—"}</td>
                  <td className="py-2 pr-4">{r.check_in ? String(r.check_in).slice(0, 5) : "—"}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatHoursWorked(r.hours_worked)}</td>
                  <td className="py-2 pr-4">{minutesLabel(r.late_minutes)}</td>
                  <td className="py-2 pr-4">
                    {r.lunch_minutes != null ? `${r.lunch_minutes}m` : r.lunch_status || "—"}
                  </td>
                  <td className="py-2 pr-4">{minutesLabel(r.lunch_late_minutes)}</td>
                  <td className="py-2 pr-4 font-medium">{formatAttendanceLateness(r)}</td>
                  <td className="py-2 pr-4">{r.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        pageSizeOptions={[10, 25, 50, 100]}
      />
    </CatalogPageShell>
  );
}
