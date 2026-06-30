"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { ATTENDANCE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  PrimaryButton,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { HrSelectField } from "@/components/hr/hr-crud-page";
import { HrTimePickerField } from "@/components/hr/hr-time-picker";
import { FieldRepHrLinkageBanner } from "@/components/hr/field-rep-hr-linkage-banner";
import {
  composeEmployeeDisplayName,
  computeAttendanceHours,
  formatTimeForApi,
} from "@/components/hr/hr-shared";
import {
  formatAttendanceLoginChannel,
  formatAttendanceSource,
  attendanceLoginChannelBadgeClass,
  isCompanyMobileAttendanceEnabled,
} from "@/lib/hr-settings";
import { shouldShowMobileFieldAttendance } from "@/lib/sales-settings";
import MobileFieldAttendanceScreen from "@/components/sales/mobile-field-attendance-screen";

function daysAgoCalendarDate(days) {
  const today = todayCalendarDate();
  const ms = Date.parse(`${today}T12:00:00+03:00`) - days * 86_400_000;
  return calendarDateInTimezone(new Date(ms)) ?? today;
}

const EMPTY_MANUAL = {
  employee_id: "",
  attendance_date: new Date().toISOString().slice(0, 10),
  check_in: "",
  check_out: "",
  status: "present",
  hours_worked: "",
  notes: "",
};

const NON_WORK_STATUSES = ["leave", "holiday", "absent"];

function attendanceCountsInPayroll(status) {
  return ["present", "late", "half_day"].includes(status);
}

export default function HrAttendancePage() {
  const { capabilities, hasPermission } = useAuth();
  const canManageSettings = hasPermission(P.hr.manage);
  const companyMobileEnabled = isCompanyMobileAttendanceEnabled(capabilities?.module_settings);
  const fieldAttendanceEnabled = shouldShowMobileFieldAttendance(capabilities);
  const [tab, setTab] = useState("active");
  const [employees, setEmployees] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [fieldRepLinkage, setFieldRepLinkage] = useState(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFromDate, setHistoryFromDate] = useState(() => daysAgoCalendarDate(7));
  const [historyToDate, setHistoryToDate] = useState(() => todayCalendarDate());
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [dayHint, setDayHint] = useState(null);

  const loadActive = useCallback(async () => {
    setActiveLoading(true);
    try {
      const requestDefs = [];

      if (companyMobileEnabled) {
        requestDefs.push({
          key: "sessions",
          promise: apiRequest("/attendance/company-mobile-sessions", {
            searchParams: { per_page: 50, open_only: 1 },
          }),
        });
      } else {
        requestDefs.push({
          key: "sessions",
          promise: apiRequest("/attendance/clock-sessions", {
            searchParams: { per_page: 50, open_only: 1 },
          }),
        });
      }

      if (fieldAttendanceEnabled) {
        requestDefs.push({
          key: "fieldRepLinkage",
          promise: apiRequest("/attendance/field-rep-hr-linkage", { searchParams: { days: 30 } }),
        });
      }

      const results = await Promise.allSettled(requestDefs.map((item) => item.promise));
      const failures = [];

      results.forEach((result, index) => {
        const { key } = requestDefs[index];
        if (result.status === "rejected") {
          const message =
            result.reason instanceof ApiError
              ? result.reason.message
              : result.reason instanceof Error
                ? result.reason.message
                : "Request failed";
          failures.push(message);
          return;
        }

        const res = result.value;
        if (key === "sessions") setSessions(res.data ?? []);
        if (key === "fieldRepLinkage") setFieldRepLinkage(res ?? null);
      });

      if (failures.length === requestDefs.length) {
        notifyError(failures[0] ?? "Failed to load active attendance");
      } else if (failures.length) {
        notifyError(`Some attendance data could not be loaded (${failures.join("; ")}).`);
      }
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load active attendance");
    } finally {
      setActiveLoading(false);
    }
  }, [companyMobileEnabled, fieldAttendanceEnabled]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [employeesRes, attendanceRes] = await Promise.all([
        apiRequest("/employees", { searchParams: { per_page: 200 } }),
        apiRequest("/employee-attendance", { searchParams: { per_page: 200 } }),
      ]);
      setEmployees(employeesRes.data ?? []);
      setRecords(attendanceRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load attendance records");
      setEmployees([]);
      setRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActive();
  }, [loadActive]);

  useEffect(() => {
    if (tab === "history") {
      loadHistory();
    }
  }, [tab, loadHistory]);

  const openSessions = useMemo(() => {
    if (companyMobileEnabled) {
      return sessions.filter((s) => s.is_open !== false && !s.clock_out_at);
    }
    return sessions.filter(
      (s) => !s.clock_out_at && (!s.source || s.source === "clock_device"),
    );
  }, [companyMobileEnabled, sessions]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const date = record.attendance_date?.slice?.(0, 10) ?? "";
      if (!date) return false;
      return date >= historyFromDate && date <= historyToDate;
    });
  }, [historyFromDate, historyToDate, records]);

  const timesRequired = !NON_WORK_STATUSES.includes(manualForm.status);

  const computedHours = useMemo(() => {
    if (!timesRequired) return null;
    return computeAttendanceHours(manualForm.check_in, manualForm.check_out, {
      allowOvernight: false,
    });
  }, [manualForm.check_in, manualForm.check_out, timesRequired]);

  const hoursHint = useMemo(() => {
    if (!timesRequired) return null;
    const inT = manualForm.check_in;
    const outT = manualForm.check_out;
    if (!inT || !outT) return "Select check-in and check-out to calculate hours.";
    if (computedHours != null) return null;
    return "Check-out must be after check-in on the same day (e.g. 9:30 AM → 5:30 PM).";
  }, [timesRequired, manualForm.check_in, manualForm.check_out, computedHours]);

  useEffect(() => {
    if (!manualForm.employee_id || !manualForm.attendance_date) {
      setDayHint(null);
      return;
    }
    let cancelled = false;
    apiRequest("/employee-attendance/day-preview", {
      searchParams: {
        employee_id: manualForm.employee_id,
        attendance_date: manualForm.attendance_date,
      },
    })
      .then((hint) => {
        if (!cancelled) setDayHint(hint);
      })
      .catch(() => {
        if (!cancelled) setDayHint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [manualForm.employee_id, manualForm.attendance_date]);

  function openCreateManual() {
    setEditingRecord(null);
    setManualForm(EMPTY_MANUAL);
    setManualError(null);
    setDayHint(null);
    setManualOpen(true);
  }

  function openEditManual(record) {
    setEditingRecord(record);
    setManualForm({
      employee_id: String(record.employee_id),
      attendance_date: record.attendance_date?.slice?.(0, 10) ?? "",
      check_in: record.check_in?.slice?.(0, 5) ?? "",
      check_out: record.check_out?.slice?.(0, 5) ?? "",
      status: record.status ?? "present",
      hours_worked: record.hours_worked != null ? String(record.hours_worked) : "",
      notes: record.notes ?? "",
    });
    setManualError(null);
    setDayHint(null);
    setManualOpen(true);
  }

  async function deleteRecord(record) {
    if (!confirm("Delete this attendance record?")) return;
    try {
      await apiRequest(`/employee-attendance/${record.id}`, { method: "DELETE" });
      await loadHistory();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  function updateManualTime(field, value) {
    setManualForm((p) => ({ ...p, [field]: value }));
  }

  async function saveManual(e) {
    e.preventDefault();
    if (!manualForm.employee_id) {
      setManualError("Select an employee.");
      return;
    }
    const checkInApi = timesRequired ? formatTimeForApi(manualForm.check_in) : null;
    const checkOutApi = timesRequired ? formatTimeForApi(manualForm.check_out) : null;
    if (timesRequired && (!checkInApi || !checkOutApi)) {
      setManualError("Set check-in and check-out using the time lists (hour, minute, AM/PM).");
      return;
    }
    if (timesRequired && computedHours == null) {
      setManualError(hoursHint ?? "Check-out must be after check-in on the same day.");
      return;
    }
    if (dayHint?.has_existing_attendance && dayHint.existing_attendance?.id !== editingRecord?.id) {
      setManualError(
        "This employee already has attendance for this date. Only one record per employee per day is allowed.",
      );
      return;
    }
    setManualSaving(true);
    setManualError(null);
    try {
      const body = {
        employee_id: Number(manualForm.employee_id),
        attendance_date: manualForm.attendance_date,
        check_in: checkInApi,
        check_out: checkOutApi,
        status: manualForm.status,
        hours_worked: timesRequired ? computedHours : 0,
        notes: manualForm.notes.trim() || null,
      };
      if (editingRecord) {
        await apiRequest(`/employee-attendance/${editingRecord.id}`, {
          method: "PUT",
          body: { ...body, source: editingRecord.source ?? "manual" },
        });
      } else {
        await apiRequest("/employee-attendance", {
          method: "POST",
          body: { ...body, source: "manual" },
        });
      }
      setManualOpen(false);
      setEditingRecord(null);
      setManualForm(EMPTY_MANUAL);
      setDayHint(null);
      await loadHistory();
    } catch (err) {
      setManualError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Attendance"
      subtitle="Premises clock-in, company phone, mobile sales app, and manual records — all in one place for payroll"
      action={
        tab === "history" ? (
          <div className="flex flex-wrap items-center gap-2">
            <CatalogListExport
              title="Attendance"
              apiPath="/employee-attendance"
              columns={ATTENDANCE_EXPORT_COLUMNS}
              totalCount={filteredRecords.length}
              getSearchParams={() => ({ per_page: 200 })}
              disabled={historyLoading}
            />
            <PrimaryButton type="button" onClick={openCreateManual}>
              Add manual record
            </PrimaryButton>
          </div>
        ) : null
      }
    >
      <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "active" ? "bg-[#185FA5] text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Active today
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "history" ? "bg-[#185FA5] text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          History
        </button>
      </div>

      {tab === "active" ? (
        <>
          {fieldAttendanceEnabled ? (
            <FieldRepHrLinkageBanner linkage={fieldRepLinkage} canManage={canManageSettings} />
          ) : null}

          {canManageSettings ? (
            <p className="mb-4 text-sm text-slate-600">
              Attendance capture mode and device setup are in{" "}
              <Link href="/admin/settings" className="font-medium text-[#185FA5] hover:underline">
                Admin → Settings → HR &amp; Payroll
              </Link>
              .
            </p>
          ) : null}

          <section className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="text-[15px] font-medium text-slate-900">Premises — on shift now</h2>
            <p className="mt-1 text-sm text-slate-500">
              Employees currently signed in at premises via clock device or company phone.
            </p>
            {activeLoading ? (
              <p className="mt-3 text-sm text-slate-500">Loading…</p>
            ) : openSessions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No one is on shift at premises right now.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {openSessions.map((s) => (
                  <li key={`premises-${s.id}`} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">
                        {companyMobileEnabled
                          ? s.employee_name || `#${s.employee_id}`
                          : composeEmployeeDisplayName(s.employee) || `#${s.employee_id}`}
                      </p>
                      <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">
                        Premises
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {companyMobileEnabled ? (
                        <>
                          {formatAttendanceSource("company_mobile")} · In {formatShortDate(s.clock_in_at)}{" "}
                          {String(s.clock_in_at).slice(11, 16)}
                          {s.clock_in_geofence_distance_metres != null
                            ? ` · ${s.clock_in_geofence_distance_metres}m from premises`
                            : ""}
                        </>
                      ) : (
                        <>
                          {formatAttendanceSource("clock_device")} · Device {s.device_identifier || "—"} · In{" "}
                          {formatShortDate(s.clock_in_at)} {String(s.clock_in_at).slice(11, 16)}
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {fieldAttendanceEnabled ? (
            <MobileFieldAttendanceScreen variant="hr" embedded embeddedMode="active" />
          ) : null}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 theme-panel rounded-xl border p-4 shadow-sm">
            <Field label="From">
              <input
                type="date"
                value={historyFromDate}
                onChange={(e) => setHistoryFromDate(e.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={historyToDate}
                onChange={(e) => setHistoryToDate(e.target.value)}
                className={inputClassName()}
              />
            </Field>
          </div>

          <section className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-medium text-slate-900">Attendance records</h2>
              <p className="mt-1 text-sm text-slate-500">
                One row per employee per day in the selected date range. Present, late, and half-day
                rows count toward payroll when attendance proration is enabled.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">In</th>
                    <th className="px-4 py-3">Out</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Login channel</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payroll</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        No attendance records in this date range.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => (
                      <tr key={r.id} className="theme-table-body-row">
                        <td className="px-4 py-3">
                          {composeEmployeeDisplayName(r.employee) || r.employee_id}
                        </td>
                        <td className="px-4 py-3">{formatShortDate(r.attendance_date)}</td>
                        <td className="px-4 py-3">{r.check_in?.slice?.(0, 5) ?? "—"}</td>
                        <td className="px-4 py-3">{r.check_out?.slice?.(0, 5) ?? "—"}</td>
                        <td className="px-4 py-3">{r.hours_worked ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${attendanceLoginChannelBadgeClass(r.source)}`}
                          >
                            {formatAttendanceLoginChannel(r.source, r.login_channel_label)}
                          </span>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {formatAttendanceSource(r.source, r.source_label)}
                          </p>
                        </td>
                        <td className="px-4 py-3 capitalize">{r.status}</td>
                        <td className="px-4 py-3">
                          {attendanceCountsInPayroll(r.status) ? (
                            <span className="text-xs font-medium text-emerald-700">Counts</span>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEditManual(r)}
                            className="text-[#185FA5] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRecord(r)}
                            className="ml-3 text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {fieldAttendanceEnabled ? (
            <div className="mt-8">
              <MobileFieldAttendanceScreen variant="hr" embedded embeddedMode="history" />
            </div>
          ) : null}
        </>
      )}

      <FormDrawer
        title={editingRecord ? "Edit attendance" : "Manual attendance"}
        open={manualOpen}
        onClose={() => {
          setManualOpen(false);
          setEditingRecord(null);
          setDayHint(null);
        }}
        onSubmit={saveManual}
        saving={manualSaving}
        error={manualError}
        submitLabel={editingRecord ? "Save changes" : "Save record"}
        wide
      >
        <HrSelectField
          label="Employee"
          value={manualForm.employee_id}
          onChange={(v) => setManualForm((p) => ({ ...p, employee_id: v }))}
          required
          options={employees.map((e) => ({
            value: String(e.id),
            label: composeEmployeeDisplayName(e),
          }))}
        />
        <Field label="Date">
          <input
            type="date"
            value={manualForm.attendance_date}
            onChange={(e) => setManualForm((p) => ({ ...p, attendance_date: e.target.value }))}
            className={inputClassName()}
          />
        </Field>
        {dayHint?.has_existing_attendance && dayHint.existing_attendance?.id !== editingRecord?.id ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Attendance already exists for this employee on this date (
            {dayHint.existing_attendance?.status ?? "recorded"}
            {dayHint.existing_attendance?.source
              ? `, ${formatAttendanceSource(dayHint.existing_attendance.source, dayHint.existing_attendance.source_label).toLowerCase()}`
              : ""}
            ). You cannot add a second record — edit the existing one in the History tab.
          </p>
        ) : null}
        {dayHint && !dayHint.has_existing_attendance ? (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              dayHint.should_work
                ? "bg-[#EAF3DE] text-[#27500A]"
                : "bg-amber-50 text-amber-900"
            }`}
          >
            {dayHint.reason ??
              (dayHint.should_work ? "Scheduled working day" : dayHint.suggested_status)}
          </p>
        ) : null}
        <HrSelectField
          label="Status"
          value={manualForm.status}
          onChange={(v) => setManualForm((p) => ({ ...p, status: v }))}
          options={[
            { value: "present", label: "Present" },
            { value: "absent", label: "Absent" },
            { value: "late", label: "Late" },
            { value: "half_day", label: "Half day" },
            { value: "leave", label: "Leave" },
            { value: "holiday", label: "Holiday / off day" },
          ]}
        />
        {timesRequired ? (
          <>
            <HrTimePickerField
              label="Check in"
              value={manualForm.check_in}
              onChange={(v) => updateManualTime("check_in", v)}
              required
            />
            <HrTimePickerField
              label="Check out"
              value={manualForm.check_out}
              onChange={(v) => updateManualTime("check_out", v)}
              required
            />
            <Field label="Hours worked">
              <input
                type="text"
                readOnly
                tabIndex={-1}
                value={computedHours != null ? String(computedHours) : ""}
                placeholder="—"
                className={`${inputClassName()} bg-slate-50 font-medium text-slate-900`}
              />
              <p
                className={`mt-1 text-xs ${computedHours != null ? "text-[#27500A]" : "text-amber-800"}`}
              >
                {computedHours != null
                  ? `Auto-calculated: ${computedHours} hours`
                  : hoursHint}
              </p>
            </Field>
          </>
        ) : null}
        <Field label="Notes">
          <input
            type="text"
            value={manualForm.notes}
            onChange={(e) => setManualForm((p) => ({ ...p, notes: e.target.value }))}
            className={inputClassName()}
          />
        </Field>
      </FormDrawer>
    </CatalogPageShell>
  );
}
