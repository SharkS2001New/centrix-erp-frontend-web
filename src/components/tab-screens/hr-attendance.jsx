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
import { HrDateField, HrFilterButton, HrFilterToolbar, HrPageActions } from "@/components/hr/hr-list-toolbar";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  PencilIcon,
  PrimaryButton,
  PaginationBar,
  SECONDARY_BTN_CLASS,
  SearchInput,
  TrashIcon,
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
import { AttendanceGapsBanner } from "@/components/hr/attendance-gaps-banner";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";
import { canApproveLatenessWaivers } from "@/lib/approval-permissions";
import {
  composeEmployeeDisplayName,
  computeAttendanceHours,
  elapsedAttendanceHours,
  formatHoursWorked,
  formatTimeForApi,
  attendanceLatenessParts,
  formatAttendanceLateness,
} from "@/components/hr/hr-shared";
import {
  formatAttendanceLoginChannel,
  formatAttendanceSource,
  attendanceLoginChannelBadgeClass,
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
  lunch_out: "",
  lunch_in: "",
  lateness_waived: false,
  lateness_waiver_reason: "",
};

const NON_WORK_STATUSES = ["leave", "holiday", "absent"];

function attendanceCountsInPayroll(status) {
  return ["present", "late", "half_day"].includes(status);
}

export function HrAttendanceScreen({ mode = "today" }) {
  const isHistory = mode === "history";
  const { capabilities, hasPermission, user } = useAuth();
  const confirm = useConfirm();
  const canManageSettings = hasPermission(P.hr.manage);
  const canAddManualAttendance =
    hasPermission(P.hr.attendance.create) || hasPermission(P.hr.manage);
  const canApproveWaivers = canApproveLatenessWaivers({ hasPermission, capabilities });
  const fieldAttendanceEnabled = shouldShowMobileFieldAttendance(capabilities);
  const [employees, setEmployees] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [todayFieldSessions, setTodayFieldSessions] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [records, setRecords] = useState([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(50);
  const [todayPage, setTodayPage] = useState(1);
  const [todayPageSize, setTodayPageSize] = useState(25);
  const [fieldRepLinkage, setFieldRepLinkage] = useState(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFromDate, setHistoryFromDate] = useState(() => daysAgoCalendarDate(1));
  const [historyToDate, setHistoryToDate] = useState(() => daysAgoCalendarDate(1));
  const [appliedHistoryFrom, setAppliedHistoryFrom] = useState(() => daysAgoCalendarDate(1));
  const [appliedHistoryTo, setAppliedHistoryTo] = useState(() => daysAgoCalendarDate(1));
  const [recordSearch, setRecordSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [todaySearch, setTodaySearch] = useState("");

  useEffect(() => {
    if (isHistory) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isHistory]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [punchEditDay, setPunchEditDay] = useState(null);
  const [punchEditIn, setPunchEditIn] = useState("");
  const [punchEditLunchOut, setPunchEditLunchOut] = useState("");
  const [punchEditLunchIn, setPunchEditLunchIn] = useState("");
  const [punchEditOut, setPunchEditOut] = useState("");
  const [punchEditSaving, setPunchEditSaving] = useState(false);
  const [dayHint, setDayHint] = useState(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [employeePickerFilter, setEmployeePickerFilter] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [markingAbsents, setMarkingAbsents] = useState(false);
  const [syncingPunches, setSyncingPunches] = useState(false);
  const [gapCounts, setGapCounts] = useState(null);
  const [clockDeviceCount, setClockDeviceCount] = useState(null);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  const loadActive = useCallback(async () => {
    setActiveLoading(true);
    if (!fieldAttendanceEnabled) {
      setTodayFieldSessions([]);
    }
    try {
      const requestDefs = [
        {
          key: "sessions",
          promise: apiRequest("/attendance/clock-sessions", {
            searchParams: { per_page: 200, today: 1 },
          }),
        },
        {
          key: "todayAttendance",
          promise: apiRequest("/employee-attendance", {
            searchParams: {
              from_date: todayCalendarDate(),
              to_date: todayCalendarDate(),
              per_page: 200,
              page: 1,
            },
          }),
        },
        {
          key: "gaps",
          promise: apiRequest("/attendance/missed-punches"),
        },
        {
          key: "clockDevices",
          promise: apiRequest("/attendance-clock-devices", { searchParams: { per_page: 5 } }),
        },
      ];

      if (fieldAttendanceEnabled) {
        requestDefs.push({
          key: "fieldSessions",
          promise: apiRequest("/attendance/field-sessions", {
            searchParams: {
              from_date: todayCalendarDate(),
              to_date: todayCalendarDate(),
              per_page: 200,
            },
          }),
        });
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
        if (key === "todayAttendance") setTodayRecords(res.data ?? []);
        if (key === "fieldSessions") setTodayFieldSessions(res.data ?? []);
        if (key === "gaps") setGapCounts(res.counts ?? null);
        if (key === "clockDevices") {
          const total = Number(res.meta?.total ?? res.total ?? (res.data ?? []).length ?? 0);
          setClockDeviceCount(Number.isFinite(total) ? total : (res.data ?? []).length);
        }
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
  }, [fieldAttendanceEnabled]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const attendanceRes = await apiRequest("/employee-attendance", {
        searchParams: {
          per_page: historyPageSize,
          page: historyPage,
          from_date: appliedHistoryFrom,
          to_date: appliedHistoryTo,
          ...(appliedSearch ? { q: appliedSearch } : {}),
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
  }, [appliedSearch, appliedHistoryFrom, appliedHistoryTo, historyPage, historyPageSize, clearSelection]);

  useEffect(() => {
    setHistoryPage(1);
  }, [appliedSearch, appliedHistoryFrom, appliedHistoryTo]);

  const recordPageIds = useMemo(() => records.map((r) => r.id), [records]);

  const selectedRecords = useMemo(
    () => records.filter((r) => selectedIds.has(String(r.id))),
    [records, selectedIds],
  );

  const selectedWaiveableCount = useMemo(
    () =>
      selectedRecords.filter(
        (r) => attendanceLatenessParts(r).total > 0 && !r.lateness_waived && !r.pending_waiver,
      ).length,
    [selectedRecords],
  );

  const selectedUndoWaiveCount = useMemo(
    () =>
      selectedRecords.filter(
        (r) => attendanceLatenessParts(r).total > 0 && r.lateness_waived && !r.pending_waiver,
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

  useTabAwareDataLoad(isHistory ? loadHistory : loadActive);

  function sessionEmployeeLabel(s) {
    return (
      composeEmployeeDisplayName(s?.employee) ||
      s?.employee_name ||
      s?.user_name ||
      s?.username ||
      (s?.employee_id != null ? `#${s.employee_id}` : "—")
    );
  }

  function attendanceSourceKey(source) {
    if (source === "field_rep") return "field_rep";
    if (source === "company_mobile") return "company_mobile";
    if (source === "hr_applied") return "hr_applied";
    if (source === "manual") return "manual";
    return source || "clock_device";
  }

  function sessionTimestamp(value) {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  function sessionTimeLabel(value) {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      const text = String(value);
      return text.slice(11, 16) || text;
    }
    return new Intl.DateTimeFormat("en-KE", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
  }

  function sessionHm(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value).slice(11, 16);
    }
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
  }

  function sessionCalendarDate(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value).slice(0, 10);
    }
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsed);
  }

  function attendanceDateTime(date, time) {
    if (!date || !time) return null;
    const hm = String(time).length >= 8 ? String(time).slice(0, 8) : `${String(time).slice(0, 5)}:00`;
    return `${String(date).slice(0, 10)}T${hm}+03:00`;
  }

  const todaySessions = useMemo(
    () => [...sessions].sort((a, b) => sessionTimestamp(a.clock_in_at) - sessionTimestamp(b.clock_in_at)),
    [sessions],
  );

  const todayDays = useMemo(() => {
    const byEmployeeSource = new Map();
    for (const session of todaySessions) {
      const key = `${session.employee_id}:${attendanceSourceKey(session.source)}`;
      if (!byEmployeeSource.has(key)) byEmployeeSource.set(key, []);
      byEmployeeSource.get(key).push(session);
    }
    const fromSessions = [...byEmployeeSource.values()].map((group) => {
      const sorted = [...group].sort(
        (a, b) => sessionTimestamp(a.clock_in_at) - sessionTimestamp(b.clock_in_at),
      );
      const employee = sorted[0]?.employee;
      const source = attendanceSourceKey(sorted[sorted.length - 1]?.source || sorted[0]?.source);
      const dayDate = calendarDateInTimezone(new Date(sessionTimestamp(sorted[0]?.clock_in_at)))
        ?? todayCalendarDate();
      const lunch = source === "field_rep" ? false : shiftLunchRequired(employee?.shift, dayDate);
      const first = sorted[0];
      const second = sorted[1];
      const last = sorted[sorted.length - 1];
      let lunchOut = null;
      let lunchIn = null;
      let clockOut = last?.clock_out_at ?? null;
      if (lunch) {
        if (second) {
          lunchOut = first?.clock_out_at ?? null;
          lunchIn = second?.clock_in_at ?? null;
          clockOut = last?.clock_out_at ?? null;
        } else if (first?.clock_out_at) {
          if (isEndOfDayClockOut(first.clock_out_at, employee?.shift, dayDate)) {
            clockOut = first.clock_out_at;
          } else {
            lunchOut = first.clock_out_at;
            clockOut = null;
          }
        } else {
          clockOut = null;
        }
      }
      let status = "on_shift";
      if (clockOut) status = "clocked_out";
      else if (lunchOut && !lunchIn) status = "at_lunch";
      const hoursWorked = elapsedAttendanceHours({
        clockIn: first?.clock_in_at ?? null,
        clockOut,
        lunchOut,
        lunchIn,
        lunchRequired: lunch,
        nowMs,
      });
      return {
        rowKey: `${first?.employee_id}:${source}`,
        employeeId: first?.employee_id,
        employee,
        sessions: sorted,
        lastSession: last,
        clockIn: first?.clock_in_at ?? null,
        lunchOut,
        lunchIn,
        clockOut,
        lunchRequired: lunch,
        status,
        hoursWorked,
        device: last?.device_identifier || first?.device_identifier,
        source,
        attendanceRecord: null,
      };
    });
    const seenKeys = new Set(fromSessions.map((day) => day.rowKey));
    const fromRecords = todayRecords.flatMap((row) => {
      const source = attendanceSourceKey(row.source);
      const rowKey = `${row.employee_id}:${source}`;
      if (seenKeys.has(rowKey)) {
        const existing = fromSessions.find((day) => day.rowKey === rowKey);
        if (existing && !existing.attendanceRecord) existing.attendanceRecord = row;
        return [];
      }
      seenKeys.add(rowKey);
      const date = String(row.attendance_date ?? "").slice(0, 10);
      const clockIn = attendanceDateTime(date, row.clock_in || row.check_in);
      const clockOut = attendanceDateTime(date, row.clock_out || row.check_out);
      const lunchOut = attendanceDateTime(date, row.lunch_out);
      const lunchIn = attendanceDateTime(date, row.lunch_in);
      const lunchRequired = source === "field_rep" ? false : row.lunch_required !== false;
      const hoursWorked = clockOut
        ? Number(row.hours_worked ?? 0)
        : elapsedAttendanceHours({
            clockIn,
            clockOut: null,
            lunchOut: lunchRequired ? lunchOut : null,
            lunchIn: lunchRequired ? lunchIn : null,
            lunchRequired,
            nowMs,
          });
      return [{
        rowKey,
        employeeId: row.employee_id,
        employee: row.employee,
        sessions: [],
        lastSession: {
          employee: row.employee,
          employee_id: row.employee_id,
          source: row.source,
          device_identifier: row.device_identifier,
        },
        clockIn,
        lunchOut,
        lunchIn,
        clockOut,
        lunchRequired,
        status: clockOut ? "clocked_out" : lunchOut && !lunchIn ? "at_lunch" : "on_shift",
        hoursWorked,
        device: row.device_identifier,
        source,
        attendanceRecord: row,
      }];
    });
    const byFieldUser = new Map();
    for (const session of todayFieldSessions) {
      const userId = String(session.user_id ?? session.id);
      if (!byFieldUser.has(userId)) byFieldUser.set(userId, []);
      byFieldUser.get(userId).push(session);
    }
    const fromField = [...byFieldUser.values()].flatMap((group) => {
      const sorted = [...group].sort(
        (a, b) => sessionTimestamp(a.sign_in_at) - sessionTimestamp(b.sign_in_at),
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const employeeId = first?.hr_link?.employee_id ?? null;
      const rowKey = employeeId != null ? `${employeeId}:field_rep` : `user:${first?.user_id}:field_rep`;
      if (seenKeys.has(rowKey)) return [];
      seenKeys.add(rowKey);
      const employeeName = first?.hr_link?.employee_name || first?.user_name || first?.username;
      const clockOut = last?.sign_out_at ?? null;
      const hoursWorked = clockOut
        ? sorted.reduce((sum, item) => sum + Number(item.work_hours ?? 0), 0)
        : elapsedAttendanceHours({
            clockIn: first?.sign_in_at ?? null,
            clockOut: null,
            lunchOut: null,
            lunchIn: null,
            lunchRequired: false,
            nowMs,
          });
      let status = "on_shift";
      if (clockOut) status = "clocked_out";
      else if (last?.is_suspended) status = "at_lunch";
      return [{
        rowKey,
        employeeId: employeeId ?? `user:${first?.user_id}`,
        employee: employeeId ? { id: employeeId, full_name: employeeName } : null,
        sessions: [],
        lastSession: {
          employee: employeeId ? { id: employeeId, full_name: employeeName } : null,
          employee_id: employeeId,
          employee_name: employeeName,
          user_name: first?.user_name,
          username: first?.username,
          source: "field_rep",
          device_identifier: last?.device_identifier || first?.device_identifier,
        },
        clockIn: first?.sign_in_at ?? null,
        lunchOut: null,
        lunchIn: null,
        clockOut,
        lunchRequired: false,
        status,
        hoursWorked,
        device: last?.device_identifier || first?.device_identifier,
        source: "field_rep",
        attendanceRecord: null,
      }];
    });
    return [...fromSessions, ...fromRecords, ...fromField];
  }, [todaySessions, todayRecords, todayFieldSessions, nowMs]);

  const filteredTodayDays = useMemo(() => {
    const q = todaySearch.trim().toLowerCase();
    if (!q) return todayDays;
    return todayDays.filter((day) => {
      const employee = day.employee ?? day.lastSession?.employee;
      const haystack = [
        sessionEmployeeLabel(day.lastSession),
        composeEmployeeDisplayName(employee),
        employee?.full_name,
        employee?.first_name,
        employee?.last_name,
        employee?.employee_code,
        day.lastSession?.employee_name,
        day.lastSession?.user_name,
        day.lastSession?.username,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [todayDays, todaySearch]);

  const todayTotal = filteredTodayDays.length;
  const todayTotalPages = Math.max(1, Math.ceil(todayTotal / todayPageSize) || 1);
  const todaySafePage = Math.min(todayPage, todayTotalPages);
  const pagedTodayDays = filteredTodayDays.slice(
    (todaySafePage - 1) * todayPageSize,
    todaySafePage * todayPageSize,
  );

  useEffect(() => {
    setTodayPage(1);
  }, [todaySearch, todayPageSize]);

  const showDeviceColumn = clockDeviceCount == null || clockDeviceCount > 1;

  function parseClockMinutes(value) {
    const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function sessionMinutes(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-KE", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(parsed);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  }

  function shiftHoursForDate(shift, dateStr) {
    if (!shift) {
      return { lunch_required: true, end_minutes: 17 * 60 };
    }
    const weekday = new Date(`${dateStr}T12:00:00+03:00`).getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const useAlternate =
      isWeekend &&
      !!shift.use_alternate_hours &&
      !!(shift.alternate_start_time && shift.alternate_end_time);
    const start = useAlternate ? shift.alternate_start_time : shift.start_time;
    const end = useAlternate ? shift.alternate_end_time : shift.end_time;
    let lunchRequired = shift.lunch_required !== false;
    if (shift.lunch_minutes != null) lunchRequired = lunchRequired && Number(shift.lunch_minutes) > 0;
    const hasLunchOverride =
      shift.alternate_lunch_minutes != null || shift.alternate_lunch_required != null;
    if (isWeekend && hasLunchOverride) {
      lunchRequired =
        shift.alternate_lunch_required !== false && Number(shift.alternate_lunch_minutes ?? 0) > 0;
    } else if (useAlternate && lunchRequired) {
      const startMin = parseClockMinutes(start);
      const endMin = parseClockMinutes(end);
      if (startMin != null && endMin != null) {
        const span = endMin >= startMin ? endMin - startMin : 24 * 60 - startMin + endMin;
        if (span > 0 && span < 6 * 60) lunchRequired = false;
      }
    }
    return {
      lunch_required: lunchRequired,
      end_minutes: parseClockMinutes(end) ?? 17 * 60,
    };
  }

  function shiftLunchRequired(shift, dateStr) {
    return shiftHoursForDate(shift, dateStr).lunch_required;
  }

  function isEndOfDayClockOut(clockOutAt, shift, dateStr) {
    const punch = sessionMinutes(clockOutAt);
    if (punch == null) return false;
    const end = shiftHoursForDate(shift, dateStr).end_minutes;
    if (punch >= end - 60) return true;
    return Math.floor(punch / 60) >= 16;
  }

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
      lunch_out: record.lunch_out?.slice?.(0, 5) ?? "",
      lunch_in: record.lunch_in?.slice?.(0, 5) ?? "",
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

  function openPunchEdit(day) {
    setPunchEditDay(day);
    setPunchEditIn(sessionHm(day.clockIn));
    setPunchEditLunchOut(sessionHm(day.lunchOut));
    setPunchEditLunchIn(sessionHm(day.lunchIn));
    setPunchEditOut(sessionHm(day.clockOut));
  }

  async function savePunchEdit(e) {
    e.preventDefault();
    const inApi = formatTimeForApi(punchEditIn);
    if (!inApi) {
      notifyError("Set a clock-in time.");
      return;
    }
    const lunchOutApi = punchEditLunchOut ? formatTimeForApi(punchEditLunchOut) : null;
    const lunchInApi = punchEditLunchIn ? formatTimeForApi(punchEditLunchIn) : null;
    const outApi = punchEditOut ? formatTimeForApi(punchEditOut) : null;
    if (lunchInApi && !lunchOutApi) {
      notifyError("Set lunch out before lunch in.");
      return;
    }
    const first = punchEditDay?.sessions?.[0];
    const date =
      sessionCalendarDate(first?.clock_in_at || punchEditDay.clockIn) ||
      todayCalendarDate();
    if (!punchEditDay?.employeeId) {
      notifyError("Employee is missing for this attendance row.");
      return;
    }
    setPunchEditSaving(true);
    try {
      await apiRequest("/attendance/clock-sessions/day-times", {
        method: "POST",
        body: {
          employee_id: Number(punchEditDay.employeeId),
          attendance_date: date,
          clock_in_at: `${date} ${inApi}`,
          lunch_out_at: lunchOutApi ? `${date} ${lunchOutApi}` : null,
          lunch_in_at: lunchInApi ? `${date} ${lunchInApi}` : null,
          clock_out_at: outApi ? `${date} ${outApi}` : null,
        },
      });
      notifySuccess("Punch times updated.");
      setPunchEditDay(null);
      await loadActive();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not update punch times");
    } finally {
      setPunchEditSaving(false);
    }
  }

  async function deleteClockSession(session) {
    const name = sessionEmployeeLabel(session);
    const ok = await confirm(
      confirmDeleteOptions(
        `this punch for ${name}`,
        `Delete the ${sessionTimeLabel(session.clock_in_at)}${session.clock_out_at ? `–${sessionTimeLabel(session.clock_out_at)}` : ""} punch for ${name}? The attendance day is rebuilt from remaining punches.`,
      ),
    );
    if (!ok) return;
    try {
      await apiRequest(`/attendance/clock-sessions/${session.id}`, { method: "DELETE" });
      notifySuccess("Punch deleted.");
      await loadActive();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  async function deleteRecord(record) {
    const ok = await confirm(confirmDeleteOptions("this attendance record"));
    if (!ok) return;
    try {
      await apiRequest(`/employee-attendance/${record.id}`, { method: "DELETE" });
      if (isHistory) await loadHistory();
      else await loadActive();
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
      (r) => attendanceLatenessParts(r).total > 0 && !r.pending_waiver,
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
        ? `Approve waiving ${pending.late_minutes ?? attendanceLatenessParts(record).total}m late (clock-in and lunch)? Paid hours will be restored for payroll.`
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

  async function syncFromDevices() {
    setSyncingPunches(true);
    try {
      const body =
        isHistory
          ? { from: appliedHistoryFrom, to: appliedHistoryTo }
          : {};
      let result;
      try {
        result = await apiRequest("/attendance/sync-from-devices", {
          method: "POST",
          body,
        });
      } catch (e) {
        const missing =
          e instanceof ApiError &&
          (e.status === 404 || /could not be found/i.test(String(e.message || "")));
        if (!missing) throw e;
        result = await fallbackSyncFromClockDevices(body);
      }
      const devices = Number(result.devices ?? 0);
      const pulled = Number(result.pulled ?? 0);
      const applied = Number(result.applied ?? 0);
      const retried = Number(result.retried ?? 0);
      const duplicates = Number(result.duplicates ?? 0);
      if (devices === 0) {
        notifySuccess("No Hikvision clocks to sync. Attendance list refreshed.");
      } else {
        notifySuccess(
          `Synced ${devices} clock${devices === 1 ? "" : "s"} — pulled ${pulled}, applied ${applied}` +
            (retried ? `, retried ${retried}` : "") +
            (duplicates ? `, ${duplicates} duplicate${duplicates === 1 ? "" : "s"} logged` : "") +
            ".",
        );
      }
      if (result.errors?.length) {
        notifyError(String(result.errors[0]));
      }
      if (isHistory) {
        await loadHistory();
      } else {
        await loadActive();
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not sync punches");
    } finally {
      setSyncingPunches(false);
    }
  }

  async function fallbackSyncFromClockDevices(body) {
    const listRes = await apiRequest("/attendance-clock-devices", {
      searchParams: { per_page: 200 },
    });
    const rows = Array.isArray(listRes?.data) ? listRes.data : Array.isArray(listRes) ? listRes : [];
    const clocks = rows.filter(
      (row) =>
        String(row.provider || "").toLowerCase() === "hikvision" &&
        row.is_active !== false &&
        String(row.host || "").trim() !== "",
    );
    const summary = {
      devices: clocks.length,
      pulled: 0,
      stored: 0,
      applied: 0,
      skipped: 0,
      duplicates: 0,
      retried: 0,
      errors: [],
    };
    for (const device of clocks) {
      try {
        const result = await apiRequest(`/attendance-clock-devices/${device.id}/hikvision/sync/attendance`, {
          method: "POST",
          body,
        });
        summary.pulled += Number(result.pulled ?? 0);
        summary.stored += Number(result.stored ?? 0);
        summary.applied += Number(result.applied ?? 0);
        summary.skipped += Number(result.skipped ?? 0);
        summary.duplicates += Number(result.duplicates ?? 0);
        summary.retried += Number(result.retried ?? 0);
        for (const error of result.errors ?? []) {
          summary.errors.push(error);
        }
      } catch (err) {
        const label = String(device.device_no || device.id);
        const message = err instanceof ApiError ? err.message : "Sync failed";
        summary.errors.push(`${label}: ${message}`);
      }
    }
    return summary;
  }

  async function markMissingAsAbsent() {
    const ok = await confirm({
      title: "Mark missing as absent?",
      message: `For ${appliedHistoryFrom} to ${appliedHistoryTo}, create absent records for active employees who were scheduled to work but have no attendance. Today and future dates are never marked. Leave/off days are skipped.`,
      confirmLabel: "Mark absents",
    });
    if (!ok) return;

    setMarkingAbsents(true);
    try {
      const res = await apiRequest("/employee-attendance/mark-absents", {
        method: "POST",
        body: {
          from_date: appliedHistoryFrom,
          to_date: appliedHistoryTo,
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
        `Request to waive ${attendanceLatenessParts(record).total} minutes late for ${composeEmployeeDisplayName(record.employee) || "employee"}?\nRequires manager approval. Optional reason:`,
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
        const lunchOutApi =
          timesRequired && lunchAppliesToSelection && manualForm.lunch_taken
            ? formatTimeForApi(manualForm.lunch_out)
            : null;
        const lunchInApi =
          timesRequired && lunchAppliesToSelection && manualForm.lunch_taken
            ? formatTimeForApi(manualForm.lunch_in)
            : null;
        if (manualForm.lunch_taken && lunchAppliesToSelection && (lunchInApi || lunchOutApi) && (!lunchOutApi || !lunchInApi)) {
          setManualError("Set both lunch out and lunch in, or leave both blank.");
          setManualSaving(false);
          return;
        }
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
        if (checkInApi) {
          await apiRequest("/attendance/clock-sessions/day-times", {
            method: "POST",
            body: {
              employee_id: Number(manualForm.employee_id),
              attendance_date: manualForm.attendance_date,
              clock_in_at: `${manualForm.attendance_date} ${checkInApi}`,
              lunch_out_at: lunchOutApi ? `${manualForm.attendance_date} ${lunchOutApi}` : null,
              lunch_in_at: lunchInApi ? `${manualForm.attendance_date} ${lunchInApi}` : null,
              clock_out_at: checkOutApi ? `${manualForm.attendance_date} ${checkOutApi}` : null,
            },
          });
        }
        setManualOpen(false);
        setEditingRecord(null);
        setManualForm(EMPTY_MANUAL);
        setDayHint(null);
        setBulkResult(null);
        if (isHistory) await loadHistory();
        else await loadActive();
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
        if (isHistory) await loadHistory();
        else await loadActive();
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
      title={isHistory ? "Previous attendance" : "Today's attendance"}
      subtitle={
        isHistory
          ? "Yesterday’s clock-in records by default. Change the dates or search by employee name."
          : "Who is in today — office clocks, company phone, mobile sales route, and manual entries"
      }
      action={
        <HrPageActions>
          <Link href={isHistory ? "/hr/attendance" : "/hr/attendance/history"} className={SECONDARY_BTN_CLASS}>
            {isHistory ? "Today's attendance" : "Previous attendance"}
          </Link>
          <button
            type="button"
            disabled={syncingPunches || activeLoading || historyLoading}
            onClick={() => void syncFromDevices()}
            className={SECONDARY_BTN_CLASS}
          >
            {syncingPunches ? "Refreshing…" : "Refresh attendance"}
          </button>
          {!isHistory ? (
            <CatalogListExport
              title="Today's attendance"
              filename="todays-attendance"
              columns={[
                { key: "employee", label: "Employee" },
                { key: "status", label: "Status" },
                { key: "clock_in", label: "Clock in" },
                { key: "lunch_out", label: "Lunch out" },
                { key: "lunch_in", label: "Lunch in" },
                { key: "clock_out", label: "Clock out" },
                { key: "hours_worked", label: "No of hours worked", align: "right" },
                { key: "device", label: "Device" },
                { key: "source", label: "Source" },
              ]}
              totalCount={filteredTodayDays.length}
              getInlineRows={async () =>
                filteredTodayDays.map((day) => ({
                  employee: sessionEmployeeLabel(day.lastSession),
                  status:
                    day.status === "clocked_out"
                      ? "Left for home"
                      : day.status === "at_lunch"
                        ? "At lunch"
                        : "On shift",
                  clock_in: sessionTimeLabel(day.clockIn),
                  lunch_out: day.lunchRequired ? sessionTimeLabel(day.lunchOut) : "",
                  lunch_in: day.lunchRequired ? sessionTimeLabel(day.lunchIn) : "",
                  clock_out: sessionTimeLabel(day.clockOut),
                  hours_worked: formatHoursWorked(day.hoursWorked),
                  device: day.device || "",
                  source: formatAttendanceSource(day.source),
                }))
              }
              disabled={activeLoading}
            />
          ) : null}
          {canAddManualAttendance ? (
            <PrimaryButton type="button" onClick={openCreateManual}>
              Add Manual attendance
            </PrimaryButton>
          ) : null}
          {isHistory ? (
            <>
            <CatalogListExport
              title="Previous attendance"
              apiPath="/employee-attendance"
              columns={ATTENDANCE_EXPORT_COLUMNS}
              totalCount={recordsTotal || records.length}
              getSearchParams={() => ({
                per_page: 200,
                from_date: appliedHistoryFrom,
                to_date: appliedHistoryTo,
                ...(appliedSearch ? { q: appliedSearch } : {}),
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
            </>
          ) : null}
        </HrPageActions>
      }
    >
      {!isHistory ? (
        <>
          {fieldAttendanceEnabled ? (
            <FieldRepHrLinkageBanner linkage={fieldRepLinkage} canManage={canManageSettings} />
          ) : null}

          <AttendanceGapsBanner counts={gapCounts} />

          {canManageSettings ? (
            <p className="mb-4 text-sm text-slate-600">
              Attendance capture mode and device setup are in{" "}
              <Link href="/admin/settings" className="font-medium text-[#185FA5] hover:underline">
                Admin → Settings → HR &amp; Payroll
              </Link>
              . Unmapped or failed terminal scans are on{" "}
              <Link href="/hr/missed-punches" className="font-medium text-[#185FA5] hover:underline">
                Missed punches
              </Link>
              . Extra scans in the same hour are on{" "}
              <Link href="/hr/duplicate-punches" className="font-medium text-[#185FA5] hover:underline">
                Duplicate punches
              </Link>
              .
            </p>
          ) : (
            <p className="mb-4 text-sm text-slate-600">
              Terminal punches that did not apply are listed under{" "}
              <Link href="/hr/missed-punches" className="font-medium text-[#185FA5] hover:underline">
                Missed punches
              </Link>
              . Extra scans in the same hour are on{" "}
              <Link href="/hr/duplicate-punches" className="font-medium text-[#185FA5] hover:underline">
                Duplicate punches
              </Link>
              .
            </p>
          )}

          <HrFilterToolbar>
            <Field label="Search employee">
              <SearchInput
                value={todaySearch}
                onChange={(e) => setTodaySearch(e.target.value)}
                placeholder="Search by employee name"
              />
            </Field>
          </HrFilterToolbar>

          <section className="mb-8 theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-medium text-slate-900">Today</h2>
              <p className="mt-1 text-sm text-slate-500">
                One table for every capture method. Source shows whether the row came from a
                fingerprint or clock device, a company phone on premises, the mobile sales app, or
                attendance added by HR.
              </p>
            </div>
            {activeLoading ? (
              <p className="px-5 py-6 text-sm text-slate-500">Loading…</p>
            ) : todayDays.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No attendance recorded yet today.</p>
            ) : filteredTodayDays.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                No employees match “{todaySearch.trim()}”.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Clock in</th>
                      <th className="px-4 py-3">Lunch out</th>
                      <th className="px-4 py-3">Lunch in</th>
                      <th className="px-4 py-3">Clock out</th>
                      <th className="px-4 py-3">No of hours worked</th>
                      {showDeviceColumn ? <th className="px-4 py-3">Device</th> : null}
                      <th className="px-4 py-3">Source</th>
                      {canManageSettings ? <th className="px-4 py-3 text-right">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedTodayDays.map((day) => (
                      <tr key={day.rowKey || `${day.employeeId}:${day.source}`} className="theme-table-body-row">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {sessionEmployeeLabel(day.lastSession)}
                        </td>
                        <td className="px-4 py-3">
                          {day.status === "clocked_out" ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                              Left for home
                            </span>
                          ) : day.status === "at_lunch" ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                              At lunch
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">
                              On shift
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">{sessionTimeLabel(day.clockIn)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {day.lunchRequired ? sessionTimeLabel(day.lunchOut) : "—"}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {day.lunchRequired ? sessionTimeLabel(day.lunchIn) : "—"}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">{sessionTimeLabel(day.clockOut)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {formatHoursWorked(day.hoursWorked)}
                          {day.hoursWorked != null && !day.clockOut ? (
                            <span className="text-slate-400"> so far</span>
                          ) : null}
                        </td>
                        {showDeviceColumn ? (
                          <td className="px-4 py-3 text-slate-600">{day.device || "—"}</td>
                        ) : null}
                        <td className="px-4 py-3 text-slate-600">{formatAttendanceSource(day.source)}</td>
                        {canManageSettings ? (
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex justify-end gap-1">
                              {day.sessions?.length ? (
                                <>
                                  <IconButton label="Edit times" onClick={() => openPunchEdit(day)}>
                                    <PencilIcon />
                                  </IconButton>
                                  <IconButton
                                    label="Delete last punch"
                                    danger
                                    onClick={() => void deleteClockSession(day.lastSession)}
                                  >
                                    <TrashIcon />
                                  </IconButton>
                                </>
                              ) : day.attendanceRecord ? (
                                <>
                                  <IconButton
                                    label="Edit attendance"
                                    onClick={() => openEditManual(day.attendanceRecord)}
                                  >
                                    <PencilIcon />
                                  </IconButton>
                                  <IconButton
                                    label="Delete attendance"
                                    danger
                                    onClick={() => void deleteRecord(day.attendanceRecord)}
                                  >
                                    <TrashIcon />
                                  </IconButton>
                                </>
                              ) : null}
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
              page={todaySafePage}
              totalPages={todayTotalPages}
              total={todayTotal}
              pageSize={todayPageSize}
              onChange={setTodayPage}
              onPageSizeChange={(size) => {
                setTodayPageSize(size);
                setTodayPage(1);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          </section>
        </>
      ) : (
        <>
          <HrFilterToolbar>
            <HrDateField label="From" value={historyFromDate} onChange={setHistoryFromDate} />
            <HrDateField label="To" value={historyToDate} onChange={setHistoryToDate} />
            <Field label="Search employee">
              <SearchInput
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                placeholder="Search by employee name"
              />
            </Field>
            <HrFilterButton
              loading={historyLoading}
              onClick={() => {
                const nextSearch = recordSearch.trim();
                setAppliedHistoryFrom(historyFromDate);
                setAppliedHistoryTo(historyToDate);
                setAppliedSearch(nextSearch);
                setHistoryPage(1);
                if (
                  historyFromDate === appliedHistoryFrom &&
                  historyToDate === appliedHistoryTo &&
                  nextSearch === appliedSearch
                ) {
                  void loadHistory();
                }
              }}
            />
          </HrFilterToolbar>

          <section className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-medium text-slate-900">Previous attendance</h2>
              <p className="mt-1 text-sm text-slate-500">
                Showing yesterday unless you change the date range. Search by employee name to narrow
                the list. Includes clock device, company phone, mobile sales route, and manual entries.
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
                    <th className="px-4 py-3">Clock in</th>
                    <th className="px-4 py-3">Lunch out</th>
                    <th className="px-4 py-3">Lunch in</th>
                    <th className="px-4 py-3">Clock out</th>
                    <th className="px-4 py-3">No of hours worked</th>
                    <th className="px-4 py-3">Late (in / lunch / total)</th>
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
                      <td colSpan={15} className="px-4 py-8 text-center text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-4 py-8 text-center text-slate-500">
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
                        <td className="px-4 py-3">{r.clock_in ?? r.check_in?.slice?.(0, 5) ?? "—"}</td>
                        <td className="px-4 py-3">
                          {r.lunch_required === false ? "—" : (r.lunch_out ?? "—")}
                        </td>
                        <td className="px-4 py-3">
                          {r.lunch_required === false ? "—" : (r.lunch_in ?? "—")}
                        </td>
                        <td className="px-4 py-3">{r.clock_out ?? r.check_out?.slice?.(0, 5) ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {formatHoursWorked(r.hours_worked)}
                          {r.expected_hours != null ? (
                            <span className="text-slate-400"> / {formatHoursWorked(r.expected_hours)} exp.</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {attendanceLatenessParts(r).total > 0 ? (
                            <span>
                              {formatAttendanceLateness(r, "")}
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
                          <div className="inline-flex flex-wrap items-center justify-end gap-1">
                            <IconButton label="Edit" onClick={() => openEditManual(r)}>
                              <PencilIcon />
                            </IconButton>
                            {r.pending_waiver && canReviewWaiver(r) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void reviewWaiverRequest(r, true)}
                                  className="ml-1 text-emerald-700 hover:underline"
                                >
                                  Approve waive
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void reviewWaiverRequest(r, false)}
                                  className="ml-1 text-amber-800 hover:underline"
                                >
                                  Reject
                                </button>
                              </>
                            ) : null}
                            {r.pending_waiver && !canReviewWaiver(r) ? (
                              <span className="ml-1 text-xs text-amber-700">Awaiting manager</span>
                            ) : null}
                            {attendanceLatenessParts(r).total > 0 && !r.lateness_waived && !r.pending_waiver ? (
                              <button
                                type="button"
                                onClick={() => void waiveLateness(r, true)}
                                className="ml-1 text-emerald-700 hover:underline"
                              >
                                Request waive
                              </button>
                            ) : null}
                            {attendanceLatenessParts(r).total > 0 && r.lateness_waived && !r.pending_waiver ? (
                              <button
                                type="button"
                                onClick={() => void waiveLateness(r, false)}
                                className="ml-1 text-amber-700 hover:underline"
                              >
                                Request undo
                              </button>
                            ) : null}
                            <IconButton label="Delete" danger onClick={() => void deleteRecord(r)}>
                              <TrashIcon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
                page={historyPage}
                totalPages={Math.max(1, Math.ceil(recordsTotal / historyPageSize) || 1)}
                total={recordsTotal}
                pageSize={historyPageSize}
                onChange={setHistoryPage}
                onPageSizeChange={(size) => {
                  setHistoryPageSize(size);
                  setHistoryPage(1);
                }}
                pageSizeOptions={[10, 25, 50, 100]}
              />
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
        title={editingRecord ? "Edit attendance" : "Add Manual attendance"}
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
              ? `Add for ${selectedEmployeeIds.length} employees`
              : selectedEmployeeIds.length === 1
                ? "Add Manual attendance"
                : "Add Manual attendance"
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
            ). You cannot add a second record — edit the existing one in Previous attendance.
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
                {manualForm.lunch_taken ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <HrTimePickerField
                      label="Lunch out"
                      value={manualForm.lunch_out}
                      onChange={(v) => updateManualTime("lunch_out", v)}
                      defaultPeriod="PM"
                    />
                    <HrTimePickerField
                      label="Lunch in"
                      value={manualForm.lunch_in}
                      onChange={(v) => updateManualTime("lunch_in", v)}
                      defaultPeriod="PM"
                    />
                  </div>
                ) : null}
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
        {editingRecord && (attendanceLatenessParts(manualForm).total > 0 || attendanceLatenessParts(editingRecord).total > 0) ? (
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
                Waive lateness ({formatAttendanceLateness(editingRecord, `${attendanceLatenessParts(editingRecord).total}m`)})
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

      <FormDrawer
        title={`Edit punch times${punchEditDay ? ` — ${sessionEmployeeLabel(punchEditDay.lastSession)}` : ""}`}
        open={Boolean(punchEditDay)}
        onClose={() => setPunchEditDay(null)}
        onSubmit={savePunchEdit}
        saving={punchEditSaving}
        submitLabel="Save times"
      >
        <p className="text-sm text-slate-600">
          Correct clock in, lunch out, lunch in, and clock out. Hours and lateness are rebuilt from these
          punches.
        </p>
        <HrTimePickerField label="Clock in" value={punchEditIn} onChange={setPunchEditIn} required defaultPeriod="AM" />
        {punchEditDay?.lunchRequired !== false ? (
          <>
            <HrTimePickerField
              label="Lunch out"
              value={punchEditLunchOut}
              onChange={setPunchEditLunchOut}
              defaultPeriod="PM"
            />
            <HrTimePickerField
              label="Lunch in"
              value={punchEditLunchIn}
              onChange={setPunchEditLunchIn}
              defaultPeriod="PM"
            />
          </>
        ) : null}
        <HrTimePickerField
          label="Clock out"
          value={punchEditOut}
          onChange={setPunchEditOut}
          defaultPeriod="PM"
        />
      </FormDrawer>
    </CatalogPageShell>
  );
}
