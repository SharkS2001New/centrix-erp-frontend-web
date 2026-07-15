"use client";

import { CatalogPageShell, Field, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage, HrSelectField } from "@/components/hr/hr-crud-page";
import { GovernmentDeductionsAside } from "@/components/hr/government-deductions-aside";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import { apiRequest } from "@/lib/api";

export function HrDeductionsScreen() {
  return (
    <CatalogPageShell
      title="Deductions"
      subtitle="Government statutory deductions and custom payroll deductions"
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <GovernmentDeductionsAside />
        </div>

        <div className="space-y-10 lg:col-span-8">
          <HrCrudPage
            embedded
            title="Other deductions"
            subtitle="Template only = not deducted on payroll until you assign an employee below or check Apply to all employees (e.g. SACCO KES 1,500 for everyone)."
            addButtonLabel="Add type"
            apiPath="/payroll-deduction-types"
            columns={[
              { key: "deduction_code", label: "Code" },
              { key: "name", label: "Name" },
              {
                key: "applies_to_all",
                label: "Scope",
                render: (r) =>
                  r.applies_to_all ? "All employees" : "Template only",
              },
              { key: "calc_type", label: "Type" },
              {
                key: "default_amount",
                label: "Default",
                render: (r) =>
                  r.calc_type === "percentage"
                    ? `${r.default_percentage ?? 0}%`
                    : formatHrKesFull(r.default_amount),
              },
            ]}
            searchFilter={(r, q) => `${r.deduction_code} ${r.name}`.toLowerCase().includes(q)}
            buildEmptyForm={(_, row) => ({
              deduction_code: row?.deduction_code ?? "",
              name: row?.name ?? "",
              calc_type: row?.calc_type ?? "fixed",
              default_amount: row?.default_amount != null ? String(row.default_amount) : "",
              default_percentage:
                row?.default_percentage != null ? String(row.default_percentage) : "",
              is_active: row?.is_active !== false,
              applies_to_all: row?.applies_to_all === true,
            })}
            buildBody={(form, orgId) => ({
              organization_id: orgId,
              deduction_code: form.deduction_code.trim().toUpperCase(),
              name: form.name.trim(),
              calc_type: form.calc_type,
              default_amount: form.calc_type === "fixed" ? parseFloat(form.default_amount) || 0 : 0,
              default_percentage:
                form.calc_type === "percentage" ? parseFloat(form.default_percentage) || 0 : null,
              is_active: form.is_active,
              applies_to_all: form.applies_to_all,
            })}
            validateForm={(form) => (!form.name?.trim() ? "Name is required." : null)}
            renderFormFields={(form, setForm) => (
              <>
                <Field label="Name">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    required
                    className={inputClassName()}
                  />
                </Field>
                <Field label="Code">
                  <input
                    type="text"
                    value={form.deduction_code}
                    onChange={(e) => setForm((p) => ({ ...p, deduction_code: e.target.value }))}
                    className={`${inputClassName()} font-mono`}
                  />
                </Field>
                <HrSelectField
                  label="Calculation"
                  value={form.calc_type}
                  onChange={(v) => setForm((p) => ({ ...p, calc_type: v }))}
                  options={[
                    { value: "fixed", label: "Fixed amount (KES)" },
                    { value: "percentage", label: "% of contract gross (basic + allowances)" },
                  ]}
                />
                {form.calc_type === "percentage" ? (
                  <Field label="Percentage">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.default_percentage}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, default_percentage: e.target.value }))
                      }
                      className={inputClassName()}
                    />
                  </Field>
                ) : (
                  <Field label="Default amount per payroll (KES, full)">
                    <input
                      type="number"
                      min="0"
                      value={form.default_amount}
                      onChange={(e) => setForm((p) => ({ ...p, default_amount: e.target.value }))}
                      className={inputClassName()}
                    />
                  </Field>
                )}
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.applies_to_all}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, applies_to_all: e.target.checked }))
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Apply to all employees</span>
                    <span className="mt-0.5 block text-slate-500">
                      Required for org-wide deductions such as SACCO (full fixed amount every pay
                      run). Template only skips payroll until this is checked or you assign below.
                    </span>
                  </span>
                </label>
              </>
            )}
          />

          <HrCrudPage
            embedded
            title="Assign to employees"
            subtitle="Per-employee amounts on payroll. Org-wide types (checkbox above) apply automatically unless overridden here."
            addButtonLabel="Assign deduction"
            drawerWide
            apiPath="/employee-deductions"
            loadExtra={async () => {
              const [emps, types] = await Promise.all([
                apiRequest("/employees", { searchParams: { per_page: 200 } }),
                apiRequest("/payroll-deduction-types", { searchParams: { per_page: 200 } }),
              ]);
              return { employees: emps.data ?? [], types: types.data ?? [] };
            }}
            columns={[
              {
                key: "employee_id",
                label: "Employee",
                render: (r, { employees = [] }) => {
                  const emp = employees.find((e) => e.id === r.employee_id);
                  return emp ? composeEmployeeDisplayName(emp) : r.employee_id;
                },
              },
              { key: "name", label: "Name" },
              { key: "calc_type", label: "Type" },
              {
                key: "amount",
                label: "Amount",
                render: (r) =>
                  r.calc_type === "percentage" ? `${r.percentage}% of gross` : formatHrKesFull(r.amount),
              },
            ]}
            buildEmptyForm={(extra, row) => ({
              employee_id: row?.employee_id != null ? String(row.employee_id) : "",
              deduction_type_id:
                row?.deduction_type_id != null ? String(row.deduction_type_id) : "",
              name: row?.name ?? "",
              calc_type: row?.calc_type ?? "fixed",
              amount: row?.amount != null ? String(row.amount) : "",
              percentage: row?.percentage != null ? String(row.percentage) : "",
              is_active: row?.is_active !== false,
            })}
            buildBody={(form) => ({
              employee_id: Number(form.employee_id),
              deduction_type_id: form.deduction_type_id ? Number(form.deduction_type_id) : null,
              name: form.name.trim(),
              calc_type: form.calc_type,
              amount: form.calc_type === "fixed" ? parseFloat(form.amount) || 0 : 0,
              percentage: form.calc_type === "percentage" ? parseFloat(form.percentage) || 0 : null,
              is_active: form.is_active,
            })}
            validateForm={(form) => {
              if (!form.employee_id) return "Select an employee.";
              if (!form.name?.trim()) return "Deduction name is required.";
              if (form.calc_type === "fixed" && (!form.amount || Number(form.amount) <= 0)) {
                return "Enter the fixed deduction amount.";
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
                <HrSelectField
                  label="Type (optional)"
                  value={form.deduction_type_id}
                  onChange={(v) => {
                    const t = (extra.types ?? []).find((x) => String(x.id) === v);
                    setForm((p) => ({
                      ...p,
                      deduction_type_id: v,
                      name: t?.name ?? p.name,
                      calc_type: t?.calc_type ?? p.calc_type,
                      amount: t?.default_amount != null ? String(t.default_amount) : p.amount,
                      percentage:
                        t?.default_percentage != null ? String(t.default_percentage) : p.percentage,
                    }));
                  }}
                  options={(extra.types ?? []).map((t) => ({
                    value: String(t.id),
                    label: t.name,
                  }))}
                />
                <Field label="Name on payslip">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className={inputClassName()}
                  />
                </Field>
                <HrSelectField
                  label="Calculation"
                  value={form.calc_type}
                  onChange={(v) => setForm((p) => ({ ...p, calc_type: v }))}
                  options={[
                    { value: "fixed", label: "Fixed amount (KES)" },
                    { value: "percentage", label: "% of contract gross (basic + allowances)" },
                  ]}
                />
                {form.calc_type === "percentage" ? (
                  <Field label="Percentage">
                    <input
                      type="number"
                      value={form.percentage}
                      onChange={(e) => setForm((p) => ({ ...p, percentage: e.target.value }))}
                      className={inputClassName()}
                    />
                  </Field>
                ) : (
                  <Field label="Amount per payroll (KES, full — not prorated)">
                    <input
                      type="number"
                      min="0"
                      value={form.amount}
                      onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                      className={inputClassName()}
                    />
                  </Field>
                )}
              </>
            )}
          />
        </div>
      </div>
    </CatalogPageShell>
  );
}
