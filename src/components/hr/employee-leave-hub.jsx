"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  FormDrawer,
  PrimaryButton,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { HrDateField, HrFilterToolbar } from "@/components/hr/hr-list-toolbar";
import { useAuth } from "@/contexts/auth-context";
import { canApproveLeaveRequests } from "@/lib/approval-permissions";
import { ApprovalReminderButton } from "@/components/approval-reminder-button";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";
import { composeEmployeeDisplayName } from "@/components/hr/hr-shared";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";
import { printLeaveApplication } from "@/components/hr/leave-application-print";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  buildOffDayBody,
  buildOffDayEmptyForm,
  HrOffDayAssignmentFields,
  validateOffDayForm,
} from "@/components/hr/hr-off-day-assignment-fields";
import { leaveDurationLabel } from "@/lib/leave-duration";

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** First and last calendar day of the month containing `date` (YYYY-MM-DD or Date). */
function monthDateBounds(date = new Date()) {
  const base = typeof date === "string" ? new Date(`${date}T12:00:00`) : date;
  const y = base.getFullYear();
  const m = base.getMonth();
  return {
    from: formatLocalDate(new Date(y, m, 1)),
    to: formatLocalDate(new Date(y, m + 1, 0)),
  };
}

function deductFromLabel(value) {
  if (value === "annual") return "Annual leave";
  if (value === "sick") return "Sick leave";
  if (value === "unpaid") return "Unpaid leave";
  return "Off days";
}

function formatPeriod(record) {
  const start = record.start_date ?? record.leave_date;
  const end = record.end_date ?? start;
  if (!start) return "—";
  const a = formatShortDate(start);
  const b = formatShortDate(end);
  return a === b ? a : `${a} – ${b}`;
}

function formatDays(record) {
  if (record.duration_type === "hourly") {
    return leaveDurationLabel(record);
  }
  if (record.total_days == null) return "—";
  const days =
    record.deduct_from === "unpaid"
      ? Number(record.total_days)
      : Number(record.days_deducted ?? record.total_days);
  return `${days} d · ${Number(record.total_hours ?? 0)} h`;
}

function approvalBadgeClass(status) {
  if (status === "approved") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "rejected") return "bg-red-50 text-red-800 border-red-200";
  return "bg-amber-50 text-amber-900 border-amber-200";
}

async function searchEmployeeOptions(query) {
  const q = String(query ?? "").trim();
  if (q.length < 1) return [];
  const res = await apiRequest("/employees", {
    searchParams: { q, per_page: 25, fields: "lean" },
  });
  return (res.data ?? []).map((employee) => ({
    value: String(employee.id),
    label: composeEmployeeDisplayName(employee),
    employee,
  }));
}

function LeaveRecordsTable({
  records,
  canApproveLeave,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onPrint,
  highlightedLeaveDayId,
  leaveRowRefs,
  emptyLabel,
  showEmployee = false,
}) {
  if (!records.length) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-[640px] w-full text-sm">
        <thead className="theme-table-head-row text-left text-xs font-medium">
          <tr>
            {showEmployee ? <th className="px-3 py-2">Employee</th> : null}
            <th className="px-3 py-2">Period</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Days</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((record) => (
            <tr
              key={record.id}
              ref={(node) => {
                if (node) leaveRowRefs.current.set(record.id, node);
                else leaveRowRefs.current.delete(record.id);
              }}
              className={`theme-table-body-row ${
                highlightedLeaveDayId && Number(record.id) === Number(highlightedLeaveDayId)
                  ? "bg-amber-50 ring-1 ring-inset ring-amber-200"
                  : ""
              }`}
            >
              {showEmployee ? (
                <td className="px-3 py-2 text-slate-800">
                  {composeEmployeeDisplayName(record.employee) || `Employee #${record.employee_id}`}
                </td>
              ) : null}
              <td className="px-3 py-2 text-slate-800">{formatPeriod(record)}</td>
              <td className="px-3 py-2 text-slate-700">{deductFromLabel(record.deduct_from)}</td>
              <td className="px-3 py-2 text-slate-700">{formatDays(record)}</td>
              <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={record.notes ?? ""}>
                {record.notes || "—"}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${approvalBadgeClass(record.approval_status)}`}
                >
                  {record.approval_status ?? "approved"}
                </span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {record.action_request?.can_remind ? (
                  <span className="mr-3 inline-block">
                    <ApprovalReminderButton
                      actionRequestId={record.action_request.id}
                      canRemind
                      onReminded={onApprove}
                    />
                  </span>
                ) : null}
                {canApproveLeave && record.approval_status === "pending" ? (
                  <>
                    <button type="button" className="text-emerald-700 hover:underline" onClick={() => onApprove(record)}>
                      Approve
                    </button>
                    <button type="button" className="ml-3 text-red-600 hover:underline" onClick={() => onReject(record)}>
                      Reject
                    </button>
                  </>
                ) : null}
                <button type="button" className="ml-3 text-[#185FA5] hover:underline" onClick={() => onPrint(record)}>
                  Print
                </button>
                <button type="button" className="ml-3 text-[#185FA5] hover:underline" onClick={() => onEdit(record)}>
                  Edit
                </button>
                <button type="button" className="ml-3 text-red-600 hover:underline" onClick={() => onDelete(record)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmployeeLeaveHub({
  refreshKey = 0,
  onSaved,
  highlightLeaveDayId = null,
}) {
  const { user, capabilities, hasPermission } = useAuth();
  const confirm = useConfirm();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const canApproveLeave = canApproveLeaveRequests({ hasPermission, capabilities });

  const [tab, setTab] = useState("leave");
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const initialMonth = useMemo(() => monthDateBounds(), []);
  const [leaveFromDate, setLeaveFromDate] = useState(initialMonth.from);
  const [leaveToDate, setLeaveToDate] = useState(initialMonth.to);
  const [monthLeaveRecords, setMonthLeaveRecords] = useState([]);
  const [loadingMonthLeaves, setLoadingMonthLeaves] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEmployeeLabel, setSelectedEmployeeLabel] = useState("");
  const [loadingPending, setLoadingPending] = useState(true);
  const [error, setError] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [leavePreview, setLeavePreview] = useState(null);
  const [highlightedLeaveDayId, setHighlightedLeaveDayId] = useState(null);
  const leaveRowRefs = useRef(new Map());

  const loadEmployeeOptions = useCallback(async (query) => searchEmployeeOptions(query), []);

  const selectedEmployeeOptions = useMemo(() => {
    if (!selectedEmployeeId || !selectedEmployeeLabel) return [];
    return [{ value: selectedEmployeeId, label: selectedEmployeeLabel }];
  }, [selectedEmployeeId, selectedEmployeeLabel]);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await apiRequest("/employee-leave-days", {
        searchParams: { approval_status: "pending", per_page: 100 },
      });
      setPendingLeaves(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pending leave applications");
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const loadMonthLeaves = useCallback(async (fromDate, toDate) => {
    const from = fromDate || monthDateBounds().from;
    const to = toDate || monthDateBounds().to;
    setLoadingMonthLeaves(true);
    try {
      const res = await apiRequest("/employee-leave-days", {
        searchParams: {
          from_date: from,
          to_date: to,
          approval_status: "approved",
          assignment_kind: "leave",
          per_page: 200,
        },
      });
      setMonthLeaveRecords(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leave for this period");
      setMonthLeaveRecords([]);
    } finally {
      setLoadingMonthLeaves(false);
    }
  }, []);

  const filteredMonthLeaves = useMemo(() => {
    if (!selectedEmployeeId) return monthLeaveRecords;
    return monthLeaveRecords.filter(
      (row) => String(row.employee_id) === String(selectedEmployeeId),
    );
  }, [monthLeaveRecords, selectedEmployeeId]);

  useEffect(() => {
    void loadPending();
  }, [loadPending, refreshKey]);

  useEffect(() => {
    void loadMonthLeaves(leaveFromDate, leaveToDate);
  }, [loadMonthLeaves, leaveFromDate, leaveToDate, refreshKey]);

  useEffect(() => {
    if (!highlightLeaveDayId || loadingMonthLeaves) return;
    const targetId = Number(highlightLeaveDayId);
    if (!Number.isFinite(targetId) || targetId <= 0) return;

    const record =
      monthLeaveRecords.find((row) => Number(row.id) === targetId) ??
      pendingLeaves.find((row) => Number(row.id) === targetId);
    if (!record) return;

    setTab(record.approval_status === "pending" ? "pending" : "leave");
    setHighlightedLeaveDayId(targetId);
    const timer = window.setTimeout(() => {
      leaveRowRefs.current.get(targetId)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
    const clearTimer = window.setTimeout(() => setHighlightedLeaveDayId(null), 6000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightLeaveDayId, loadingMonthLeaves, monthLeaveRecords, pendingLeaves]);

  function emptyCreateForm() {
    return buildOffDayEmptyForm({
      presetEmployeeId: selectedEmployeeId,
      presetEmployeeLabel: selectedEmployeeLabel,
    });
  }

  function openCreateTab() {
    setEditing(null);
    setDrawerOpen(false);
    setFormError(null);
    setForm(emptyCreateForm());
    setTab("create");
  }

  function openEdit(row) {
    setEditing(row);
    setForm(
      buildOffDayEmptyForm(
        {
          presetEmployeeId: String(row.employee_id),
          presetEmployeeLabel: composeEmployeeDisplayName(row.employee) || selectedEmployeeLabel,
        },
        row,
      ),
    );
    setFormError(null);
    setDrawerOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    const err = validateOffDayForm(form, { leavePreview });
    if (err) {
      setFormError(err);
      return;
    }
    if (!organizationId) {
      setFormError("Your user account has no organization. Contact an administrator.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const wasEditing = Boolean(editing);
    try {
      const body = buildOffDayBody(form);
      if (editing) {
        await apiRequest(`/employee-leave-days/${editing.id}`, { method: "PUT", body });
        notifySuccess("Leave application updated.");
      } else {
        await apiRequest("/employee-leave-days", { method: "POST", body });
        notifySuccess("Leave application submitted for admin approval.");
      }
      setDrawerOpen(false);
      setEditing(null);
      if (!wasEditing) {
        setForm(emptyCreateForm());
        setTab("pending");
      }
      await Promise.all([
        loadPending(),
        loadMonthLeaves(leaveFromDate, leaveToDate),
      ]);
      onSaved?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    const ok = await confirm(
      confirmDeleteOptions("this leave application", "Delete this leave application?"),
    );
    if (!ok) return;
    try {
      await apiRequest(`/employee-leave-days/${row.id}`, { method: "DELETE" });
      await Promise.all([loadPending(), loadMonthLeaves(leaveFromDate, leaveToDate)]);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function approve(row) {
    try {
      await apiRequest(`/employee-leave-days/${row.id}/approve`, { method: "POST" });
      notifySuccess("Leave application approved.");
      await Promise.all([loadPending(), loadMonthLeaves(leaveFromDate, leaveToDate)]);
      onSaved?.();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Approval failed");
    }
  }

  async function reject(row) {
    try {
      await apiRequest(`/employee-leave-days/${row.id}/reject`, { method: "POST" });
      notifySuccess("Leave application rejected.");
      await Promise.all([loadPending(), loadMonthLeaves(leaveFromDate, leaveToDate)]);
      onSaved?.();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Rejection failed");
    }
  }

  async function printLeave(row) {
    try {
      const leave = row.employee ? row : await apiRequest(`/employee-leave-days/${row.id}`);
      await printLeaveApplication({
        leave,
        employee: leave.employee ?? null,
        organization: capabilities?.organization ?? null,
        generalSettings: capabilities?.module_settings?.general ?? null,
        printedByUser: user,
      });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Print failed");
    }
  }

  function onLeaveFromDateChange(value) {
    setLeaveFromDate(value);
    if (!value) return;
    const bounds = monthDateBounds(value);
    // Keep the range on a calendar month when From moves to another month.
    if (leaveToDate < bounds.from || leaveToDate > bounds.to) {
      setLeaveToDate(bounds.to);
    }
  }

  const tabClass = (id) =>
    `rounded-md px-4 py-2 text-sm font-medium transition ${
      tab === id ? "bg-[#185FA5] text-white" : "text-slate-600 hover:bg-slate-50"
    }`;

  const pendingCount = pendingLeaves.length;

  function closeEditDrawer() {
    setDrawerOpen(false);
    setEditing(null);
    setFormError(null);
    if (tab === "create") {
      setForm(emptyCreateForm());
    }
  }

  const employeeSearch = (
    <div className="max-w-xl">
      <label className="mb-1 block text-sm font-medium text-slate-700">Search employee (optional)</label>
      <PosSearchableSelect
        value={selectedEmployeeId}
        onChange={(value, option) => {
          setSelectedEmployeeId(value);
          setSelectedEmployeeLabel(option?.label ?? "");
        }}
        options={selectedEmployeeOptions}
        loadOptions={loadEmployeeOptions}
        placeholder="Filter by employee…"
        searchPlaceholder="Type to search employees…"
        idleSearchLabel="Type at least one character to search"
        emptyLabel="No matching employees"
        minSearchLength={1}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button type="button" onClick={() => setTab("leave")} className={tabClass("leave")}>
          Leave
        </button>
        <button
          type="button"
          onClick={() => {
            if (tab !== "create") openCreateTab();
          }}
          className={tabClass("create")}
        >
          Create leave
        </button>
        <button type="button" onClick={() => setTab("pending")} className={tabClass("pending")}>
          Pending approvals{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {tab === "leave" ? (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-[15px] font-medium text-slate-900">Leave this period</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500">
            Approved leave for all employees in the selected range (including upcoming dates). Use search
            only to narrow the list.
          </p>
          <HrFilterToolbar>
            <HrDateField label="From" value={leaveFromDate} onChange={onLeaveFromDateChange} />
            <HrDateField label="To" value={leaveToDate} onChange={setLeaveToDate} />
            <div className="min-w-[16rem] max-w-xl">{employeeSearch}</div>
            <PrimaryButton type="button" onClick={openCreateTab}>
              Create leave
            </PrimaryButton>
          </HrFilterToolbar>

          <div className="mt-4">
            {loadingMonthLeaves ? (
              <p className="text-sm text-slate-500">Loading leave…</p>
            ) : (
              <LeaveRecordsTable
                records={filteredMonthLeaves}
                canApproveLeave={canApproveLeave}
                onApprove={approve}
                onReject={reject}
                onEdit={openEdit}
                onDelete={remove}
                onPrint={printLeave}
                highlightedLeaveDayId={highlightedLeaveDayId}
                leaveRowRefs={leaveRowRefs}
                showEmployee
                emptyLabel={
                  selectedEmployeeId
                    ? `No approved leave for this employee between ${formatShortDate(leaveFromDate)} and ${formatShortDate(leaveToDate)}.`
                    : `No approved leave between ${formatShortDate(leaveFromDate)} and ${formatShortDate(leaveToDate)}.`
                }
              />
            )}
          </div>
        </section>
      ) : null}

      {tab === "create" ? (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-[15px] font-medium text-slate-900">Create leave</h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter leave dates and a reason, then submit for administrator approval.
            </p>
          </div>
      {form ? (
            <form onSubmit={save} className="space-y-4">
              <HrOffDayAssignmentFields
                form={form}
                setForm={setForm}
                extra={{
                  editingRow: null,
                  presetEmployeeId: selectedEmployeeId,
                  presetEmployeeLabel: selectedEmployeeLabel,
                }}
                setLeavePreview={setLeavePreview}
              />
              {formError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </p>
              ) : null}
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Submitting…" : "Submit for approval"}
              </PrimaryButton>
            </form>
          ) : null}
        </section>
      ) : null}

      {tab === "pending" ? (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="text-[15px] font-medium text-slate-900">Pending approvals</h2>
            <p className="mt-1 text-sm text-slate-500">
              Leave applications waiting for administrator approval.
            </p>
          </div>
          {loadingPending ? (
            <p className="text-sm text-slate-500">Loading pending applications…</p>
          ) : (
            <LeaveRecordsTable
              records={pendingLeaves}
              canApproveLeave={canApproveLeave}
              onApprove={approve}
              onReject={reject}
              onEdit={openEdit}
              onDelete={remove}
              onPrint={printLeave}
              highlightedLeaveDayId={highlightedLeaveDayId}
              leaveRowRefs={leaveRowRefs}
              showEmployee
              emptyLabel="No leave applications are waiting for approval."
            />
          )}
        </section>
      ) : null}

      {form && editing ? (
        <FormDrawer
          title="Edit leave application"
          open={drawerOpen}
          onClose={closeEditDrawer}
          onSubmit={save}
          saving={saving}
          error={formError}
          submitLabel="Save changes"
          wide
        >
          <HrOffDayAssignmentFields
            form={form}
            setForm={setForm}
            extra={{
              editingRow: editing,
              presetEmployeeId: selectedEmployeeId,
              presetEmployeeLabel: selectedEmployeeLabel,
            }}
            setLeavePreview={setLeavePreview}
          />
        </FormDrawer>
      ) : null}
    </div>
  );
}
