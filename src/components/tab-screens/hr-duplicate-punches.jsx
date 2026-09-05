"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AttendanceGapsBanner } from "@/components/hr/attendance-gaps-banner";
import { P } from "@/lib/permission-codes";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  PaginationBar,
  PrimaryButton,
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

function rowDateKey(row) {
  return String(row.event_time_local || row.event_time || "").slice(0, 10);
}

export function HrDuplicatePunchesScreen() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(P.hr.manage) || hasPermission(P.hr.duplicate_punches.view);
  const [duplicates, setDuplicates] = useState([]);
  const [gapCounts, setGapCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/attendance/missed-punches");
      setDuplicates(data.duplicate_punches ?? []);
      setGapCounts(data.counts ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load duplicate punches");
      setDuplicates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(load);

  const filtered = useMemo(() => {
    const q = appliedSearch.toLowerCase();
    return duplicates.filter((row) => {
      const d = rowDateKey(row);
      if (d && (d < appliedFrom || d > appliedTo)) return false;
      if (!q) return true;
      const hay = [
        row.employee_no,
        row.employee_name,
        row.device_no,
        row.device_location,
        row.process_error,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [duplicates, appliedFrom, appliedTo, appliedSearch]);

  async function dismiss(id = null) {
    setBusy(true);
    try {
      const result = await apiRequest("/attendance/duplicate-punches/dismiss", {
        method: "POST",
        body: id ? { id } : {},
      });
      const n = Number(result.dismissed ?? 0);
      notifySuccess(n > 0 ? `Dismissed ${n} duplicate punch${n === 1 ? "" : "es"}.` : "Nothing to dismiss.");
      clearSelection();
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not dismiss");
    } finally {
      setBusy(false);
    }
  }

  async function dismissSelected() {
    const selected = filtered.filter((r) => r.id && selectedIds.has(String(r.id)));
    if (selected.length === 0 || batchBusy) return;
    setBatchBusy(true);
    try {
      const { succeeded, failed } = await runSequentialActions({
        items: selected,
        action: async (row) => {
          await apiRequest("/attendance/duplicate-punches/dismiss", {
            method: "POST",
            body: { id: row.id },
          });
        },
      });
      clearSelection();
      await load();
      if (failed.length === 0) {
        notifySuccess(
          succeeded.length === 1
            ? "1 duplicate dismissed."
            : `${succeeded.length} duplicates dismissed.`,
        );
      } else if (succeeded.length === 0) {
        notifyError(failed[0]?.message ?? "Could not dismiss selected.");
      } else {
        notifyError(
          `Dismissed ${succeeded.length}; ${failed.length} failed${
            failed[0]?.message ? ` (${failed[0].message})` : ""
          }`,
        );
      }
    } finally {
      setBatchBusy(false);
    }
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageRowIds = useMemo(
    () => paged.map((r) => r.id).filter((id) => id != null),
    [paged],
  );
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

  return (
    <CatalogPageShell
      title="Duplicate punches"
      subtitle="Extra terminal scans in the same hour. Only the first successful punch counts for attendance."
      action={
        <HrPageActions>
          <CatalogListExport
            title="Duplicate punches"
            filename="duplicate-punches"
            columns={[
              { key: "time", label: "Time" },
              { key: "employee_no", label: "Terminal ID" },
              { key: "employee_name", label: "Name on device" },
              { key: "device", label: "Device" },
              { key: "note", label: "Note" },
            ]}
            totalCount={total}
            getInlineRows={async () =>
              filtered.map((row) => ({
                time: formatWhen(row.event_time_local || row.event_time),
                employee_no: displayField(row.employee_no),
                employee_name: displayField(row.employee_name),
                device: `${displayField(row.device_no)}${row.device_location ? ` · ${row.device_location}` : ""}`,
                note: displayField(row.process_error),
              }))
            }
            disabled={loading}
          />
          {canManage && filtered.length > 0 ? (
            <PrimaryButton type="button" disabled={busy || loading} onClick={() => void dismiss()}>
              {busy ? "Dismissing…" : "Dismiss all"}
            </PrimaryButton>
          ) : null}
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
              placeholder="Name, terminal ID, device…"
            />
          </Field>
          <HrFilterButton
            loading={loading}
            onClick={() => {
              setAppliedFrom(fromDate);
              setAppliedTo(toDate);
              setAppliedSearch(search.trim());
              setPage(1);
            }}
          />
        </HrFilterToolbar>
      }
    >
      <AttendanceGapsBanner counts={gapCounts} />
      <p className="mb-6 text-sm text-slate-600">
        These scans are logged so HR can see every fingerprint. They do not change attendance. Unmapped scans stay on{" "}
        <Link href="/hr/missed-punches" className="font-medium text-[#185FA5] hover:underline">
          Missed punches
        </Link>
        .
      </p>

      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500">
            {appliedSearch ? "No duplicate punches match your filters." : "No duplicate punches."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {canManage ? (
                    <TableSelectAllHeader
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected}
                      onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                    />
                  ) : null}
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Terminal ID</th>
                  <th className="px-3 py-2">Name on device</th>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2">Note</th>
                  {canManage ? <th className="px-3 py-2">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {paged.map((row) => (
                  <tr key={row.id ?? row.event_key} className="border-t border-slate-100">
                    {canManage ? (
                      <TableRowSelectCell
                        checked={selectedIds.has(String(row.id))}
                        onChange={() => toggleOne(row.id)}
                        label={`Select duplicate for ${displayField(row.employee_name)}`}
                      />
                    ) : null}
                    <td className="px-3 py-2 text-xs">
                      {formatWhen(row.event_time_local || row.event_time)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{displayField(row.employee_no)}</td>
                    <td className="px-3 py-2 text-xs">{displayField(row.employee_name)}</td>
                    <td className="px-3 py-2 text-xs">
                      {displayField(row.device_no)}
                      {row.device_location ? ` · ${row.device_location}` : ""}
                    </td>
                    <td className="max-w-[320px] px-3 py-2 text-xs text-slate-600">
                      {displayField(row.process_error)}
                    </td>
                    {canManage ? (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={busy || batchBusy || !row.id}
                          onClick={() => void dismiss(row.id)}
                          className="text-xs font-medium text-[#185FA5] hover:underline disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={safePage}
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
      </section>

      {canManage ? (
        <BatchActionBar count={selectedCount} onClear={clearSelection}>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={batchBusy || selectedCount === 0}
            onClick={() => void dismissSelected()}
          >
            {batchBusy ? "Working…" : `Dismiss (${selectedCount})`}
          </PrimaryButton>
        </BatchActionBar>
      ) : null}
    </CatalogPageShell>
  );
}
