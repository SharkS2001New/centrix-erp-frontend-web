"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAdminApi } from "@/contexts/admin-api-context";
import { useAuth } from "@/contexts/auth-context";
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
  workspaceCardClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { ROLE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { notifyError, notifySuccess } from "@/lib/notify";
import { normalizeRoleId, permissionIdSet } from "@/lib/permission-ids";
import { useConfirm } from "@/lib/use-confirm";

export function AdminRolesScreen() {
  const confirm = useConfirm();
  const { adminPath } = useAdminApi();
  const { refreshCapabilities, capabilities } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [permissionApplications, setPermissionApplications] = useState([]);
  const [industryLabel, setIndustryLabel] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [assignedIds, setAssignedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [formError, setFormError] = useState(null);
  const initialRolePicked = useRef(false);

  const selectedRole = useMemo(
    () => roles.find((r) => normalizeRoleId(r.id) === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const loadRoles = useCallback(async () => {
    const res = await apiRequest(adminPath("/roles"), { searchParams: { per_page: 200 } });
    return res.data ?? [];
  }, [adminPath]);

  const loadPermissionsCatalog = useCallback(async () => {
    const res = await apiRequest(adminPath("/roles/permissions/matrix"));
    setPermissionApplications(res.applications ?? []);
    setPermissionGroups(res.groups ?? []);
    if (res.industry) {
      setIndustryLabel(
        res.industry === "hospitality"
          ? "Hotel & Hospitality"
          : res.industry === "commerce"
            ? "Retail & Distribution"
            : res.industry,
      );
    }
  }, [adminPath]);

  const loadRolePermissions = useCallback(async (roleId) => {
    const id = normalizeRoleId(roleId);
    if (id == null) {
      setAssignedIds(new Set());
      return;
    }
    const res = await apiRequest(adminPath(`/roles/${id}/permissions`));
    setAssignedIds(permissionIdSet(res.permission_ids));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      try {
        const list = await loadRoles();
        if (cancelled) return;
        setRoles(list);
        await loadPermissionsCatalog();
        if (cancelled) return;
        if (!initialRolePicked.current && list.length > 0) {
          initialRolePicked.current = true;
          setSelectedRoleId(normalizeRoleId(list[0].id));
        }
      } catch (e) {
        if (!cancelled) {
          notifyError(e instanceof ApiError ? e.message : "Failed to load roles");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadRoles, loadPermissionsCatalog]);

  useEffect(() => {
    if (selectedRoleId == null) return;
    loadRolePermissions(selectedRoleId).catch((e) => {
      notifyError(e instanceof ApiError ? e.message : "Failed to load role permissions");
    });
  }, [selectedRoleId, loadRolePermissions]);

  function togglePermission(permissionId) {
    const id = Number(permissionId);
    if (!Number.isFinite(id)) return;
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleManyPermissionIds(permissionIds, checked) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      for (const raw of permissionIds) {
        const id = Number(raw);
        if (!Number.isFinite(id)) continue;
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function savePermissions() {
    const roleId = normalizeRoleId(selectedRoleId);
    if (roleId == null) return;
    setSaving(true);
    try {
      const res = await apiRequest(adminPath(`/roles/${roleId}/permissions`), {
        method: "PUT",
        body: { permission_ids: [...assignedIds] },
      });
      setAssignedIds(permissionIdSet(res.permission_ids));
      notifySuccess("Permissions saved.");
      await refreshCapabilities();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role) {
    const target = role ?? selectedRole;
    if (!target) return;
    const roleId = normalizeRoleId(target.id);
    if (roleId == null) return;

    const count = target.users_count ?? 0;
    if (count > 0) {
      notifyError(`Cannot delete "${target.role_name}" — ${count} user(s) are still assigned. Reassign them first.`);
      return;
    }
    const ok = await confirm({
      title: "Delete role",
      message: `Delete role "${target.role_name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setSaving(true);
    try {
      await apiRequest(adminPath(`/roles/${roleId}`), { method: "DELETE" });
      const list = await loadRoles();
      setRoles(list);
      const nextId = list[0] ? normalizeRoleId(list[0].id) : null;
      setSelectedRoleId(nextId);
      if (nextId == null) setAssignedIds(new Set());
      notifySuccess(`Role "${target.role_name}" deleted.`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to delete role");
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
      const role = await apiRequest(adminPath("/roles"), {
        method: "POST",
        body: { role_name: roleName.trim(), scope: "branch", is_active: true },
      });
      setDrawerOpen(false);
      setRoleName("");
      const list = await loadRoles();
      setRoles(list);
      setSelectedRoleId(normalizeRoleId(role.id));
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
      subtitle={
        industryLabel || capabilities?.industry_label
          ? `Assign feature-level access for ${industryLabel || capabilities.industry_label}.`
          : "Assign feature-level access per link and action."
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Roles"
            apiPath="/roles"
            columns={ROLE_EXPORT_COLUMNS}
            totalCount={roles.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <PrimaryButton type="button" onClick={() => setDrawerOpen(true)}>
            Create role
          </PrimaryButton>
        </div>
      }
    >
      <AdminBreadcrumb
        items={[{ label: "Administration", href: "/admin" }, { label: "Roles & permissions" }]}
      />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className={workspaceCardClassName}>
          <p className="theme-subtext border-b border-[var(--theme-border)] px-4 py-3 text-xs font-semibold uppercase tracking-wide">
            Roles
          </p>
          <ul className="divide-y divide-[var(--theme-border)]">
            {loading ? (
              <li className="theme-subtext px-4 py-6 text-sm">Loading…</li>
            ) : (
              roles.map((role) => {
                const roleId = normalizeRoleId(role.id);
                return (
                  <li key={roleId ?? role.id} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setSelectedRoleId(roleId)}
                      className={`min-w-0 flex-1 px-4 py-3 text-left text-sm transition ${
                        selectedRoleId === roleId ? "theme-list-item-active" : "theme-list-item"
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
                );
              })
            )}
          </ul>
        </div>

        <div className={workspaceCardClassName}>
          {selectedRole ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] px-5 py-4">
                <div>
                  <h2 className="theme-heading text-[15px] font-medium">Role: {selectedRole.role_name}</h2>
                  <p className="theme-subtext mt-0.5 text-sm">
                    Users assigned: {selectedRole.users_count ?? 0}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => deleteRole()}
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
                <p className="theme-subtext mb-3 text-xs font-semibold uppercase tracking-wide">
                  Permissions by application & module
                </p>
                <PermissionMatrix
                  applications={permissionApplications}
                  groups={permissionGroups}
                  assignedIds={assignedIds}
                  onToggle={togglePermission}
                  onToggleMany={toggleManyPermissionIds}
                />
              </div>
            </>
          ) : (
            <p className="theme-subtext px-5 py-8 text-sm">Select a role to manage permissions.</p>
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
