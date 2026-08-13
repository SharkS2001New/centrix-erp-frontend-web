"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  FormDrawer,
  PrimaryButton,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
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

function BalancePill({ label, available }) {
  return (
    <span className="inline-flex flex-col rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{available}</span>
    </span>
  );
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
}) {
  if (!records.length) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-[640px] w-full text-sm">
        <thead className="theme-table-head-row text-left text-xs font-medium">
          <tr>
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

  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEmployeeLabel, setSelectedEmployeeLabel] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeBalances, setEmployeeBalances] = useState(null);
  const [employeeLeaves, setEmployeeLeaves] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
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

  const loadEmployeeData = useCallback(async (employeeId) => {
    if (!employeeId) {
      setSelectedEmployee(null);
      setEmployeeBalances(null);
      setEmployeeLeaves([]);
      return;
    }
    setLoadingEmployee(true);
    setError(null);
    try {
      const [employee, balanceRes, leaveRes] = await Promise.all([
        apiRequest(`/employees/${employeeId}`, { searchParams: { fields: "lean" } }),
        apiRequest(`/employees/${employeeId}/leave-balances`),
        apiRequest("/employee-leave-days", {
          searchParams: { employee_id: employeeId, per_page: 100 },
        }),
      ]);
      setSelectedEmployee(employee);
      setSelectedEmployeeLabel(composeEmployeeDisplayName(employee));
      setEmployeeBalances(balanceRes.balances ?? null);
      setEmployeeLeaves(leaveRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee leave data");
      setSelectedEmployee(null);
      setEmployeeBalances(null);
      setEmployeeLeaves([]);
    } finally {
      setLoadingEmployee(false);
    }
  }, []);

  useEffect(() => {
    void loadPending();
  }, [loadPending, refreshKey]);

  useEffect(() => {
    void loadEmployeeData(selectedEmployeeId);
  }, [loadEmployeeData, selectedEmployeeId, refreshKey]);

  useEffect(() => {
    if (!highlightLeaveDayId || loadingEmployee) return;
    const targetId = Number(highlightLeaveDayId);
    if (!Number.isFinite(targetId) || targetId <= 0) return;

    const record =
      employeeLeaves.find((row) => Number(row.id) === targetId) ??
      pendingLeaves.find((row) => Number(row.id) === targetId);
    if (!record?.employee_id) return;

    if (String(record.employee_id) !== String(selectedEmployeeId)) {
      setSelectedEmployeeId(String(record.employee_id));
      return;
    }

    setHighlightedLeaveDayId(targetId);
    const timer = window.setTimeout(() => {
      leaveRowRefs.current.get(targetId)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
    const clearTimer = window.setTimeout(() => setHighlightedLeaveDayId(null), 6000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [employeeLeaves, highlightLeaveDayId, loadingEmployee, pendingLeaves, selectedEmployeeId]);

  function openCreate() {
    setEditing(null);
    setForm(
      buildOffDayEmptyForm({
        presetEmployeeId: selectedEmployeeId,
        presetEmployeeLabel: selectedEmployeeLabel,
      }),
    );
    setFormError(null);
    setDrawerOpen(true);
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
      if (!selectedEmployeeId && body.employee_id) {
        setSelectedEmployeeId(String(body.employee_id));
      }
      await Promise.all([loadPending(), loadEmployeeData(selectedEmployeeId || String(body.employee_id))]);
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
      await Promise.all([loadPending(), loadEmployeeData(selectedEmployeeId)]);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function approve(row) {
    try {
      await apiRequest(`/employee-leave-days/${row.id}/approve`, { method: "POST" });
      notifySuccess("Leave application approved.");
      await Promise.all([loadPending(), loadEmployeeData(String(row.employee_id))]);
      onSaved?.();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Approval failed");
    }
  }

  async function reject(row) {
    try {
      await apiRequest(`/employee-leave-days/${row.id}/reject`, { method: "POST" });
      notifySuccess("Leave application rejected.");
      await Promise.all([loadPending(), loadEmployeeData(String(row.employee_id))]);
      onSaved?.();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Rejection failed");
    }
  }

  async function printLeave(row) {
    try {
      const leave = row.employee ? row : await apiRequest(`/employee-leave-days/${row.id}`);
      const employee = leave.employee ?? selectedEmployee;
      await printLeaveApplication({
        leave,
        employee,
        organization: capabilities?.organization ?? null,
        generalSettings: capabilities?.module_settings?.general ?? null,
        printedByUser: user,
      });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Print failed");
    }
  }

  return (
    <div className="space-y-6">
      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-slate-900">Create leave application</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search an employee, enter leave dates and reason, then submit for administrator approval.
            </p>
          </div>
          <PrimaryButton type="button" onClick={openCreate}>
            New leave application
          </PrimaryButton>
        </div>

        <div className="mt-4 max-w-xl">
          <label className="mb-1 block text-sm font-medium text-slate-700">Search employee</label>
          <PosSearchableSelect
            value={selectedEmployeeId}
            onChange={(value, option) => {
              setSelectedEmployeeId(value);
              setSelectedEmployeeLabel(option?.label ?? "");
            }}
            options={selectedEmployeeOptions}
            loadOptions={loadEmployeeOptions}
            placeholder="Search by name, code, or payroll #…"
            searchPlaceholder="Type to search employees…"
            idleSearchLabel="Type at least one character to search"
            emptyLabel="No matching employees"
            minSearchLength={1}
          />
        </div>

        {loadingEmployee ? (
          <p className="mt-4 text-sm text-slate-500">Loading employee leave data…</p>
        ) : selectedEmployee ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{composeEmployeeDisplayName(selectedEmployee)}</p>
                <p className="text-xs text-slate-500">{selectedEmployee.employee_code ?? "—"}</p>
              </div>
              {employeeBalances ? (
                <div className="flex flex-wrap gap-2">
                  <BalancePill label="Annual left" available={employeeBalances.annual?.available ?? 0} />
                  <BalancePill label="Sick left" available={employeeBalances.sick?.available ?? 0} />
                  <BalancePill label="Off days left" available={employeeBalances.off_days?.available ?? 0} />
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Leave history
              </p>
              <LeaveRecordsTable
                records={employeeLeaves}
                canApproveLeave={canApproveLeave}
                onApprove={approve}
                onReject={reject}
                onEdit={openEdit}
                onDelete={remove}
                onPrint={printLeave}
                highlightedLeaveDayId={highlightedLeaveDayId}
                leaveRowRefs={leaveRowRefs}
                emptyLabel="No leave applications for this employee yet."
              />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Search and select an employee to view balances and leave history.
          </p>
        )}
      </section>

      {canApproveLeave || pendingLeaves.length > 0 ? (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="text-[15px] font-medium text-slate-900">Pending approval</h2>
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
              emptyLabel="No leave applications are waiting for approval."
            />
          )}
        </section>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {form ? (
        <FormDrawer
          title={editing ? "Edit leave application" : "New leave application"}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSubmit={save}
          saving={saving}
          error={formError}
          submitLabel={editing ? "Save changes" : "Submit for approval"}
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
