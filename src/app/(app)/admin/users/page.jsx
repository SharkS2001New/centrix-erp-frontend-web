"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { PasswordInput } from "@/components/auth/password-input";
import { UserDetailModal } from "@/components/admin/user-detail-modal";
import { toggleUserPermissionOverride } from "@/components/admin/user-permission-matrix";
import { permissionIdSet } from "@/lib/permission-ids";
import { filterByOrganization, orgListParams } from "@/lib/admin";
import { useAdminApi } from "@/contexts/admin-api-context";
import {
  ActiveBadge,
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  PencilIcon,
  PrimaryButton,
  ShieldIcon,
  TrashIcon,
  SearchInput,
  TABLE_HEAD_ROW_CLASS,
  inputClassName,
  workspaceCardClassName,
} from "@/components/catalog/catalog-shared";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";
import {
  DEFAULT_LOGIN_CHANNELS,
  LOGIN_CHANNELS,
  formatLoginChannels,
  normalizeLoginChannels,
} from "@/lib/login-channels";
import { isOrgMobileSalesEnabled } from "@/lib/sales-settings";
import { userHasMobileChannel } from "@/lib/mobile-order-scope";

function isProtectedUserAccount(row, currentUserId) {
  return row.id === currentUserId || Boolean(row.is_admin);
}

const EMPTY_FORM = {
  full_name: "",
  email: "",
  username: "",
  branch_id: "",
  role_id: "",
  password: "",
  access_scope: "branch",
  login_channels: [...DEFAULT_LOGIN_CHANNELS],
  assigned_route_id: "",
  is_active: true,
};

export default function AdminUsersPage() {
  const { user, capabilities } = useAuth();
  const { adminPath, organizationId: platformOrgId, isPlatformManaged, tenantCapabilities } = useAdminApi();
  const organizationId = platformOrgId ?? user?.organization_id ?? capabilities?.organization_id;
  const effectiveCapabilities = isPlatformManaged ? tenantCapabilities ?? capabilities : capabilities;

  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [permissionApplications, setPermissionApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewUser, setViewUser] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState(null);
  const [rolePermissionIds, setRolePermissionIds] = useState(new Set());
  const [grantedIds, setGrantedIds] = useState(new Set());
  const [deniedIds, setDeniedIds] = useState(new Set());

  const mobileOrdersEnabled = isOrgMobileSalesEnabled(effectiveCapabilities);
  const availableLoginChannels = useMemo(
    () =>
      mobileOrdersEnabled
        ? LOGIN_CHANNELS
        : LOGIN_CHANNELS.filter((channel) => channel.value !== "mobile"),
    [mobileOrdersEnabled],
  );
  const matrix = permissionGroups;
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [userRes, branchRes, roleRes, routeRes, matrixRes] = await Promise.all([
        apiRequest(adminPath("/users"), { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest(adminPath("/branches"), { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest(adminPath("/roles"), { searchParams: { per_page: 200 } }),
        apiRequest(adminPath("/routes"), { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest(adminPath("/roles/permissions/matrix")),
      ]);
      setUsers(filterByOrganization(userRes.data, organizationId));
      setBranches(filterByOrganization(branchRes.data, organizationId));
      setRoles(roleRes.data ?? []);
      setRoutes(filterByOrganization(routeRes.data ?? [], organizationId));
      setPermissions(matrixRes.permissions ?? []);
      setPermissionApplications(matrixRes.applications ?? []);
      setPermissionGroups(matrixRes.groups ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [organizationId, adminPath]);

  const loadUserPermissions = useCallback(async (userId) => {
    setPermLoading(true);
    setPermError(null);
    try {
      const res = await apiRequest(adminPath(`/users/${userId}/permissions`));
      setRolePermissionIds(permissionIdSet(res.role_permission_ids));
      setGrantedIds(permissionIdSet(res.granted_permission_ids));
      setDeniedIds(permissionIdSet(res.denied_permission_ids));
    } catch (e) {
      setPermError(e instanceof ApiError ? e.message : "Failed to load permissions");
    } finally {
      setPermLoading(false);
    }
  }, [adminPath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (viewUser?.id) loadUserPermissions(viewUser.id);
    else {
      setRolePermissionIds(new Set());
      setGrantedIds(new Set());
      setDeniedIds(new Set());
      setPermError(null);
    }
  }, [viewUser, loadUserPermissions]);

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
      access_scope: row.access_scope ?? "branch",
      login_channels: normalizeLoginChannels(row.login_channels),
      assigned_route_id: row.assigned_route_id ? String(row.assigned_route_id) : "",
      is_active: row.is_active !== false,
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openView(row) {
    setViewUser(row);
  }

  async function deactivateUser(row) {
    if (isProtectedUserAccount(row, user?.id)) {
      setError(
        row.id === user?.id
          ? "You cannot disable your own login."
          : "Organization administrator accounts cannot have login disabled.",
      );
      return;
    }
    if (row.is_active === false) return;
    if (
      !window.confirm(
        `Disable login for "${row.full_name}"? They will not be able to sign in, but their history is kept.`,
      )
    ) {
      return;
    }
    try {
      await apiRequest(adminPath(`/users/${row.id}`), { method: "PUT", body: { is_active: false } });
      await load();
      if (viewUser?.id === row.id) setViewUser((u) => ({ ...u, is_active: false }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to disable user login");
    }
  }

  async function softDeleteUser(row) {
    if (isProtectedUserAccount(row, user?.id)) {
      setError(
        row.id === user?.id
          ? "You cannot delete your own account."
          : "Organization administrator accounts cannot be deleted.",
      );
      return;
    }
    if (
      !window.confirm(
        `Archive "${row.full_name}"? They will be hidden from this list and cannot sign in. Sales and audit history are kept.`,
      )
    ) {
      return;
    }
    try {
      await apiRequest(adminPath(`/users/${row.id}`), { method: "DELETE" });
      setViewUser(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to archive user");
    }
  }

  function togglePermission(permissionId) {
    const next = toggleUserPermissionOverride(
      permissionId,
      rolePermissionIds,
      grantedIds,
      deniedIds,
    );
    setGrantedIds(next.grantedIds);
    setDeniedIds(next.deniedIds);
  }

  async function savePermissions() {
    if (!viewUser?.id) return;
    setPermSaving(true);
    setPermError(null);
    try {
      await apiRequest(adminPath(`/users/${viewUser.id}/permissions`), {
        method: "PUT",
        body: {
          granted_permission_ids: [...grantedIds],
          denied_permission_ids: [...deniedIds],
        },
      });
      await loadUserPermissions(viewUser.id);
    } catch (e) {
      setPermError(e instanceof ApiError ? e.message : "Failed to save permissions");
    } finally {
      setPermSaving(false);
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
    if (!form.login_channels?.length) {
      setFormError("Select at least one login channel.");
      return;
    }
    if (form.access_scope === "branch" && !form.branch_id) {
      setFormError("Branch is required for branch-limited users.");
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
        access_scope: form.access_scope,
        login_channels: normalizeLoginChannels(form.login_channels),
      };
      if (userHasMobileChannel(form.login_channels)) {
        body.assigned_route_id = form.assigned_route_id
          ? Number(form.assigned_route_id)
          : null;
      }
      if (!editing || !isProtectedUserAccount(editing, user?.id)) {
        body.is_active = form.is_active;
      }
      if (form.password.trim()) body.password = form.password;
      if (editing) {
        await apiRequest(adminPath(`/users/${editing.id}`), { method: "PUT", body });
      } else {
        await apiRequest(adminPath("/users"), { method: "POST", body });
      }
      setDrawerOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const viewRoleName = viewUser ? roleById.get(viewUser.role_id)?.role_name : null;

  const page = (
    <CatalogPageShell
      title="Users"
      subtitle="Manage system users, branches, roles, and per-user permission overrides."
      action={
        <PrimaryButton type="button" onClick={openCreate}>
          Create user
        </PrimaryButton>
      }
      toolbar={
        <SearchInput value={search} onChange={setSearch} placeholder="Search user…" className="max-w-sm" />
      }
    >
      {!isPlatformManaged ? (
        <AdminBreadcrumb items={[{ label: "Administration", href: "/admin" }, { label: "Users" }]} />
      ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        <div className={`${workspaceCardClassName} overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead className={TABLE_HEAD_ROW_CLASS}>
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Channels</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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
                    <td className="px-4 py-3 text-slate-600">
                      {formatLoginChannels(row.login_channels)}
                    </td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={row.is_active !== false} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <IconButton label="Permissions" onClick={() => openView(row)}>
                          <ShieldIcon />
                        </IconButton>
                        <IconButton label="Edit" onClick={() => openEdit(row)}>
                          <PencilIcon />
                        </IconButton>
                        {row.is_active !== false && !isProtectedUserAccount(row, user?.id) ? (
                          <button
                            type="button"
                            onClick={() => deactivateUser(row)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                          >
                            Disable login
                          </button>
                        ) : null}
                        <IconButton
                          label="Archive user"
                          danger
                          onClick={() => softDeleteUser(row)}
                          disabled={isProtectedUserAccount(row, user?.id)}
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

        <UserDetailModal
          open={Boolean(viewUser)}
          user={viewUser}
          roleName={viewRoleName}
          branchName={viewUser ? branchById.get(viewUser.branch_id)?.branch_name : null}
          matrix={matrix}
          permissionApplications={permissionApplications}
          permissionGroups={permissionGroups}
          rolePermissionIds={rolePermissionIds}
          grantedIds={grantedIds}
          deniedIds={deniedIds}
          permLoading={permLoading}
          permSaving={permSaving}
          permError={permError}
          onClose={() => setViewUser(null)}
          onTogglePermission={togglePermission}
          onSavePermissions={savePermissions}
        />

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
          <Field label="Access scope">
            <select
              className={inputClassName()}
              value={form.access_scope}
              onChange={(e) => setForm((f) => ({ ...f, access_scope: e.target.value }))}
            >
              <option value="org">Whole organization</option>
              <option value="branch">Single branch only</option>
            </select>
          </Field>
          <Field label="Branch">
            <HrSearchableSelect
              value={form.branch_id}
              onChange={(v) => setForm((f) => ({ ...f, branch_id: v }))}
              options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
              placeholder={form.access_scope === "branch" ? "Select branch (required)" : "Optional home branch"}
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
          <Field label="Allowed login channels">
            <div className="space-y-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
              {availableLoginChannels.map((channel) => (
                <label key={channel.value} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.login_channels.includes(channel.value)}
                    onChange={(e) =>
                      setForm((f) => {
                        const current = normalizeLoginChannels(f.login_channels);
                        const next = e.target.checked
                          ? [...current, channel.value]
                          : current.filter((c) => c !== channel.value);
                        return { ...f, login_channels: next };
                      })
                    }
                  />
                  <span>
                    <span className="font-medium text-slate-900">{channel.label}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {mobileOrdersEnabled
                ? "Mobile-only users can sign in from the mobile app but not the web backoffice or POS."
                : "Mobile orders are disabled for this organization — only backoffice and POS channels are available."}
            </p>
          </Field>
          {mobileOrdersEnabled && userHasMobileChannel(form.login_channels) ? (
            <Field label="Assigned route (optional)">
              <HrSearchableSelect
                value={form.assigned_route_id}
                onChange={(v) => setForm((f) => ({ ...f, assigned_route_id: v }))}
                options={routes.map((route) => ({
                  value: String(route.id),
                  label: route.route_name ?? `Route #${route.id}`,
                }))}
                placeholder="Any route — rep chooses in the app"
              />
              <p className="mt-1 text-xs text-slate-500">
                Leave empty to let the rep work on multiple routes. When set, the rep is locked to that route only.
              </p>
            </Field>
          ) : null}
          <Field label={editing ? "Reset password" : "Password"}>
            <PasswordInput
              className={inputClassName()}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required={!editing}
              minLength={6}
            />
            {editing ? (
              <p className="mt-1 text-xs text-slate-500">
                User must change this password on next sign-in.
              </p>
            ) : null}
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              disabled={Boolean(editing && isProtectedUserAccount(editing, user?.id))}
            />
            Login enabled
          </label>
          <p className="text-xs text-slate-500">
            {editing && isProtectedUserAccount(editing, user?.id)
              ? editing.id === user?.id
                ? "You cannot disable login on your own account."
                : "Organization administrator accounts must stay enabled."
              : "Disable login to block sign-in. Use Archive to soft-delete while keeping all history."}
          </p>
        </FormDrawer>
      </CatalogPageShell>
  );

  if (isPlatformManaged) return page;

  return <AdminGuard strict>{page}</AdminGuard>;
}
