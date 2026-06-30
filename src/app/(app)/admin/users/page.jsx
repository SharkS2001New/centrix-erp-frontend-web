"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { PasswordInput } from "@/components/auth/password-input";
import { UserDetailModal } from "@/components/admin/user-detail-modal";
import { UserPermissionMatrix, toggleUserPermissionOverride } from "@/components/admin/user-permission-matrix";
import { permissionIdSet } from "@/lib/permission-ids";
import { filterByOrganization, orgListParams } from "@/lib/admin";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useAdminApi } from "@/contexts/admin-api-context";
import {
  ActiveBadge,
  CatalogPageShell,
  Field,
  FilterToolbar,
  FormDrawer,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  ShieldIcon,
  TrashIcon,
  SearchInput,
  TABLE_HEAD_ROW_CLASS,
  inputClassName,
  workspaceCardClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { USER_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";
import {
  availableLoginChannelsFromCapabilities,
  defaultLoginChannelsForCapabilities,
  formatLoginChannels,
  normalizeLoginChannels,
} from "@/lib/login-channels";
import { isOrgMobileSalesEnabled } from "@/lib/sales-settings";
import { userHasMobileChannel } from "@/lib/mobile-order-scope";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import {
  BatchActionBar,
  BatchDeleteButton,
  TableRowSelectCell,
  TableSelectAllHeader,
  batchDeleteWithConfirm,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  username: "",
  branch_id: "",
  role_id: "",
  password: "",
  must_change_password: true,
  access_scope: "branch",
  login_channels: [],
  assigned_route_id: "",
  is_active: true,
};


function isProtectedUserAccount(row, currentUserId) {
  return row.id === currentUserId || Boolean(row.is_admin);
}

function userIsPasswordLocked(row) {
  return Boolean(row?.password_locked ?? row?.must_change_password);
}

export default function AdminUsersPage() {
  const confirm = useConfirm();
  const { user, capabilities, refreshCapabilities } = useAuth();
  const { adminPath, organizationId: platformOrgId, isPlatformManaged, tenantCapabilities } = useAdminApi();
  const organizationId = platformOrgId ?? user?.organization_id ?? capabilities?.organization_id;
  const effectiveCapabilities = isPlatformManaged ? tenantCapabilities ?? capabilities : capabilities;

  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [permissionApplications, setPermissionApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewUser, setViewUser] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState(null);
  const [rolePermissionIds, setRolePermissionIds] = useState(new Set());
  const [grantedIds, setGrantedIds] = useState(new Set());
  const [deniedIds, setDeniedIds] = useState(new Set());

  const mobileOrdersEnabled = isOrgMobileSalesEnabled(effectiveCapabilities);
  const posEnabled = Boolean(effectiveCapabilities?.modules?.["sales.pos"]);
  const allowedLoginChannelSet = useMemo(
    () => new Set(defaultLoginChannelsForCapabilities(effectiveCapabilities)),
    [effectiveCapabilities],
  );
  const availableLoginChannels = useMemo(
    () => availableLoginChannelsFromCapabilities(effectiveCapabilities),
    [effectiveCapabilities],
  );
  const matrix = permissionGroups;
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const loadReferenceData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const requests = [
        apiRequest(adminPath("/branches"), { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest(adminPath("/roles"), { searchParams: { per_page: 200 } }),
        apiRequest(adminPath("/roles/permissions/matrix")),
      ];

      if (mobileOrdersEnabled) {
        requests.push(
          apiRequest(adminPath("/routes"), {
            searchParams: { per_page: 200, ...orgListParams(organizationId) },
          }),
        );
      }

      const results = await Promise.allSettled(requests);
      const [branchRes, roleRes, matrixRes, routeRes] = results;

      if (branchRes.status === "rejected") {
        throw branchRes.reason;
      }
      if (roleRes.status === "rejected") {
        throw roleRes.reason;
      }
      if (matrixRes.status === "rejected") {
        throw matrixRes.reason;
      }

      setBranches(filterByOrganization(branchRes.value.data, organizationId));
      setRoles(roleRes.value.data ?? []);
      setPermissions(matrixRes.value.permissions ?? []);
      setPermissionApplications(matrixRes.value.applications ?? []);
      setPermissionGroups(matrixRes.value.groups ?? []);

      if (mobileOrdersEnabled) {
        if (routeRes?.status === "fulfilled") {
          setRoutes(filterByOrganization(routeRes.value.data ?? [], organizationId));
        } else {
          setRoutes([]);
        }
      } else {
        setRoutes([]);
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [organizationId, adminPath, mobileOrdersEnabled]);

  const loadUsers = useCallback(async () => {
    if (!organizationId) return;
    setListLoading(true);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra: orgListParams(organizationId),
      });
      const userRes = await apiRequest(adminPath("/users"), { searchParams });
      const parsed = parsePaginator(userRes);
      setUsers(filterByOrganization(parsed.items, organizationId));
      setTotalUsers(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load users");
    } finally {
      setListLoading(false);
    }
  }, [organizationId, adminPath, page, debouncedSearch]);

  async function reloadAll() {
    await Promise.all([loadReferenceData(), loadUsers()]);
  }

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
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  useEffect(() => {
    if (viewUser?.id) loadUserPermissions(viewUser.id);
    else {
      setRolePermissionIds(new Set());
      setGrantedIds(new Set());
      setDeniedIds(new Set());
      setPermError(null);
    }
  }, [viewUser, loadUserPermissions]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      login_channels: defaultLoginChannelsForCapabilities(effectiveCapabilities),
    });
    setRolePermissionIds(new Set());
    setGrantedIds(new Set());
    setDeniedIds(new Set());
    setFormError(null);
    setDrawerOpen(true);
  }

  useEffect(() => {
    if (!drawerOpen || editing || !form.role_id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest(adminPath(`/roles/${form.role_id}/permissions`));
        if (cancelled) return;
        setRolePermissionIds(permissionIdSet(res.permission_ids));
        setGrantedIds(new Set());
        setDeniedIds(new Set());
      } catch {
        if (!cancelled) setRolePermissionIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminPath, drawerOpen, editing, form.role_id]);

  function toggleCreatePermission(permissionId) {
    const next = toggleUserPermissionOverride(
      permissionId,
      rolePermissionIds,
      grantedIds,
      deniedIds,
    );
    setGrantedIds(next.grantedIds);
    setDeniedIds(next.deniedIds);
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
      must_change_password: true,
      access_scope: row.access_scope ?? "branch",
      login_channels: normalizeLoginChannels(row.login_channels, allowedLoginChannelSet),
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
      notifyError(
        row.id === user?.id
          ? "You cannot disable your own login."
          : "Organization administrator accounts cannot have login disabled.",
      );
      return;
    }
    if (row.is_active === false) return;
    const ok = await confirm({
      title: "Disable login",
      message: `Disable login for "${row.full_name}"? They will not be able to sign in, but their history is kept.`,
      confirmLabel: "Disable",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(adminPath(`/users/${row.id}`), { method: "PUT", body: { is_active: false } });
      await reloadAll();
      if (viewUser?.id === row.id) setViewUser((u) => ({ ...u, is_active: false }));
      notifySuccess(`Login disabled for "${row.full_name}"`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to disable user login");
    }
  }

  async function clearPasswordLock(row) {
    const ok = await confirm({
      title: "Clear password lock?",
      message: `Clear the password lock for "${row.full_name}"? They can sign in and use the application without changing their password.`,
      confirmLabel: "Clear lock",
    });
    if (!ok) return;
    try {
      await apiRequest(adminPath(`/users/${row.id}/clear-password-lock`), { method: "POST" });
      await reloadAll();
      if (viewUser?.id === row.id) {
        setViewUser((current) =>
          current ? { ...current, must_change_password: false, password_locked: false } : current,
        );
      }
      notifySuccess(`Password lock cleared for "${row.full_name}"`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to clear password lock");
    }
  }

  async function softDeleteUser(row) {
    if (isProtectedUserAccount(row, user?.id)) {
      notifyError(
        row.id === user?.id
          ? "You cannot delete your own account."
          : "Organization administrator accounts cannot be deleted.",
      );
      return;
    }
    const ok = await confirm({
      title: "Delete user",
      message: `Delete "${row.full_name}"? Users with sales or activity history are archived; users without records are removed permanently.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await apiRequest(adminPath(`/users/${row.id}`), { method: "DELETE" });
      setViewUser(null);
      await reloadAll();
      notifySuccess(res?.message ?? `"${row.full_name}" deleted`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to delete user");
    }
  }

  async function deleteSelectedUsers() {
    const userByIdOnPage = new Map(users.map((row) => [String(row.id), row]));
    setBatchDeleting(true);
    try {
      await batchDeleteWithConfirm({
        confirm,
        selectedIds,
        entityName: "user",
        deleteItem: async (id) => {
          const row = userByIdOnPage.get(String(id));
          if (row && isProtectedUserAccount(row, user?.id)) {
            throw new Error(`Cannot delete ${row.full_name}`);
          }
          await apiRequest(adminPath(`/users/${id}`), { method: "DELETE" });
        },
        clearSelection,
        reload: reloadAll,
        notifySuccess,
        notifyError,
        labelForId: (id) => userByIdOnPage.get(String(id))?.full_name ?? id,
      });
    } finally {
      setBatchDeleting(false);
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
      if (viewUser.id === user?.id) {
        await refreshCapabilities();
      }
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
        login_channels: normalizeLoginChannels(form.login_channels, allowedLoginChannelSet),
      };
      if (userHasMobileChannel(form.login_channels)) {
        body.assigned_route_id = form.assigned_route_id
          ? Number(form.assigned_route_id)
          : null;
      }
      if (!editing || !isProtectedUserAccount(editing, user?.id)) {
        body.is_active = form.is_active;
      }
      if (form.password.trim()) {
        body.password = form.password;
        body.must_change_password = form.must_change_password;
      }
      if (editing) {
        await apiRequest(adminPath(`/users/${editing.id}`), { method: "PUT", body });
      } else {
        const created = await apiRequest(adminPath("/users"), { method: "POST", body });
        const createdId = created?.id;
        if (
          createdId &&
          (grantedIds.size > 0 || deniedIds.size > 0) &&
          !created?.is_admin
        ) {
          await apiRequest(adminPath(`/users/${createdId}/permissions`), {
            method: "PUT",
            body: {
              granted_permission_ids: [...grantedIds],
              denied_permission_ids: [...deniedIds],
            },
          });
        }
      }
      setDrawerOpen(false);
      await reloadAll();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const viewRoleName = viewUser ? roleById.get(viewUser.role_id)?.role_name : null;
  const pageRowIds = useMemo(() => users.map((row) => row.id), [users]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

  const pageContent = (
    <CatalogPageShell
      title="Users"
      subtitle="Manage system users, branches, roles, and per-user permission overrides."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Users"
            apiPath="/users"
            columns={USER_EXPORT_COLUMNS}
            totalCount={totalUsers}
            getSearchParams={() => buildPageParams({ page: 1, perPage: 200, q: debouncedSearch })}
            disabled={loading}
          />
          <PrimaryButton type="button" onClick={openCreate}>
            Create user
          </PrimaryButton>
        </div>
      }
      toolbar={
        <FilterToolbar className="mb-0">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user…"
          />
        </FilterToolbar>
      }
    >
      {!isPlatformManaged ? (
        <AdminBreadcrumb items={[{ label: "Administration", href: "/admin" }, { label: "Users" }]} />
      ) : null}

        <div className={`${workspaceCardClassName} overflow-x-auto ${listLoading ? "opacity-60" : ""}`}>
          <table className="min-w-full text-sm">
            <thead className={TABLE_HEAD_ROW_CLASS}>
              <tr>
                <TableSelectAllHeader
                  checked={allOnPageSelected}
                  indeterminate={someOnPageSelected}
                  onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                />
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
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((row) => (
                  <tr key={row.id} className="theme-table-body-row">
                    <TableRowSelectCell
                      checked={selectedIds.has(String(row.id))}
                      onChange={() => toggleOne(row.id)}
                      label={`Select ${row.full_name}`}
                    />
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
                      <div className="flex flex-col gap-1">
                        <ActiveBadge active={row.is_active !== false} />
                        {userIsPasswordLocked(row) ? (
                          <span className="text-[11px] font-medium text-amber-700">Password locked</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {userIsPasswordLocked(row) ? (
                          <button
                            type="button"
                            onClick={() => clearPasswordLock(row)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                          >
                            Clear lock
                          </button>
                        ) : null}
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
                          label="Delete user"
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

        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={totalUsers}
          pageSize={pageSize}
          onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />

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
          wide={!editing}
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
          <Field label="Branch" required={form.access_scope === "branch"}>
            <HrSearchableSelect
              value={form.branch_id}
              onChange={(v) => setForm((f) => ({ ...f, branch_id: v }))}
              options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
              placeholder={form.access_scope === "branch" ? "Select branch" : "Optional home branch"}
              required={form.access_scope === "branch"}
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
                        const current = normalizeLoginChannels(f.login_channels, allowedLoginChannelSet);
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
              Only channels enabled for this organization are listed.
              {mobileOrdersEnabled
                ? " Mobile-only users can sign in from the mobile app but not the web backoffice or POS."
                : posEnabled
                  ? " External POS and backoffice are available; mobile orders are disabled."
                  : " Backoffice web sign-in is available; external POS and mobile are disabled for this organization."}
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
          </Field>
          {(!editing || form.password.trim()) ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.must_change_password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, must_change_password: e.target.checked }))
                }
              />
              Require password change on first sign-in
            </label>
          ) : null}
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
              : "Disable login to block sign-in. Delete removes users without activity permanently; users with sales history are archived."}
          </p>
          {!editing && form.role_id ? (
            <div className="mt-2 border-t border-[var(--theme-border)] pt-4">
              <p className="mb-2 text-sm font-medium text-slate-800">Permission overrides (optional)</p>
              <p className="mb-3 text-xs text-slate-500">
                Grant extra rights or deny role permissions for this user when they are created.
              </p>
              <UserPermissionMatrix
                applications={permissionApplications}
                groups={permissionGroups}
                rolePermissionIds={rolePermissionIds}
                grantedIds={grantedIds}
                deniedIds={deniedIds}
                onToggle={toggleCreatePermission}
              />
            </div>
          ) : null}
        </FormDrawer>

        <BatchActionBar count={selectedCount} onClear={clearSelection}>
          <BatchDeleteButton
            count={selectedCount}
            busy={batchDeleting}
            onClick={() => void deleteSelectedUsers()}
          />
        </BatchActionBar>
      </CatalogPageShell>
  );

  if (isPlatformManaged) return pageContent;

  return <AdminGuard strict>{pageContent}</AdminGuard>;
}
