"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  ActiveBadge,
  CatalogPageShell,
  Field,
  FilterSelect,
  FilterToolbar,
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
import { useListPageSize } from "@/lib/use-list-page-controls";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { CatalogDataImportButton, filterNonEmptyImportRows, mapImportHeaders } from "@/components/catalog/catalog-data-import";
import { CATEGORY_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { toast } from "@/lib/toast";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import {
  BatchActionBar,
  BatchDeleteButton,
  TableRowSelectCell,
  TableSelectAllHeader,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";


const SUBCATEGORY_IMPORT_COLUMNS = [
  { key: "subcategory_name", label: "Subcategory" },
  { key: "category_name", label: "Category" },
  { key: "category_id", label: "Category ID" },
];

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
  const confirm = useConfirm();
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { search, setSearch } = useListUrlSearch();
  const [typeFilter, setTypeFilter] = useState("all");
  const [collapsed, setCollapsed] = useState(new Set());
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const {
    selectedIds: selected,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalKind, setModalKind] = useState("category");
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadData = useCallback(async () => {
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
      notifyError(e instanceof Error ? e.message : "Failed to load categories");
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

  const totalPages = Math.max(1, Math.ceil(treeRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = treeRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageRowIds = useMemo(() => pageSlice.map((r) => rowKey(r.type, r.id)), [pageSlice]);
  const allSelected = isAllOnPageSelected(pageRowIds);
  const someSelected = isSomeOnPageSelected(pageRowIds);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

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
    const ok = await confirm({
      title: "Delete category",
      message: `Delete "${cat.category_name}" and ${subs.length} sub-categor${subs.length === 1 ? "y" : "ies"}? ${prodCount} product(s) linked.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/categories/${cat.id}`, { method: "DELETE" });
      await loadData();
      toast.success(`"${cat.category_name}" deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSubCategory(sub) {
    const count = productCountBySub.get(sub.id) ?? 0;
    const ok = await confirm({
      title: "Delete sub-category",
      message: `Delete "${sub.subcategory_name}"? ${count} product(s) linked.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/sub-categories/${sub.id}`, { method: "DELETE" });
      await loadData();
      toast.success(`"${sub.subcategory_name}" deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSelectedRows() {
    const keys = [...selected];
    if (keys.length === 0) return;

    const ok = await confirm({
      title: "Delete selected",
      message: `Delete ${keys.length} selected categor${keys.length === 1 ? "y" : "ies"} / sub-categor${keys.length === 1 ? "y" : "ies"}?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBatchDeleting(true);
    let succeeded = 0;
    const failed = [];

    try {
      for (const key of keys) {
        const dash = key.indexOf("-");
        const type = key.slice(0, dash);
        const id = key.slice(dash + 1);
        try {
          if (type === "category") {
            await apiRequest(`/categories/${id}`, { method: "DELETE" });
          } else {
            await apiRequest(`/sub-categories/${id}`, { method: "DELETE" });
          }
          succeeded += 1;
        } catch (e) {
          failed.push({
            key,
            message: e instanceof ApiError ? e.message : "Delete failed",
          });
        }
      }

      clearSelection();
      await loadData();

      if (failed.length === 0) {
        toast.success(`Deleted ${succeeded} item${succeeded === 1 ? "" : "s"}`);
      } else if (succeeded === 0) {
        toast.error(failed[0]?.message ?? "Delete failed");
      } else {
        toast.error(`Deleted ${succeeded}; ${failed.length} failed`);
      }
    } finally {
      setBatchDeleting(false);
    }
  }

  return (
    <CatalogPageShell
      title="Categories"
      subtitle="Manage product categories and sub-categories in one hierarchy"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogDataImportButton
            label="Import categories"
            title="Import categories"
            description="Upload CSV or Excel with category_name for each row."
            sampleHeaders={["category_name"]}
            sampleRow={["Beverages"]}
            apiPath="/categories/import-batch"
            normalizeRows={(rows) => filterNonEmptyImportRows(rows, ["category_name"])}
            onImported={loadData}
            importPage="categories"
          />
          <CatalogDataImportButton
            label="Import sub-categories"
            title="Import sub-categories"
            description="Upload CSV or Excel with subcategory_name and category_name (or category_id)."
            sampleHeaders={["category_name", "subcategory_name"]}
            sampleRow={["Beverages", "Soft drinks"]}
            apiPath="/sub-categories/import-batch"
            normalizeRows={(rows) =>
              filterNonEmptyImportRows(mapImportHeaders(rows, SUBCATEGORY_IMPORT_COLUMNS), ["subcategory_name"])
            }
            onImported={loadData}
            importPage="categories"
          />
          <CatalogListExport
            title="Categories"
            apiPath="/categories"
            columns={CATEGORY_EXPORT_COLUMNS}
            totalCount={categories.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => openCreateSubCategory()}
            className="inline-flex items-center gap-1.5 theme-secondary-btn rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Add sub-category
          </button>
          <PrimaryButton onClick={openCreateCategory}>Add category</PrimaryButton>
        </div>
      }
      toolbar={
        <FilterToolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories or sub-categories…"
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
        </FilterToolbar>
      }
    >
      <div className={TABLE_SHELL_CLASS}>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <TableSelectAllHeader
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                    />
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
                            <TableRowSelectCell
                              checked={selected.has(key)}
                              onChange={() => toggleOne(key)}
                              label={`Select ${cat.category_name}`}
                            />
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
                          <TableRowSelectCell
                            checked={selected.has(key)}
                            onChange={() => toggleOne(key)}
                            label={`Select ${sub.subcategory_name}`}
                          />
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <span className="pl-8">{sub.subcategory_name}</span>
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
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
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
        <Field label={modalKind === "category" ? "Category name" : "Sub-category name"} required>
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

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <BatchDeleteButton
          count={selectedCount}
          busy={batchDeleting}
          onClick={() => void deleteSelectedRows()}
        />
      </BatchActionBar>
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

function PlusSmallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
