"use client";

import { useCallback, useMemo, useState } from "react";
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
  frequency: "per_cycle", // per_cycle | one_time
  apply_scope: "template", // template | all | selected
  employee_ids: [],
};

function DeductionTypeFormFields({ form, setForm, employees = [] }) {
  const [empSearch, setEmpSearch] = useState("");
  const selected = useMemo(
    () => new Set((form.employee_ids ?? []).map(String)),
    [form.employee_ids],
  );

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    const list = employees ?? [];
    if (!q) return list;
    return list.filter((e) => composeEmployeeDisplayName(e).toLowerCase().includes(q));
  }, [employees, empSearch]);

  function setScope(scope) {
    setForm((p) => ({
      ...p,
      apply_scope: scope,
      applies_to_all: scope === "all",
      employee_ids: scope === "selected" ? p.employee_ids ?? [] : [],
    }));
  }

  function toggleEmployee(id) {
    const key = String(id);
    setForm((p) => {
      const cur = new Set((p.employee_ids ?? []).map(String));
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...p, employee_ids: [...cur] };
    });
  }

  function selectAllFiltered() {
    setForm((p) => {
      const cur = new Set((p.employee_ids ?? []).map(String));
      for (const e of filteredEmployees) cur.add(String(e.id));
      return { ...p, employee_ids: [...cur] };
    });
  }

  function clearSelected() {
    setForm((p) => ({ ...p, employee_ids: [] }));
  }

  return (
    <>
      <Field label="Type name">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
          placeholder="e.g. Goods Damages"
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

      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-medium text-slate-600">How often</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="deduction_frequency"
            className="mt-0.5"
            checked={(form.frequency || "per_cycle") === "per_cycle"}
            onChange={() => setForm((p) => ({ ...p, frequency: "per_cycle" }))}
          />
          <span>
            <span className="font-medium">Every payroll cycle</span>
            <span className="mt-0.5 block text-slate-500">
              Deducted on each pay run until you deactivate it (e.g. SACCO, loan installment).
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="deduction_frequency"
            className="mt-0.5"
            checked={form.frequency === "one_time"}
            onChange={() => setForm((p) => ({ ...p, frequency: "one_time" }))}
          />
          <span>
            <span className="font-medium">One-time</span>
            <span className="mt-0.5 block text-slate-500">
              Deducted on the next payroll only, then closed automatically (e.g. damages, advance recovery).
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-medium text-slate-600">Who this applies to</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="apply_scope"
            className="mt-0.5"
            checked={form.apply_scope === "template"}
            onChange={() => setScope("template")}
          />
          <span>
            <span className="font-medium">Template only</span>
            <span className="mt-0.5 block text-slate-500">
              Saved as a type — assign employees later (or use Assign below).
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="apply_scope"
            className="mt-0.5"
            checked={form.apply_scope === "all"}
            onChange={() => setScope("all")}
          />
          <span>
            <span className="font-medium">Apply to all employees</span>
            <span className="mt-0.5 block text-slate-500">
              Org-wide every pay run (e.g. SACCO for everyone).
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="apply_scope"
            className="mt-0.5"
            checked={form.apply_scope === "selected"}
            onChange={() => setScope("selected")}
          />
          <span>
            <span className="font-medium">Apply to selected employees</span>
            <span className="mt-0.5 block text-slate-500">
              Create the type once and assign it to the people you pick below.
            </span>
          </span>
        </label>

        {form.apply_scope === "selected" ? (
          <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Search employees…"
                className={`${inputClassName()} max-w-xs`}
              />
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-xs font-medium text-[#185FA5] hover:underline"
              >
                Select shown
              </button>
              <button
                type="button"
                onClick={clearSelected}
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                Clear
              </button>
              <span className="text-xs text-slate-500">{selected.size} selected</span>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
              {filteredEmployees.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-slate-500">No employees found.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredEmployees.map((e) => {
                    const id = String(e.id);
                    const checked = selected.has(id);
                    return (
                      <li key={id}>
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEmployee(e.id)}
                          />
                          <span className="min-w-0 truncate text-slate-800">
                            {composeEmployeeDisplayName(e)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </fieldset>
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
  const scope = form.apply_scope || (form.applies_to_all ? "all" : "template");
  const employeeIds =
    scope === "selected"
      ? (form.employee_ids ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];

  return {
    organization_id: organizationId,
    deduction_code: code || `DED-${Date.now()}`,
    name,
    calc_type: form.calc_type,
    default_amount: form.calc_type === "fixed" ? parseFloat(form.default_amount) || 0 : 0,
    default_percentage:
      form.calc_type === "percentage" ? parseFloat(form.default_percentage) || 0 : null,
    is_active: form.is_active !== false,
    applies_to_all: scope === "all",
    frequency: form.frequency === "one_time" ? "one_time" : "per_cycle",
    employee_ids: employeeIds,
  };
}

function typeFormFromRow(row) {
  return {
    deduction_code: row?.deduction_code ?? "",
    name: row?.name ?? "",
    calc_type: row?.calc_type ?? "fixed",
    default_amount: row?.default_amount != null ? String(row.default_amount) : "",
    default_percentage: row?.default_percentage != null ? String(row.default_percentage) : "",
    is_active: row?.is_active !== false,
    frequency: row?.frequency === "one_time" ? "one_time" : "per_cycle",
    apply_scope: row?.applies_to_all ? "all" : "template",
    employee_ids: [],
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
      setTypeError("Type name is required.");
      return;
    }
    if (typeForm.apply_scope === "selected" && !(typeForm.employee_ids ?? []).length) {
      setTypeError("Select at least one employee, or choose another scope.");
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
        frequency: created.frequency === "one_time" ? "one_time" : "per_cycle",
        amount: created.default_amount != null ? String(created.default_amount) : p.amount,
        percentage:
          created.default_percentage != null ? String(created.default_percentage) : p.percentage,
      }));
      setTypeDrawerOpen(false);
      setTypeForm(EMPTY_TYPE_FORM);
      const n = Number(created.assigned_employee_count ?? 0);
      notifySuccess(
        n > 0 ? `Deduction type created and assigned to ${n} employee(s).` : "Deduction type created.",
      );
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
            frequency: t?.frequency === "one_time" ? "one_time" : "per_cycle",
            amount: t?.default_amount != null ? String(t.default_amount) : p.amount,
            percentage:
              t?.default_percentage != null ? String(t.default_percentage) : p.percentage,
          }));
        }}
        options={(extra.types ?? []).map((t) => ({
          value: String(t.id),
          label: `${t.name}${t.frequency === "one_time" ? " (one-time)" : ""}`,
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
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-medium text-slate-600">How often</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="assign_deduction_frequency"
            className="mt-0.5"
            checked={(form.frequency || "per_cycle") === "per_cycle"}
            onChange={() => setForm((p) => ({ ...p, frequency: "per_cycle" }))}
          />
          <span>
            <span className="font-medium">Every payroll cycle</span>
            <span className="mt-0.5 block text-slate-500">Repeats each pay run until deactivated.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="assign_deduction_frequency"
            className="mt-0.5"
            checked={form.frequency === "one_time"}
            onChange={() => setForm((p) => ({ ...p, frequency: "one_time" }))}
          />
          <span>
            <span className="font-medium">One-time</span>
            <span className="mt-0.5 block text-slate-500">
              Taken on the next payroll only, then closed.
            </span>
          </span>
        </label>
      </fieldset>

      <FormDrawer
        title="Add deduction type"
        open={typeDrawerOpen}
        onClose={() => setTypeDrawerOpen(false)}
        onSubmit={saveType}
        saving={typeSaving}
        error={typeError}
        submitLabel="Create type"
        wide
      >
        <DeductionTypeFormFields
          form={typeForm}
          setForm={setTypeForm}
          employees={extra.employees ?? []}
        />
      </FormDrawer>
    </>
  );
}

export function HrDeductionsScreen() {
  const [typesVersion, setTypesVersion] = useState(0);
  const bumpTypes = useCallback(() => setTypesVersion((v) => v + 1), []);

  const loadEmployeesExtra = useCallback(async () => {
    const emps = await apiRequest("/employees", { searchParams: { per_page: 200 } });
    return { employees: emps.data ?? [] };
  }, []);

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
            subtitle={
              <>
                Create once: template only, all employees, or selected employees (assigns in one save).{" "}
                <a href="/reports/other-deductions" className="font-medium text-slate-800 underline-offset-2 hover:underline">
                  View deductions by pay period
                </a>
              </>
            }
            addButtonLabel="Add deduction"
            drawerCreateTitle="Add deduction"
            drawerWide
            apiPath="/payroll-deduction-types"
            onSaved={bumpTypes}
            loadExtra={loadEmployeesExtra}
            columns={[
              { key: "deduction_code", label: "Code" },
              { key: "name", label: "Type" },
              {
                key: "frequency",
                label: "When",
                render: (r) => (r.frequency === "one_time" ? "One-time" : "Every cycle"),
              },
              {
                key: "applies_to_all",
                label: "Scope",
                render: (r) => (r.applies_to_all ? "All employees" : "Template / assigned"),
              },
              {
                key: "calc_type",
                label: "Calculation",
                render: (r) =>
                  r.calc_type === "percentage" ? "Percentage" : "Fixed amount",
              },
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
            buildEmptyForm={(_, row) => typeFormFromRow(row)}
            buildBody={(form, orgId) => buildTypeBody(form, orgId)}
            validateForm={(form) => {
              if (!form.name?.trim()) return "Type name is required.";
              if (form.apply_scope === "selected" && !(form.employee_ids ?? []).length) {
                return "Select at least one employee, or choose another scope.";
              }
              return null;
            }}
            renderFormFields={(form, setForm, extra) => (
              <DeductionTypeFormFields
                form={form}
                setForm={setForm}
                employees={extra.employees ?? []}
              />
            )}
          />

          <HrCrudPage
            embedded
            title="Assign to employees"
            subtitle="Per-employee amounts on payroll. Org-wide types apply automatically unless overridden here."
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
              { key: "name", label: "Type" },
              {
                key: "frequency",
                label: "When",
                render: (r) =>
                  r.payroll_run_id
                    ? "One-time (applied)"
                    : r.frequency === "one_time"
                      ? "One-time"
                      : "Every cycle",
              },
              {
                key: "calc_type",
                label: "Calculation",
                render: (r) =>
                  r.calc_type === "percentage" ? "Percentage" : "Fixed amount",
              },
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
              frequency: row?.frequency === "one_time" ? "one_time" : "per_cycle",
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
              frequency: form.frequency === "one_time" ? "one_time" : "per_cycle",
            })}
            validateForm={(form) => {
              if (!form.employee_id) return "Select an employee.";
              if (!form.name?.trim()) return "Type name is required.";
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
