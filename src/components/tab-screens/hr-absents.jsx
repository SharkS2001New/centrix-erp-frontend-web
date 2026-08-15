"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError } from "@/lib/notify";
import { composeEmployeeDisplayName, formatHoursWorked } from "@/components/hr/hr-shared";
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

function mapAbsentExportRow(r) {
  return {
    attendance_date: formatShortDate(r.attendance_date),
    employee: composeEmployeeDisplayName(r.employee) || "",
    employee_code: r.employee?.employee_code ?? "",
    hours_worked: formatHoursWorked(r.hours_worked ?? 0),
    notes: r.notes || "",
  };
}

const ABSENT_EXPORT_COLUMNS = [
  { key: "attendance_date", label: "Date" },
  { key: "employee", label: "Employee" },
  { key: "employee_code", label: "Code" },
  { key: "hours_worked", label: "No of hours worked", align: "right" },
  { key: "notes", label: "Notes" },
];

export function HrAbsentsScreen() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(daysAgo(14));
  const [toDate, setToDate] = useState(daysAgo(1));
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(14));
  const [appliedTo, setAppliedTo] = useState(daysAgo(1));

  useEffect(() => {
    setPage(1);
  }, [appliedFrom, appliedTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/employee-attendance", {
        searchParams: {
          "filter[status]": "absent",
          from_date: appliedFrom,
          to_date: appliedTo,
          per_page: pageSize,
          page,
        },
      });
      setRows(data.data ?? []);
      setTotal(Number(data.meta?.total ?? data.total ?? data.data?.length ?? 0));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load absents");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [appliedFrom, appliedTo, page, pageSize]);

  useTabAwareDataLoad(load);

  async function fetchAllAbsentRows() {
    const all = [];
    let p = 1;
    for (;;) {
      const data = await apiRequest("/employee-attendance", {
        searchParams: {
          "filter[status]": "absent",
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
    return all.map(mapAbsentExportRow);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  return (
    <CatalogPageShell
      title="Absents"
      subtitle="Past scheduled workdays with no clock-in. Hours worked stay 0."
      action={
        <HrPageActions>
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={load} disabled={loading}>
            Refresh
          </button>
          <CatalogListExport
            title="Absents"
            filename="absents"
            columns={ABSENT_EXPORT_COLUMNS}
            totalCount={total}
            getInlineRows={fetchAllAbsentRows}
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
        <p className="text-sm text-slate-600">No absent records in this range.</p>
      ) : (
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Employee</th>
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">No of hours worked</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{formatShortDate(r.attendance_date)}</td>
                  <td className="py-2 pr-4">{composeEmployeeDisplayName(r.employee) || "—"}</td>
                  <td className="py-2 pr-4">{r.employee?.employee_code ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatHoursWorked(r.hours_worked ?? 0)}</td>
                  <td className="py-2 pr-4 text-slate-600">{r.notes || "—"}</td>
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
