"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useConfirm } from "@/contexts/confirm-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { composeEmployeeDisplayName, formatHoursWorked } from "@/components/hr/hr-shared";
import {
  CatalogPageShell,
  Field,
  PaginationBar,
  SECONDARY_BTN_CLASS,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { HrDateField, HrFilterButton, HrFilterToolbar, HrPageActions } from "@/components/hr/hr-list-toolbar";
import {
  BatchActionBar,
  TableRowSelectCell,
  TableSelectAllHeader,
  runSequentialActions,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";
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
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [fromDate, setFromDate] = useState(daysAgo(14));
  const [toDate, setToDate] = useState(daysAgo(1));
  const [search, setSearch] = useState("");
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(14));
  const [appliedTo, setAppliedTo] = useState(daysAgo(1));
  const [appliedSearch, setAppliedSearch] = useState("");
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  useEffect(() => {
    setPage(1);
    clearSelection();
  }, [appliedFrom, appliedTo, appliedSearch, clearSelection]);

  const listParams = useMemo(
    () => ({
      "filter[status]": "absent",
      from_date: appliedFrom,
      to_date: appliedTo,
      ...(appliedSearch ? { q: appliedSearch } : {}),
    }),
    [appliedFrom, appliedTo, appliedSearch],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/employee-attendance", {
        searchParams: {
          ...listParams,
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
  }, [listParams, page, pageSize]);

  useTabAwareDataLoad(load);

  const pageRowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

  async function markPresent(row) {
    if (!row?.id) return;
    setMarkingId(row.id);
    try {
      await apiRequest(`/employee-attendance/${row.id}`, {
        method: "PUT",
        body: {
          employee_id: row.employee_id,
          attendance_date: String(row.attendance_date).slice(0, 10),
          status: "present",
          check_in: null,
          check_out: null,
          notes: "Corrected to present by HR (no punches)",
          source: row.source ?? "manual",
        },
      });
      notifySuccess("Marked present — day will count as paid on the next payroll run.");
      clearSelection();
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not mark present");
    } finally {
      setMarkingId(null);
    }
  }

  async function markPresentSelected() {
    const selected = rows.filter((r) => selectedIds.has(String(r.id)));
    if (selected.length === 0 || batchBusy) return;

    const ok = await confirm({
      title: "Mark selected present",
      message: `Mark ${selected.length} absent day${selected.length === 1 ? "" : "s"} as present? They will count as paid on the next payroll run.`,
      confirmLabel: "Mark present",
    });
    if (!ok) return;

    setBatchBusy(true);
    try {
      const { succeeded, failed } = await runSequentialActions({
        items: selected,
        action: async (row) => {
          await apiRequest(`/employee-attendance/${row.id}`, {
            method: "PUT",
            body: {
              employee_id: row.employee_id,
              attendance_date: String(row.attendance_date).slice(0, 10),
              status: "present",
              check_in: null,
              check_out: null,
              notes: "Corrected to present by HR (no punches)",
              source: row.source ?? "manual",
            },
          });
        },
      });
      clearSelection();
      await load();
      if (failed.length === 0) {
        notifySuccess(
          succeeded.length === 1
            ? "1 day marked present."
            : `${succeeded.length} days marked present.`,
        );
      } else if (succeeded.length === 0) {
        notifyError(failed[0]?.message ?? "Could not mark selected present.");
      } else {
        notifyError(
          `Marked ${succeeded.length}; ${failed.length} failed${
            failed[0]?.message ? ` (${failed[0].message})` : ""
          }`,
        );
      }
    } finally {
      setBatchBusy(false);
    }
  }

  async function fetchAllAbsentRows() {
    const all = [];
    let p = 1;
    for (;;) {
      const data = await apiRequest("/employee-attendance", {
        searchParams: {
          ...listParams,
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
  const actionBusy = batchBusy || markingId != null;

  return (
    <CatalogPageShell
      title="Absents"
      subtitle="Past scheduled workdays with no clock-in. Use Mark present to pay the day (do not only delete — a missing day is still unpaid)."
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
          <Field label="Search">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by employee name"
            />
          </Field>
          <HrFilterButton
            loading={loading}
            onClick={() => {
              const nextSearch = search.trim();
              setAppliedFrom(fromDate);
              setAppliedTo(toDate);
              setAppliedSearch(nextSearch);
              setPage(1);
              if (
                fromDate === appliedFrom &&
                toDate === appliedTo &&
                nextSearch === appliedSearch
              ) {
                void load();
              }
            }}
          />
        </HrFilterToolbar>
      }
    >
      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">
          {appliedSearch ? "No absents match your filters." : "No absent records in this range."}
        </p>
      ) : (
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <TableSelectAllHeader
                  checked={allOnPageSelected}
                  indeterminate={someOnPageSelected}
                  onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                />
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Employee</th>
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">No of hours worked</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
                <th className="py-2 pr-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <TableRowSelectCell
                    checked={selectedIds.has(String(r.id))}
                    onChange={() => toggleOne(r.id)}
                    label={`Select absent for ${composeEmployeeDisplayName(r.employee) || "employee"}`}
                  />
                  <td className="py-2 pr-4">{formatShortDate(r.attendance_date)}</td>
                  <td className="py-2 pr-4">{composeEmployeeDisplayName(r.employee) || "—"}</td>
                  <td className="py-2 pr-4">{r.employee?.employee_code ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatHoursWorked(r.hours_worked ?? 0)}</td>
                  <td className="py-2 pr-4 text-slate-600">{r.notes || "—"}</td>
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      className="text-sm font-medium text-[#185FA5] hover:underline disabled:opacity-50"
                      disabled={actionBusy}
                      onClick={() => void markPresent(r)}
                    >
                      {markingId === r.id ? "Saving…" : "Mark present"}
                    </button>
                  </td>
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
        onChange={(next) => {
          clearSelection();
          setPage(next);
        }}
        onPageSizeChange={(size) => {
          clearSelection();
          setPageSize(size);
          setPage(1);
        }}
        pageSizeOptions={[10, 25, 50, 100]}
      />

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <button
          type="button"
          disabled={batchBusy || selectedCount === 0}
          onClick={() => void markPresentSelected()}
          className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {batchBusy ? "Working…" : `Mark present (${selectedCount})`}
        </button>
      </BatchActionBar>
    </CatalogPageShell>
  );
}
