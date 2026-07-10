"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  FormModal,
  IconButton,
  PencilIcon,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  TrashIcon,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  InventoryPageShell,
  InventoryTableShell,
  SESSION_STATUS_LABELS,
  stockTakeProductScopeLabel,
} from "@/components/inventory/inventory-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { STOCK_TAKE_SESSION_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

const EMPTY_FORM = {
  session_code: "",
  stock_location: "both",
  filter_category_id: "all",
  filter_subcategory_id: "all",
  filter_supplier_id: "all",
};

function optionalFilterId(value) {
  return value && value !== "all" ? Number(value) : null;
}

export default function StockTakeListPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [sessions, setSessions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { runQueuedTask, overlayNode } = useQueuedTask(
    "Please wait while stock take lines are prepared…",
  );

  const subCategoryOptions = useMemo(() => {
    if (form.filter_category_id === "all") {
      return subCategories;
    }
    return subCategories.filter(
      (row) => String(row.category_id) === String(form.filter_category_id),
    );
  }, [subCategories, form.filter_category_id]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [categoryRes, subCategoryRes, supplierRes] = await Promise.all([
        apiRequest("/categories", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
        apiRequest("/sub-categories", { searchParams: { per_page: 500 } }).catch(() => ({ data: [] })),
        apiRequest("/suppliers", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
      ]);
      setCategories(categoryRes.data ?? []);
      setSubCategories(subCategoryRes.data ?? []);
      setSuppliers(supplierRes.data ?? []);
    } catch {
      setCategories([]);
      setSubCategories([]);
      setSuppliers([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/stock-take-sessions", {
        searchParams: { per_page: 100, "filter[branch_id]": branchId },
      });
      setSessions(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load stock take sessions");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void loadReferenceData();
    void load();
  }, [loadReferenceData, load]);

  async function startSession() {
    if (!form.session_code.trim()) return;

    setCreating(true);
    try {
      const session = await apiRequest("/stock-take-sessions", {
        method: "POST",
        body: {
          branch_id: branchId,
          session_code: form.session_code.trim(),
          stock_location: form.stock_location,
          filter_category_id: optionalFilterId(form.filter_category_id),
          filter_subcategory_id: optionalFilterId(form.filter_subcategory_id),
          filter_supplier_id: optionalFilterId(form.filter_supplier_id),
          status: "in_progress",
          started_by: user?.id,
        },
      });

      await runQueuedTask(
        () =>
          apiRequest(`/inventory/stock-take/${session.id}/initialize`, {
            method: "POST",
          }),
        { message: "Please wait while stock take lines are prepared…" },
      );

      setModalOpen(false);
      setForm(EMPTY_FORM);
      router.push(`/inventory/stock-take/${session.id}`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to start session");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(session) {
    setEditingSession(session);
    setForm({
      session_code: session.session_code ?? "",
      stock_location: session.stock_location ?? "both",
      filter_category_id: "all",
      filter_subcategory_id: "all",
      filter_supplier_id: "all",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editingSession) return;
    setSavingEdit(true);
    try {
      await apiRequest(`/stock-take-sessions/${editingSession.id}`, {
        method: "PUT",
        body: { session_code: form.session_code.trim() },
      });
      setEditOpen(false);
      setEditingSession(null);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to update session");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteSession(session) {
    if (session.status === "completed") {
      notifyError("Completed stock takes cannot be deleted.");
      return;
    }
    const ok = await confirm({
      title: "Delete stock take",
      message: `Delete stock take "${session.session_code}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/stock-take-sessions/${session.id}`, { method: "DELETE" });
      await load();
      notifySuccess(`"${session.session_code}" deleted`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to delete session");
    }
  }

  return (
    <InventoryPageShell
      title="Stock take"
      subtitle="Count stock in the shop or warehouse and reconcile differences"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogListExport
            title="Stock take sessions"
            filename="stock-take-sessions"
            apiPath="/stock-take-sessions"
            columns={STOCK_TAKE_SESSION_EXPORT_COLUMNS}
            totalCount={sessions.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <PrimaryButton type="button" onClick={() => setModalOpen(true)}>
            New session
          </PrimaryButton>
        </div>
      }
    >
      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No stock take sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Session</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Product scope</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventory/stock-take/${session.id}`}
                        className="font-medium text-[#185FA5] hover:underline"
                      >
                        {session.session_code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">
                      {session.stock_location?.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {stockTakeProductScopeLabel(session, {
                        categories,
                        subCategories,
                        suppliers,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          session.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : session.status === "in_progress"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {SESSION_STATUS_LABELS[session.status] ?? session.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {session.status !== "completed" ? (
                          <>
                            <IconButton label="Edit" onClick={() => openEdit(session)}>
                              <PencilIcon />
                            </IconButton>
                            <IconButton label="Delete" onClick={() => deleteSession(session)}>
                              <TrashIcon />
                            </IconButton>
                          </>
                        ) : null}
                        <Link
                          href={`/inventory/stock-take/${session.id}`}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </InventoryTableShell>

      <FormModal
        title="Start stock take"
        open={modalOpen}
        onClose={() => !creating && setModalOpen(false)}
        onSubmit={startSession}
        saving={creating}
        submitLabel="Start"
      >
        <Field label="Session name">
          <input
            className={inputClassName()}
            value={form.session_code}
            onChange={(e) => setForm((p) => ({ ...p, session_code: e.target.value }))}
            placeholder="June count"
            required
          />
        </Field>
        <Field label="Warehouse / location">
          <select
            className={inputClassName()}
            value={form.stock_location}
            onChange={(e) => setForm((p) => ({ ...p, stock_location: e.target.value }))}
          >
            <option value="both">Shop and store</option>
            <option value="shop">Shop only</option>
            <option value="store">Store / warehouse only</option>
          </select>
        </Field>
        <div className="theme-panel rounded-lg border px-3 py-3">
          <p className="text-sm font-medium theme-heading">Product scope</p>
          <p className="mt-1 text-xs theme-subtext">
            Optional. Limit this count to a supplier, category, or subcategory instead of every product.
          </p>
          <div className="mt-3 space-y-3">
            <Field label="Supplier">
              <select
                className={inputClassName()}
                value={form.filter_supplier_id}
                onChange={(e) =>
                  setForm((p) => ({ ...p, filter_supplier_id: e.target.value }))
                }
              >
                <option value="all">All suppliers</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={String(supplier.id)}>
                    {supplier.supplier_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                className={inputClassName()}
                value={form.filter_category_id}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    filter_category_id: e.target.value,
                    filter_subcategory_id: "all",
                  }))
                }
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.category_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subcategory">
              <select
                className={inputClassName()}
                value={form.filter_subcategory_id}
                onChange={(e) =>
                  setForm((p) => ({ ...p, filter_subcategory_id: e.target.value }))
                }
              >
                <option value="all">All subcategories</option>
                {subCategoryOptions.map((subCategory) => (
                  <option key={subCategory.id} value={String(subCategory.id)}>
                    {subCategory.subcategory_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </FormModal>

      <FormModal
        title="Edit session"
        open={editOpen}
        onClose={() => !savingEdit && setEditOpen(false)}
        onSubmit={saveEdit}
        saving={savingEdit}
        submitLabel="Save"
      >
        <Field label="Session name">
          <input
            className={inputClassName()}
            value={form.session_code}
            onChange={(e) => setForm((p) => ({ ...p, session_code: e.target.value }))}
            required
          />
        </Field>
      </FormModal>
      {overlayNode}
    </InventoryPageShell>
  );
}
