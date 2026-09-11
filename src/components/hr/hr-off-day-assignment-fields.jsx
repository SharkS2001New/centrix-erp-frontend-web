"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Field, formatShortDate, inputClassName } from "@/components/catalog/catalog-shared";
import { HrSelectField } from "@/components/hr/hr-crud-page";
import { composeEmployeeDisplayName } from "@/components/hr/hr-shared";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";
import {
  isSingleDateLeaveDuration,
  LEAVE_DURATION_TYPES,
  leaveHoursAreValid,
  parseLeaveHours,
} from "@/lib/leave-duration";

const LEAVE_TYPE_OPTIONS = [
  { value: "unpaid", label: "Unpaid leave" },
  { value: "annual", label: "Annual leave" },
  { value: "sick", label: "Sick leave" },
];

const OFF_DAY_POOL_OPTIONS = [
  { value: "off_days", label: "Off days" },
  { value: "annual", label: "Annual leave" },
  { value: "sick", label: "Sick leave" },
];

function resolveSalaryDeductible(row) {
  if (row?.deduct_from === "unpaid" || row?.leave_type === "unpaid") return true;
  if (row?.salary_deductible != null) return Boolean(row.salary_deductible);
  return false;
}

function resolveBalancePool(row) {
  if (row?.deduct_from === "annual" || row?.deduct_from === "sick") return row.deduct_from;
  return "off_days";
}

export function buildOffDayEmptyForm(extra, row) {
  const today = new Date().toISOString().slice(0, 10);
  const assignmentKind = row?.assignment_kind === "off_day" ? "off_day" : "leave";
  const salaryDeductible = assignmentKind === "off_day" && resolveSalaryDeductible(row);

  return {
    employee_id: row?.employee_id != null ? String(row.employee_id) : extra?.presetEmployeeId ?? "",
    assignment_kind: assignmentKind,
    start_date: row?.start_date?.slice?.(0, 10) ?? row?.leave_date?.slice?.(0, 10) ?? today,
    end_date: row?.end_date?.slice?.(0, 10) ?? row?.leave_date?.slice?.(0, 10) ?? today,
    salary_deductible: salaryDeductible,
    deduct_from:
      assignmentKind === "leave"
        ? row?.deduct_from === "sick" || row?.deduct_from === "annual" || row?.deduct_from === "unpaid"
          ? row.deduct_from
          : "unpaid"
        : salaryDeductible
          ? "unpaid"
          : resolveBalancePool(row),
    duration_type: row?.duration_type ?? "full_day",
    half_day_period: row?.half_day_period ?? "morning",
    hours:
      row?.duration_type === "hourly"
        ? String(parseLeaveHours(row?.total_hours) || 1)
        : "1",
    notes: row?.notes ?? "",
  };
}

export function buildOffDayBody(form) {
  const assignmentKind = form.assignment_kind === "off_day" ? "off_day" : "leave";
  const salaryDeductible = assignmentKind === "off_day" && Boolean(form.salary_deductible);
  const deductFrom = salaryDeductible ? "unpaid" : (form.deduct_from ?? "unpaid");
  const leaveType =
    deductFrom === "annual" ? "annual" : deductFrom === "sick" ? "sick" : deductFrom === "unpaid" ? "unpaid" : "other";
  const singleDate = isSingleDateLeaveDuration(form.duration_type);

  return {
    employee_id: Number(form.employee_id),
    start_date: form.start_date,
    end_date: singleDate ? form.start_date : form.end_date,
    assignment_kind: assignmentKind,
    deduct_from: deductFrom,
    leave_type: leaveType,
    duration_type: form.duration_type,
    half_day_period: form.duration_type === "half_day" ? form.half_day_period : null,
    ...(form.duration_type === "hourly" ? { hours: parseLeaveHours(form.hours) } : {}),
    notes: form.notes.trim() || null,
  };
}

export function validateOffDayForm(form, extra) {
  if (!form.employee_id) return "Search and select an employee.";
  if (!form.notes?.trim()) return "Enter a reason for this leave application.";
  if (form.assignment_kind === "off_day" && !form.salary_deductible && !form.deduct_from) {
    return "Select which balance pool to use for this non-deductible off day.";
  }
  if (!form.start_date) return "Start date is required.";
  if (form.duration_type === "half_day") {
    if (!form.half_day_period) return "Select morning or afternoon for half day.";
  } else if (form.duration_type === "hourly") {
    if (!leaveHoursAreValid(form.hours)) {
      return "Enter how many hours of leave to apply for (at least 0.25).";
    }
  } else if (!form.end_date) {
    return "End date is required.";
  } else if (form.end_date < form.start_date) {
    return "End date must be on or after start date.";
  }

  const preview = extra?.leavePreview;
  if (preview && preview.can_assign === false) {
    return preview.balance_message ?? "Insufficient balance. Cannot assign.";
  }

  return null;
}

function deductFromLabel(value) {
  if (value === "annual") return "annual leave";
  if (value === "sick") return "sick leave";
  if (value === "unpaid") return "unpaid leave";
  return "off days";
}

function BalanceChip({ label, entitled, used, available, highlight = false }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        highlight
          ? "border-[#185FA5]/30 bg-[#E6F1FB]/40"
          : "border-slate-200 bg-slate-50/80"
      }`}
    >
      <p className="font-medium text-slate-800">{label}</p>
      <p className="mt-0.5 text-slate-600">
        <span className="font-semibold text-slate-900">{available}</span> available
        <span className="text-slate-400">
          {" "}
          · {used} used / {entitled} entitled
        </span>
      </p>
    </div>
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
  }));
}

export function HrOffDayAssignmentFields({ form, setForm, extra, setLeavePreview }) {
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [balances, setBalances] = useState(null);
  const [employeeLabel, setEmployeeLabel] = useState(extra?.presetEmployeeLabel ?? "");

  const isLeave = form.assignment_kind !== "off_day";
  const isHalfDay = form.duration_type === "half_day";
  const isHourly = form.duration_type === "hourly";
  const isSingleDate = isSingleDateLeaveDuration(form.duration_type);
  const salaryDeductible = !isLeave && Boolean(form.salary_deductible);
  const deductFrom = salaryDeductible ? "unpaid" : (form.deduct_from ?? (isLeave ? "unpaid" : "off_days"));
  const exceptLeaveId = extra?.editingRow?.id;

  const loadEmployeeOptions = useCallback(async (query) => searchEmployeeOptions(query), []);

  useEffect(() => {
    if (!form.employee_id) {
      setEmployeeLabel("");
      return;
    }
    if (extra?.presetEmployeeLabel) {
      setEmployeeLabel(extra.presetEmployeeLabel);
      return;
    }
    const row = extra?.editingRow?.employee;
    if (row && String(row.id) === String(form.employee_id)) {
      setEmployeeLabel(composeEmployeeDisplayName(row));
      return;
    }
    let cancelled = false;
    apiRequest(`/employees/${form.employee_id}`, { searchParams: { fields: "lean" } })
      .then((employee) => {
        if (!cancelled) setEmployeeLabel(composeEmployeeDisplayName(employee));
      })
      .catch(() => {
        if (!cancelled) setEmployeeLabel("");
      });
    return () => {
      cancelled = true;
    };
  }, [form.employee_id, extra?.editingRow?.employee, extra?.presetEmployeeLabel]);

  useEffect(() => {
    if (!form.employee_id) {
      setBalances(null);
      return;
    }
    let cancelled = false;
    const params = exceptLeaveId ? { except_leave_id: exceptLeaveId } : {};
    apiRequest(`/employees/${form.employee_id}/leave-balances`, { searchParams: params })
      .then((data) => {
        if (!cancelled) setBalances(data.balances ?? null);
      })
      .catch(() => {
        if (!cancelled) setBalances(null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.employee_id, exceptLeaveId]);

  useEffect(() => {
    if (!form.employee_id || !form.start_date || !deductFrom) {
      setPreview(null);
      setLeavePreview?.(null);
      return;
    }
    const endDate = isSingleDate ? form.start_date : form.end_date;
    if (!endDate) {
      setPreview(null);
      setLeavePreview?.(null);
      return;
    }
    if (isHourly && !leaveHoursAreValid(form.hours)) {
      setPreview(null);
      setLeavePreview?.(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    apiRequest("/employee-leave-days/calculate", {
      searchParams: {
        employee_id: form.employee_id,
        start_date: form.start_date,
        end_date: endDate,
        duration_type: form.duration_type,
        half_day_period: isHalfDay ? form.half_day_period : "",
        ...(isHourly ? { hours: parseLeaveHours(form.hours) } : {}),
        assignment_kind: form.assignment_kind === "off_day" ? "off_day" : "leave",
        deduct_from: deductFrom,
        ...(exceptLeaveId ? { except_leave_id: exceptLeaveId } : {}),
      },
    })
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setLeavePreview?.(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview(null);
          setLeavePreview?.(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    form.employee_id,
    form.start_date,
    form.end_date,
    form.duration_type,
    form.half_day_period,
    form.hours,
    form.assignment_kind,
    deductFrom,
    isHalfDay,
    isHourly,
    isSingleDate,
    exceptLeaveId,
    setLeavePreview,
  ]);

  const previewLabel = useMemo(() => {
    if (previewLoading) return "Calculating…";
    if (!preview) {
      return isHourly
        ? "Select employee, date, and hours to see totals."
        : "Select employee and dates to see totals.";
    }
    const days = Number(preview.working_days ?? preview.total_days);
    const hours = Number(preview.total_hours);
    const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
    const dayLabel =
      days === 1 ? "1 working day" : `${Number(days.toFixed(4))} working day${days === 1 ? "" : "s"}`;
    const span = isHourly ? hourLabel : `${dayLabel} · ${hourLabel}`;
    if (salaryDeductible) {
      return `${span} · deductible from salary`;
    }
    return isHourly
      ? `${span} · ${Number(days.toFixed(4))} day${days === 1 ? "" : "s"} from balance`
      : `${span} from balance`;
  }, [preview, previewLoading, salaryDeductible, isHourly]);

  const employeeOptions = useMemo(() => {
    if (!form.employee_id || !employeeLabel) return [];
    return [{ value: String(form.employee_id), label: employeeLabel }];
  }, [form.employee_id, employeeLabel]);

  return (
    <>
      <Field label="Employee">
        <PosSearchableSelect
          value={form.employee_id}
          onChange={(value) => setForm((prev) => ({ ...prev, employee_id: value }))}
          options={employeeOptions}
          loadOptions={loadEmployeeOptions}
          placeholder="Search employee by name or code…"
          searchPlaceholder="Type name, code, or payroll #…"
          idleSearchLabel="Type at least one character to search employees"
          emptyLabel="No matching employees"
          minSearchLength={1}
          inputClassName={inputClassName()}
        />
      </Field>

      <HrSelectField
        label="Application type"
        value={form.assignment_kind === "off_day" ? "off_day" : "leave"}
        onChange={(value) => {
          const offDay = value === "off_day";
          setForm((prev) => ({
            ...prev,
            assignment_kind: offDay ? "off_day" : "leave",
            deduct_from: offDay ? "off_days" : "unpaid",
            salary_deductible: false,
          }));
        }}
        options={[
          { value: "leave", label: "Leave (annual / sick / unpaid)" },
          { value: "off_day", label: "Off day" },
        ]}
      />

      {isLeave ? (
        <HrSelectField
          label="Leave type"
          value={deductFrom === "unpaid" ? "unpaid" : deductFrom === "sick" ? "sick" : "annual"}
          onChange={(value) => setForm((prev) => ({ ...prev, deduct_from: value, salary_deductible: false }))}
          options={LEAVE_TYPE_OPTIONS}
        />
      ) : (
        <>
          <HrSelectField
            label="Salary impact"
            value={salaryDeductible ? "deductible" : "non_deductible"}
            onChange={(value) => {
              const nextDeductible = value === "deductible";
              setForm((prev) => ({
                ...prev,
                salary_deductible: nextDeductible,
                deduct_from: nextDeductible
                  ? "unpaid"
                  : prev.deduct_from === "unpaid"
                    ? "off_days"
                    : (prev.deduct_from ?? "off_days"),
              }));
            }}
            options={[
              { value: "non_deductible", label: "Non-deductible — off day, no salary deduction" },
              { value: "deductible", label: "Deductible — off day, deduct from salary" },
            ]}
          />
          {!salaryDeductible ? (
            <HrSelectField
              label="Deduct from balance"
              value={deductFrom === "unpaid" ? "off_days" : deductFrom}
              onChange={(value) => setForm((prev) => ({ ...prev, deduct_from: value, salary_deductible: false }))}
              options={OFF_DAY_POOL_OPTIONS}
            />
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Deductible offs do not use leave/off balances. Payroll treats them as unpaid days.
            </p>
          )}
        </>
      )}

      {balances ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <BalanceChip
            label="Annual leave"
            entitled={balances.annual?.entitled ?? 0}
            used={balances.annual?.used ?? 0}
            available={balances.annual?.available ?? 0}
            highlight={deductFrom === "annual"}
          />
          <BalanceChip
            label="Sick leave"
            entitled={balances.sick?.entitled ?? 0}
            used={balances.sick?.used ?? 0}
            available={balances.sick?.available ?? 0}
            highlight={deductFrom === "sick"}
          />
          <BalanceChip
            label="Off days"
            entitled={balances.off_days?.entitled ?? 0}
            used={balances.off_days?.used ?? 0}
            available={balances.off_days?.available ?? 0}
            highlight={deductFrom === "off_days"}
          />
        </div>
      ) : null}

      <Field label="Start date">
        <input
          type="date"
          value={form.start_date}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              start_date: e.target.value,
              end_date: isSingleDateLeaveDuration(prev.duration_type) ? e.target.value : prev.end_date,
            }))
          }
          required
          className={inputClassName()}
        />
      </Field>

      <Field label="Duration">
        <select
          value={form.duration_type}
          onChange={(e) => {
            const duration_type = e.target.value;
            setForm((prev) => ({
              ...prev,
              duration_type,
              end_date: isSingleDateLeaveDuration(duration_type) ? prev.start_date : prev.end_date,
              hours: duration_type === "hourly" ? prev.hours || "1" : prev.hours,
            }));
          }}
          className={inputClassName()}
        >
          {LEAVE_DURATION_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      {isHalfDay ? (
        <HrSelectField
          label="Half day"
          value={form.half_day_period}
          onChange={(value) => setForm((prev) => ({ ...prev, half_day_period: value }))}
          options={[
            { value: "morning", label: "Morning" },
            { value: "afternoon", label: "Afternoon" },
          ]}
        />
      ) : isHourly ? (
        <Field label="Hours">
          <input
            type="number"
            min="0.25"
            step="0.25"
            max="24"
            value={form.hours}
            onChange={(e) => setForm((prev) => ({ ...prev, hours: e.target.value }))}
            required
            className={inputClassName()}
          />
          <p className="mt-1 text-xs text-slate-500">
            Time off on the start date — e.g. 1 hour to attend an appointment. Deducted from the leave
            balance as a fraction of the shift.
          </p>
        </Field>
      ) : (
        <Field label="End date">
          <input
            type="date"
            value={form.end_date}
            min={form.start_date}
            onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
            required
            className={inputClassName()}
          />
        </Field>
      )}

      <div
        className={`rounded-lg px-3 py-2 text-sm ${
          preview && !previewLoading
            ? preview.can_assign === false
              ? "border border-red-200 bg-red-50 text-red-800"
              : "bg-[#EAF3DE] text-[#27500A]"
            : "bg-slate-50 text-slate-600"
        }`}
      >
        <p className="font-medium">{previewLabel}</p>
        {preview && !previewLoading && preview.can_assign === false ? (
          <p className="mt-1 text-xs">{preview.balance_message}</p>
        ) : null}
        {preview && !previewLoading && preview.can_assign !== false ? (
          <p className="mt-1 text-xs opacity-90">
            {salaryDeductible
              ? "Deductible from salary."
              : `Deducting from ${deductFromLabel(deductFrom)}.`}{" "}
            Based on shift length ({Number(preview.shift_hours_per_day)} h per working day).
            {!salaryDeductible && preview.available_after_assign != null ? (
              <>
                {" "}
                After approval: {Number(preview.available_after_assign)} day
                {Number(preview.available_after_assign) === 1 ? "" : "s"} remaining in this pool.
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <Field label="Reason">
        <textarea
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          rows={3}
          required
          placeholder="Why is this leave needed?"
          className={`${inputClassName()} min-h-[84px] resize-y`}
        />
      </Field>

      {!extra?.editingRow ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          New applications are submitted as <strong>pending</strong> and must be approved by an administrator
          before they take effect.
        </p>
      ) : null}
    </>
  );
}
