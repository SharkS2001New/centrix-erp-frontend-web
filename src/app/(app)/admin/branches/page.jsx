"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useAdminApi } from "@/contexts/admin-api-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { filterByOrganization, orgListParams, slugCode } from "@/lib/admin";
import {
  ActiveBadge,
  CatalogPageShell,
  DetailDrawer,
  Field,
  FormDrawer,
  IconButton,
  PencilIcon,
  PrimaryButton,
  TrashIcon,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { BRANCH_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";

const EMPTY_FORM = {
  branch_name: "",
  branch_code: "",
  branch_phone: "",
  branch_email: "",
  branch_address: "",
  manager_employee_id: "",
  mpesa_shortcode: "",
  mpesa_till_number: "",
  mpesa_child_storecode: "",
  is_active: true,
};

export default function AdminBranchesPage() {
  const { user, capabilities } = useAuth();
  const { adminPath, organizationId: platformOrgId } = useAdminApi();
  const organizationId = platformOrgId ?? user?.organization_id ?? capabilities?.organization_id;

  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewBranch, setViewBranch] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [branchRes, userRes] = await Promise.all([
        apiRequest(adminPath("/branches"), { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest(adminPath("/users"), { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
      ]);
      setBranches(filterByOrganization(branchRes.data, organizationId));
      setUsers(filterByOrganization(userRes.data, organizationId));

      try {
        const empRes = await apiRequest(adminPath("/employees"), {
          searchParams: { per_page: 200, ...orgListParams(organizationId) },
        });
        setEmployees(filterByOrganization(empRes.data, organizationId));
      } catch {
        setEmployees([]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }, [adminPath, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const userCountByBranch = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      if (!u.branch_id) continue;
      map.set(u.branch_id, (map.get(u.branch_id) ?? 0) + 1);
    }
    return map;
  }, [users]);

  const employeeById = useMemo(() => {
    const map = new Map();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) =>
      `${b.branch_name} ${b.branch_code} ${b.branch_phone}`.toLowerCase().includes(q),
    );
  }, [branches, search]);

  function managerName(branch) {
    const id = branch.settings?.manager_employee_id;
    if (!id) return "—";
    const emp = employeeById.get(Number(id));
    return emp?.full_name ?? emp?.first_name ?? "—";
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(branch) {
    setEditing(branch);
    setForm({
      branch_name: branch.branch_name ?? "",
      branch_code: branch.branch_code ?? "",
      branch_phone: branch.branch_phone ?? "",
      branch_email: branch.branch_email ?? "",
      branch_address: branch.branch_address ?? "",
      manager_employee_id: branch.settings?.manager_employee_id
        ? String(branch.settings.manager_employee_id)
        : "",
      mpesa_shortcode: branch.settings?.mpesa?.shortcode ?? "",
      mpesa_till_number: branch.settings?.mpesa?.till_number ?? "",
      mpesa_child_storecode: branch.settings?.mpesa?.child_storecode ?? "",
      is_active: branch.is_active !== false,
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  async function removeBranch(branch) {
    const userCount = userCountByBranch.get(branch.id) ?? 0;
    if (userCount > 0) {
      setError(`Cannot delete "${branch.branch_name}" — ${userCount} user(s) are still assigned.`);
      return;
    }
    if (!window.confirm(`Delete branch "${branch.branch_name}"? This cannot be undone.`)) return;
    try {
      await apiRequest(adminPath(`/branches/${branch.id}`), { method: "DELETE" });
      if (viewBranch?.id === branch.id) setViewBranch(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete branch");
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!form.branch_name.trim()) {
      setFormError("Branch name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        organization_id: organizationId,
        branch_name: form.branch_name.trim(),
        branch_code: form.branch_code.trim() || slugCode(form.branch_name, "BRANCH"),
        branch_phone: form.branch_phone.trim() || null,
        branch_email: form.branch_email.trim() || null,
        branch_address: form.branch_address.trim() || null,
        branch_type: editing?.branch_type ?? "retail",
        is_active: form.is_active,
        settings: {
          ...(editing?.settings ?? {}),
          manager_employee_id: form.manager_employee_id ? Number(form.manager_employee_id) : null,
          mpesa: {
            ...(editing?.settings?.mpesa ?? {}),
            shortcode: form.mpesa_shortcode.trim() || null,
            till_number: form.mpesa_till_number.trim() || null,
            child_storecode: form.mpesa_child_storecode.trim() || null,
          },
        },
      };
      if (editing) {
        await apiRequest(adminPath(`/branches/${editing.id}`), { method: "PUT", body });
      } else {
        await apiRequest(adminPath("/branches"), { method: "POST", body });
      }
      setDrawerOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Branches"
      subtitle="Manage branch locations and contacts."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Branches"
            apiPath="/branches"
            columns={BRANCH_EXPORT_COLUMNS}
            totalCount={branches.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <PrimaryButton type="button" onClick={openCreate}>
            Add branch
          </PrimaryButton>
        </div>
      }
      toolbar={<SearchInput value={search} onChange={setSearch} placeholder="Search branches…" className="max-w-sm" />}
    >
      <AdminBreadcrumb items={[{ label: "Administration", href: "/admin" }, { label: "Branches" }]} />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Manager</th>
              <th className="px-4 py-3">Employees</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No branches found.
                </td>
              </tr>
            ) : (
              filtered.map((branch) => (
                <tr key={branch.id} className="theme-table-body-row">
                  <td className="px-4 py-3 font-medium text-slate-900">{branch.branch_name}</td>
                  <td className="px-4 py-3 text-slate-600">{managerName(branch)}</td>
                  <td className="px-4 py-3 text-slate-600">{userCountByBranch.get(branch.id) ?? 0}</td>
                  <td className="px-4 py-3 text-slate-600">{branch.branch_phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={branch.is_active !== false} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <IconButton label="View" onClick={() => setViewBranch(branch)}>
                        👁
                      </IconButton>
                      <IconButton label="Edit" onClick={() => openEdit(branch)}>
                        <PencilIcon />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        danger
                        onClick={() => removeBranch(branch)}
                        disabled={(userCountByBranch.get(branch.id) ?? 0) > 0}
                      >
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

      <FormDrawer
        title={editing ? "Edit branch" : "Add branch"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={save}
        saving={saving}
        error={formError}
        submitLabel={editing ? "Save branch" : "Save branch"}
      >
        <Field label="Branch name">
          <input
            className={inputClassName()}
            value={form.branch_name}
            onChange={(e) => setForm((f) => ({ ...f, branch_name: e.target.value }))}
            required
          />
        </Field>
        <Field label="Phone">
          <input
            className={inputClassName()}
            value={form.branch_phone}
            onChange={(e) => setForm((f) => ({ ...f, branch_phone: e.target.value }))}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className={inputClassName()}
            value={form.branch_email}
            onChange={(e) => setForm((f) => ({ ...f, branch_email: e.target.value }))}
          />
        </Field>
        <Field label="Address">
          <textarea
            className={`${inputClassName()} min-h-[72px]`}
            value={form.branch_address}
            onChange={(e) => setForm((f) => ({ ...f, branch_address: e.target.value }))}
          />
        </Field>
        <Field label="Manager">
          <HrSearchableSelect
            value={form.manager_employee_id}
            onChange={(v) => setForm((f) => ({ ...f, manager_employee_id: v }))}
            options={employees.map((e) => ({
              value: String(e.id),
              label: e.full_name ?? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
            }))}
            placeholder="Select employee"
            emptyLabel="No employees found"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          Active
        </label>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-900">M-Pesa overrides (optional)</p>
          <p className="mt-1 text-xs text-slate-500">
            Leave blank to use organization finance settings. Set when this branch uses its own till or paybill on
            Daraja.
          </p>
          <div className="mt-3 space-y-3">
            <Field label="Paybill shortcode override">
              <input
                className={inputClassName()}
                value={form.mpesa_shortcode}
                onChange={(e) => setForm((f) => ({ ...f, mpesa_shortcode: e.target.value }))}
              />
            </Field>
            <Field label="Till number override">
              <input
                className={inputClassName()}
                value={form.mpesa_till_number}
                onChange={(e) => setForm((f) => ({ ...f, mpesa_till_number: e.target.value }))}
              />
            </Field>
            <Field label="C2B shortcode override">
              <input
                className={inputClassName()}
                value={form.mpesa_child_storecode}
                onChange={(e) => setForm((f) => ({ ...f, mpesa_child_storecode: e.target.value }))}
              />
            </Field>
          </div>
        </div>
      </FormDrawer>

      <DetailDrawer
        title={viewBranch?.branch_name ?? "Branch"}
        subtitle={viewBranch?.branch_code}
        open={Boolean(viewBranch)}
        onClose={() => setViewBranch(null)}
      >
        {viewBranch ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase text-slate-500">Manager</dt>
              <dd className="text-slate-900">{managerName(viewBranch)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Phone</dt>
              <dd className="text-slate-900">{viewBranch.branch_phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Email</dt>
              <dd className="text-slate-900">{viewBranch.branch_email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Address</dt>
              <dd className="text-slate-900">{viewBranch.branch_address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Users</dt>
              <dd className="text-slate-900">{userCountByBranch.get(viewBranch.id) ?? 0}</dd>
            </div>
          </dl>
        ) : null}
      </DetailDrawer>
    </CatalogPageShell>
  );
}
