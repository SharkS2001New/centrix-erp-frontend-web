"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { PasswordInput } from "@/components/auth/password-input";
import { useAuth } from "@/contexts/auth-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { hasPlatformAreaPermission } from "@/lib/platform-nav";

const EMPTY_FORM = {
  username: "",
  email: "",
  full_name: "",
  password: "",
  password_confirmation: "",
  full_access: false,
  areas: [],
  is_active: true,
};

export default function PlatformAdminsPage() {
  const { capabilities, refreshCapabilities } = useAuth();
  const confirm = useConfirm();
  const canManage = hasPlatformAreaPermission(capabilities, "admins");
  const actorIsOwner = Boolean(capabilities?.platform_full_access);

  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [cat, list] = await Promise.all([
        apiRequest("/admin/platform-admins/permission-catalog"),
        apiRequest("/admin/platform-admins"),
      ]);
      setCatalog(Array.isArray(cat?.permissions) ? cat.permissions : []);
      setRows(Array.isArray(list?.data) ? list.data : []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load platform admins.");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const grantableAreas = useMemo(() => {
    if (actorIsOwner) return catalog;
    const allowed = new Set(capabilities?.platform_permissions || []);
    return catalog.filter((item) => allowed.has(item.code));
  }, [actorIsOwner, capabilities?.platform_permissions, catalog]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      username: row.username || "",
      email: row.email || "",
      full_name: row.full_name || "",
      password: "",
      password_confirmation: "",
      full_access: Boolean(row.full_access),
      areas: Array.isArray(row.areas) ? [...row.areas] : [],
      is_active: Boolean(row.is_active),
    });
  }

  function toggleArea(code) {
    setForm((prev) => {
      const has = prev.areas.includes(code);
      return {
        ...prev,
        full_access: false,
        areas: has ? prev.areas.filter((c) => c !== code) : [...prev.areas, code],
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    try {
      const body = {
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        is_active: form.is_active,
        full_access: form.full_access,
        platform_permissions: form.full_access ? null : form.areas,
      };
      if (editingId) {
        if (form.password) {
          body.password = form.password;
          body.password_confirmation = form.password_confirmation;
        }
        await apiRequest(`/admin/platform-admins/${editingId}`, { method: "PATCH", body });
        notifySuccess("Platform admin updated.");
      } else {
        body.username = form.username.trim();
        body.password = form.password;
        body.password_confirmation = form.password_confirmation;
        await apiRequest("/admin/platform-admins", { method: "POST", body });
        notifySuccess("Platform admin created. They must enable 2FA on first sign-in.");
      }
      resetForm();
      await load();
      await refreshCapabilities?.({ force: true });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save platform admin.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    const ok = await confirm({
      title: "Remove platform admin?",
      message: `Remove ${row.full_name || row.username}? They will lose platform access immediately.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/admin/platform-admins/${row.id}`, { method: "DELETE" });
      notifySuccess("Platform admin removed.");
      if (editingId === row.id) resetForm();
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not remove platform admin.");
    }
  }

  if (!canManage) {
    return (
      <CatalogPageShell
        title="Platform admins"
        description="You do not have permission to manage platform administrator accounts."
      >
        <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Admins" }]} />
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="Platform admins"
      description="Create additional platform administrators, limit which areas they can use, and require two-factor authentication on every account."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Admins" }]} />

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {editingId ? "Edit platform admin" : "Create platform admin"}
            </h2>
            {editingId ? (
              <button type="button" className="text-xs font-medium text-[#185FA5]" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
          <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
            {!editingId ? (
              <Field label="Username" required>
                <input
                  className={inputClassName()}
                  value={form.username}
                  onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                  required
                  autoComplete="off"
                  placeholder="e.g. ops.admin"
                />
              </Field>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-600">
                Username: <span className="font-medium text-slate-900">{form.username}</span>
              </p>
            )}
            <Field label="Full name" required>
              <input
                className={inputClassName()}
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                required
                placeholder="Full legal name"
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email"
                className={inputClassName()}
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
                placeholder="admin@example.com"
              />
            </Field>
            <Field
              label={editingId ? "New password (optional)" : "Temporary password"}
              required={!editingId}
            >
              <PasswordInput
                className={inputClassName()}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                required={!editingId}
                autoComplete="new-password"
                placeholder={editingId ? "Leave blank to keep current password" : "Temporary password"}
              />
            </Field>
            <Field label="Confirm password" required={!editingId || Boolean(form.password)}>
              <PasswordInput
                className={inputClassName()}
                value={form.password_confirmation}
                onChange={(e) => setForm((p) => ({ ...p, password_confirmation: e.target.value }))}
                required={!editingId || Boolean(form.password)}
                autoComplete="new-password"
                placeholder="Confirm password"
              />
            </Field>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Permissions</p>
              {actorIsOwner ? (
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.full_access}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        full_access: e.target.checked,
                        areas: e.target.checked ? grantableAreas.map((a) => a.code) : p.areas,
                      }))
                    }
                  />
                  Full platform access (owner)
                </label>
              ) : null}
              <div className="mt-3 space-y-2">
                {grantableAreas.map((area) => (
                  <label key={area.code} className="flex items-start gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={form.full_access}
                      checked={form.full_access || form.areas.includes(area.code)}
                      onChange={() => toggleArea(area.code)}
                    />
                    <span>
                      <span className="font-medium">{area.label}</span>
                      <span className="block text-xs text-slate-500">{area.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-amber-800">
                New accounts must enable two-factor authentication on first sign-in before platform APIs unlock.
              </p>
            </div>

            {editingId ? (
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Active
              </label>
            ) : null}

            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create admin"}
            </PrimaryButton>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Existing admins</h2>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No platform admins found.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {row.full_name || row.username}
                      {row.is_self ? (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.username} · {row.email || "no email"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {row.full_access
                        ? "Full access"
                        : row.areas?.length
                          ? row.areas.join(", ")
                          : "No areas"}
                      {" · "}
                      {row.two_factor_enabled ? (
                        <span className="text-emerald-700">2FA on</span>
                      ) : (
                        <span className="text-amber-700">2FA required</span>
                      )}
                      {!row.is_active ? <span className="text-red-700"> · inactive</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => startEdit(row)}
                    >
                      Edit
                    </button>
                    {!row.is_self ? (
                      <button
                        type="button"
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        onClick={() => void handleDelete(row)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </CatalogPageShell>
  );
}
