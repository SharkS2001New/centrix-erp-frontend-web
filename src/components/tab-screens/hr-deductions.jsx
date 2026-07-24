"use client";

import { useCallback, useState } from "react";
import { CatalogPageShell, Field, FormDrawer, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage, HrSelectField } from "@/components/hr/hr-crud-page";
import { GovernmentDeductionsAside } from "@/components/hr/government-deductions-aside";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";

const EMPTY_TYPE_FORM = {
  deduction_code: "",
  name: "",
  calc_type: "fixed",
  default_amount: "",
  default_percentage: "",
  is_active: true,
  applies_to_all: false,
};

function DeductionTypeFormFields({ form, setForm }) {
  return (
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
          placeholder="Auto from name if blank"
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
            onChange={(e) => setForm((p) => ({ ...p, default_percentage: e.target.value }))}
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
          onChange={(e) => setForm((p) => ({ ...p, applies_to_all: e.target.checked }))}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Apply to all employees</span>
          <span className="mt-0.5 block text-slate-500">
            Required for org-wide deductions such as SACCO (full fixed amount every pay run).
          </span>
        </span>
      </label>
    </>
  );
}

function buildTypeBody(form, organizationId) {
  const name = form.name.trim();
  const code =
    form.deduction_code.trim().toUpperCase() ||
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 45);
  return {
    organization_id: organizationId,
    deduction_code: code || `DED-${Date.now()}`,
    name,
    calc_type: form.calc_type,
    default_amount: form.calc_type === "fixed" ? parseFloat(form.default_amount) || 0 : 0,
    default_percentage:
      form.calc_type === "percentage" ? parseFloat(form.default_percentage) || 0 : null,
    is_active: form.is_active !== false,
    applies_to_all: form.applies_to_all === true,
  };
}

function AssignDeductionFormFields({ form, setForm, extra }) {
  const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE_FORM);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeError, setTypeError] = useState(null);

  async function saveType(e) {
    e.preventDefault();
    if (!typeForm.name?.trim()) {
      setTypeError("Name is required.");
      return;
    }
    if (!extra.organizationId) {
      setTypeError("Your user account has no organization.");
      return;
    }
    setTypeSaving(true);
    setTypeError(null);
    try {
      const created = await apiRequest("/payroll-deduction-types", {
        method: "POST",
        body: buildTypeBody(typeForm, extra.organizationId),
      });
      const nextTypes = [...(extra.types ?? []), created];
      extra.setExtra?.((prev) => ({ ...prev, types: nextTypes }));
      setForm((p) => ({
        ...p,
        deduction_type_id: String(created.id),
        name: created.name ?? p.name,
        calc_type: created.calc_type ?? p.calc_type,
        amount: created.default_amount != null ? String(created.default_amount) : p.amount,
        percentage:
          created.default_percentage != null ? String(created.default_percentage) : p.percentage,
      }));
      setTypeDrawerOpen(false);
      setTypeForm(EMPTY_TYPE_FORM);
      notifySuccess("Deduction type created.");
      void extra.reload?.();
    } catch (err) {
      setTypeError(err instanceof ApiError ? err.message : "Could not create type.");
      notifyError(err instanceof ApiError ? err.message : "Could not create type.");
    } finally {
      setTypeSaving(false);
    }
  }

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
      <HrSelectField
        label="Type"
        value={form.deduction_type_id}
        onAdd={() => {
          setTypeError(null);
          setTypeForm(EMPTY_TYPE_FORM);
          setTypeDrawerOpen(true);
        }}
        addLabel="Add type"
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

      <FormDrawer
        title="Add deduction type"
        open={typeDrawerOpen}
        onClose={() => setTypeDrawerOpen(false)}
        onSubmit={saveType}
        saving={typeSaving}
        error={typeError}
        submitLabel="Create type"
      >
        <DeductionTypeFormFields form={typeForm} setForm={setTypeForm} />
      </FormDrawer>
    </>
  );
}

export function HrDeductionsScreen() {
  const [typesVersion, setTypesVersion] = useState(0);
  const bumpTypes = useCallback(() => setTypesVersion((v) => v + 1), []);

  const loadAssignExtra = useCallback(async () => {
    const [emps, types] = await Promise.all([
      apiRequest("/employees", { searchParams: { per_page: 200 } }),
      apiRequest("/payroll-deduction-types", { searchParams: { per_page: 200 } }),
    ]);
    return { employees: emps.data ?? [], types: types.data ?? [] };
  }, [typesVersion]);

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
            onSaved={bumpTypes}
            columns={[
              { key: "deduction_code", label: "Code" },
              { key: "name", label: "Name" },
              {
                key: "applies_to_all",
                label: "Scope",
                render: (r) => (r.applies_to_all ? "All employees" : "Template only"),
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
            buildBody={(form, orgId) => buildTypeBody(form, orgId)}
            validateForm={(form) => (!form.name?.trim() ? "Name is required." : null)}
            renderFormFields={(form, setForm) => (
              <DeductionTypeFormFields form={form} setForm={setForm} />
            )}
          />

          <HrCrudPage
            embedded
            title="Assign to employees"
            subtitle="Per-employee amounts on payroll. Org-wide types (checkbox above) apply automatically unless overridden here."
            addButtonLabel="Assign deduction"
            drawerWide
            apiPath="/employee-deductions"
            loadExtra={loadAssignExtra}
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
                  r.calc_type === "percentage"
                    ? `${r.percentage}% of gross`
                    : formatHrKesFull(r.amount),
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
              percentage:
                form.calc_type === "percentage" ? parseFloat(form.percentage) || 0 : null,
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
              <AssignDeductionFormFields form={form} setForm={setForm} extra={extra} />
            )}
          />
        </div>
      </div>
    </CatalogPageShell>
  );
}
