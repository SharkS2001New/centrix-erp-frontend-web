"use client";

import { Field, formatShortDate, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage, HrSelectField } from "@/components/hr/hr-crud-page";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import { apiRequest } from "@/lib/api";

const RATE_MODE_OPTIONS = [
  { value: "fixed_hourly", label: "Fixed amount per hour" },
  { value: "from_salary", label: "From salary (daily rate ÷ shift hours)" },
];

export default function HrOvertimePage() {
  return (
    <HrCrudPage
      title="Overtime"
      subtitle="Amount = hours × rate (fixed per hour or derived from monthly salary and shift)"
      addButtonLabel="Add overtime"
      drawerWide
      apiPath="/employee-overtime"
      loadExtra={async () => {
        const res = await apiRequest("/employees", { searchParams: { per_page: 200 } });
        const employees = (res.data ?? []).filter((e) => e.shift_id != null);
        return { employees };
      }}
      columns={[
        {
          key: "employee_id",
          label: "Employee",
          render: (r, { employees = [] }) => {
            const emp = employees.find((e) => e.id === r.employee_id);
            return emp ? composeEmployeeDisplayName(emp) : "—";
          },
        },
        {
          key: "work_date",
          label: "Date",
          render: (r) => formatShortDate(r.work_date),
        },
        { key: "hours", label: "Hours" },
        {
          key: "rate_mode",
          label: "Rate",
          render: (r) =>
            r.rate_mode === "fixed_hourly" ? "Fixed / hr" : "From salary",
        },
        { key: "amount", label: "Amount", render: (r) => formatHrKesFull(r.amount) },
        { key: "status", label: "Status" },
      ]}
      buildEmptyForm={(extra, row) => ({
        employee_id: row?.employee_id != null ? String(row.employee_id) : "",
        work_date: row?.work_date?.slice?.(0, 10) ?? new Date().toISOString().slice(0, 10),
        hours: row?.hours != null ? String(row.hours) : "",
        rate_mode: row?.rate_mode ?? "from_salary",
        hourly_rate: row?.hourly_rate != null ? String(row.hourly_rate) : "",
        rate_multiplier: "1",
        status: row?.status ?? "pending",
        notes: row?.notes ?? "",
      })}
      buildBody={(form, orgId) => ({
        employee_id: Number(form.employee_id),
        organization_id: orgId,
        work_date: form.work_date,
        hours: parseFloat(form.hours) || 0,
        rate_mode: form.rate_mode || "from_salary",
        hourly_rate:
          form.rate_mode === "fixed_hourly" && form.hourly_rate
            ? parseFloat(form.hourly_rate)
            : null,
        rate_multiplier: 1,
        status: form.status,
        notes: form.notes.trim() || null,
      })}
      validateForm={(form, extra) => {
        if (!form.employee_id) return "Select an employee.";
        if (!form.work_date) return "Work date is required.";
        const emp = (extra?.employees ?? []).find((e) => String(e.id) === form.employee_id);
        if (emp && !emp.shift_id) {
          return "Employee must have a work shift assigned before adding overtime.";
        }
        if (form.rate_mode === "fixed_hourly" && (!form.hourly_rate || Number(form.hourly_rate) <= 0)) {
          return "Enter the fixed amount per hour.";
        }
        return null;
      }}
      renderFormFields={(form, setForm, extra) => (
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
          {(extra.employees ?? []).length === 0 ? (
            <p className="text-sm text-amber-800">
              No employees with a work shift. Assign a shift on the employee profile first.
            </p>
          ) : null}
          <Field label="Work date">
            <input
              type="date"
              value={form.work_date}
              onChange={(e) => setForm((p) => ({ ...p, work_date: e.target.value }))}
              className={inputClassName()}
            />
          </Field>
          <Field label="Hours">
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.hours}
              onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))}
              className={inputClassName()}
            />
          </Field>
          <HrSelectField
            label="Overtime rate"
            value={form.rate_mode}
            onChange={(v) => setForm((p) => ({ ...p, rate_mode: v }))}
            options={RATE_MODE_OPTIONS}
          />
          {form.rate_mode === "fixed_hourly" ? (
            <Field label="Amount per hour (KES)">
              <input
                type="number"
                min="0"
                value={form.hourly_rate}
                onChange={(e) => setForm((p) => ({ ...p, hourly_rate: e.target.value }))}
                className={inputClassName()}
                placeholder="e.g. 500"
              />
            </Field>
          ) : (
            <p className="text-sm text-slate-600">
              Rate = monthly salary ÷ scheduled work days in the month ÷ shift hours per day.
            </p>
          )}
          <HrSelectField
            label="Status"
            value={form.status}
            onChange={(v) => setForm((p) => ({ ...p, status: v }))}
            options={[
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "paid", label: "Paid" },
              { value: "rejected", label: "Rejected" },
            ]}
          />
        </>
      )}
    />
  );
}
