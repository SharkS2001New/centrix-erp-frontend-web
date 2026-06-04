"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Field, formatShortDate, inputClassName } from "@/components/catalog/catalog-shared";
import { HrSelectField } from "@/components/hr/hr-crud-page";
import { composeEmployeeDisplayName } from "@/components/hr/hr-shared";

const DEDUCT_FROM_OPTIONS = [
  { value: "off_days", label: "Off days" },
  { value: "annual", label: "Annual leave" },
  { value: "sick", label: "Sick leave" },
];

export function buildOffDayEmptyForm(extra, row) {
  const today = new Date().toISOString().slice(0, 10);
  const deductFrom =
    row?.deduct_from === "annual" || row?.deduct_from === "sick"
      ? row.deduct_from
      : "off_days";
  return {
    employee_id: row?.employee_id != null ? String(row.employee_id) : "",
    start_date: row?.start_date?.slice?.(0, 10) ?? row?.leave_date?.slice?.(0, 10) ?? today,
    end_date: row?.end_date?.slice?.(0, 10) ?? row?.leave_date?.slice?.(0, 10) ?? today,
    deduct_from: deductFrom,
    duration_type: row?.duration_type ?? "full_day",
    half_day_period: row?.half_day_period ?? "morning",
    notes: row?.notes ?? "",
  };
}

export function buildOffDayBody(form) {
  const deductFrom = form.deduct_from ?? "off_days";
  const leaveType =
    deductFrom === "annual" ? "annual" : deductFrom === "sick" ? "sick" : "other";

  return {
    employee_id: Number(form.employee_id),
    start_date: form.start_date,
    end_date: form.duration_type === "half_day" ? form.start_date : form.end_date,
    assignment_kind: "off_day",
    deduct_from: deductFrom,
    leave_type: leaveType,
    duration_type: form.duration_type,
    half_day_period: form.duration_type === "half_day" ? form.half_day_period : null,
    notes: form.notes.trim() || null,
  };
}

export function validateOffDayForm(form, extra) {
  if (!form.employee_id) return "Select an employee.";
  if (!form.deduct_from) return "Select where to deduct days from.";
  if (!form.start_date) return "Start date is required.";
  if (form.duration_type === "half_day") {
    if (!form.half_day_period) return "Select morning or afternoon for half day.";
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

export function HrOffDayAssignmentFields({ form, setForm, extra, setLeavePreview }) {
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [balances, setBalances] = useState(null);

  const isHalfDay = form.duration_type === "half_day";
  const deductFrom = form.deduct_from ?? "off_days";
  const exceptLeaveId = extra?.editingRow?.id;

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
    const endDate = isHalfDay ? form.start_date : form.end_date;
    if (!endDate) {
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
        assignment_kind: "off_day",
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
    deductFrom,
    isHalfDay,
    exceptLeaveId,
    setLeavePreview,
  ]);

  const previewLabel = useMemo(() => {
    if (previewLoading) return "Calculating…";
    if (!preview) return "Select employee, pool, and dates to see totals.";
    const days = Number(preview.working_days ?? preview.total_days);
    const dayLabel = days === 1 ? "1 working day" : `${days} working days`;
    const hours = Number(preview.total_hours);
    return `${dayLabel} · ${hours} hour${hours === 1 ? "" : "s"} deducted`;
  }, [preview, previewLoading]);

  return (
    <>
      <HrSelectField
        label="Employee"
        value={form.employee_id}
        onChange={(v) => setForm((p) => ({ ...p, employee_id: v }))}
        required
        options={(extra.employees ?? []).map((e) => ({
          value: String(e.id),
          label: composeEmployeeDisplayName(e),
        }))}
      />

      {balances && (
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
      )}

      <HrSelectField
        label="Deduct from"
        value={deductFrom}
        onChange={(v) => setForm((p) => ({ ...p, deduct_from: v }))}
        options={DEDUCT_FROM_OPTIONS}
      />

      <Field label="Start date">
        <input
          type="date"
          value={form.start_date}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              start_date: e.target.value,
              end_date: p.duration_type === "half_day" ? e.target.value : p.end_date,
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
            setForm((p) => ({
              ...p,
              duration_type,
              end_date: duration_type === "half_day" ? p.start_date : p.end_date,
            }));
          }}
          className={inputClassName()}
        >
          <option value="full_day">Full day(s)</option>
          <option value="half_day">Half day (single date)</option>
        </select>
      </Field>
      {isHalfDay ? (
        <HrSelectField
          label="Half day"
          value={form.half_day_period}
          onChange={(v) => setForm((p) => ({ ...p, half_day_period: v }))}
          options={[
            { value: "morning", label: "Morning" },
            { value: "afternoon", label: "Afternoon" },
          ]}
        />
      ) : (
        <Field label="End date">
          <input
            type="date"
            value={form.end_date}
            min={form.start_date}
            onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
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
        {preview && !previewLoading && preview.can_assign === false && (
          <p className="mt-1 text-xs">{preview.balance_message}</p>
        )}
        {preview && !previewLoading && preview.can_assign !== false ? (
          <p className="mt-1 text-xs opacity-90">
            Deducting from {deductFromLabel(deductFrom)}. Based on shift length (
            {Number(preview.shift_hours_per_day)} h per working day).
            {preview.calendar_days > (preview.working_days ?? preview.total_days) ? (
              <>
                {" "}
                {Number(preview.working_days ?? preview.total_days)} working day
                {Number(preview.working_days ?? preview.total_days) === 1 ? "" : "s"} across{" "}
                {preview.calendar_days} calendar days ({formatShortDate(form.start_date)} –{" "}
                {formatShortDate(form.end_date)}).
              </>
            ) : (
              <> {formatShortDate(form.start_date)}.</>
            )}
            {preview.available_after_assign != null ? (
              <>
                {" "}
                After save: {Number(preview.available_after_assign)} day
                {Number(preview.available_after_assign) === 1 ? "" : "s"} remaining in this pool.
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      <Field label="Notes">
        <input
          type="text"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          className={inputClassName()}
        />
      </Field>
    </>
  );
}
