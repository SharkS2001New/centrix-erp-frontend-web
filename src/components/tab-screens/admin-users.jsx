"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { PasswordInput } from "@/components/auth/password-input";
import { UserDetailModal } from "@/components/admin/user-detail-modal";
import { UserPermissionMatrix, toggleUserPermissionOverride } from "@/components/admin/user-permission-matrix";
import { RbacHelpButton } from "@/components/admin/rbac-help";
import { RbacHelpDialog } from "@/components/admin/rbac-help";
import { permissionIdSet } from "@/lib/permission-ids";
import { filterPermissionMatrixForCapabilities } from "@/lib/permission-matrix-filters";
import { filterByOrganization, orgListParams } from "@/lib/admin";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListUrlSearch } from "@/lib/use-list-url-search";
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
  SECONDARY_BTN_CLASS,
  ShieldIcon,
  TrashIcon,
  SearchInput,
  SearchableSelect,
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
import { suggestNextTillDefaults, tillDisplayName } from "@/lib/pos-till";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  username: "",
  branch_id: "",
  hospitality_outlet_id: "",
  role_id: "",
  password: "",
  must_change_password: true,
  access_scope: "branch",
  login_channels: [],
  assigned_route_ids: [],
  till_id: "auto",
  is_active: true,
};


function isProtectedUserAccount(row, currentUserId, { allowDeleteOrgAdmin = false } = {}) {
  if (row?.id === currentUserId) return true;
  if (Boolean(row?.is_admin) && !allowDeleteOrgAdmin) return true;
  return false;
}

function userDeleteBlockReason(row, currentUserId, { allowDeleteOrgAdmin = false } = {}) {
  if (row?.id === currentUserId) return "You cannot delete your own account.";
  if (Boolean(row?.is_admin) && !allowDeleteOrgAdmin) {
    return "Organization administrator — change role away from Administrator first, or ask a platform admin to remove them.";
  }
  return null;
}

function userIsPasswordLocked(row) {
  return Boolean(row?.password_locked ?? row?.must_change_password);
}

function userHasTwoFactor(row) {
  return Boolean(row?.two_factor_enabled);
}

export function AdminUsersScreen() {
  const confirm = useConfirm();
  const { user, capabilities, refreshCapabilities, updateProfile } = useAuth();
  const { adminPath, organizationId: platformOrgId, isPlatformManaged, tenantCapabilities } = useAdminApi();
  const organizationId = platformOrgId ?? user?.organization_id ?? capabilities?.organization_id;
  const effectiveCapabilities = isPlatformManaged ? tenantCapabilities ?? capabilities : capabilities;
  const allowDeleteOrgAdmin = Boolean(user?.is_super_admin || isPlatformManaged);

  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);
  const [branches, setBranches] = useState([]);
  const [hospitalityOutlets, setHospitalityOutlets] = useState([]);
  const [roles, setRoles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [tills, setTills] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState([]);
  const [permissionApplications, setPermissionApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
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
  const mobileAppEnabled = mobileOrdersEnabled || effectiveCapabilities?.driver_mobile_enabled === true;
  const posEnabled = Boolean(effectiveCapabilities?.modules?.["sales.pos"]);
  const hospitalityPosEnabled = Boolean(
    effectiveCapabilities?.modules?.["hospitality.bar_pos"] ||
      effectiveCapabilities?.deployment_profile === "hotel_bar",
  );
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
  const showPosTillField = posEnabled && form.login_channels.includes("pos");
  const tillOptionsForForm = useMemo(() => {
    if (!showPosTillField) return [];
    const branchId = form.branch_id ? Number(form.branch_id) : null;
    const editingUserId = editing?.id != null ? Number(editing.id) : null;
    const branchTills = (tills ?? []).filter((till) => {
      if (branchId != null && Number(till.branch_id) !== branchId) return false;
      return till.is_active !== false;
    });
    const next = suggestNextTillDefaults(branchTills);
    const options = [
      ...(next
        ? [{ value: "auto", label: `Auto — create/assign next free (${next.till_name})` }]
        : []),
      { value: "", label: "No till assigned (auto on POS login if possible)" },
    ];
    for (const till of branchTills) {
      const assignedToOther =
        till.cashier_id != null &&
        editingUserId != null &&
        Number(till.cashier_id) !== editingUserId;
      const assignedToOtherNew =
        till.cashier_id != null && editingUserId == null;
      if (assignedToOther || assignedToOtherNew) continue;
      options.push({
        value: String(till.id),
        label: tillDisplayName(till),
      });
    }
    // Keep the currently selected till visible even if filters would hide it.
    if (form.till_id && form.till_id !== "auto" && !options.some((o) => o.value === form.till_id)) {
      const current = tills.find((t) => String(t.id) === String(form.till_id));
      if (current) {
        options.push({ value: String(current.id), label: tillDisplayName(current) });
      }
    }
    return options;
  }, [showPosTillField, form.branch_id, form.till_id, tills, editing?.id]);

  const loadReferenceData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const requests = [
        apiRequest(adminPath("/branches"), { searchParams: { per_page: 200, ...orgListParams(organizationId) } }),
        apiRequest(adminPath("/roles"), { searchParams: { per_page: 200 } }),
        apiRequest(adminPath("/roles/permissions/matrix")),
      ];
      const routeReqIndex = mobileAppEnabled ? requests.length : -1;
      if (mobileAppEnabled) {
        requests.push(
          apiRequest(adminPath("/routes"), {
            searchParams: { per_page: 200, ...orgListParams(organizationId) },
          }),
        );
      }
      const tillReqIndex = posEnabled ? requests.length : -1;
      if (posEnabled) {
        requests.push(
          apiRequest(adminPath("/tills"), {
            searchParams: { per_page: 200, ...orgListParams(organizationId) },
          }),
        );
      }
      const hospitalityOutletReqIndex = hospitalityPosEnabled ? requests.length : -1;
      if (hospitalityPosEnabled) {
        requests.push(apiRequest("/hospitality/outlets", { reportIssues: false }));
      }

      const results = await Promise.allSettled(requests);
      const [branchRes, roleRes, matrixRes] = results;
      const routeRes = routeReqIndex >= 0 ? results[routeReqIndex] : null;
      const tillRes = tillReqIndex >= 0 ? results[tillReqIndex] : null;
      const hospitalityOutletRes =
        hospitalityOutletReqIndex >= 0 ? results[hospitalityOutletReqIndex] : null;

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
      const filteredMatrix = filterPermissionMatrixForCapabilities(
        {
          applications: matrixRes.value.applications ?? [],
          groups: matrixRes.value.groups ?? [],
        },
        effectiveCapabilities,
      );
      setPermissionApplications(filteredMatrix.applications);
      setPermissionGroups(filteredMatrix.groups);

      if (mobileAppEnabled) {
        if (routeRes?.status === "fulfilled") {
          setRoutes(filterByOrganization(routeRes.value.data ?? [], organizationId));
        } else {
          setRoutes([]);
        }
      } else {
        setRoutes([]);
      }

      if (posEnabled) {
        if (tillRes?.status === "fulfilled") {
          const tillRows = tillRes.value?.data ?? tillRes.value ?? [];
          setTills(filterByOrganization(Array.isArray(tillRows) ? tillRows : [], organizationId));
        } else {
          setTills([]);
        }
      } else {
        setTills([]);
      }

      if (hospitalityPosEnabled) {
        if (hospitalityOutletRes?.status === "fulfilled") {
          const outletRows =
            hospitalityOutletRes.value?.data ?? hospitalityOutletRes.value ?? [];
          setHospitalityOutlets(Array.isArray(outletRows) ? outletRows : []);
        } else {
          setHospitalityOutlets([]);
        }
      } else {
        setHospitalityOutlets([]);
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [organizationId, adminPath, mobileAppEnabled, posEnabled, hospitalityPosEnabled, effectiveCapabilities]);

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

  useTabAwareDataLoad(loadReferenceData);

  useTabAwareDataLoad(loadUsers);

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
    if (!drawerOpen || !form.role_id) return;
    let cancelled = false;
    (async () => {
      try {
        const roleRes = await apiRequest(adminPath(`/roles/${form.role_id}/permissions`));
        if (cancelled) return;
        setRolePermissionIds(permissionIdSet(roleRes.permission_ids));

        if (editing?.id) {
          const userRes = await apiRequest(adminPath(`/users/${editing.id}/permissions`));
          if (cancelled) return;
          setGrantedIds(permissionIdSet(userRes.granted_permission_ids));
          setDeniedIds(permissionIdSet(userRes.denied_permission_ids));
          return;
        }

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

  function toggleDrawerPermission(permissionId) {
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
      hospitality_outlet_id: row.hospitality_outlet_id
        ? String(row.hospitality_outlet_id)
        : "",
      role_id: row.role_id ? String(row.role_id) : "",
      password: "",
      must_change_password: true,
      access_scope: row.access_scope ?? "branch",
      login_channels: normalizeLoginChannels(row.login_channels, allowedLoginChannelSet),
      assigned_route_ids: Array.isArray(row.assigned_route_ids)
        ? row.assigned_route_ids.map((id) => String(id))
        : row.assigned_route_id
          ? [String(row.assigned_route_id)]
          : [],
      till_id: row.till_id != null ? String(row.till_id) : "",
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

  async function clearTwoFactor(row) {
    const ok = await confirm({
      title: "Clear two-factor authentication?",
      message: `Clear 2FA for "${row.full_name}"? They will sign in with password only until they enable 2FA again from My profile.`,
      confirmLabel: "Clear 2FA",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(adminPath(`/users/${row.id}/clear-two-factor`), { method: "POST" });
      await reloadAll();
      if (viewUser?.id === row.id) {
        setViewUser((current) =>
          current ? { ...current, two_factor_enabled: false, two_factor_method: null } : current,
        );
      }
      notifySuccess(`Two-factor authentication cleared for "${row.full_name}"`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to clear 2FA");
    }
  }

  async function softDeleteUser(row) {
    const blockReason = userDeleteBlockReason(row, user?.id, { allowDeleteOrgAdmin });
    if (blockReason) {
      notifyError(blockReason);
      return;
    }
    const ok = await confirm({
      title: "Delete user",
      message: row.is_admin
        ? `Delete organization administrator "${row.full_name}"? Prefer demoting their role first if this is not a test account. Users with sales or activity history are archived.`
        : `Delete "${row.full_name}"? Users with sales or activity history are archived; users without records are removed permanently.`,
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
          const blockReason = row
            ? userDeleteBlockReason(row, user?.id, { allowDeleteOrgAdmin })
            : null;
          if (blockReason) {
            throw new Error(blockReason);
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
        hospitality_outlet_id: form.hospitality_outlet_id
          ? Number(form.hospitality_outlet_id)
          : null,
        role_id: Number(form.role_id),
        access_scope: form.access_scope,
        login_channels: normalizeLoginChannels(form.login_channels, allowedLoginChannelSet),
      };
      if (!hospitalityPosEnabled) {
        delete body.hospitality_outlet_id;
      }
      if (userHasMobileChannel(form.login_channels)) {
        body.assigned_route_ids = (form.assigned_route_ids ?? [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0);
        body.assigned_route_id = body.assigned_route_ids[0] ?? null;
      }
      if (posEnabled && form.login_channels.includes("pos")) {
        if (!form.branch_id && (form.till_id === "auto" || form.till_id)) {
          setFormError("Branch is required to assign a POS till.");
          setSaving(false);
          return;
        }
        if (form.till_id === "auto") {
          body.till_id = "auto";
        } else if (form.till_id) {
          body.till_id = Number(form.till_id);
        } else {
          body.till_id = null;
        }
      } else if (posEnabled && editing) {
        // Clearing POS channel also clears till assignment.
        body.till_id = null;
      }
      if (!editing || !isProtectedUserAccount(editing, user?.id)) {
        body.is_active = form.is_active;
      }
      if (form.password.trim()) {
        body.password = form.password;
        body.must_change_password = form.must_change_password;
      }
      if (editing) {
        const updated = await apiRequest(adminPath(`/users/${editing.id}`), { method: "PUT", body });
        if (!editing.is_admin) {
          await apiRequest(adminPath(`/users/${editing.id}/permissions`), {
            method: "PUT",
            body: {
              granted_permission_ids: [...grantedIds],
              denied_permission_ids: [...deniedIds],
            },
          });
        }
        // Role / admin demotion invalidates sessions server-side; refresh own caps immediately
        // when editing yourself (before the 15s version poll).
        if (editing.id === user?.id) {
          try {
            await refreshCapabilities({ force: true });
            if (updated) {
              updateProfile({
                role_id: updated.role_id ?? user.role_id,
                is_admin: Boolean(updated.is_admin),
              });
            }
          } catch {
            // Role demotion revokes sessions — next navigation will require sign-in.
          }
        }
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
          <button
            type="button"
            onClick={() => void reloadAll()}
            disabled={loading || listLoading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading || listLoading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogListExport
            title="Users"
            apiPath="/users"
            columns={USER_EXPORT_COLUMNS}
            totalCount={totalUsers}
            getSearchParams={() => buildPageParams({ page: 1, perPage: 200, q: debouncedSearch })}
            disabled={loading}
          />
          <RbacHelpButton />
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
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{row.full_name}</span>
                        {row.is_admin ? (
                          <span
                            className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-900"
                            title="Organization administrator (is_admin) — protected from delete unless you are a platform admin"
                          >
                            Org admin
                          </span>
                        ) : null}
                      </div>
                    </td>
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
                        {userHasTwoFactor(row) ? (
                          <span className="text-[11px] font-medium text-indigo-700">2FA on</span>
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
                        {user?.is_super_admin && userHasTwoFactor(row) ? (
                          <button
                            type="button"
                            onClick={() => void clearTwoFactor(row)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-50"
                          >
                            Clear 2FA
                          </button>
                        ) : null}
                        <IconButton label="Permissions" onClick={() => openView(row)}>
                          <ShieldIcon />
                        </IconButton>
                        <IconButton label="Edit" onClick={() => openEdit(row)}>
                          <PencilIcon />
                        </IconButton>
                        {row.is_active !== false &&
                        !isProtectedUserAccount(row, user?.id, { allowDeleteOrgAdmin }) ? (
                          <button
                            type="button"
                            onClick={() => deactivateUser(row)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                          >
                            Disable login
                          </button>
                        ) : null}
                        <IconButton
                          label={
                            userDeleteBlockReason(row, user?.id, { allowDeleteOrgAdmin }) ??
                            "Delete user"
                          }
                          danger
                          onClick={() => softDeleteUser(row)}
                          disabled={isProtectedUserAccount(row, user?.id, { allowDeleteOrgAdmin })}
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
          wide
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
            <SearchableSelect
              className={inputClassName()}
              value={form.access_scope}
              onChange={(v) => setForm((f) => ({ ...f, access_scope: v }))}
              options={[
                { value: "org", label: "Whole organization" },
                { value: "branch", label: "Single branch only" },
              ]}
            />
          </Field>
          <Field label="Branch" required={form.access_scope === "branch" || showPosTillField}>
            <HrSearchableSelect
              value={form.branch_id}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  branch_id: v,
                  // Reset till when branch changes — till options are branch-scoped.
                  till_id: f.login_channels.includes("pos") ? "auto" : f.till_id,
                }))
              }
              options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
              placeholder={form.access_scope === "branch" ? "Select branch" : "Optional home branch"}
              required={form.access_scope === "branch" || showPosTillField}
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
              {mobileAppEnabled
                ? " Mobile-only users can sign in from the mobile app but not the web backoffice or POS."
                : posEnabled
                  ? " External POS and backoffice are available; mobile orders are disabled."
                  : " Backoffice web sign-in is available; external POS and mobile are disabled for this organization."}
            </p>
          </Field>
          {mobileAppEnabled && userHasMobileChannel(form.login_channels) ? (
            <Field label="Assigned routes (optional)">
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
                {routes.length === 0 ? (
                  <p className="text-xs text-slate-500">No active routes available.</p>
                ) : (
                  routes.map((route) => {
                    const value = String(route.id);
                    const checked = (form.assigned_route_ids ?? []).includes(value);
                    return (
                      <label key={route.id} className="flex items-center gap-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={checked}
                          onChange={() => {
                            setForm((f) => {
                              const current = f.assigned_route_ids ?? [];
                              const next = checked
                                ? current.filter((id) => id !== value)
                                : [...current, value];
                              return { ...f, assigned_route_ids: next };
                            });
                          }}
                        />
                        <span>{route.route_name ?? `Route #${route.id}`}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Leave empty to let the rep work on any route. When set, the rep is locked to the
                selected route(s) only and can switch among them in the app.
              </p>
            </Field>
          ) : null}
          {showPosTillField ? (
            <Field label="Assigned till">
              <HrSearchableSelect
                value={form.till_id}
                onChange={(v) => setForm((f) => ({ ...f, till_id: v }))}
                options={tillOptionsForForm}
                placeholder="Select till"
              />
              <p className="mt-1 text-xs text-slate-500">
                Lock this cashier to a till (Till01–Till10), or choose “Create next till” /
                leave auto so POS assigns the lowest free unlocked till on declare float.
                Tills locked to another cashier are never auto-assigned.
              </p>
            </Field>
          ) : null}
          {hospitalityPosEnabled ? (
            <Field label="Hotel & Bar outlet">
              <HrSearchableSelect
                value={form.hospitality_outlet_id}
                onChange={(v) => setForm((f) => ({ ...f, hospitality_outlet_id: v }))}
                options={[
                  { value: "", label: "Unassigned — pick Bar or Restaurant" },
                  ...hospitalityOutlets
                    .filter((o) => o.is_active !== false)
                    .map((o) => {
                      const channel =
                        String(o.outlet_type || "").toLowerCase() === "bar"
                          ? "Bar menu"
                          : "Restaurant menu";
                      return {
                        value: String(o.id),
                        label: `${o.name || o.code} · ${channel}`,
                      };
                    }),
                ]}
                placeholder="Select outlet"
              />
              <p className="mt-1 text-xs text-slate-500">
                Required for dual Bar + Restaurant orgs. Bar cashiers only see Bar products;
                Restaurant cashiers only see Restaurant / Hotel products. Manage outlets under
                Hospitality → Outlets.
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
          {form.role_id && !(editing?.is_admin) ? (
            <div className="mt-2 border-t border-[var(--theme-border)] pt-4">
              <p className="mb-2 text-sm font-medium text-slate-800">Permission overrides (optional)</p>
              <p className="mb-3 text-xs text-slate-500">
                Grant extra rights or deny role permissions for this user
                {editing ? "." : " when they are created."}
              </p>
              <UserPermissionMatrix
                applications={permissionApplications}
                groups={permissionGroups}
                rolePermissionIds={rolePermissionIds}
                grantedIds={grantedIds}
                deniedIds={deniedIds}
                onToggle={toggleDrawerPermission}
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

  if (isPlatformManaged) {
    return (
      <>
        {pageContent}
        <RbacHelpDialog />
      </>
    );
  }

  return (
    <AdminGuard>
      {pageContent}
      <RbacHelpDialog />
    </AdminGuard>
  );
}
