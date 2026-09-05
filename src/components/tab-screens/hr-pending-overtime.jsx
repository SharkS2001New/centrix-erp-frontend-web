"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useConfirm } from "@/contexts/confirm-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { P } from "@/lib/permission-codes";
import { useAuth } from "@/contexts/auth-context";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import {
  CatalogPageShell,
  Field,
  PaginationBar,
  PrimaryButton,
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

const PENDING_OT_EXPORT_COLUMNS = [
  { key: "work_date", label: "Date" },
  { key: "employee", label: "Employee" },
  { key: "hours", label: "Hours", align: "right" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "notes", label: "Notes" },
];

function daysAgo(days) {
  const today = todayCalendarDate();
  const ms = Date.parse(`${today}T12:00:00+03:00`) - days * 86_400_000;
  return calendarDateInTimezone(new Date(ms)) ?? today;
}

export function HrPendingOvertimeScreen() {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const highlightOvertimeId = searchParams.get("overtime_id");
  const highlightOpenedRef = useRef(null);
  const canManage = hasPermission(P.hr.pending_overtime.approve) || hasPermission(P.hr.manage);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(todayCalendarDate());
  const [search, setSearch] = useState("");
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(30));
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
      "filter[status]": "pending",
      from_date: appliedFrom,
      to_date: appliedTo,
      ...(appliedSearch ? { q: appliedSearch } : {}),
    }),
    [appliedFrom, appliedTo, appliedSearch],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ot = await apiRequest("/employee-overtime", {
        searchParams: { ...listParams, per_page: pageSize, page },
      });
      setRows(ot.data ?? []);
      setTotal(Number(ot.meta?.total ?? ot.total ?? ot.data?.length ?? 0));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load pending overtime");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [listParams, page, pageSize]);

  useTabAwareDataLoad(load);

  useEffect(() => {
    if (!highlightOvertimeId || loading) return;
    const key = String(highlightOvertimeId);
    if (highlightOpenedRef.current === key) return;
    const el = document.getElementById(`pending-ot-row-${key}`);
    if (!el) return;
    highlightOpenedRef.current = key;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightOvertimeId, loading, rows]);

  const pageRowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

  function employeeName(row) {
    return row.employee ? composeEmployeeDisplayName(row.employee) : "—";
  }

  async function fetchAllPendingRows() {
    const all = [];
    let p = 1;
    for (;;) {
      const data = await apiRequest("/employee-overtime", {
        searchParams: { ...listParams, per_page: 200, page: p },
      });
      const batch = data.data ?? [];
      all.push(...batch);
      const n = Number(data.meta?.total ?? all.length);
      if (all.length >= n || batch.length === 0) break;
      p += 1;
      if (p > 100) break;
    }
    return all.map((r) => ({
      work_date: formatShortDate(r.work_date),
      employee: employeeName(r),
      hours: r.hours,
      amount: formatHrKesFull(r.amount),
      notes: r.notes || "",
    }));
  }

  async function approve(id) {
    setBusyId(id);
    try {
      await apiRequest(`/employee-overtime/${id}/approve`, { method: "POST" });
      notifySuccess("Overtime approved. It now appears on the Overtime page.");
      clearSelection();
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not approve");
    } finally {
      setBusyId(null);
    }
  }

  async function deny(id) {
    setBusyId(id);
    try {
      await apiRequest(`/employee-overtime/${id}/deny`, { method: "POST" });
      notifySuccess("Denied. The overtime was removed and clock-out was set to shift end.");
      clearSelection();
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not deny");
    } finally {
      setBusyId(null);
    }
  }

  async function approveSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0 || batchBusy) return;

    const ok = await confirm({
      title: "Approve selected overtime",
      message: `Approve ${ids.length} pending overtime ${ids.length === 1 ? "entry" : "entries"}? They will move to the Overtime page for payroll.`,
      confirmLabel: "Approve",
    });
    if (!ok) return;

    setBatchBusy(true);
    try {
      const { succeeded, failed } = await runSequentialActions({
        items: ids,
        action: async (id) => {
          await apiRequest(`/employee-overtime/${id}/approve`, { method: "POST" });
        },
      });
      clearSelection();
      await load();
      if (failed.length === 0) {
        notifySuccess(
          succeeded.length === 1
            ? "1 overtime approved."
            : `${succeeded.length} overtime entries approved.`,
        );
      } else if (succeeded.length === 0) {
        notifyError(failed[0]?.message ?? "Could not approve selected overtime.");
      } else {
        notifyError(
          `Approved ${succeeded.length}; ${failed.length} failed${
            failed[0]?.message ? ` (${failed[0].message})` : ""
          }`,
        );
      }
    } finally {
      setBatchBusy(false);
    }
  }

  async function denySelected() {
    const ids = [...selectedIds];
    if (ids.length === 0 || batchBusy) return;

    const ok = await confirm({
      title: "Deny selected overtime",
      message: `Deny ${ids.length} pending overtime ${
        ids.length === 1 ? "entry" : "entries"
      }? Each will be removed and clock-out reset to shift end.`,
      confirmLabel: "Deny",
      destructive: true,
    });
    if (!ok) return;

    setBatchBusy(true);
    try {
      const { succeeded, failed } = await runSequentialActions({
        items: ids,
        action: async (id) => {
          await apiRequest(`/employee-overtime/${id}/deny`, { method: "POST" });
        },
      });
      clearSelection();
      await load();
      if (failed.length === 0) {
        notifySuccess(
          succeeded.length === 1
            ? "1 overtime denied."
            : `${succeeded.length} overtime entries denied.`,
        );
      } else if (succeeded.length === 0) {
        notifyError(failed[0]?.message ?? "Could not deny selected overtime.");
      } else {
        notifyError(
          `Denied ${succeeded.length}; ${failed.length} failed${
            failed[0]?.message ? ` (${failed[0].message})` : ""
          }`,
        );
      }
    } finally {
      setBatchBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const actionBusy = batchBusy || busyId != null;

  return (
    <CatalogPageShell
      title="Pending overtimes"
      subtitle="Late clock-out past shift end is logged here. Approve to pay it, or deny to drop it and reset clock-out to the shift end time."
      action={
        <HrPageActions>
          <Link href="/hr/overtime" className={SECONDARY_BTN_CLASS}>
            Approved overtime
          </Link>
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={load} disabled={loading}>
            Refresh
          </button>
          <CatalogListExport
            title="Pending overtimes"
            filename="pending-overtimes"
            columns={PENDING_OT_EXPORT_COLUMNS}
            totalCount={total}
            getInlineRows={fetchAllPendingRows}
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
              placeholder="Employee, notes…"
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
          {appliedSearch ? "No pending overtime matches your filters." : "No pending overtime."}
        </p>
      ) : (
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                {canManage ? (
                  <TableSelectAllHeader
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                  />
                ) : null}
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Employee</th>
                <th className="py-2 pr-4 font-medium">Hours</th>
                <th className="py-2 pr-4 font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
                {canManage ? <th className="py-2 pr-4 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  id={`pending-ot-row-${r.id}`}
                  className={`border-b border-slate-100 ${
                    highlightOvertimeId && String(r.id) === String(highlightOvertimeId)
                      ? "bg-amber-50"
                      : ""
                  }`}
                >
                  {canManage ? (
                    <TableRowSelectCell
                      checked={selectedIds.has(String(r.id))}
                      onChange={() => toggleOne(r.id)}
                      label={`Select overtime for ${employeeName(r)}`}
                    />
                  ) : null}
                  <td className="py-2 pr-4">{formatShortDate(r.work_date)}</td>
                  <td className="py-2 pr-4">{employeeName(r)}</td>
                  <td className="py-2 pr-4">{r.hours}</td>
                  <td className="py-2 pr-4">{formatHrKesFull(r.amount)}</td>
                  <td className="py-2 pr-4 text-slate-600">{r.notes || "—"}</td>
                  {canManage ? (
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        <PrimaryButton
                          type="button"
                          showIcon={false}
                          onClick={() => approve(r.id)}
                          disabled={actionBusy}
                        >
                          Approve
                        </PrimaryButton>
                        <button
                          type="button"
                          className={SECONDARY_BTN_CLASS}
                          onClick={() => deny(r.id)}
                          disabled={actionBusy}
                        >
                          Deny
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

      {canManage ? (
        <BatchActionBar count={selectedCount} onClear={clearSelection}>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={batchBusy || selectedCount === 0}
            onClick={() => void approveSelected()}
          >
            {batchBusy ? "Working…" : `Approve (${selectedCount})`}
          </PrimaryButton>
          <button
            type="button"
            disabled={batchBusy || selectedCount === 0}
            onClick={() => void denySelected()}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {batchBusy ? "Working…" : `Deny (${selectedCount})`}
          </button>
        </BatchActionBar>
      ) : null}
    </CatalogPageShell>
  );
}
