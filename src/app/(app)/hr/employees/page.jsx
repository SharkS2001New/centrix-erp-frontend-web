"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  CatalogPageShell,
  FilterSelect,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  StatCard,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import {
  EmployeeStatusBadge,
  composeEmployeeDisplayName,
  formatHrKesFull,
  formatShiftExpectedHours,
  formatWorkShiftLabel,
} from "@/components/hr/hr-shared";

const PAGE_SIZE = 10;

export default function HrEmployeesPage() {
  const router = useRouter();

  const [employees, setEmployees] = useState([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [employeeStats, setEmployeeStats] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const loadReferenceData = useCallback(async () => {
    setError(null);
    try {
      const [deptRes, statsRes] = await Promise.all([
        apiRequest("/departments", { searchParams: { per_page: 200 } }),
        apiRequest("/employees/summary").catch(() => null),
      ]);
      setDepartments(deptRes.data ?? []);
      if (statsRes) setEmployeeStats(statsRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const filters = {};
      if (deptFilter !== "all") filters.department_id = deptFilter;

      const extra = {};
      if (statusFilter === "active") extra.is_active = 1;
      if (statusFilter === "inactive") extra.is_active = 0;

      const searchParams = buildPageParams({
        page,
        perPage: PAGE_SIZE,
        q: debouncedSearch,
        filters,
        extra,
      });
      const empRes = await apiRequest("/employees", { searchParams });
      const parsed = parsePaginator(empRes);
      setEmployees(parsed.items);
      setTotalEmployees(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      setListLoading(false);
    }
  }, [page, debouncedSearch, deptFilter, statusFilter]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  async function reloadAll() {
    await Promise.all([loadReferenceData(), loadEmployees()]);
  }

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  const stats = useMemo(() => {
    if (employeeStats) {
      return {
        total: Number(employeeStats.total ?? 0),
        active: Number(employeeStats.active ?? 0),
        departments: Number(employeeStats.departments ?? 0),
        payrollCost: Number(employeeStats.payroll_cost ?? 0),
      };
    }
    const active = employees.filter((e) => e.is_active !== false);
    const totalSalary = active.reduce((sum, e) => sum + Number(e.base_salary ?? 0), 0);
    return {
      total: totalEmployees,
      active: active.length,
      departments: departments.filter((d) => d.is_active !== false).length,
      payrollCost: totalSalary,
    };
  }, [employeeStats, employees, totalEmployees, departments]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, deptFilter, statusFilter]);

  async function deleteEmployee(employee) {
    if (!window.confirm(`Delete employee "${composeEmployeeDisplayName(employee)}"?`)) return;
    try {
      await apiRequest(`/employees/${employee.id}`, { method: "DELETE" });
      await reloadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <CatalogPageShell
      title="Employees"
      subtitle="Manage staff records and departments"
      action={
        <Link
          href="/hr/employees/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
        >
          Add employee
        </Link>
      }
      banner={
        !loading ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active employees" value={stats.active.toLocaleString()} />
            <StatCard label="Total employees" value={stats.total.toLocaleString()} />
            <StatCard label="Departments" value={stats.departments.toLocaleString()} />
            <StatCard label="Monthly payroll cost" value={formatHrKesFull(stats.payrollCost)} />
          </div>
        ) : null
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="max-w-sm"
          />
          <FilterSelect
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            options={[
              { value: "all", label: "All departments" },
              ...departments.map((d) => ({ value: String(d.id), label: d.department_name })),
            ]}
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </div>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading employees…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5">Department</th>
                    <th className="px-4 py-2.5">Shift</th>
                    <th className="px-4 py-2.5">Branch</th>
                    <th className="px-4 py-2.5">Position</th>
                    <th className="px-4 py-2.5 text-right">Salary</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="w-[110px] px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No employees found.
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee) => (
                      <tr
                        key={employee.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/hr/employees/${employee.id}`}
                            className="font-medium text-[#185FA5] hover:underline"
                          >
                            {composeEmployeeDisplayName(employee)}
                          </Link>
                          <p className="text-xs text-slate-500">{employee.employee_code}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {employee.department?.department_name ??
                            deptById.get(employee.department_id)?.department_name ??
                            "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {employee.shift ? (
                            <>
                              <span className="block">{formatWorkShiftLabel(employee.shift)}</span>
                              <span className="text-xs text-slate-500">
                                {formatShiftExpectedHours(employee.shift)}
                              </span>
                            </>
                          ) : (
                            <span className="text-amber-700">Not assigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {employee.branch?.branch_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{employee.job_title || "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {formatHrKesFull(employee.base_salary)}
                        </td>
                        <td className="px-4 py-3">
                          <EmployeeStatusBadge active={employee.is_active !== false} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <IconButton
                              label="View"
                              onClick={() => router.push(`/hr/employees/${employee.id}`)}
                            >
                              <ViewIcon />
                            </IconButton>
                            <IconButton
                              label="Edit"
                              onClick={() => router.push(`/hr/employees/${employee.id}/edit`)}
                            >
                              <PencilIcon />
                            </IconButton>
                            <IconButton label="Delete" danger onClick={() => deleteEmployee(employee)}>
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
              page={page}
              totalPages={totalPages}
              total={totalEmployees}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </CatalogPageShell>
  );
}

function ViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
