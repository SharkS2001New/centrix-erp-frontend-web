"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAdminApi } from "@/contexts/admin-api-context";
import { P } from "@/lib/permission-codes";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  inputClassName,
  PencilIcon,
  PrimaryButton,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TrashIcon,
} from "@/components/catalog/catalog-shared";

const EMPTY_FORM = {
  vat_code: "",
  vat_name: "",
  vat_percentage: "",
  is_active: true,
};

export default function VatsPage() {
  const { adminPath, isPlatformManaged } = useAdminApi();
  const [vats, setVats] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [vatRes, prodRes, userRes] = await Promise.all([
        apiRequest(adminPath("/vats"), { searchParams: { per_page: 100 } }),
        apiRequest(adminPath("/products"), { searchParams: { per_page: 200 } }),
        apiRequest(adminPath("/users"), { searchParams: { per_page: 200 } }),
      ]);
      setVats(vatRes.data ?? vatRes ?? []);
      setProducts(prodRes.data ?? []);
      setUsers(userRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load VAT rates");
    } finally {
      setLoading(false);
    }
  }, [adminPath]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const productCountByVat = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      if (p.vat_id != null) {
        map.set(p.vat_id, (map.get(p.vat_id) ?? 0) + 1);
      }
    }
    return map;
  }, [products]);

  const drawerTitle = drawerMode === "create" ? "Add VAT rate" : "Edit VAT rate";

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(vat) {
    setDrawerMode("edit");
    setEditingId(vat.id);
    setForm({
      vat_code: vat.vat_code ?? "",
      vat_name: vat.vat_name ?? "",
      vat_percentage: vat.vat_percentage ?? "",
      is_active: vat.is_active !== false,
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveForm(e) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const body = {
      vat_code: form.vat_code.trim(),
      vat_name: form.vat_name.trim(),
      vat_percentage: parseFloat(form.vat_percentage),
      is_active: form.is_active,
    };
    try {
      if (drawerMode === "create") {
        await apiRequest(adminPath("/vats"), { method: "POST", body });
      } else {
        await apiRequest(adminPath(`/vats/${editingId}`), { method: "PUT", body });
      }
      await loadData();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVat(vat) {
    const count = productCountByVat.get(vat.id) ?? 0;
    const msg =
      count > 0
        ? `"${vat.vat_name}" is used by ${count} product(s). Delete anyway?`
        : `Delete VAT rate "${vat.vat_name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await apiRequest(adminPath(`/vats/${vat.id}`), { method: "DELETE" });
      if (editingId === vat.id) closeDrawer();
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <CatalogPageShell
      title="VAT rates"
      subtitle="Configure tax codes and percentages for products"
      action={
        <PrimaryButton
          onClick={openCreateDrawer}
          permission={isPlatformManaged ? null : P.catalogue.vat_rates.create}
        >
          Add VAT rate
        </PrimaryButton>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className={TABLE_SHELL_CLASS}>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading VAT rates…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW_CLASS}>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Rate</th>
                  <th className="px-4 py-2.5">Products using</th>
                  <th className="px-4 py-2.5">Created by</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="w-[90px] px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vats.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      No VAT rates yet. Add one to get started.
                    </td>
                  </tr>
                ) : (
                  vats.map((vat) => {
                    const creator = userById.get(vat.created_by);
                    const creatorName = creator?.username ?? creator?.full_name ?? "—";
                    const count = productCountByVat.get(vat.id) ?? 0;
                    return (
                      <tr
                        key={vat.id}
                        className={TABLE_BODY_ROW_CLASS}
                      >
                        <td className="px-4 py-3.5">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm font-medium text-slate-800">
                            {vat.vat_code}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-900">{vat.vat_name}</td>
                        <td className="px-4 py-3.5">
                          <RatePill rate={vat.vat_percentage} />
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">
                          {count} {count === 1 ? "product" : "products"}
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">{creatorName}</td>
                        <td className="px-4 py-3.5">
                          <StatusBadge active={vat.is_active !== false} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-1">
                            <IconButton label="Edit" onClick={() => openEditDrawer(vat)}>
                              <PencilIcon />
                            </IconButton>
                            <IconButton label="Delete" danger onClick={() => deleteVat(vat)}>
                              <TrashIcon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FormDrawer
        title={drawerTitle}
        open={drawerOpen}
        onClose={closeDrawer}
        onSubmit={saveForm}
        saving={saving}
        error={formError}
        submitLabel={drawerMode === "create" ? "Add VAT rate" : "Save changes"}
      >
        <Field label="VAT code">
          <input
            type="text"
            value={form.vat_code}
            onChange={(e) => updateField("vat_code", e.target.value.toUpperCase())}
            required
            maxLength={20}
            className={`${inputClassName()} font-mono font-medium`}
            placeholder="V"
          />
        </Field>
        <Field label="VAT name">
          <input
            type="text"
            value={form.vat_name}
            onChange={(e) => updateField("vat_name", e.target.value)}
            required
            className={inputClassName()}
            placeholder="Standard rated"
          />
        </Field>
        <Field label="Percentage (%)">
          <input
            type="number"
            value={form.vat_percentage}
            onChange={(e) => updateField("vat_percentage", e.target.value)}
            required
            min="0"
            max="100"
            step="0.01"
            className={inputClassName()}
          />
        </Field>
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-sm text-slate-900">Active</span>
          <button
            type="button"
            role="switch"
            aria-checked={form.is_active}
            onClick={() => updateField("is_active", !form.is_active)}
            className={`relative h-5 w-9 rounded-full transition ${
              form.is_active ? "bg-[#185FA5]" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition ${
                form.is_active ? "translate-x-4" : ""
              }`}
            />
          </button>
        </div>
      </FormDrawer>
    </CatalogPageShell>
  );
}

function RatePill({ rate }) {
  return (
    <span className="inline-flex min-w-[52px] items-center justify-center rounded-full bg-[#E6F1FB] px-2.5 py-1 text-sm font-medium text-[#0C447C]">
      {Number(rate)}%
    </span>
  );
}

function StatusBadge({ active }) {
  return active ? (
    <span className="inline-flex rounded-full bg-[#EAF3DE] px-2.5 py-0.5 text-[11px] font-medium text-[#27500A]">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-[#FCEBEB] px-2.5 py-0.5 text-[11px] font-medium text-[#791F1F]">
      Inactive
    </span>
  );
}
