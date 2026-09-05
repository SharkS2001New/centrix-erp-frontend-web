"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useConfirm } from "@/contexts/confirm-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  attendanceLatenessParts,
  composeEmployeeDisplayName,
  formatAttendanceLateness,
  formatHoursWorked,
} from "@/components/hr/hr-shared";
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
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";
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
    waiver: r.pending_waiver
      ? "Pending waiver"
      : r.lateness_waived
        ? "Waived"
        : "",
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
  { key: "waiver", label: "Waiver" },
];

export function HrLatenessScreen() {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [batchBusy, setBatchBusy] = useState(false);
  const [fromDate, setFromDate] = useState(daysAgo(14));
  const [toDate, setToDate] = useState(todayCalendarDate());
  const [search, setSearch] = useState("");
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(14));
  const [appliedTo, setAppliedTo] = useState(todayCalendarDate());
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
      lateness: 1,
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
      notifyError(e instanceof ApiError ? e.message : "Failed to load lateness");
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

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(String(r.id))),
    [rows, selectedIds],
  );

  const selectedWaiveable = useMemo(
    () =>
      selectedRows.filter(
        (r) => attendanceLatenessParts(r).total > 0 && !r.lateness_waived && !r.pending_waiver,
      ),
    [selectedRows],
  );

  const selectedUndoWaive = useMemo(
    () =>
      selectedRows.filter(
        (r) => attendanceLatenessParts(r).total > 0 && r.lateness_waived && !r.pending_waiver,
      ),
    [selectedRows],
  );

  const selectedWaiveableCount = selectedWaiveable.length;
  const selectedUndoWaiveCount = selectedUndoWaive.length;

  const selectedWaiveableEmployeeCount = useMemo(() => {
    const ids = new Set(selectedWaiveable.map((r) => Number(r.employee_id)).filter((id) => id > 0));
    return ids.size;
  }, [selectedWaiveable]);

  const selectedUndoWaiveEmployeeCount = useMemo(() => {
    const ids = new Set(selectedUndoWaive.map((r) => Number(r.employee_id)).filter((id) => id > 0));
    return ids.size;
  }, [selectedUndoWaive]);

  async function fetchAllLatenessRows() {
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
    return all.map(mapLatenessExportRow);
  }

  async function waiveSelectedLateness(waived) {
    const eligible = waived ? selectedWaiveable : selectedUndoWaive;
    const ids = eligible.map((r) => r.id);
    if (ids.length === 0 || batchBusy) return;

    const employeeCount = waived ? selectedWaiveableEmployeeCount : selectedUndoWaiveEmployeeCount;
    let reason = "";
    if (waived) {
      const entered = window.prompt(
        `Request lateness waiver for ${ids.length} record${ids.length === 1 ? "" : "s"}` +
          ` (${employeeCount} employee${employeeCount === 1 ? "" : "s"})?\n` +
          `Requires manager approval. One reason is sent with all:`,
        "",
      );
      if (entered === null) return;
      reason = entered.trim();
    } else {
      const ok = await confirm({
        title: "Request undo lateness waiver?",
        message: `Submit undo requests for ${ids.length} record${ids.length === 1 ? "" : "s"} (${employeeCount} employee${employeeCount === 1 ? "" : "s"})? A manager must approve before payroll hours change.`,
        confirmLabel: "Submit request",
      });
      if (!ok) return;
    }

    setBatchBusy(true);
    try {
      const chunkSize = 200;
      let updated = 0;
      let skipped = 0;
      let autoApproved = 0;
      let firstSkipReason = null;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const res = await apiRequest("/employee-attendance/bulk-waive-lateness", {
          method: "POST",
          body: {
            ids: chunk,
            lateness_waived: waived,
            lateness_waiver_reason: waived ? reason || null : null,
          },
        });
        updated += Number(res.updated_count ?? res.submitted_count ?? 0);
        skipped += Number(res.skipped_count ?? res.skipped?.length ?? 0);
        autoApproved += Number(res.auto_approved?.length ?? 0);
        if (!firstSkipReason && res.skipped?.[0]?.reason) {
          firstSkipReason = res.skipped[0].reason;
        }
      }
      clearSelection();
      await load();
      if (updated > 0 && skipped === 0) {
        if (autoApproved > 0 && autoApproved === updated) {
          notifySuccess(
            `Applied ${updated} lateness waiver${updated === 1 ? "" : "s"} (you have approve permission).`,
          );
        } else if (autoApproved > 0) {
          notifySuccess(
            `Applied ${autoApproved}; submitted ${updated - autoApproved} for manager approval.`,
          );
        } else {
          notifySuccess(
            `Submitted ${updated} waiver request${updated === 1 ? "" : "s"} for manager approval.`,
          );
        }
      } else if (updated > 0) {
        notifySuccess(`Processed ${updated}; skipped ${skipped}.`);
      } else {
        notifyError(firstSkipReason ?? "No waiver requests submitted.");
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Bulk waiver request failed");
    } finally {
      setBatchBusy(false);
    }
  }

  function waiverLabel(r) {
    if (r.pending_waiver) return "Pending waiver";
    if (r.lateness_waived) return "Waived";
    return "—";
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  return (
    <CatalogPageShell
      title="Lateness"
      subtitle="Late clock-in (after shift start + grace), late return from lunch, and overall lateness deducted on payroll. Select rows to request waivers."
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
          {appliedSearch ? "No lateness matches your filters." : "No lateness in this range."}
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
                <th className="py-2 pr-4 font-medium">Clock in</th>
                <th className="py-2 pr-4 font-medium">No of hours worked</th>
                <th className="py-2 pr-4 font-medium">Late in</th>
                <th className="py-2 pr-4 font-medium">Lunch</th>
                <th className="py-2 pr-4 font-medium">Late from lunch</th>
                <th className="py-2 pr-4 font-medium">Overall late</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Waiver</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <TableRowSelectCell
                    checked={selectedIds.has(String(r.id))}
                    onChange={() => toggleOne(r.id)}
                    label={`Select lateness for ${composeEmployeeDisplayName(r.employee) || "employee"}`}
                  />
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
                  <td className="py-2 pr-4">{waiverLabel(r)}</td>
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
        {selectedWaiveableCount > 0 ? (
          <button
            type="button"
            disabled={batchBusy}
            onClick={() => void waiveSelectedLateness(true)}
            className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {batchBusy
              ? "Working…"
              : `Request waive (${selectedWaiveableCount}${
                  selectedWaiveableEmployeeCount > 1
                    ? ` · ${selectedWaiveableEmployeeCount} users`
                    : ""
                })`}
          </button>
        ) : null}
        {selectedUndoWaiveCount > 0 ? (
          <button
            type="button"
            disabled={batchBusy}
            onClick={() => void waiveSelectedLateness(false)}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Request undo ({selectedUndoWaiveCount}
            {selectedUndoWaiveEmployeeCount > 1
              ? ` · ${selectedUndoWaiveEmployeeCount} users`
              : ""}
            )
          </button>
        ) : null}
      </BatchActionBar>
    </CatalogPageShell>
  );
}
