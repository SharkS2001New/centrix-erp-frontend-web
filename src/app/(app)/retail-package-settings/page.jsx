"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { RetailPricingTiersEditor } from "@/components/catalog/retail-pricing-tiers";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FormDrawer,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import { ProductSearchSelect } from "@/components/catalog/product-search-select";
import {
  EMPTY_PRICING_TIER,
  coercePricingTiersInput,
  measureLevelLabel,
  normalizePricingTiers,
  pricingTiersToApi,
  uomMeasureLevels,
} from "@/lib/uom-packaging";

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  product_code: "",
  pricing_tiers: [{ ...EMPTY_PRICING_TIER, min_qty: "1" }],
};

function formatTiersSummary(tiers, uom) {
  const rows = normalizePricingTiers(tiers);
  if (!rows.length) return "Wholesale only";
  return rows
    .map((t) => {
      const to = t.max_qty === "" || t.max_qty == null ? "∞" : t.max_qty;
      const label = measureLevelLabel(uom, t.measure_level);
      return `${t.min_qty}–${to} ${label} +${t.markup_price ?? 0}`;
    })
    .join(" · ");
}

export default function RetailPackageSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subCategoryFilter, setSubCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pickedProduct, setPickedProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [setRes, prodRes, uomRes, catRes, subRes] = await Promise.all([
        apiRequest("/retail-package-settings", { searchParams: { per_page: 200 } }),
        apiRequest("/products", { searchParams: { per_page: 200 } }),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
        apiRequest("/categories", { searchParams: { per_page: 200 } }),
        apiRequest("/sub-categories", { searchParams: { per_page: 200 } }),
      ]);
      setSettings(setRes.data ?? []);
      setProducts(prodRes.data ?? []);
      setUoms(uomRes.data ?? []);
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

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);

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
        const uom = product ? uomById.get(product.unit_id) : null;
        const sub = product ? subById.get(product.subcategory_id) : null;
        return {
          ...row,
          product_name: product?.product_name ?? "—",
          category_id: sub?.category_id ?? null,
          subcategory_id: product?.subcategory_id ?? null,
          product_uom: uom,
        };
      }),
    [settings, productByCode, subById, uomById],
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
      if (categoryFilter !== "all" && String(row.category_id) !== categoryFilter) return false;
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

  const usedProductCodes = useMemo(
    () => settings.map((s) => s.product_code),
    [settings],
  );

  const lockedEditProduct = useMemo(() => {
    if (!editingId || !form.product_code) return null;
    return productByCode.get(form.product_code) ?? { product_code: form.product_code, product_name: form.product_code };
  }, [editingId, form.product_code, productByCode]);

  const selectedProductUom = useMemo(() => {
    const product = pickedProduct ?? productByCode.get(form.product_code);
    return product ? uomById.get(product.unit_id) : null;
  }, [form.product_code, pickedProduct, productByCode, uomById]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setPickedProduct(null);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setPickedProduct(productByCode.get(row.product_code) ?? null);
    const tiers = coercePricingTiersInput(row.pricing_tiers).length
      ? normalizePricingTiers(row.pricing_tiers)
      : normalizePricingTiers([
          {
            min_qty: row.max_qty_measure ?? 1,
            max_qty: row.max_qty_measure,
            measure_level: "small",
            markup_price: row.markup_price ?? 0,
          },
        ]);
    setForm({
      product_code: row.product_code ?? "",
      pricing_tiers: tiers.length ? tiers : [{ ...EMPTY_PRICING_TIER, min_qty: "1" }],
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPickedProduct(null);
    setFormError(null);
  }

  async function saveSetting(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const body = {
      product_code: form.product_code,
      pricing_tiers: pricingTiersToApi(form.pricing_tiers),
      max_qty_measure: null,
      max_uom_measure: null,
      markup_price: 0,
      wholesale_qty_measure: 0,
      min_uom_measure: null,
      wholesale_markup_price: 0,
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

  return (
    <CatalogPageShell
      title="Retail package settings"
      subtitle="Tiered retail markups per product — measurements come from the product UOM"
      action={<PrimaryButton onClick={openCreate}>Add package setting</PrimaryButton>}
      banner={
        <div className="mb-3.5 flex items-start gap-2.5 rounded-lg border border-[#B5D4F4] bg-[#E6F1FB] px-3.5 py-2.5 text-xs leading-relaxed text-[#0C447C]">
          <InfoIcon />
          <span>
            Retail price = <strong>(unit price + tier markup) × quantity</strong> when quantity falls
            in a tier.             Outside all tiers = <strong>wholesale</strong> (base unit price, no markup).
            Configure full / middle / small packaging under <strong>UOM</strong>. This page lists
            products that already have a setting — use <strong>Add package setting</strong> to
            configure a new product (search by name or code).
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

      <div className={TABLE_SHELL_CLASS}>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading package settings…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className="px-3.5 py-2.5">Product</th>
                    <th className="px-3.5 py-2.5">UOM</th>
                    <th className="px-3.5 py-2.5">Retail tiers</th>
                    <th className="w-[80px] px-3.5 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                        {settings.length === 0
                          ? "No retail package settings yet. Click Add package setting to configure a product."
                          : "No package settings match your filters."}
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => (
                      <tr
                        key={row.id}
                        className={TABLE_BODY_ROW_CLASS}
                      >
                        <td className="px-3.5 py-3">
                          <div className="font-medium text-slate-900">{row.product_name}</div>
                          <span className="font-mono text-xs text-slate-500">{row.product_code}</span>
                        </td>
                        <td className="px-3.5 py-3 text-slate-600">
                          {row.product_uom ? (
                            <>
                              {row.product_uom.full_name}
                              <span className="block text-xs text-slate-400">
                                small: {row.product_uom.small_packaging_label ?? row.product_uom.uom_type}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-xs text-slate-700">
                          {formatTiersSummary(row.pricing_tiers, row.product_uom)}
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
          <ProductSearchSelect
            value={form.product_code}
            onChange={(code) => setForm((p) => ({ ...p, product_code: code }))}
            onProductSelect={setPickedProduct}
            excludeCodes={editingId ? [] : usedProductCodes}
            lockedProduct={lockedEditProduct}
            disabled={!!editingId}
            required
            placeholder="Search product name or SKU…"
          />
          {!editingId ? (
            <p className="mt-1 text-xs text-slate-500">
              Search finds any active product — not limited to the first 200 in the catalogue.
              Products that already have a setting are hidden.
            </p>
          ) : null}
        </Field>

        {selectedProductUom ? (
          <p className="text-xs text-slate-500">
            UOM: {selectedProductUom.full_name} · small:{" "}
            {selectedProductUom.small_packaging_label ?? selectedProductUom.uom_type}
            {selectedProductUom.middle_packaging_label
              ? ` · middle: ${selectedProductUom.middle_packaging_label}`
              : ""}
            {" · "}
            levels: {uomMeasureLevels(selectedProductUom).map((l) => l.label).join(", ")}
          </p>
        ) : null}

        <RetailPricingTiersEditor
          tiers={form.pricing_tiers}
          onChange={(pricing_tiers) => setForm((p) => ({ ...p, pricing_tiers }))}
          productUom={selectedProductUom}
          unitPrice={pickedProduct?.unit_price ?? ""}
        />
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
