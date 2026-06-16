"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";
import {
  ActiveBadge,
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  PencilIcon,
  PrimaryButton,
  TrashIcon,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";

const EMPTY = { method_name: "", method_code: "", requires_reference: false, is_active: true };

export default function PaymentMethodsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(P.admin.payment_methods.create);
  const canEdit = hasPermission(P.admin.payment_methods.edit);
  const canDelete = hasPermission(P.admin.payment_methods.delete);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/payment-methods", { searchParams: { per_page: 100 } });
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      method_name: row.method_name ?? "",
      method_code: row.method_code ?? "",
      requires_reference: Boolean(row.requires_reference),
      is_active: Boolean(row.is_active),
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        method_name: form.method_name.trim(),
        method_code: form.method_code.trim().toUpperCase(),
        requires_reference: form.requires_reference,
        is_active: form.is_active,
      };
      if (editing) {
        await apiRequest(`/payment-methods/${editing.id}`, { method: "PATCH", body });
      } else {
        await apiRequest("/payment-methods", { method: "POST", body });
      }
      setDrawerOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete payment method "${row.method_name}"?`)) return;
    try {
      await apiRequest(`/payment-methods/${row.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => String(a.method_name).localeCompare(String(b.method_name))),
    [rows],
  );

  return (
    <CatalogPageShell title="Payment methods" subtitle="Tender types used at checkout, expenses, and supplier payments">
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Payment methods" }]} />

      <div className="mb-4 flex justify-end">
        {canCreate ? (
          <PrimaryButton type="button" onClick={openCreate} showIcon={false}>
            Add method
          </PrimaryButton>
        ) : null}
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Reference required</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No payment methods.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{row.method_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.method_code}</td>
                  <td className="px-4 py-3">{row.requires_reference ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <ActiveBadge active={row.is_active} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit ? (
                      <IconButton label="Edit" onClick={() => openEdit(row)}>
                        <PencilIcon />
                      </IconButton>
                    ) : null}
                    {canDelete ? (
                      <IconButton label="Delete" onClick={() => remove(row)}>
                        <TrashIcon />
                      </IconButton>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <FormDrawer open={drawerOpen} title={editing ? "Edit payment method" : "New payment method"} onClose={() => setDrawerOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Name">
            <input className={inputClassName()} value={form.method_name} onChange={(e) => setForm((f) => ({ ...f, method_name: e.target.value }))} required />
          </Field>
          <Field label="Code">
            <input className={inputClassName()} value={form.method_code} onChange={(e) => setForm((f) => ({ ...f, method_code: e.target.value.toUpperCase() }))} required />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.requires_reference} onChange={(e) => setForm((f) => ({ ...f, requires_reference: e.target.checked }))} />
            Requires payment reference
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <PrimaryButton type="submit" disabled={saving} showIcon={false}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </form>
      </FormDrawer>
    </CatalogPageShell>
  );
}
