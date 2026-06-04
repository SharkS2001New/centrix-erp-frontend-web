"use client";

import { apiRequest } from "@/lib/api";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage, HrSelectField } from "@/components/hr/hr-crud-page";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";

export default function HrAllowancesPage() {
  return (
    <HrCrudPage
      title="Allowances"
      subtitle="Monthly allowances per employee — summed into gross pay when payroll includes allowances"
      addButtonLabel="Add allowance"
      drawerWide
      apiPath="/employee-allowances"
      loadExtra={async () => {
        const res = await apiRequest("/employees", { searchParams: { per_page: 200 } });
        return { employees: res.data ?? [] };
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
        { key: "name", label: "Allowance" },
        {
          key: "amount",
          label: "Monthly (KES)",
          render: (r) => formatHrKesFull(r.amount),
        },
        {
          key: "is_active",
          label: "Active",
          render: (r) => (r.is_active !== false ? "Yes" : "No"),
        },
      ]}
      buildEmptyForm={(_, row) => ({
        employee_id: row?.employee_id != null ? String(row.employee_id) : "",
        name: row?.name ?? "",
        amount: row?.amount != null ? String(row.amount) : "",
        is_active: row?.is_active !== false,
        notes: row?.notes ?? "",
      })}
      buildBody={(form, orgId) => ({
        employee_id: Number(form.employee_id),
        organization_id: orgId,
        name: form.name.trim(),
        amount: parseFloat(form.amount) || 0,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      })}
      validateForm={(form) => {
        if (!form.employee_id) return "Select an employee.";
        if (!form.name?.trim()) return "Allowance name is required.";
        if (!form.amount || Number(form.amount) <= 0) return "Enter a monthly amount.";
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
          <Field label="Allowance name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              placeholder="e.g. Housing, Transport"
              className={inputClassName()}
            />
          </Field>
          <Field label="Monthly amount (KES)">
            <input
              type="number"
              min="0"
              step="1"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              required
              className={inputClassName()}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              className="rounded border-slate-300"
            />
            Active (included in payroll)
          </label>
        </>
      )}
    />
  );
}
