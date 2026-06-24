"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";
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
import { CompanyPremisesPanel } from "@/components/hr/company-premises-panel";
import { AttendanceMobileDevicesPanel } from "@/components/hr/attendance-mobile-devices-panel";
import {
  composeEmployeeDisplayName,
  computeAttendanceHours,
  formatTimeForApi,
  isAdminUser,
} from "@/components/hr/hr-shared";
import { isCompanyMobileAttendanceEnabled } from "@/lib/hr-settings";

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

export default function HrAttendancePage() {
  const { user, capabilities, hasPermission } = useAuth();
  const admin = isAdminUser(user);
  const canManagePremises = hasPermission(P.hr.manage);
  const companyMobileEnabled = isCompanyMobileAttendanceEnabled(capabilities?.module_settings);
  const [employees, setEmployees] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clockDevices, setClockDevices] = useState([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [dayHint, setDayHint] = useState(null);
  const [mobileSessions, setMobileSessions] = useState([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const requestDefs = [
        { key: "employees", promise: apiRequest("/employees", { searchParams: { per_page: 200 } }) },
        {
          key: "sessions",
          promise: apiRequest("/attendance/clock-sessions", {
            searchParams: { per_page: 50, open_only: 1 },
          }),
        },
        {
          key: "attendance",
          promise: apiRequest("/employee-attendance", { searchParams: { per_page: 100 } }),
        },
        {
          key: "devices",
          promise: apiRequest("/attendance-clock-devices", { searchParams: { per_page: 100 } }),
        },
      ];
      if (companyMobileEnabled) {
        requestDefs.push({
          key: "mobileSessions",
          promise: apiRequest("/attendance/company-mobile-sessions", {
            searchParams: { per_page: 50 },
          }),
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
          failures.push(`${key}: ${message}`);
          return;
        }

        const res = result.value;
        if (key === "employees") setEmployees(res.data ?? []);
        if (key === "sessions") setSessions(res.data ?? []);
        if (key === "attendance") setRecords(res.data ?? []);
        if (key === "devices") setClockDevices(res.data ?? []);
        if (key === "mobileSessions") setMobileSessions(res.data ?? []);
      });

      if (failures.length === requestDefs.length) {
        setError(failures[0] ?? "Failed to load attendance");
      } else if (failures.length) {
        setError(`Some attendance data could not be loaded (${failures.join("; ")}).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [companyMobileEnabled]);

  useEffect(() => {
    load();
  }, [load]);

  const openSessions = useMemo(
    () => sessions.filter((s) => !s.clock_out_at),
    [sessions],
  );

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

  const activeDevices = useMemo(
    () => clockDevices.filter((d) => d.is_active !== false),
    [clockDevices],
  );

  const sessionsByDevice = useMemo(() => {
    const map = new Map();
    for (const s of openSessions) {
      const key = s.device_identifier || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [openSessions]);

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
    setError(null);
    try {
      await apiRequest(`/employee-attendance/${record.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
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
      setManualError(
        hoursHint ?? "Check-out must be after check-in on the same day.",
      );
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
      if (editingRecord) {
        await apiRequest(`/employee-attendance/${editingRecord.id}`, {
          method: "PUT",
          body: {
            employee_id: Number(manualForm.employee_id),
            attendance_date: manualForm.attendance_date,
            check_in: checkInApi,
            check_out: checkOutApi,
            status: manualForm.status,
            source: editingRecord.source ?? "manual",
            hours_worked: timesRequired ? computedHours : 0,
            notes: manualForm.notes.trim() || null,
          },
        });
      } else {
        await apiRequest("/employee-attendance", {
          method: "POST",
          body: {
            employee_id: Number(manualForm.employee_id),
            attendance_date: manualForm.attendance_date,
            check_in: checkInApi,
            check_out: checkOutApi,
            status: manualForm.status,
            source: "manual",
            hours_worked: timesRequired ? computedHours : 0,
            notes: manualForm.notes.trim() || null,
          },
        });
      }
      setManualOpen(false);
      setEditingRecord(null);
      setManualForm(EMPTY_MANUAL);
      setDayHint(null);
      await load();
    } catch (err) {
      setManualError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Attendance"
      subtitle={
        companyMobileEnabled
          ? "Company mobile, clock devices, and manual records"
          : "Clock device sessions and manual attendance records"
      }
      action={
        <PrimaryButton type="button" onClick={openCreateManual}>
          Add manual record
        </PrimaryButton>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {canManagePremises ? (
        <CompanyPremisesPanel enabled={companyMobileEnabled} />
      ) : null}
      {canManagePremises ? (
        <AttendanceMobileDevicesPanel enabled={companyMobileEnabled} />
      ) : null}

      <div className={`mb-8 grid gap-6 ${admin && !companyMobileEnabled ? "lg:grid-cols-2" : admin ? "lg:grid-cols-2" : ""}`}>
        {admin && !companyMobileEnabled && (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-medium text-slate-900">Clock devices</h2>
              <p className="mt-1 text-sm text-slate-500">
                Terminals post clock-in/out via the device API when an employee uses a fingerprint.
                This screen shows registered devices only — not manual clocking.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#EAF3DE] px-2.5 py-1 text-xs font-medium text-[#27500A]">
              {activeDevices.length > 0 ? "In use" : "No devices"}
            </span>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : activeDevices.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No clock devices registered. Add a device number and location below.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {activeDevices.map((d) => {
                const open = sessionsByDevice.get(d.device_no)?.length ?? 0;
                return (
                  <li key={d.id} className="py-3">
                    <p className="font-medium text-slate-900">{d.device_no}</p>
                    <p className="text-sm text-slate-500">{d.location || "Location not set"}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {open > 0
                        ? `${open} open session${open === 1 ? "" : "s"} on this device`
                        : "Idle — ready for clock-in"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          {admin && <ClockDeviceRegisterForm onRegistered={load} />}
        </section>
        )}

        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-[15px] font-medium text-slate-900">Live clock sessions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Employees currently clocked in on a device (read-only).
          </p>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : openSessions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No open sessions.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {openSessions.map((s) => (
                <li key={s.id} className="py-3">
                  <p className="font-medium text-slate-900">
                    {composeEmployeeDisplayName(s.employee) || `#${s.employee_id}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Device {s.device_identifier || "—"} · In{" "}
                    {formatShortDate(s.clock_in_at)} {String(s.clock_in_at).slice(11, 16)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {companyMobileEnabled ? (
        <section className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-[15px] font-medium text-slate-900">Company mobile sessions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Recent face + GPS attendance from the shared company phone.
          </p>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : mobileSessions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No company mobile sessions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {mobileSessions.map((s) => (
                <li key={s.id} className="py-3">
                  <p className="font-medium text-slate-900">
                    {s.employee_name || `#${s.employee_id}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.is_open ? "On shift" : "Completed"} · In {formatShortDate(s.clock_in_at)}
                    {s.clock_out_at ? ` · Out ${formatShortDate(s.clock_out_at)}` : ""}
                    {s.clock_in_geofence_distance_metres != null
                      ? ` · ${s.clock_in_geofence_distance_metres}m from premises`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-medium text-slate-900">Attendance records</h2>
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
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No attendance records yet.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="theme-table-body-row">
                    <td className="px-4 py-3">
                      {composeEmployeeDisplayName(r.employee) || r.employee_id}
                    </td>
                    <td className="px-4 py-3">{formatShortDate(r.attendance_date)}</td>
                    <td className="px-4 py-3">{r.check_in?.slice?.(0, 5) ?? "—"}</td>
                    <td className="px-4 py-3">{r.check_out?.slice?.(0, 5) ?? "—"}</td>
                    <td className="px-4 py-3">{r.hours_worked ?? "—"}</td>
                    <td className="px-4 py-3 capitalize">
                      {r.source === "clock_device" ? "Clock device" : "Manual"}
                    </td>
                    <td className="px-4 py-3 capitalize">{r.status}</td>
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
        {dayHint?.has_existing_attendance && dayHint.existing_attendance?.id !== editingRecord?.id && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Attendance already exists for this employee on this date (
            {dayHint.existing_attendance?.status ?? "recorded"}
            {dayHint.existing_attendance?.source === "clock_device" ? ", clock device" : ""}
            ). You cannot add a second record — edit the existing one in the table below.
          </p>
        )}
        {dayHint && !dayHint.has_existing_attendance && (
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
        )}
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
        {timesRequired && (
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
        )}
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

function ClockDeviceRegisterForm({ onRegistered }) {
  const { user, capabilities } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const [deviceNo, setDeviceNo] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  async function register(e) {
    e.preventDefault();
    if (!deviceNo.trim()) {
      setMsg("Device number is required.");
      return;
    }
    if (!organizationId) {
      setMsg("No organization on your account.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await apiRequest("/attendance-clock-devices", {
        method: "POST",
        body: {
          organization_id: organizationId,
          device_no: deviceNo.trim(),
          location: location.trim() || null,
          is_active: true,
        },
      });
      setDeviceNo("");
      setLocation("");
      setMsg("Device registered.");
      await onRegistered();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Could not register device");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={register} className="mt-5 border-t border-slate-100 pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Register device
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Field label="Device no.">
          <input
            type="text"
            value={deviceNo}
            onChange={(e) => setDeviceNo(e.target.value)}
            placeholder="TERMINAL-01"
            className={inputClassName()}
          />
        </Field>
        <Field label="Location">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Main branch — reception"
            className={inputClassName()}
          />
        </Field>
      </div>
      {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
      <button
        type="submit"
        disabled={saving}
        className="mt-2 text-sm font-medium text-[#185FA5] hover:underline disabled:opacity-50"
      >
        {saving ? "Saving…" : "Add clock device"}
      </button>
    </form>
  );
}
