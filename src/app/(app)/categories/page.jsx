"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  ActiveBadge,
  CatalogPageShell,
  Field,
  FilterSelect,
  FormDrawer,
  IconButton,
  inputClassName,
  PaginationBar,
  ParentChip,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SECTION_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TrashIcon,
  formatShortDate,
} from "@/components/catalog/catalog-shared";

const PAGE_SIZE = 15;

function rowKey(type, id) {
  return `${type}-${id}`;
}

function buildTreeRows(categories, subCategories, collapsed, search, typeFilter) {
  const q = search.trim().toLowerCase();
  const rows = [];

  for (const cat of categories) {
    const subs = subCategories.filter((s) => s.category_id === cat.id);
    const catMatches = !q || cat.category_name?.toLowerCase().includes(q);
    const matchingSubs = subs.filter(
      (s) => !q || s.subcategory_name?.toLowerCase().includes(q),
    );

    if (q && !catMatches && matchingSubs.length === 0) continue;

    const showCategory = typeFilter !== "sub";
    const showSubs = typeFilter !== "root";

    if (showCategory) {
      rows.push({ type: "category", id: cat.id, category: cat, subs });
    }

    if (showSubs && !collapsed.has(cat.id)) {
      const subsToShow = q && !catMatches ? matchingSubs : subs;
      for (const sub of subsToShow) {
        if (q && !sub.subcategory_name?.toLowerCase().includes(q) && !catMatches) continue;
        rows.push({
          type: "subcategory",
          id: sub.id,
          subcategory: sub,
          category: cat,
        });
      }
    }
  }

  return rows;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [collapsed, setCollapsed] = useState(new Set());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalKind, setModalKind] = useState("category");
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [catRes, subRes, prodRes, userRes] = await Promise.all([
        apiRequest("/categories", { searchParams: { per_page: 200 } }),
        apiRequest("/sub-categories", { searchParams: { per_page: 200 } }),
        apiRequest("/products", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
      ]);
      setCategories(catRes.data ?? []);
      setSubCategories(subRes.data ?? []);
      setProducts(prodRes.data ?? []);
      setUsers(userRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const productCountBySub = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      if (p.subcategory_id != null) {
        map.set(p.subcategory_id, (map.get(p.subcategory_id) ?? 0) + 1);
      }
    }
    return map;
  }, [products]);

  const productCountByCategory = useMemo(() => {
    const subToCat = new Map(subCategories.map((s) => [s.id, s.category_id]));
    const map = new Map();
    for (const p of products) {
      const catId = subToCat.get(p.subcategory_id);
      if (catId != null) map.set(catId, (map.get(catId) ?? 0) + 1);
    }
    return map;
  }, [products, subCategories]);

  const treeRows = useMemo(
    () => buildTreeRows(categories, subCategories, collapsed, search, typeFilter),
    [categories, subCategories, collapsed, search, typeFilter],
  );

  const totalPages = Math.max(1, Math.ceil(treeRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = treeRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function toggleCollapse(categoryId) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function openCreateCategory() {
    setModalKind("category");
    setEditingId(null);
    setName("");
    setParentCategoryId("");
    setFormError(null);
    setDrawerOpen(true);
  }

  function openCreateSubCategory(parentId) {
    setModalKind("subcategory");
    setEditingId(null);
    setName("");
    setParentCategoryId(String(parentId ?? categories[0]?.id ?? ""));
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditCategory(cat) {
    setModalKind("category");
    setEditingId(cat.id);
    setName(cat.category_name ?? "");
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditSubCategory(sub) {
    setModalKind("subcategory");
    setEditingId(sub.id);
    setName(sub.subcategory_name ?? "");
    setParentCategoryId(String(sub.category_id ?? ""));
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  async function saveForm(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (modalKind === "category") {
        const body = { category_name: name.trim() };
        if (editingId) {
          await apiRequest(`/categories/${editingId}`, { method: "PUT", body });
        } else {
          await apiRequest("/categories", { method: "POST", body });
        }
      } else {
        const body = {
          subcategory_name: name.trim(),
          category_id: Number(parentCategoryId),
        };
        if (editingId) {
          await apiRequest(`/sub-categories/${editingId}`, { method: "PUT", body });
        } else {
          await apiRequest("/sub-categories", { method: "POST", body });
        }
      }
      await loadData();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(cat) {
    const subs = subCategories.filter((s) => s.category_id === cat.id);
    const prodCount = productCountByCategory.get(cat.id) ?? 0;
    if (
      !window.confirm(
        `Delete "${cat.category_name}" and ${subs.length} sub-categor${subs.length === 1 ? "y" : "ies"}? ${prodCount} product(s) linked.`,
      )
    ) {
      return;
    }
    try {
      await apiRequest(`/categories/${cat.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSubCategory(sub) {
    const count = productCountBySub.get(sub.id) ?? 0;
    if (!window.confirm(`Delete "${sub.subcategory_name}"? ${count} product(s) linked.`)) {
      return;
    }
    try {
      await apiRequest(`/sub-categories/${sub.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  const allSelected =
    pageSlice.length > 0 && pageSlice.every((r) => selected.has(rowKey(r.type, r.id)));

  return (
    <CatalogPageShell
      title="Categories"
      subtitle="Manage product categories and sub-categories in one hierarchy"
      action={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openCreateSubCategory()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add sub-category
          </button>
          <PrimaryButton onClick={openCreateCategory}>Add category</PrimaryButton>
        </div>
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories or sub-categories…"
            className="max-w-sm"
          />
          <FilterSelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: "all", label: "All types" },
              { value: "root", label: "Root only" },
              { value: "sub", label: "Sub-categories only" },
            ]}
          />
        </div>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className={TABLE_SHELL_CLASS}>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? new Set(pageSlice.map((r) => rowKey(r.type, r.id)))
                              : new Set(),
                          )
                        }
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Parent</th>
                    <th className="px-4 py-2.5">Sub-categories</th>
                    <th className="px-4 py-2.5">Products</th>
                    <th className="px-4 py-2.5">Created</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="w-[110px] px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No categories match your filters.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => {
                      const key = rowKey(row.type, row.id);
                      if (row.type === "category") {
                        const cat = row.category;
                        const subCount = row.subs.length;
                        const isCollapsed = collapsed.has(cat.id);
                        return (
                          <tr
                            key={key}
                            className={TABLE_SECTION_ROW_CLASS}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selected.has(key)}
                                onChange={() =>
                                  setSelected((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(key)) next.delete(key);
                                    else next.add(key);
                                    return next;
                                  })
                                }
                                className="rounded border-slate-300"
                              />
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              <button
                                type="button"
                                onClick={() => toggleCollapse(cat.id)}
                                className="mr-1.5 inline-flex align-middle text-slate-400 hover:text-slate-600"
                                aria-label={isCollapsed ? "Expand" : "Collapse"}
                              >
                                {subCount > 0 ? (
                                  isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />
                                ) : (
                                  <span className="inline-block w-3.5" />
                                )}
                              </button>
                              {cat.category_name}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">— root —</td>
                            <td className="px-4 py-3">{subCount}</td>
                            <td className="px-4 py-3">
                              {productCountByCategory.get(cat.id) ?? 0}
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {formatShortDate(cat.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              <ActiveBadge />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <IconButton
                                  label="Add sub-category"
                                  onClick={() => openCreateSubCategory(cat.id)}
                                >
                                  <PlusSmallIcon />
                                </IconButton>
                                <IconButton label="Edit" onClick={() => openEditCategory(cat)}>
                                  <PencilIcon />
                                </IconButton>
                                <IconButton
                                  label="Delete"
                                  danger
                                  onClick={() => deleteCategory(cat)}
                                >
                                  <TrashIcon />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      const sub = row.subcategory;
                      const creator = userById.get(sub.created_by);
                      return (
                        <tr
                          key={key}
                          className={TABLE_BODY_ROW_CLASS}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={() =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                })
                              }
                              className="rounded border-slate-300"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <span className="inline-flex items-center pl-8">
                              <CornerIcon />
                              {sub.subcategory_name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ParentChip label={row.category.category_name} />
                          </td>
                          <td className="px-4 py-3 text-slate-400">—</td>
                          <td className="px-4 py-3">{productCountBySub.get(sub.id) ?? 0}</td>
                          <td className="px-4 py-3 text-slate-500">
                            {formatShortDate(sub.created_at)}
                            {creator && (
                              <span className="mt-0.5 block text-xs text-slate-400">
                                {creator.username ?? creator.full_name}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <ActiveBadge />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <IconButton label="Edit" onClick={() => openEditSubCategory(sub)}>
                                <PencilIcon />
                              </IconButton>
                              <IconButton
                                label="Delete"
                                danger
                                onClick={() => deleteSubCategory(sub)}
                              >
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
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={treeRows.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>

      <FormDrawer
        title={
          editingId
            ? modalKind === "category"
              ? "Edit category"
              : "Edit sub-category"
            : modalKind === "category"
              ? "Add category"
              : "Add sub-category"
        }
        open={drawerOpen}
        onClose={closeDrawer}
        onSubmit={saveForm}
        saving={saving}
        error={formError}
        submitLabel={editingId ? "Save changes" : "Save"}
      >
        {modalKind === "subcategory" && (
          <Field label="Parent category">
            <select
              value={parentCategoryId}
              onChange={(e) => setParentCategoryId(e.target.value)}
              required
              className={inputClassName()}
            >
              <option value="" disabled>
                Select category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.category_name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={modalKind === "category" ? "Category name" : "Sub-category name"}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputClassName()}
            placeholder={modalKind === "category" ? "Beverages" : "Soft drinks"}
          />
        </Field>
      </FormDrawer>
    </CatalogPageShell>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CornerIcon() {
  return (
    <svg
      className="mr-1 text-slate-400"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="15 10 15 15 10 15" />
      <path d="M20 4H9a2 2 0 0 0-2 2v11" />
    </svg>
  );
}

function PlusSmallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
