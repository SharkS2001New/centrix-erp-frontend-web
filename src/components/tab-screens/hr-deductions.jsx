"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { CatalogPageShell, Field, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage, HrSelectField } from "@/components/hr/hr-crud-page";
import { GovernmentDeductionsAside } from "@/components/hr/government-deductions-aside";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import { apiRequest } from "@/lib/api";

const EMPTY_TYPE_FORM = {
  deduction_code: "",
  name: "",
  calc_type: "fixed",
  default_amount: "",
  default_percentage: "",
  is_active: true,
  frequency: "per_cycle", // per_cycle | one_time
  apply_scope: "selected", // all | selected
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
        <Field label="Amount per payroll (KES, full)">
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
              Deducted on the next payroll only, then closed automatically.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-medium text-slate-600">Employees</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="apply_scope"
            className="mt-0.5"
            checked={form.apply_scope === "selected"}
            onChange={() => setScope("selected")}
          />
          <span>
            <span className="font-medium">Selected employees</span>
            <span className="mt-0.5 block text-slate-500">
              Create the deduction and assign it to the people you pick below.
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
            <span className="font-medium">All employees</span>
            <span className="mt-0.5 block text-slate-500">
              Org-wide every pay run (e.g. SACCO for everyone).
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
                className={`${inputClassName()} w-72 max-w-md sm:w-96`}
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
  const scope = form.apply_scope === "all" ? "all" : "selected";
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
  const assignees = Array.isArray(row?.assigned_employees) ? row.assigned_employees : [];
  const applyScope = row?.applies_to_all ? "all" : "selected";
  return {
    deduction_code: row?.deduction_code ?? "",
    name: row?.name ?? "",
    calc_type: row?.calc_type ?? "fixed",
    default_amount: row?.default_amount != null ? String(row.default_amount) : "",
    default_percentage: row?.default_percentage != null ? String(row.default_percentage) : "",
    is_active: row?.is_active !== false,
    frequency: row?.frequency === "one_time" ? "one_time" : "per_cycle",
    apply_scope: applyScope,
    employee_ids: assignees.map((e) => String(e.id)),
  };
}

function formatAssigneesColumn(row) {
  if (row?.applies_to_all) return "All employees";
  const assignees = Array.isArray(row?.assigned_employees) ? row.assigned_employees : [];
  if (assignees.length === 0) return "—";
  const names = assignees
    .map((e) => String(e.name ?? "").trim())
    .filter(Boolean);
  if (names.length === 0) return `${assignees.length} employee${assignees.length === 1 ? "" : "s"}`;
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
}

export function HrDeductionsScreen() {
  const [tab, setTab] = useState("govt");

  const loadEmployeesExtra = useCallback(async () => {
    const emps = await apiRequest("/employees", {
      searchParams: { per_page: 200, fields: "lean" },
    });
    return { employees: emps.data ?? [] };
  }, []);

  const tabClass = (id) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      tab === id ? "bg-[#185FA5] text-white" : "text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <CatalogPageShell
      title="Deductions"
      subtitle="Government statutory deductions and custom payroll deductions"
    >
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <button type="button" className={tabClass("govt")} onClick={() => setTab("govt")}>
          Govt deductions
        </button>
        <button type="button" className={tabClass("other")} onClick={() => setTab("other")}>
          Other deductions
        </button>
        </div>

      {tab === "govt" ? (
        <GovernmentDeductionsAside />
      ) : (
          <HrCrudPage
            embedded
            title="Other deductions"
            subtitle={
              <>
              Create a deduction and assign employees in one step.{" "}
              <Link
                href="/reports/other-deductions"
                className="font-medium text-slate-800 underline-offset-2 hover:underline"
              >
                  View deductions by pay period
                </Link>
              </>
            }
            addButtonLabel="Add deduction"
            drawerCreateTitle="Add deduction"
            drawerWide
            apiPath="/payroll-deduction-types"
            loadExtra={loadEmployeesExtra}
            exportTitle="Other deductions"
            exportFilename="other-deductions"
            exportColumns={[
              { key: "deduction_code", label: "Code" },
              { key: "name", label: "Type" },
            { key: "employees", label: "Employees" },
              { key: "when", label: "When" },
              { key: "calculation", label: "Calculation" },
            { key: "default_display", label: "Amount", align: "right" },
            ]}
            getExportRows={({ filtered }) =>
              filtered.map((r) => ({
                deduction_code: r.deduction_code ?? "",
                name: r.name ?? "",
              employees: formatAssigneesColumn(r),
                when: r.frequency === "one_time" ? "One-time" : "Every cycle",
                calculation: r.calc_type === "percentage" ? "Percentage" : "Fixed amount",
                default_display:
                  r.calc_type === "percentage"
                    ? `${r.default_percentage ?? 0}%`
                    : formatHrKesFull(r.default_amount),
              }))
            }
            columns={[
              { key: "deduction_code", label: "Code" },
              { key: "name", label: "Type" },
            {
              key: "employees",
              label: "Employees",
              render: (r) => (
                <span className="max-w-[280px] whitespace-normal text-slate-700" title={formatAssigneesColumn(r)}>
                  {formatAssigneesColumn(r)}
                </span>
              ),
            },
              {
                key: "frequency",
                label: "When",
                render: (r) => (r.frequency === "one_time" ? "One-time" : "Every cycle"),
              },
              {
                key: "calc_type",
                label: "Calculation",
                render: (r) =>
                  r.calc_type === "percentage" ? "Percentage" : "Fixed amount",
              },
              {
                key: "default_amount",
              label: "Amount",
                render: (r) =>
                  r.calc_type === "percentage"
                    ? `${r.default_percentage ?? 0}%`
                    : formatHrKesFull(r.default_amount),
              },
            ]}
          searchFilter={(r, q) => {
            const assignees = Array.isArray(r.assigned_employees)
              ? r.assigned_employees.map((e) => e.name ?? "").join(" ")
              : "";
            return `${r.deduction_code} ${r.name} ${assignees}`.toLowerCase().includes(q);
          }}
            buildEmptyForm={(_, row) => typeFormFromRow(row)}
            buildBody={(form, orgId) => buildTypeBody(form, orgId)}
            validateForm={(form) => {
              if (!form.name?.trim()) return "Type name is required.";
              if (form.apply_scope === "selected" && !(form.employee_ids ?? []).length) {
              return "Select at least one employee, or choose All employees.";
            }
            if (form.calc_type === "fixed" && (!form.default_amount || Number(form.default_amount) <= 0)) {
              return "Enter the deduction amount.";
            }
            if (
              form.calc_type === "percentage" &&
              (!form.default_percentage || Number(form.default_percentage) <= 0)
            ) {
              return "Enter the percentage.";
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
      )}
    </CatalogPageShell>
  );
}
