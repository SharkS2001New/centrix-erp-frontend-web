"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchProductCatalogCached } from "@/lib/catalog-cache";
import { useAuth } from "@/contexts/auth-context";
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
import { useListPageSize } from "@/lib/use-list-page-controls";
import { ProductSearchSelect } from "@/components/catalog/product-search-select";
import {
  EMPTY_PRICING_TIER,
  coercePricingTiersInput,
  measureLevelLabel,
  normalizePricingTiers,
  pricingTiersToApi,
  tierPriceModeLabel,
  uomMeasureLevels,
} from "@/lib/uom-packaging";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { CatalogDataImportButton, filterNonEmptyImportRows } from "@/components/catalog/catalog-data-import";
import { RETAIL_PACKAGE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
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
      const mode = tierPriceModeLabel(t.price_mode);
      return `${mode} ${t.min_qty}–${to} ${label} +${t.markup_price ?? 0}${t.price_mode === "wholesale" ? " line" : ""}`;
    })
    .join(" · ");
}

export default function RetailPackageSettingsPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [settings, setSettings] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subCategoryFilter, setSubCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pickedProduct, setPickedProduct] = useState(null);
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

  const loadData = useCallback(async () => {
    try {
      const [setRes, catalogProducts, uomRes, catRes, subRes] = await Promise.all([
        apiRequest("/retail-package-settings", { searchParams: { per_page: 200 } }),
        fetchProductCatalogCached(user?.organization_id, { status: "all" }),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
        apiRequest("/categories", { searchParams: { per_page: 200 } }),
        apiRequest("/sub-categories", { searchParams: { per_page: 200 } }),
      ]);
      setSettings(setRes.data ?? []);
      setProducts(catalogProducts ?? []);
      setUoms(uomRes.data ?? []);
      setCategories(catRes.data ?? []);
      setSubCategories(subRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load package settings");
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

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
        const unitId = product?.unit_id ?? row.product_unit_id;
        const subcategoryId = product?.subcategory_id ?? row.product_subcategory_id;
        const uom = unitId ? uomById.get(unitId) : null;
        const sub = subcategoryId ? subById.get(subcategoryId) : null;
        return {
          ...row,
          product_name: row.product_name ?? product?.product_name ?? "—",
          category_id: sub?.category_id ?? null,
          subcategory_id: subcategoryId ?? null,
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageRowIds = useMemo(() => pageSlice.map((r) => r.id), [pageSlice]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);
  const rowById = useMemo(() => new Map(pageSlice.map((r) => [String(r.id), r])), [pageSlice]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, subCategoryFilter]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  const usedProductCodes = useMemo(
    () => settings.map((s) => s.product_code),
    [settings],
  );

  const lockedEditProduct = useMemo(() => {
    if (!editingId || !form.product_code) return null;
    const fromCatalog = productByCode.get(form.product_code);
    if (fromCatalog) return fromCatalog;
    if (pickedProduct && String(pickedProduct.product_code) === String(form.product_code)) {
      return pickedProduct;
    }
    const fromRow = enriched.find((row) => String(row.product_code) === String(form.product_code));
    if (fromRow?.product_name && fromRow.product_name !== "—") {
      return {
        product_code: fromRow.product_code,
        product_name: fromRow.product_name,
        unit_id: fromRow.product_unit_id,
      };
    }
    return { product_code: form.product_code, product_name: form.product_code };
  }, [editingId, enriched, form.product_code, pickedProduct, productByCode]);

  const selectedProductUom = useMemo(() => {
    const product = pickedProduct ?? productByCode.get(form.product_code);
    let unitId = product?.unit_id;
    if (!unitId && form.product_code) {
      unitId = enriched.find((row) => String(row.product_code) === String(form.product_code))?.product_unit_id;
    }
    return unitId ? uomById.get(unitId) : null;
  }, [enriched, form.product_code, pickedProduct, productByCode, uomById]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setPickedProduct(null);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    const fromCatalog = productByCode.get(row.product_code);
    setPickedProduct(
      fromCatalog ?? {
        product_code: row.product_code,
        product_name: row.product_name && row.product_name !== "—" ? row.product_name : row.product_code,
        unit_id: row.product_unit_id,
      },
    );
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
    const ok = await confirm({
      title: "Delete package setting",
      message: `Delete package setting for ${row.product_code}?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/retail-package-settings/${row.id}`, { method: "DELETE" });
      await loadData();
      notifySuccess(`Setting for ${row.product_code} deleted`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSelectedSettings() {
    setBatchDeleting(true);
    try {
      await batchDeleteWithConfirm({
        confirm,
        selectedIds,
        entityName: "package setting",
        deleteItem: async (id) => {
          await apiRequest(`/retail-package-settings/${id}`, { method: "DELETE" });
        },
        clearSelection,
        reload: loadData,
        notifySuccess,
        notifyError,
        labelForId: (id) => rowById.get(String(id))?.product_code ?? id,
      });
    } finally {
      setBatchDeleting(false);
    }
  }

  return (
    <CatalogPageShell
      title="Retail package settings"
      subtitle="Tiered retail markups per product — measurements come from the product UOM"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogDataImportButton
            title="Import retail packages"
            description="Upload CSV or Excel with product_code and retail pricing fields. Products must already exist in the catalogue."
            sampleHeaders={[
              "product_code",
              "max_qty_measure",
              "markup_price",
              "min_uom_measure",
              "max_uom_measure",
              "wholesale_qty_measure",
              "wholesale_markup_price",
            ]}
            sampleRow={["SKU001", "11", "2.5", "pcs", "carton", "12", "0"]}
            apiPath="/retail-package-settings/import-batch"
            normalizeRows={(rows) => filterNonEmptyImportRows(rows, ["product_code"])}
            onImported={loadData}
            importPage="retail_packages"
          />
          <CatalogListExport
            title="Retail package settings"
            filename="retail-package-settings"
            apiPath="/retail-package-settings"
            columns={RETAIL_PACKAGE_EXPORT_COLUMNS}
            totalCount={filtered.length}
            getSearchParams={() => ({
              per_page: 200,
              ...(categoryFilter !== "all" ? { category_id: categoryFilter } : {}),
              ...(search.trim() ? { q: search.trim() } : {}),
            })}
            disabled={loading}
          />
          <PrimaryButton onClick={openCreate}>Add package setting</PrimaryButton>
        </div>
      }
      banner={
        <div className="mb-3.5 flex items-start gap-2.5 rounded-lg border border-[#B5D4F4] bg-[#E6F1FB] px-3.5 py-2.5 text-xs leading-relaxed text-[#0C447C]">
          <InfoIcon />
          <span>
            <strong>Retail</strong> tiers: (wholesale base + per-unit markup) × quantity.
            <strong> Wholesale</strong> tiers: (catalog wholesale × qty) + <strong>line markup</strong>.
            Package-level wholesale markup is also applied on the line total. Unit prices on POS and
            receipts are reverse-computed from the final line amount ÷ quantity.
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
      <div className={TABLE_SHELL_CLASS}>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading package settings…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <TableSelectAllHeader
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected}
                      onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                    />
                    <th className="px-3.5 py-2.5">Product</th>
                    <th className="px-3.5 py-2.5">UOM</th>
                    <th className="px-3.5 py-2.5">Retail tiers</th>
                    <th className="w-[80px] px-3.5 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
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
                        <TableRowSelectCell
                          checked={selectedIds.has(String(row.id))}
                          onChange={() => toggleOne(row.id)}
                          label={`Select ${row.product_name}`}
                        />
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
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
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

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <BatchDeleteButton
          count={selectedCount}
          busy={batchDeleting}
          onClick={() => void deleteSelectedSettings()}
        />
      </BatchActionBar>
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
