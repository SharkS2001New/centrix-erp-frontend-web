"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FormDrawer,
  IconButton,
  inputClassName,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  TrashIcon,
  UomBadge,
  formatKesMarkup,
} from "@/components/catalog/catalog-shared";

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  product_code: "",
  max_qty_measure: "",
  max_uom_measure: "",
  markup_price: "",
  wholesale_qty_measure: "",
  min_uom_measure: "",
  wholesale_markup_price: "",
};

export default function RetailPackageSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subCategoryFilter, setSubCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [setRes, prodRes, catRes, subRes] = await Promise.all([
        apiRequest("/retail-package-settings", { searchParams: { per_page: 200 } }),
        apiRequest("/products", { searchParams: { per_page: 200 } }),
        apiRequest("/categories", { searchParams: { per_page: 200 } }),
        apiRequest("/sub-categories", { searchParams: { per_page: 200 } }),
      ]);
      setSettings(setRes.data ?? []);
      setProducts(prodRes.data ?? []);
      setCategories(catRes.data ?? []);
      setSubCategories(subRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load package settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );
  const subById = useMemo(
    () => new Map(subCategories.map((s) => [s.id, s])),
    [subCategories],
  );

  const enriched = useMemo(
    () =>
      settings.map((row) => {
        const product = productByCode.get(row.product_code);
        const sub = product ? subById.get(product.subcategory_id) : null;
        return {
          ...row,
          product_name: product?.product_name ?? "—",
          category_id: sub?.category_id ?? null,
          subcategory_id: product?.subcategory_id ?? null,
        };
      }),
    [settings, productByCode, subById],
  );

  const subCategoryOptions = useMemo(() => {
    if (categoryFilter === "all") return subCategories;
    return subCategories.filter((s) => String(s.category_id) === categoryFilter);
  }, [subCategories, categoryFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((row) => {
      if (
        q &&
        !row.product_name?.toLowerCase().includes(q) &&
        !row.product_code?.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (categoryFilter !== "all" && String(row.category_id) !== categoryFilter) {
        return false;
      }
      if (subCategoryFilter !== "all" && String(row.subcategory_id) !== subCategoryFilter) {
        return false;
      }
      return true;
    });
  }, [enriched, search, categoryFilter, subCategoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, subCategoryFilter]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, product_code: products[0]?.product_code ?? "" });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm({
      product_code: row.product_code ?? "",
      max_qty_measure: row.max_qty_measure ?? "",
      max_uom_measure: row.max_uom_measure ?? "",
      markup_price: row.markup_price ?? "",
      wholesale_qty_measure: row.wholesale_qty_measure ?? "",
      min_uom_measure: row.min_uom_measure ?? "",
      wholesale_markup_price: row.wholesale_markup_price ?? "",
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function saveSetting(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const body = {
      product_code: form.product_code,
      max_qty_measure: form.max_qty_measure === "" ? null : parseFloat(form.max_qty_measure),
      max_uom_measure: form.max_uom_measure || null,
      markup_price: form.markup_price === "" ? 0 : parseFloat(form.markup_price),
      wholesale_qty_measure:
        form.wholesale_qty_measure === "" ? 0 : parseFloat(form.wholesale_qty_measure),
      min_uom_measure: form.min_uom_measure || null,
      wholesale_markup_price:
        form.wholesale_markup_price === "" ? 0 : parseFloat(form.wholesale_markup_price),
    };
    try {
      if (editingId) {
        await apiRequest(`/retail-package-settings/${editingId}`, { method: "PUT", body });
      } else {
        await apiRequest("/retail-package-settings", { method: "POST", body });
      }
      await loadData();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSetting(row) {
    if (!window.confirm(`Delete package setting for ${row.product_code}?`)) return;
    try {
      await apiRequest(`/retail-package-settings/${row.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  const productsWithoutSetting = useMemo(() => {
    const used = new Set(settings.map((s) => s.product_code));
    return products.filter((p) => !used.has(p.product_code));
  }, [products, settings]);

  const productOptions = useMemo(() => {
    if (editingId) {
      return products.filter((p) => p.product_code === form.product_code);
    }
    return productsWithoutSetting.length ? productsWithoutSetting : products;
  }, [editingId, products, productsWithoutSetting, form.product_code]);

  const allSelected =
    pageSlice.length > 0 && pageSlice.every((r) => selected.has(r.id));

  return (
    <CatalogPageShell
      title="Retail package settings"
      subtitle="Configure retail and wholesale pack sizes and markup prices per product"
      action={<PrimaryButton onClick={openCreate}>Add package setting</PrimaryButton>}
      banner={
        <div className="mb-3.5 flex items-start gap-2.5 rounded-lg border border-[#B5D4F4] bg-[#E6F1FB] px-3.5 py-2.5 text-xs leading-relaxed text-[#0C447C]">
          <InfoIcon />
          <span>
            Retail price per unit = <strong>(unit_price ÷ max_qty_measure) + markup_price</strong>.
            Wholesale price = <strong>unit_price + wholesale_markup_price</strong>. These override
            base product pricing at checkout.
          </span>
        </div>
      }
      toolbar={
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name or code…"
            className="max-w-none min-w-[220px]"
          />
          <FilterSelect
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setSubCategoryFilter("all");
            }}
            options={[
              { value: "all", label: "All categories" },
              ...categories.map((c) => ({ value: String(c.id), label: c.category_name })),
            ]}
          />
          <FilterSelect
            value={subCategoryFilter}
            onChange={(e) => setSubCategoryFilter(e.target.value)}
            options={[
              { value: "all", label: "All sub-categories" },
              ...subCategoryOptions.map((s) => ({
                value: String(s.id),
                label: s.subcategory_name,
              })),
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading package settings…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="w-9 px-3.5 py-2.5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? new Set(pageSlice.map((r) => r.id))
                              : new Set(),
                          )
                        }
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th className="w-[95px] px-3.5 py-2.5">Product code</th>
                    <th className="px-3.5 py-2.5">Product name</th>
                    <th className="w-[82px] px-3.5 py-2.5">Pack qty</th>
                    <th className="w-[90px] px-3.5 py-2.5">Retail UOM</th>
                    <th className="w-[90px] px-3.5 py-2.5">Markup (retail)</th>
                    <th className="w-[82px] px-3.5 py-2.5">W&apos;sale qty</th>
                    <th className="w-[100px] px-3.5 py-2.5">W&apos;sale UOM</th>
                    <th className="w-[100px] px-3.5 py-2.5">Markup (w&apos;sale)</th>
                    <th className="w-[80px] px-3.5 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                        No package settings match your filters.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-3.5 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              })
                            }
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className="px-3.5 py-3">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                            {row.product_code}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 font-medium text-slate-900">
                          {row.product_name}
                        </td>
                        <td className="px-3.5 py-3 font-mono text-sm">
                          {row.max_qty_measure ?? "—"}
                        </td>
                        <td className="px-3.5 py-3">
                          <UomBadge label={row.max_uom_measure} />
                        </td>
                        <td className="px-3.5 py-3 font-mono text-sm text-[#27500A]">
                          {formatKesMarkup(row.markup_price)}
                        </td>
                        <td className="px-3.5 py-3 font-mono text-sm">
                          {row.wholesale_qty_measure ?? "—"}
                        </td>
                        <td className="px-3.5 py-3">
                          <UomBadge label={row.min_uom_measure} variant="purple" />
                        </td>
                        <td className="px-3.5 py-3 font-mono text-sm text-[#27500A]">
                          {formatKesMarkup(row.wholesale_markup_price)}
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="flex gap-1">
                            <IconButton label="Edit" onClick={() => openEdit(row)}>
                              <PencilIcon />
                            </IconButton>
                            <IconButton label="Delete" danger onClick={() => deleteSetting(row)}>
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
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>

      <FormDrawer
        title={editingId ? "Edit package setting" : "Add package setting"}
        open={drawerOpen}
        onClose={closeDrawer}
        onSubmit={saveSetting}
        saving={saving}
        error={formError}
        submitLabel={editingId ? "Save changes" : "Add setting"}
        wide
      >
        <Field label="Product">
          <select
            value={form.product_code}
            onChange={(e) => updateForm("product_code", e.target.value)}
            required
            disabled={!!editingId}
            className={inputClassName()}
          >
            <option value="" disabled>
              Select product
            </option>
            {productOptions.map((p) => (
              <option key={p.product_code} value={p.product_code}>
                {p.product_name} ({p.product_code})
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pack qty (max)">
            <input
              type="number"
              step="any"
              value={form.max_qty_measure}
              onChange={(e) => updateForm("max_qty_measure", e.target.value)}
              className={inputClassName()}
            />
          </Field>
          <Field label="Retail UOM">
            <input
              type="text"
              value={form.max_uom_measure}
              onChange={(e) => updateForm("max_uom_measure", e.target.value)}
              className={inputClassName()}
              placeholder="bottle"
            />
          </Field>
          <Field label="Markup (retail)">
            <input
              type="number"
              step="any"
              value={form.markup_price}
              onChange={(e) => updateForm("markup_price", e.target.value)}
              className={inputClassName()}
            />
          </Field>
          <Field label="Wholesale qty">
            <input
              type="number"
              step="any"
              value={form.wholesale_qty_measure}
              onChange={(e) => updateForm("wholesale_qty_measure", e.target.value)}
              className={inputClassName()}
            />
          </Field>
          <Field label="Wholesale UOM">
            <input
              type="text"
              value={form.min_uom_measure}
              onChange={(e) => updateForm("min_uom_measure", e.target.value)}
              className={inputClassName()}
              placeholder="crate"
            />
          </Field>
          <Field label="Markup (wholesale)">
            <input
              type="number"
              step="any"
              value={form.wholesale_markup_price}
              onChange={(e) => updateForm("wholesale_markup_price", e.target.value)}
              className={inputClassName()}
            />
          </Field>
        </div>
      </FormDrawer>
    </CatalogPageShell>
  );
}

function InfoIcon() {
  return (
    <svg
      className="mt-0.5 shrink-0"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
