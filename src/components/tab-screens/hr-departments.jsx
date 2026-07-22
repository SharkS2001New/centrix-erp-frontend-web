"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage } from "@/components/hr/hr-crud-page";
import { buildDepartmentBody, EMPTY_DEPARTMENT_FORM } from "@/components/hr/hr-shared";
import { apiRequest } from "@/lib/api";

export function HrDepartmentsScreen() {
  return (
    <HrCrudPage
      title="Departments"
      subtitle="Organizational units used when assigning employees and payroll filters"
      addButtonLabel="Add department"
      apiPath="/departments"
      loadExtra={async () => {
        const summary = await apiRequest("/employees/summary").catch(() => null);
        const raw = summary?.by_department_id ?? {};
        const headcount = {};
        for (const [id, count] of Object.entries(raw)) {
          if (id === "null" || id === "") continue;
          headcount[Number(id)] = Number(count) || 0;
        }
        return { headcount };
      }}
      columns={[
        { key: "department_code", label: "Code" },
        { key: "department_name", label: "Name" },
        {
          key: "headcount",
          label: "Active staff",
          render: (r, extra) => String(extra?.headcount?.[r.id] ?? 0),
        },
        {
          key: "is_active",
          label: "Status",
          render: (r) => (r.is_active !== false ? "Active" : "Inactive"),
        },
      ]}
      searchFilter={(r, q) =>
        `${r.department_code} ${r.department_name}`.toLowerCase().includes(q)
      }
      buildEmptyForm={(_, row) => ({
        ...EMPTY_DEPARTMENT_FORM,
        department_code: row?.department_code ?? "",
        department_name: row?.department_name ?? "",
        is_active: row?.is_active !== false,
      })}
      buildBody={(form, orgId) => ({
        ...buildDepartmentBody(form, orgId),
        is_active: form.is_active !== false,
      })}
      validateForm={(form) =>
        !form.department_name?.trim() ? "Department name is required." : null
      }
      renderFormFields={(form, setForm) => (
        <>
          <Field label="Department name">
            <input
              type="text"
              value={form.department_name}
              onChange={(e) => setForm((p) => ({ ...p, department_name: e.target.value }))}
              required
              className={inputClassName()}
            />
          </Field>
          <Field label="Code">
            <input
              type="text"
              value={form.department_code}
              onChange={(e) => setForm((p) => ({ ...p, department_code: e.target.value }))}
              className={`${inputClassName()} font-mono`}
              placeholder="Auto from name if empty"
            />
          </Field>
          <Field label="Status">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active !== false}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              Active
            </label>
          </Field>
        </>
      )}
    />
  );
}
