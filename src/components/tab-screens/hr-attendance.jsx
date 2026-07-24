"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { P } from "@/lib/permission-codes";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { ATTENDANCE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  SearchInput,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  BatchActionBar,
  BatchDeleteButton,
  TableRowSelectCell,
  TableSelectAllHeader,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";
import { HrSelectField } from "@/components/hr/hr-crud-page";
import { HrTimePickerField } from "@/components/hr/hr-time-picker";
import { FieldRepHrLinkageBanner } from "@/components/hr/field-rep-hr-linkage-banner";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";
import { canApproveLatenessWaivers } from "@/lib/approval-permissions";
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
import { calendarDateInTimezone, todayCalendarDate } from "@/lib/datetime";
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
  lunch_taken: true,
  lateness_waived: false,
  lateness_waiver_reason: "",
};

const NON_WORK_STATUSES = ["leave", "holiday", "absent"];

function attendanceCountsInPayroll(status) {
  return ["present", "late", "half_day"].includes(status);
}

export function HrAttendanceScreen() {
  const { capabilities, hasPermission, user } = useAuth();
  const confirm = useConfirm();
  const canManageSettings = hasPermission(P.hr.manage);
  const canApproveWaivers = canApproveLatenessWaivers({ hasPermission, capabilities });
  const companyMobileEnabled = isCompanyMobileAttendanceEnabled(capabilities?.module_settings);
  const fieldAttendanceEnabled = shouldShowMobileFieldAttendance(capabilities);
  const [tab, setTab] = useState("active");
  const [employees, setEmployees] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [fieldRepLinkage, setFieldRepLinkage] = useState(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFromDate, setHistoryFromDate] = useState(() => daysAgoCalendarDate(7));
  const [historyToDate, setHistoryToDate] = useState(() => todayCalendarDate());
  const [recordSearch, setRecordSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [dayHint, setDayHint] = useState(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [employeePickerFilter, setEmployeePickerFilter] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [markingAbsents, setMarkingAbsents] = useState(false);
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
    const handle = window.setTimeout(() => setDebouncedSearch(recordSearch.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [recordSearch]);

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
      const attendanceRes = await apiRequest("/employee-attendance", {
        searchParams: {
          per_page: 100,
          page: 1,
          from_date: historyFromDate,
          to_date: historyToDate,
          ...(debouncedSearch ? { q: debouncedSearch } : {}),
        },
      });
      setRecords(attendanceRes.data ?? []);
      setRecordsTotal(Number(attendanceRes.meta?.total ?? attendanceRes.total ?? attendanceRes.data?.length ?? 0));
      clearSelection();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load attendance records");
      setRecords([]);
      setRecordsTotal(0);
      clearSelection();
    } finally {
      setHistoryLoading(false);
    }
  }, [debouncedSearch, historyFromDate, historyToDate, clearSelection]);

  const recordPageIds = useMemo(() => records.map((r) => r.id), [records]);

  const selectedRecords = useMemo(
    () => records.filter((r) => selectedIds.has(String(r.id))),
    [records, selectedIds],
  );

  const selectedWaiveableCount = useMemo(
    () =>
      selectedRecords.filter(
        (r) => Number(r.late_minutes) > 0 && !r.lateness_waived && !r.pending_waiver,
      ).length,
    [selectedRecords],
  );

  const selectedUndoWaiveCount = useMemo(
    () =>
      selectedRecords.filter(
        (r) => Number(r.late_minutes) > 0 && r.lateness_waived && !r.pending_waiver,
      ).length,
    [selectedRecords],
  );

  function canReviewWaiver(record) {
    const pending = record?.pending_waiver;
    if (!pending) return false;
    if (canApproveWaivers) return true;
    return (
      pending.assigned_manager_user_id != null &&
      Number(pending.assigned_manager_user_id) === Number(user?.id)
    );
  }

  const loadEmployeesForManual = useCallback(async () => {
    if (employees.length) return;
    try {
      const employeesRes = await apiRequest("/employees", {
        searchParams: { per_page: 200, fields: "lean", is_active: 1 },
      });
      setEmployees(employeesRes.data ?? []);
    } catch {
      setEmployees([]);
    }
  }, [employees.length]);

  useTabAwareDataLoad(loadActive);

  useEffect(() => {
    if (tab === "records") {
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

  const timesRequired = !NON_WORK_STATUSES.includes(manualForm.status);

  const selectedEmployees = useMemo(() => {
    if (editingRecord) {
      return employees.filter((e) => String(e.id) === String(manualForm.employee_id));
    }
    const idSet = new Set(selectedEmployeeIds.map(String));
    return employees.filter((e) => idSet.has(String(e.id)));
  }, [editingRecord, employees, manualForm.employee_id, selectedEmployeeIds]);

  const lunchAppliesToSelection = useMemo(() => {
    if (editingRecord) {
      if (dayHint && typeof dayHint.lunch_required === "boolean") {
        return !!dayHint.lunch_required && Number(dayHint.lunch_minutes ?? 0) > 0;
      }
      if (editingRecord.lunch_status === "-") return false;
      if (editingRecord.lunch_status === "taken" || editingRecord.lunch_status === "skipped") {
        return true;
      }
    }
    if (selectedEmployees.length === 0) return true;
    return selectedEmployees.some((e) => {
      const shift = e.shift;
      if (!shift) return true;
      if (shift.lunch_required === false) return false;
      // null minutes = legacy default lunch; explicit 0 = no lunch that day
      if (shift.lunch_minutes == null) return true;
      return Number(shift.lunch_minutes) > 0;
    });
  }, [editingRecord, dayHint, selectedEmployees]);

  useEffect(() => {
    if (!lunchAppliesToSelection && manualForm.lunch_taken) {
      setManualForm((p) => ({ ...p, lunch_taken: false }));
    }
  }, [lunchAppliesToSelection, manualForm.lunch_taken]);

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
    if (!editingRecord || !manualForm.employee_id || !manualForm.attendance_date) {
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
  }, [editingRecord, manualForm.employee_id, manualForm.attendance_date]);

  const filteredEmployeesForPicker = useMemo(() => {
    const q = employeePickerFilter.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const name = composeEmployeeDisplayName(e).toLowerCase();
      const code = String(e.employee_code ?? "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [employees, employeePickerFilter]);

  const allFilteredSelected =
    filteredEmployeesForPicker.length > 0 &&
    filteredEmployeesForPicker.every((e) => selectedEmployeeIds.includes(String(e.id)));

  function openCreateManual() {
    setEditingRecord(null);
    setManualForm(EMPTY_MANUAL);
    setManualError(null);
    setDayHint(null);
    setBulkResult(null);
    setSelectedEmployeeIds([]);
    setEmployeePickerFilter("");
    setManualOpen(true);
    void loadEmployeesForManual();
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
      lunch_taken: record.lunch_status === "taken",
      lateness_waived: !!record.lateness_waived,
      lateness_waiver_reason: record.lateness_waiver_reason ?? "",
      late_minutes: record.late_minutes ?? 0,
    });
    setManualError(null);
    setDayHint(null);
    setBulkResult(null);
    setSelectedEmployeeIds([String(record.employee_id)]);
    setManualOpen(true);
    void loadEmployeesForManual();
  }

  function toggleEmployeeSelected(id) {
    const key = String(id);
    setSelectedEmployeeIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  }

  function selectAllFilteredEmployees() {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      for (const e of filteredEmployeesForPicker) next.add(String(e.id));
      return [...next];
    });
  }

  function clearEmployeeSelection() {
    setSelectedEmployeeIds([]);
  }

  async function deleteRecord(record) {
    const ok = await confirm(confirmDeleteOptions("this attendance record"));
    if (!ok) return;
    try {
      await apiRequest(`/employee-attendance/${record.id}`, { method: "DELETE" });
      await loadHistory();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  async function deleteSelectedRecords() {
    const ids = [...selectedIds].map((id) => Number(id)).filter((id) => id > 0);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: "Delete selected attendance",
      message: `Delete ${ids.length} attendance record${ids.length === 1 ? "" : "s"}? Clock sessions and pending auto-OT for those days are cleared. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBatchBusy(true);
    try {
      const res = await apiRequest("/employee-attendance/bulk-delete", {
        method: "POST",
        body: { ids },
      });
      const deleted = Number(res.deleted_count ?? 0);
      const skipped = Number(res.skipped_count ?? 0);
      clearSelection();
      await loadHistory();
      if (deleted > 0 && skipped === 0) {
        notifySuccess(`Deleted ${deleted} attendance record${deleted === 1 ? "" : "s"}.`);
      } else if (deleted > 0) {
        const reason = res.skipped?.[0]?.reason;
        notifySuccess(
          `Deleted ${deleted}; skipped ${skipped}${reason ? ` (${reason})` : ""}.`,
        );
      } else {
        notifyError(res.skipped?.[0]?.reason ?? "No records deleted.");
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Bulk delete failed");
    } finally {
      setBatchBusy(false);
    }
  }

  async function waiveSelectedLateness(waived) {
    const eligible = selectedRecords.filter(
      (r) => Number(r.late_minutes) > 0 && !r.pending_waiver,
    );
    const ids = eligible
      .filter((r) => (waived ? !r.lateness_waived : !!r.lateness_waived))
      .map((r) => Number(r.id));
    if (ids.length === 0) {
      notifyError(
        waived
          ? "None of the selected records can request a lateness waiver."
          : "None of the selected records can request undoing a waiver.",
      );
      return;
    }

    let reason = "";
    if (waived) {
      const entered = window.prompt(
        `Request lateness waiver for ${ids.length} record${ids.length === 1 ? "" : "s"}?\nRequires manager approval. One reason is sent with all:`,
        "",
      );
      if (entered === null) return;
      reason = entered.trim();
    } else {
      const ok = await confirm({
        title: "Request undo lateness waiver?",
        message: `Submit undo requests for ${ids.length} record${ids.length === 1 ? "" : "s"}? A manager must approve before payroll hours change.`,
        confirmLabel: "Submit request",
      });
      if (!ok) return;
    }

    setBatchBusy(true);
    try {
      const res = await apiRequest("/employee-attendance/bulk-waive-lateness", {
        method: "POST",
        body: {
          ids,
          lateness_waived: waived,
          lateness_waiver_reason: waived ? reason || null : null,
        },
      });
      const updated = Number(res.submitted_count ?? res.updated_count ?? 0);
      const skipped = Number(res.skipped_count ?? 0);
      clearSelection();
      await loadHistory();
      if (updated > 0 && skipped === 0) {
        notifySuccess(
          `Submitted ${updated} waiver request${updated === 1 ? "" : "s"} for manager approval.`,
        );
      } else if (updated > 0) {
        notifySuccess(`Submitted ${updated}; skipped ${skipped}.`);
      } else {
        notifyError(res.skipped?.[0]?.reason ?? "No waiver requests submitted.");
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Bulk waiver request failed");
    } finally {
      setBatchBusy(false);
    }
  }

  async function reviewWaiverRequest(record, approve) {
    const pending = record?.pending_waiver;
    if (!pending?.id) return;
    if (!approve) {
      const entered = window.prompt("Reject reason (optional):", "");
      if (entered === null) return;
      try {
        await apiRequest(`/lateness-waiver-requests/${pending.id}/reject`, {
          method: "POST",
          body: { reason: entered.trim() || null },
        });
        notifySuccess("Waiver request rejected.");
        await loadHistory();
      } catch (e) {
        notifyError(e instanceof ApiError ? e.message : "Could not reject waiver");
      }
      return;
    }
    const ok = await confirm({
      title: "Approve lateness waiver?",
      message: pending.waive
        ? `Approve waiving ${pending.late_minutes ?? record.late_minutes}m late? Paid hours will be restored for payroll.`
        : "Approve undoing this lateness waiver? Late minutes will reduce paid hours again.",
      confirmLabel: "Approve",
    });
    if (!ok) return;
    try {
      await apiRequest(`/lateness-waiver-requests/${pending.id}/approve`, {
        method: "POST",
      });
      notifySuccess("Waiver request approved.");
      await loadHistory();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not approve waiver");
    }
  }

  async function markMissingAsAbsent() {
    const ok = await confirm({
      title: "Mark missing as absent?",
      message: `For ${historyFromDate} to ${historyToDate}, create absent records for active employees who were scheduled to work but have no attendance. Today and future dates are never marked. Leave/off days are skipped.`,
      confirmLabel: "Mark absents",
    });
    if (!ok) return;

    setMarkingAbsents(true);
    try {
      const res = await apiRequest("/employee-attendance/mark-absents", {
        method: "POST",
        body: {
          from_date: historyFromDate,
          to_date: historyToDate,
        },
      });
      const created = Number(res.created_count ?? 0);
      const skipped = Number(res.skipped_count ?? 0);
      await loadHistory();
      if (created > 0) {
        notifySuccess(
          skipped > 0
            ? `Marked ${created} absent; skipped ${skipped}.`
            : `Marked ${created} absent record${created === 1 ? "" : "s"}.`,
        );
      } else {
        notifySuccess("No missing scheduled days to mark as absent in this range.");
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not mark absents");
    } finally {
      setMarkingAbsents(false);
    }
  }

  async function waiveLateness(record, waived) {
    if (record.pending_waiver) {
      notifyError("A waiver request is already pending for this day.");
      return;
    }
    let reason = record.lateness_waiver_reason ?? "";
    if (waived) {
      const entered = window.prompt(
        `Request to waive ${record.late_minutes} minutes late for ${composeEmployeeDisplayName(record.employee) || "employee"}?\nRequires manager approval. Optional reason:`,
        reason || "",
      );
      if (entered === null) return;
      reason = entered.trim();
    } else {
      const ok = await confirm({
        title: "Request undo lateness waiver?",
        message: "A manager must approve before paid hours change again.",
        confirmLabel: "Submit request",
      });
      if (!ok) return;
    }
    try {
      await apiRequest(`/employee-attendance/${record.id}/waive-lateness`, {
        method: "POST",
        body: {
          lateness_waived: waived,
          lateness_waiver_reason: waived ? reason || null : null,
        },
      });
      notifySuccess("Waiver request sent for manager approval.");
      await loadHistory();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not submit waiver request");
    }
  }

  function updateManualTime(field, value) {
    setManualForm((p) => ({ ...p, [field]: value }));
  }

  async function saveManual(e) {
    e.preventDefault();
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

    if (editingRecord) {
      if (!manualForm.employee_id) {
        setManualError("Select an employee.");
        return;
      }
      if (
        dayHint?.has_existing_attendance &&
        Number(dayHint.existing_attendance?.id) !== Number(editingRecord?.id)
      ) {
        setManualError(
          "This employee already has attendance for this date. Only one record per employee per day is allowed.",
        );
        return;
      }
      setManualSaving(true);
      setManualError(null);
      try {
        await apiRequest(`/employee-attendance/${editingRecord.id}`, {
          method: "PUT",
          body: {
            employee_id: Number(manualForm.employee_id),
            attendance_date: manualForm.attendance_date,
            check_in: checkInApi,
            check_out: checkOutApi,
            status: manualForm.status,
            notes: manualForm.notes.trim() || null,
            source: editingRecord.source ?? "manual",
            lunch_taken:
              timesRequired && lunchAppliesToSelection ? Boolean(manualForm.lunch_taken) : false,
            lateness_waived: !!manualForm.lateness_waived,
            lateness_waiver_reason: manualForm.lateness_waived
              ? manualForm.lateness_waiver_reason.trim() || null
              : null,
          },
        });
        setManualOpen(false);
        setEditingRecord(null);
        setManualForm(EMPTY_MANUAL);
        setDayHint(null);
        setBulkResult(null);
        await loadHistory();
      } catch (err) {
        setManualError(err instanceof ApiError ? err.message : "Save failed");
      } finally {
        setManualSaving(false);
      }
      return;
    }

    if (selectedEmployeeIds.length === 0) {
      setManualError("Select one or more employees, or use Select all.");
      return;
    }

    setManualSaving(true);
    setManualError(null);
    setBulkResult(null);
    try {
      const res = await apiRequest("/employee-attendance/bulk", {
        method: "POST",
        body: {
          employee_ids: selectedEmployeeIds.map((id) => Number(id)),
          attendance_date: manualForm.attendance_date,
          check_in: checkInApi,
          check_out: checkOutApi,
          status: manualForm.status,
          notes: manualForm.notes.trim() || null,
          lunch_taken:
            timesRequired && lunchAppliesToSelection ? Boolean(manualForm.lunch_taken) : false,
        },
      });
      setBulkResult(res);
      const created = Number(res.created_count ?? 0);
      const skipped = Number(res.skipped_count ?? 0);
      const skipReason =
        Array.isArray(res.skipped) && res.skipped[0]?.reason
          ? String(res.skipped[0].reason)
          : null;
      if (created > 0) {
        notifySuccess(
          skipped > 0
            ? `Saved ${created} attendance record${created === 1 ? "" : "s"}; skipped ${skipped}.`
            : `Saved ${created} attendance record${created === 1 ? "" : "s"}.`,
        );
        await loadHistory();
        if (skipped === 0) {
          setManualOpen(false);
          setManualForm(EMPTY_MANUAL);
          setSelectedEmployeeIds([]);
          setBulkResult(null);
        }
      } else {
        setManualError(
          skipReason
            ? `Could not save attendance: ${skipReason}`
            : skipped > 0
              ? `No records saved. ${skipped} employee${skipped === 1 ? " was" : "s were"} skipped.`
              : "No records saved.",
        );
      }
    } catch (err) {
      const payload = err instanceof ApiError ? err.body : null;
      if (payload?.skipped_count && !payload?.created_count) {
        setBulkResult(payload);
        const skipReason =
          Array.isArray(payload.skipped) && payload.skipped[0]?.reason
            ? String(payload.skipped[0].reason)
            : null;
        setManualError(
          skipReason
            ? `Could not save attendance: ${skipReason}`
            : `No records saved. ${payload.skipped_count} employee${payload.skipped_count === 1 ? " was" : "s were"} skipped.`,
        );
      } else {
        setManualError(err instanceof ApiError ? err.message : "Save failed");
      }
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Attendance"
      subtitle="Premises clock-in, company phone, mobile sales app, and manual records — missing scheduled days are marked absent for payroll"
      action={
        tab === "records" ? (
          <div className="flex flex-wrap items-center gap-2">
            <CatalogListExport
              title="Attendance"
              apiPath="/employee-attendance"
              columns={ATTENDANCE_EXPORT_COLUMNS}
              totalCount={recordsTotal || records.length}
              getSearchParams={() => ({
                per_page: 200,
                from_date: historyFromDate,
                to_date: historyToDate,
                ...(debouncedSearch ? { q: debouncedSearch } : {}),
              })}
              disabled={historyLoading}
            />
            <button
              type="button"
              disabled={markingAbsents || historyLoading}
              onClick={() => void markMissingAsAbsent()}
              className={SECONDARY_BTN_CLASS}
            >
              {markingAbsents ? "Marking…" : "Mark missing as absent"}
            </button>
            <PrimaryButton type="button" onClick={openCreateManual}>
              Create attendance
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
          onClick={() => setTab("records")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "records" ? "bg-[#185FA5] text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Records
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
            <Field label="Search employee">
              <SearchInput
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                placeholder="Name, code, or status"
                className="min-w-[14rem]"
              />
            </Field>
          </div>

          <section className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-medium text-slate-900">Attendance records</h2>
              <p className="mt-1 text-sm text-slate-500">
                One row per employee per day. Select rows to waive lateness (one shared reason) or
                delete in bulk. Paid hours exclude lunch and time after shift end. Overtime ≥ 1 hour
                creates a pending OT draft for HR approval.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <TableSelectAllHeader
                      checked={isAllOnPageSelected(recordPageIds)}
                      indeterminate={isSomeOnPageSelected(recordPageIds)}
                      onChange={(checked) => toggleAllOnPage(checked, recordPageIds)}
                      label="Select all attendance records on this page"
                    />
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">In</th>
                    <th className="px-4 py-3">Out</th>
                    <th className="px-4 py-3">Paid / exp.</th>
                    <th className="px-4 py-3">Late</th>
                    <th className="px-4 py-3">Lunch</th>
                    <th className="px-4 py-3">OT</th>
                    <th className="px-4 py-3">Login channel</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payroll</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-8 text-center text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-8 text-center text-slate-500">
                        {recordSearch.trim()
                          ? "No attendance records match your search in this date range."
                          : "No attendance records in this date range."}
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => (
                      <tr key={r.id} className="theme-table-body-row">
                        <TableRowSelectCell
                          checked={selectedIds.has(String(r.id))}
                          onChange={() => toggleOne(r.id)}
                          label={`Select attendance for ${composeEmployeeDisplayName(r.employee) || r.employee_id}`}
                        />
                        <td className="px-4 py-3">
                          {composeEmployeeDisplayName(r.employee) || r.employee_id}
                        </td>
                        <td className="px-4 py-3">{formatShortDate(r.attendance_date)}</td>
                        <td className="px-4 py-3">{r.check_in?.slice?.(0, 5) ?? "—"}</td>
                        <td className="px-4 py-3">{r.check_out?.slice?.(0, 5) ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {r.hours_worked ?? "—"}
                          {r.expected_hours != null ? (
                            <span className="text-slate-400"> / {r.expected_hours}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {r.late_minutes > 0 ? (
                            <span>
                              {r.late_minutes}m
                              {r.lateness_waived ? (
                                <span className="ml-1 text-[11px] font-medium text-emerald-700">
                                  waived
                                </span>
                              ) : null}
                              {r.pending_waiver ? (
                                <span className="ml-1 text-[11px] font-medium text-amber-700">
                                  pending
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.lunch_status === "taken"
                            ? r.lunch_minutes != null
                              ? `Taken (${r.lunch_minutes}m)`
                              : "Taken"
                            : r.lunch_status === "skipped"
                              ? "Skipped"
                              : (r.lunch_status ?? "—")}
                        </td>
                        <td className="px-4 py-3">
                          {r.overtime_minutes >= 60
                            ? `${(r.overtime_minutes / 60).toFixed(2)}h`
                            : r.overtime_minutes > 0
                              ? `${r.overtime_minutes}m`
                              : "—"}
                        </td>
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
                          {r.pending_waiver && canReviewWaiver(r) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void reviewWaiverRequest(r, true)}
                                className="ml-3 text-emerald-700 hover:underline"
                              >
                                Approve waive
                              </button>
                              <button
                                type="button"
                                onClick={() => void reviewWaiverRequest(r, false)}
                                className="ml-3 text-amber-800 hover:underline"
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          {r.pending_waiver && !canReviewWaiver(r) ? (
                            <span className="ml-3 text-xs text-amber-700">Awaiting manager</span>
                          ) : null}
                          {r.late_minutes > 0 && !r.lateness_waived && !r.pending_waiver ? (
                            <button
                              type="button"
                              onClick={() => void waiveLateness(r, true)}
                              className="ml-3 text-emerald-700 hover:underline"
                            >
                              Request waive
                            </button>
                          ) : null}
                          {r.late_minutes > 0 && r.lateness_waived && !r.pending_waiver ? (
                            <button
                              type="button"
                              onClick={() => void waiveLateness(r, false)}
                              className="ml-3 text-amber-700 hover:underline"
                            >
                              Request undo
                            </button>
                          ) : null}
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
                  : `Request waive (${selectedWaiveableCount})`}
              </button>
            ) : null}
            {selectedUndoWaiveCount > 0 ? (
              <button
                type="button"
                disabled={batchBusy}
                onClick={() => void waiveSelectedLateness(false)}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                Request undo ({selectedUndoWaiveCount})
              </button>
            ) : null}
            <BatchDeleteButton
              count={selectedCount}
              busy={batchBusy}
              onClick={() => void deleteSelectedRecords()}
            />
          </BatchActionBar>

          {fieldAttendanceEnabled ? (
            <div className="mt-8">
              <MobileFieldAttendanceScreen variant="hr" embedded embeddedMode="history" />
            </div>
          ) : null}
        </>
      )}

      <FormDrawer
        title={editingRecord ? "Edit attendance" : "Create attendance"}
        open={manualOpen}
        onClose={() => {
          setManualOpen(false);
          setEditingRecord(null);
          setDayHint(null);
          setBulkResult(null);
          setSelectedEmployeeIds([]);
        }}
        onSubmit={saveManual}
        saving={manualSaving}
        error={manualError}
        submitLabel={
          editingRecord
            ? "Save changes"
            : selectedEmployeeIds.length > 1
              ? `Create for ${selectedEmployeeIds.length} employees`
              : selectedEmployeeIds.length === 1
                ? "Create attendance"
                : "Create attendance"
        }
        wide
      >
        {editingRecord ? (
          <HrSelectField
            label="Employee"
            value={manualForm.employee_id}
            onChange={(v) => setManualForm((p) => ({ ...p, employee_id: v }))}
            required
            options={(
              editingRecord?.employee &&
              !employees.some((e) => Number(e.id) === Number(editingRecord.employee_id))
                ? [editingRecord.employee, ...employees]
                : employees
            ).map((e) => ({
              value: String(e.id),
              label: composeEmployeeDisplayName(e),
            }))}
          />
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">
                Employees{" "}
                <span className="font-normal text-slate-500">
                  ({selectedEmployeeIds.length} selected)
                </span>
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllFilteredEmployees}
                  className="font-medium text-[#185FA5] hover:underline"
                >
                  {allFilteredSelected ? "All filtered selected" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={clearEmployeeSelection}
                  className="font-medium text-slate-600 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <input
              type="search"
              value={employeePickerFilter}
              onChange={(e) => setEmployeePickerFilter(e.target.value)}
              placeholder="Search employees…"
              className={inputClassName()}
            />
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {filteredEmployeesForPicker.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">No active employees found.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredEmployeesForPicker.map((e) => {
                    const id = String(e.id);
                    const checked = selectedEmployeeIds.includes(id);
                    return (
                      <li key={id}>
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEmployeeSelected(id)}
                          />
                          <span className="min-w-0 flex-1 truncate text-slate-800">
                            {composeEmployeeDisplayName(e)}
                          </span>
                          <span className="shrink-0 text-xs text-slate-400">
                            {e.employee_code || ""}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Same date and times are applied to every selected employee. Existing unlocked
              attendance for that date is updated. Staff on leave/off or locked to payroll are
              skipped.
            </p>
          </div>
        )}
        <Field label="Date">
          <input
            type="date"
            value={manualForm.attendance_date}
            onChange={(e) => setManualForm((p) => ({ ...p, attendance_date: e.target.value }))}
            className={inputClassName()}
          />
        </Field>
        {editingRecord &&
        dayHint?.has_existing_attendance &&
        Number(dayHint.existing_attendance?.id) !== Number(editingRecord?.id) ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Attendance already exists for this employee on this date (
            {dayHint.existing_attendance?.status ?? "recorded"}
            {dayHint.existing_attendance?.source
              ? `, ${formatAttendanceSource(dayHint.existing_attendance.source, dayHint.existing_attendance.source_label).toLowerCase()}`
              : ""}
            ). You cannot add a second record — edit the existing one in the Records tab.
          </p>
        ) : null}
        {editingRecord && dayHint?.blocks_attendance ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {dayHint.assignment_kind === "off_day"
              ? "This date is marked as an off day. You can still update this attendance record."
              : "This date has approved leave. You can still update this attendance record."}
          </p>
        ) : null}
        {editingRecord &&
        dayHint &&
        !dayHint.has_existing_attendance &&
        !dayHint.blocks_attendance ? (
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
              defaultPeriod="AM"
              required
            />
            <HrTimePickerField
              label="Check out"
              value={manualForm.check_out}
              onChange={(v) => updateManualTime("check_out", v)}
              defaultPeriod="PM"
              required
            />
            {lunchAppliesToSelection ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={!!manualForm.lunch_taken}
                    onChange={(e) =>
                      setManualForm((p) => ({ ...p, lunch_taken: e.target.checked }))
                    }
                  />
                  <span>
                    Went for lunch
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {manualForm.lunch_taken
                        ? "Checked — lunch recorded as taken (shift lunch minutes credited per HR settings)."
                        : "Unchecked — lunch recorded as skipped (did not go). Paid hours and early leave follow the shift lunch rules and the employee’s bank-lunch setting."}
                    </span>
                  </span>
                </label>
                <p className="text-xs text-slate-600">
                  Lunch column will show:{" "}
                  <span className="font-medium text-slate-900">
                    {manualForm.lunch_taken ? "Taken" : "Skipped"}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Selected shift(s) have no lunch break configured — lunch will show as —.
              </p>
            )}
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
        {editingRecord && (manualForm.late_minutes > 0 || editingRecord.late_minutes > 0) ? (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!manualForm.lateness_waived}
                onChange={(e) =>
                  setManualForm((p) => ({ ...p, lateness_waived: e.target.checked }))
                }
              />
              <span>
                Waive lateness ({manualForm.late_minutes || editingRecord.late_minutes}m)
                <span className="mt-0.5 block text-xs text-slate-500">
                  Submits a request for the employee&apos;s manager (or HR approver) — hours change
                  only after approval.
                </span>
              </span>
            </label>
            {manualForm.lateness_waived ? (
              <Field label="Waiver reason">
                <input
                  type="text"
                  value={manualForm.lateness_waiver_reason}
                  onChange={(e) =>
                    setManualForm((p) => ({ ...p, lateness_waiver_reason: e.target.value }))
                  }
                  placeholder="e.g. traffic, medical appointment"
                  className={inputClassName()}
                />
              </Field>
            ) : null}
          </div>
        ) : null}
        <Field label="Notes">
          <input
            type="text"
            value={manualForm.notes}
            onChange={(e) => setManualForm((p) => ({ ...p, notes: e.target.value }))}
            className={inputClassName()}
          />
        </Field>
        {bulkResult?.skipped?.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-medium">
              Saved {bulkResult.created_count ?? 0}, skipped {bulkResult.skipped_count ?? 0}
            </p>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
              {bulkResult.skipped.slice(0, 20).map((row) => (
                <li key={`${row.employee_id}-${row.reason}`}>
                  {row.employee_name}: {row.reason}
                </li>
              ))}
              {bulkResult.skipped.length > 20 ? (
                <li>…and {bulkResult.skipped.length - 20} more</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </FormDrawer>
    </CatalogPageShell>
  );
}
