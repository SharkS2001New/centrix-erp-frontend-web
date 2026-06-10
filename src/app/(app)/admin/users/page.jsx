"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { filterByOrganization, orgListParams } from "@/lib/admin";
import {
  ActiveBadge,
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  PencilIcon,
  PrimaryButton,
  TrashIcon,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  username: "",
  branch_id: "",
  role_id: "",
  password: "",
  is_active: true,
};

export default function AdminUsersPage() {
  const { user, capabilities } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;

  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [userRes, branchRes, roleRes] = await Promise.all([
        apiRequest("/users", { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest("/branches", { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest("/roles", { searchParams: { per_page: 200 } }),
      ]);
      setUsers(filterByOrganization(userRes.data, organizationId));
      setBranches(filterByOrganization(branchRes.data, organizationId));
      setRoles(roleRes.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.full_name} ${u.email} ${u.username}`.toLowerCase().includes(q),
    );
  }, [users, search]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      full_name: row.full_name ?? "",
      email: row.email ?? "",
      username: row.username ?? "",
      branch_id: row.branch_id ? String(row.branch_id) : "",
      role_id: row.role_id ? String(row.role_id) : "",
      password: "",
      is_active: row.is_active !== false,
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  async function removeUser(row) {
    if (row.id === user?.id) {
      setError("You cannot delete your own account.");
      return;
    }
    if (!window.confirm(`Delete user "${row.full_name}"? This cannot be undone.`)) return;
    try {
      await apiRequest(`/users/${row.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete user");
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setFormError("Full name is required.");
      return;
    }
    if (!form.username.trim()) {
      setFormError("Username is required.");
      return;
    }
    if (!form.role_id) {
      setFormError("Role is required.");
      return;
    }
    if (!editing && !form.password.trim()) {
      setFormError("Password is required for new users.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        organization_id: organizationId,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        username: form.username.trim(),
        branch_id: form.branch_id ? Number(form.branch_id) : null,
        role_id: Number(form.role_id),
        is_active: form.is_active,
      };
      if (form.password.trim()) body.password = form.password;
      if (editing) {
        await apiRequest(`/users/${editing.id}`, { method: "PUT", body });
      } else {
        await apiRequest("/users", { method: "POST", body });
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
      title="Users"
      subtitle="Manage system users, branches, and roles."
      action={
        <PrimaryButton type="button" onClick={openCreate}>
          Create user
        </PrimaryButton>
      }
      toolbar={<SearchInput value={search} onChange={setSearch} placeholder="Search user…" className="max-w-sm" />}
    >
      <AdminBreadcrumb items={[{ label: "Administration", href: "/admin" }, { label: "Users" }]} />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Role</th>
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
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.email ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {branchById.get(row.branch_id)?.branch_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {roleById.get(row.role_id)?.role_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={row.is_active !== false} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <IconButton label="Edit" onClick={() => openEdit(row)}>
                        <PencilIcon />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        danger
                        onClick={() => removeUser(row)}
                        disabled={row.id === user?.id}
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
        title={editing ? "Edit user" : "Create user"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={save}
        saving={saving}
        error={formError}
        submitLabel={editing ? "Save changes" : "Create user"}
      >
        <Field label="Full name">
          <input
            className={inputClassName()}
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            required
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className={inputClassName()}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </Field>
        <Field label="Username">
          <input
            className={inputClassName()}
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
          />
        </Field>
        <Field label="Branch">
          <HrSearchableSelect
            value={form.branch_id}
            onChange={(v) => setForm((f) => ({ ...f, branch_id: v }))}
            options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
            placeholder="Select branch"
          />
        </Field>
        <Field label="Role">
          <HrSearchableSelect
            value={form.role_id}
            onChange={(v) => setForm((f) => ({ ...f, role_id: v }))}
            options={roles.map((r) => ({ value: String(r.id), label: r.role_name }))}
            placeholder="Select role"
            required
          />
        </Field>
        <Field label={editing ? "New password (optional)" : "Password"}>
          <input
            type="password"
            className={inputClassName()}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required={!editing}
            minLength={6}
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
      </FormDrawer>
    </CatalogPageShell>
  );
}
