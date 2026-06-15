"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { PermissionMatrix } from "@/components/admin/permission-matrix";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  PrimaryButton,
  TrashIcon,
  inputClassName,
} from "@/components/catalog/catalog-shared";

export default function AdminRolesPage() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [formError, setFormError] = useState(null);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const matrix = permissionGroups;

  const loadRoles = useCallback(async () => {
    const res = await apiRequest("/roles", { searchParams: { per_page: 200 } });
    const list = res.data ?? [];
    setRoles(list);
    if (!selectedRoleId && list.length) setSelectedRoleId(list[0].id);
    return list;
  }, [selectedRoleId]);

  const loadPermissionsCatalog = useCallback(async () => {
    const res = await apiRequest("/roles/permissions/matrix");
    setPermissions(res.permissions ?? []);
    setPermissionGroups(res.groups ?? []);
  }, []);

  const loadRolePermissions = useCallback(async (roleId) => {
    if (!roleId) return;
    const res = await apiRequest(`/roles/${roleId}/permissions`);
    setAssignedIds(new Set(res.permission_ids ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadRoles();
      await loadPermissionsCatalog();
      if (list[0]?.id) await loadRolePermissions(list[0].id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [loadRoles, loadPermissionsCatalog, loadRolePermissions]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedRoleId) return;
    loadRolePermissions(selectedRoleId).catch(() => {});
  }, [selectedRoleId, loadRolePermissions]);

  function togglePermission(permissionId) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  }

  function toggleManyPermissionIds(permissionIds, checked) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      for (const id of permissionIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function savePermissions() {
    if (!selectedRoleId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/roles/${selectedRoleId}/permissions`, {
        method: "PUT",
        body: { permission_ids: [...assignedIds] },
      });
      setMessage("Permissions saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role = selectedRole) {
    if (!role) return;
    const count = role.users_count ?? 0;
    if (count > 0) {
      setError(`Cannot delete "${role.role_name}" — ${count} user(s) are still assigned. Reassign them first.`);
      return;
    }
    const ok = window.confirm(`Delete role "${role.role_name}"? This cannot be undone.`);
    if (!ok) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/roles/${role.id}`, { method: "DELETE" });
      const res = await apiRequest("/roles", { searchParams: { per_page: 200 } });
      const list = res.data ?? [];
      setRoles(list);
      setSelectedRoleId(list[0]?.id ?? null);
      if (list[0]?.id) await loadRolePermissions(list[0].id);
      else setAssignedIds(new Set());
      setMessage(`Role "${role.role_name}" deleted.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete role");
    } finally {
      setSaving(false);
    }
  }

  async function createRole(e) {
    e.preventDefault();
    if (!roleName.trim()) {
      setFormError("Role name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const role = await apiRequest("/roles", {
        method: "POST",
        body: { role_name: roleName.trim(), scope: "branch", is_active: true },
      });
      setDrawerOpen(false);
      setRoleName("");
      await loadRoles();
      setSelectedRoleId(role.id);
      setAssignedIds(new Set());
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to create role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Roles & permissions"
      subtitle="Assign feature-level access per link and action."
      action={
        <PrimaryButton type="button" onClick={() => setDrawerOpen(true)}>
          Create role
        </PrimaryButton>
      }
    >
      <AdminBreadcrumb
        items={[{ label: "Administration", href: "/admin" }, { label: "Roles & permissions" }]}
      />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <p className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Roles
          </p>
          <ul className="divide-y divide-slate-100">
            {loading ? (
              <li className="px-4 py-6 text-sm text-slate-500">Loading…</li>
            ) : (
              roles.map((role) => (
                <li key={role.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`min-w-0 flex-1 px-4 py-3 text-left text-sm transition ${
                      selectedRoleId === role.id
                        ? "bg-[#E6F1FB] font-medium text-[#185FA5]"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {role.role_name}
                  </button>
                  <IconButton
                    label="Delete role"
                    danger
                    onClick={() => deleteRole(role)}
                    disabled={(role.users_count ?? 0) > 0 || saving}
                  >
                    <TrashIcon />
                  </IconButton>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {selectedRole ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-medium text-slate-900">Role: {selectedRole.role_name}</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Users assigned: {selectedRole.users_count ?? 0}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={deleteRole}
                    disabled={saving || (selectedRole.users_count ?? 0) > 0}
                    title={
                      (selectedRole.users_count ?? 0) > 0
                        ? "Reassign users before deleting this role"
                        : "Delete role"
                    }
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete role
                  </button>
                  <PrimaryButton type="button" onClick={savePermissions} disabled={saving} showIcon={false}>
                    {saving ? "Saving…" : "Save permissions"}
                  </PrimaryButton>
                </div>
              </div>

              <div className="overflow-x-auto p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Permissions by module & feature
                </p>
                <PermissionMatrix
                  groups={matrix}
                  assignedIds={assignedIds}
                  onToggle={togglePermission}
                  onToggleMany={toggleManyPermissionIds}
                />
              </div>
            </>
          ) : (
            <p className="px-5 py-8 text-sm text-slate-500">Select a role to manage permissions.</p>
          )}
        </div>
      </div>

      <FormDrawer
        title="Create role"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={createRole}
        saving={saving}
        error={formError}
        submitLabel="Create role"
      >
        <Field label="Role name">
          <input
            className={inputClassName()}
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            required
          />
        </Field>
      </FormDrawer>
    </CatalogPageShell>
  );
}
