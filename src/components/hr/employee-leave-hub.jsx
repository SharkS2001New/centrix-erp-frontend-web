"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  FormDrawer,
  PrimaryButton,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";
import {
  buildOffDayBody,
  buildOffDayEmptyForm,
  HrOffDayAssignmentFields,
  validateOffDayForm,
} from "@/components/hr/hr-off-day-assignment-fields";

function deductFromLabel(value) {
  if (value === "annual") return "Annual leave";
  if (value === "sick") return "Sick leave";
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
  return `${Number(record.days_deducted ?? record.total_days)} working d · ${Number(record.total_hours ?? 0)} h`;
}

function BalancePill({ label, available }) {
  return (
    <span className="inline-flex flex-col rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{available}</span>
    </span>
  );
}

export function EmployeeLeaveHub({
  employees = [],
  refreshKey = 0,
  onSaved,
}) {
  const { user, capabilities, hasPermission } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const canApproveLeave = hasPermission(P.hr.leave.approve);

  const [balances, setBalances] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [leavePreview, setLeavePreview] = useState(null);

  const extra = useMemo(() => ({ employees }), [employees]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balanceRes, assignRes] = await Promise.all([
        apiRequest("/employee-leave-balances"),
        apiRequest("/employee-leave-days", {
          searchParams: { assignment_kind: "off_day", per_page: 200 },
        }),
      ]);
      setBalances(balanceRes.data ?? []);
      setAssignments(assignRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leave data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const assignmentsByEmployee = useMemo(() => {
    const map = new Map();
    for (const row of assignments) {
      const id = row.employee_id;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(row);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.start_date ?? 0).getTime() - new Date(a.start_date ?? 0).getTime(),
      );
    }
    return map;
  }, [assignments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return balances;
    return balances.filter(
      (r) =>
        r.employee_name?.toLowerCase().includes(q) ||
        r.employee_code?.toLowerCase().includes(q),
    );
  }, [balances, search]);

  function toggleExpanded(employeeId) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function openCreate(employeeId = "") {
    setEditing(null);
    const base = buildOffDayEmptyForm(extra);
    setForm(employeeId ? { ...base, employee_id: String(employeeId) } : base);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm(buildOffDayEmptyForm(extra, row));
    setFormError(null);
    setDrawerOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    const err = validateOffDayForm(form, { ...extra, leavePreview });
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
      } else {
        await apiRequest("/employee-leave-days", { method: "POST", body });
      }
      setDrawerOpen(false);
      await load();
      onSaved?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (!confirm("Delete this leave / off day record?")) return;
    try {
      await apiRequest(`/employee-leave-days/${row.id}`, { method: "DELETE" });
      await load();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <section className="theme-panel rounded-xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium text-slate-900">Leave & off days by employee</h2>
          <p className="mt-1 text-sm text-slate-500">
            Remaining balances per employee — expand a row to see how leave and off days were used.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search employees…"
            className="max-w-xs"
          />
          <PrimaryButton type="button" onClick={() => openCreate()}>
            Assign leave / off day
          </PrimaryButton>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No employees found.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {filtered.map((row) => {
            const isOpen = !collapsed.has(row.employee_id);
            const records = assignmentsByEmployee.get(row.employee_id) ?? [];

            return (
              <li key={row.employee_id}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(row.employee_id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="shrink-0 text-slate-400" aria-hidden>
                      {isOpen ? "▾" : "▸"}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">{row.employee_name}</span>
                      <span className="block text-xs text-slate-500">{row.employee_code}</span>
                    </span>
                    <span className="hidden flex-wrap gap-2 sm:flex">
                      <BalancePill label="Annual left" available={row.annual_available} />
                      <BalancePill label="Sick left" available={row.sick_available} />
                      <BalancePill label="Off days left" available={row.off_days_available} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreate(row.employee_id)}
                    className="shrink-0 text-sm font-medium text-[#185FA5] hover:text-[#144f8a]"
                  >
                    Assign
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 px-4 pb-3 sm:hidden">
                  <BalancePill label="Annual left" available={row.annual_available} />
                  <BalancePill label="Sick left" available={row.sick_available} />
                  <BalancePill label="Off days left" available={row.off_days_available} />
                </div>

                {isOpen ? (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Utilization history
                    </p>
                    {records.length === 0 ? (
                      <p className="text-sm text-slate-500">No leave or off days assigned yet.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="min-w-[560px] w-full text-sm">
                          <thead className="theme-table-head-row text-left text-xs font-medium">
                            <tr>
                              <th className="px-3 py-2">Period</th>
                              <th className="px-3 py-2">Deducted from</th>
                              <th className="px-3 py-2">Days</th>
                              <th className="px-3 py-2">Duration</th>
                              <th className="px-3 py-2">Approval</th>
                              <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {records.map((record) => (
                              <tr key={record.id} className="theme-table-body-row">
                                <td className="px-3 py-2 text-slate-800">{formatPeriod(record)}</td>
                                <td className="px-3 py-2 text-slate-700">
                                  {deductFromLabel(record.deduct_from)}
                                </td>
                                <td className="px-3 py-2 text-slate-700">{formatDays(record)}</td>
                                <td className="px-3 py-2 text-slate-600">
                                  {record.duration_type === "half_day"
                                    ? `Half day (${record.half_day_period ?? "—"})`
                                    : "Full day(s)"}
                                </td>
                                <td className="px-3 py-2 capitalize text-slate-600">
                                  {record.approval_status ?? "approved"}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {canApproveLeave && record.approval_status === "pending" ? (
                                    <>
                                      <button
                                        type="button"
                                        className="text-emerald-700 hover:underline"
                                        onClick={async () => {
                                          await apiRequest(`/employee-leave-days/${record.id}/approve`, { method: "POST" });
                                          load();
                                        }}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        className="ml-3 text-red-600 hover:underline"
                                        onClick={async () => {
                                          await apiRequest(`/employee-leave-days/${record.id}/reject`, { method: "POST" });
                                          load();
                                        }}
                                      >
                                        Reject
                                      </button>
                                    </>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => openEdit(record)}
                                    className="text-[#185FA5] hover:underline"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => remove(record)}
                                    className="ml-3 text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {form ? (
        <FormDrawer
          title={editing ? "Edit leave / off day" : "Assign leave / off day"}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSubmit={save}
          saving={saving}
          error={formError}
          submitLabel={editing ? "Save changes" : "Assign leave / off day"}
          wide
        >
          <HrOffDayAssignmentFields
            form={form}
            setForm={setForm}
            extra={{ ...extra, editingRow: editing }}
            setLeavePreview={setLeavePreview}
          />
        </FormDrawer>
      ) : null}
    </section>
  );
}
