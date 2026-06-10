"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, inputClassName, parseDecimalInput } from "@/components/catalog/catalog-shared";
import { RetailPricingTiersEditor, defaultRetailPricingTier } from "@/components/catalog/retail-pricing-tiers";
import {
  coercePricingTiersInput,
  fullPackageLabel,
  normalizePricingTiers,
  pricingTiersToApi,
  smallPackagingLabel,
  uomHasFullPack,
} from "@/lib/uom-packaging";
import { baseToDisplayQty } from "@/lib/stock-uom";
import {
  ProductInventoryFields,
  reorderBaseFromForm,
  stockBaseFromForm,
  stockHierarchyToForm,
} from "@/components/products/product-inventory-fields";
import {
  CustomerFormCard,
  CustomerFormPageShell,
} from "@/components/customers/customer-form";
import { EntityPhotoField } from "@/components/media/entity-photo-field";

export const EMPTY_PRODUCT_FORM = {
  product_code: "",
  product_name: "",
  subcategory_id: "",
  supplier_id: "",
  unit_id: "",
  last_cost_price: "",
  unit_price: "",
  discount_type: "percentage",
  discount_percentage: "",
  discount_value: "",
  product_weight: "",
  shop_stock_full: "0",
  shop_stock_middle: "0",
  shop_stock_small: "0",
  store_stock_full: "0",
  store_stock_middle: "0",
  store_stock_small: "0",
  reorder_packs: "",
  sell_on_retail: false,
  retail_package_id: "",
  retail_pricing_tiers: [defaultRetailPricingTier(null)],
  vat_id: "",
  is_active: true,
};

export function formatUomOption(uom) {
  const measure = uom.measure_name?.trim();
  const pack = uom.full_name || uom.uom_type || `Unit ${uom.id}`;
  const factor = uom.conversion_factor != null ? Number(uom.conversion_factor) : 1;
  const small = uom.small_packaging_label || uom.uom_type || "units";
  const prefix = measure ? `${measure}: ` : "";
  if (factor > 1) {
    return `${prefix}${pack} (1 = ${factor} ${small})`;
  }
  return `${prefix}${small}`;
}

export function subcategoryLabel(sub, categoryById) {
  const cat = categoryById.get(sub.category_id);
  const catName = cat?.category_name ?? "Uncategorised";
  return `${sub.subcategory_name} (${catName})`;
}

export function retailPackageToFormFields(row) {
  if (!row) {
    return {
      retail_package_id: "",
      retail_pricing_tiers: [defaultRetailPricingTier(null)],
    };
  }

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

  return {
    retail_package_id: row.id != null ? String(row.id) : "",
    retail_pricing_tiers: tiers.length
      ? tiers.map((t) => ({
          ...t,
          measure_level: t.measure_level || "small",
        }))
      : [defaultRetailPricingTier(null)],
  };
}

export function productToForm(product, retailPackage = null, uom = null) {
  const discountType = product.discount_type === "fixed" ? "fixed" : "percentage";
  const shopStock = stockHierarchyToForm(product.stock_in_shop ?? 0, uom);
  const storeStock = stockHierarchyToForm(product.stock_in_store ?? 0, uom);
  const factor = Number(uom?.conversion_factor ?? 1);
  const rp = Number(product.reorder_point ?? 0);
  const reorderPacks =
    rp > 0 ? (factor > 1 ? String(baseToDisplayQty(rp, factor)) : String(rp)) : "";

  return {
    product_name: product.product_name ?? "",
    product_code: product.product_code ?? "",
    subcategory_id: product.subcategory_id ? String(product.subcategory_id) : "",
    supplier_id: product.supplier_id ? String(product.supplier_id) : "",
    unit_id: product.unit_id ? String(product.unit_id) : "",
    last_cost_price:
      product.last_cost_price != null ? String(product.last_cost_price) : "",
    unit_price: product.unit_price != null ? String(product.unit_price) : "",
    discount_type: discountType,
    discount_percentage:
      product.discount_percentage != null ? String(product.discount_percentage) : "",
    discount_value: product.discount_value != null ? String(product.discount_value) : "",
    product_weight:
      product.product_weight != null ? String(product.product_weight) : "",
    shop_stock_full: shopStock.full,
    shop_stock_middle: shopStock.middle,
    shop_stock_small: shopStock.small,
    store_stock_full: storeStock.full,
    store_stock_middle: storeStock.middle,
    store_stock_small: storeStock.small,
    reorder_packs: reorderPacks,
    sell_on_retail: product.sell_on_retail === 1 || product.sell_on_retail === true,
    vat_id: product.vat_id ? String(product.vat_id) : "",
    is_active: product.is_active !== false && !product.deleted_at,
    ...retailPackageToFormFields(retailPackage),
  };
}

export function buildProductBody(form, uom = null, { allowDiscounts = true } = {}) {
  const unitPrice = parseDecimalInput(form.unit_price);
  const body = {
    product_code: form.product_code.trim(),
    product_name: form.product_name.trim(),
    subcategory_id: Number(form.subcategory_id),
    unit_id: Number(form.unit_id),
    unit_price: unitPrice,
    last_selling_price: unitPrice,
    last_cost_price: parseDecimalInput(form.last_cost_price),
    discount_type: "percentage",
    discount_percentage: 0,
    discount_value: 0,
    product_weight: parseDecimalInput(form.product_weight) || null,
    stock_in_shop: stockBaseFromForm(form, "shop", uom),
    stock_in_store: stockBaseFromForm(form, "store", uom),
    supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
    sell_on_retail: Boolean(form.sell_on_retail),
    vat_id: form.vat_id ? Number(form.vat_id) : undefined,
    reorder_point: reorderBaseFromForm(form, uom),
    deleted_at: form.is_active ? null : new Date().toISOString(),
  };

  if (allowDiscounts) {
    body.discount_type = form.discount_type === "fixed" ? "fixed" : "percentage";
    if (body.discount_type === "fixed") {
      body.discount_value = parseDecimalInput(form.discount_value);
      body.discount_percentage = 0;
    } else {
      body.discount_percentage = parseDecimalInput(form.discount_percentage);
      body.discount_value = 0;
    }
  }

  return body;
}

export function buildRetailPackageBody(form, productCode) {
  return {
    product_code: productCode,
    pricing_tiers: pricingTiersToApi(form.retail_pricing_tiers),
    max_qty_measure: null,
    max_uom_measure: null,
    markup_price: 0,
    wholesale_qty_measure: 0,
    min_uom_measure: null,
    wholesale_markup_price: 0,
  };
}

export async function loadRetailPackageForProduct(productCode) {
  const res = await apiRequest("/retail-package-settings", {
    searchParams: { per_page: 1, "filter[product_code]": productCode },
  });
  const rows = res.data ?? [];
  return rows[0] ?? null;
}

export async function saveRetailPackageSetting(form, productCode) {
  if (!form.sell_on_retail) {
    if (form.retail_package_id) {
      await apiRequest(`/retail-package-settings/${form.retail_package_id}`, {
        method: "DELETE",
      });
    }
    return;
  }

  const body = buildRetailPackageBody(form, productCode);
  if (form.retail_package_id) {
    await apiRequest(`/retail-package-settings/${form.retail_package_id}`, {
      method: "PUT",
      body,
    });
    return;
  }

  await apiRequest("/retail-package-settings", { method: "POST", body });
}

export function validateRetailPackage(form) {
  if (!form.sell_on_retail) return null;
  const tiers = pricingTiersToApi(form.retail_pricing_tiers);
  if (!tiers.length) {
    return "Add at least one retail pricing tier when sell on retail is enabled.";
  }
  return null;
}

export function useProductFormResources() {
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [vats, setVats] = useState([]);
  const [systemSettings, setSystemSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [catRes, subRes, supRes, uomRes, vatRes, settingsRes] = await Promise.all([
        apiRequest("/categories", { searchParams: { per_page: 200 } }),
        apiRequest("/sub-categories", { searchParams: { per_page: 200 } }),
        apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
        apiRequest("/uoms", { searchParams: { per_page: 100 } }),
        apiRequest("/vats", { searchParams: { per_page: 50 } }),
        apiRequest("/system-settings", { searchParams: { per_page: 1 } }).catch(() => null),
      ]);
      setCategories(catRes.data ?? []);
      setSubCategories(subRes.data ?? []);
      setSuppliers(supRes.data ?? []);
      setUoms(uomRes.data ?? []);
      setVats(vatRes.data ?? vatRes ?? []);
      const settingsRows = settingsRes?.data ?? settingsRes ?? [];
      setSystemSettings(Array.isArray(settingsRows) ? settingsRows[0] : settingsRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load form data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const globalReorderLevel = useMemo(() => {
    const threshold = systemSettings?.global_low_stock_threshold;
    return threshold != null && threshold !== "" ? Number(threshold) : null;
  }, [systemSettings]);

  return {
    categories,
    subCategories,
    setSubCategories,
    suppliers,
    uoms,
    vats,
    systemSettings,
    globalReorderLevel,
    loading,
    error,
    reload: load,
  };
}

async function isProductCodeAvailable(code) {
  const res = await apiRequest("/products", {
    searchParams: { per_page: 1, "filter[product_code]": code },
  });
  return !(res.data ?? []).length;
}

export async function generateProductSku() {
  try {
    const res = await apiRequest("/products/generate-code");
    const code = res?.code ?? res?.data?.code;
    if (code) return String(code);
  } catch {
    // Fall through to client-side generation.
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    if (await isProductCodeAvailable(candidate)) {
      return candidate;
    }
  }

  throw new ApiError("Could not generate a unique SKU. Try again or enter a barcode.", 503, null);
}

function RetailPackageFields({ form, onChange, productUom }) {
  return (
    <div className="md:col-span-2 xl:col-span-3 mt-3 rounded-lg border border-[#B5D4F4] bg-[#E6F1FB]/40 p-4">
      <RetailPricingTiersEditor
        tiers={form.retail_pricing_tiers}
        onChange={(retail_pricing_tiers) => onChange("retail_pricing_tiers", retail_pricing_tiers)}
        productUom={productUom}
        unitPrice={form.unit_price}
      />
    </div>
  );
}

export function ProductFormFields({
  form,
  onChange,
  mode = "create",
  categories = [],
  subCategories = [],
  suppliers = [],
  uoms = [],
  vats = [],
  globalReorderLevel = null,
  imagePreview = null,
  onImageSelect,
  onOpenSubcategoryModal,
  generatingSku = false,
  onGenerateSku,
  allowDiscounts = true,
}) {
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const activeUoms = useMemo(
    () => uoms.filter((u) => u.is_active !== false && u.is_active !== 0),
    [uoms],
  );

  const selectedUom = useMemo(
    () => activeUoms.find((u) => String(u.id) === String(form.unit_id)) ?? null,
    [activeUoms, form.unit_id],
  );

  const packLabel = selectedUom && uomHasFullPack(selectedUom)
    ? fullPackageLabel(selectedUom)
    : "full package";
  const smallLabel = selectedUom ? smallPackagingLabel(selectedUom) : "unit";

  const suggestedUom = useMemo(() => {
    return activeUoms.find((u) => Number(u.conversion_factor ?? 1) === 1) ?? activeUoms[0] ?? null;
  }, [activeUoms]);

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2 xl:grid-cols-3">
      <Field label="SKU / barcode">
        <div className="flex gap-2">
          <input
            type="text"
            value={form.product_code}
            onChange={(e) => onChange("product_code", e.target.value)}
            readOnly={mode === "edit"}
            disabled={mode === "edit"}
            required
            autoFocus={mode === "create"}
            className={`${inputClassName()} min-w-0 flex-1 font-mono`}
            placeholder="Scan or enter barcode"
          />
          {mode === "create" ? (
            <button
              type="button"
              disabled={generatingSku}
              onClick={onGenerateSku}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#185FA5] hover:bg-slate-50 disabled:opacity-50"
            >
              {generatingSku ? "…" : "Generate SKU"}
            </button>
          ) : null}
        </div>
        {mode === "create" ? (
          <p className="mt-1 text-xs text-slate-500">
            Scan a barcode or generate a unique 6-digit SKU.
          </p>
        ) : null}
      </Field>

      <Field label="Product name">
        <input
          type="text"
          value={form.product_name}
          onChange={(e) => onChange("product_name", e.target.value)}
          required
          className={inputClassName()}
          placeholder="Mumias Sugar 2KG"
        />
      </Field>

      <Field label="Sub-category">
        <div className="flex gap-2">
          <select
            value={form.subcategory_id}
            onChange={(e) => onChange("subcategory_id", e.target.value)}
            required
            className={`${inputClassName()} min-w-0 flex-1`}
          >
            <option value="">Select sub-category</option>
            {subCategories.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {subcategoryLabel(s, categoryById)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onOpenSubcategoryModal}
            className="shrink-0 rounded-lg border border-slate-200 px-3 text-lg font-medium text-[#185FA5] hover:bg-slate-50"
            title="Create sub-category"
            aria-label="Create sub-category"
          >
            +
          </button>
        </div>
      </Field>

      <Field label="Supplier">
        <select
          value={form.supplier_id}
          onChange={(e) => onChange("supplier_id", e.target.value)}
          className={inputClassName()}
        >
          <option value="">Select supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.supplier_name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Unit of measure">
        <select
          value={form.unit_id}
          onChange={(e) => {
            const value = e.target.value;
            onChange("unit_id", value);
            if (form.sell_on_retail) {
              const nextUom = activeUoms.find((u) => String(u.id) === String(value)) ?? null;
              if (!form.retail_pricing_tiers?.length) {
                onChange("retail_pricing_tiers", [defaultRetailPricingTier(nextUom)]);
              }
            }
          }}
          required
          className={inputClassName()}
        >
          <option value="">Select unit</option>
          {activeUoms.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {formatUomOption(u)}
            </option>
          ))}
        </select>
        {suggestedUom && !form.unit_id ? (
          <button
            type="button"
            onClick={() => onChange("unit_id", String(suggestedUom.id))}
            className="mt-1 text-xs text-[#185FA5] hover:underline"
          >
            Suggest: {formatUomOption(suggestedUom)}
          </button>
        ) : null}
      </Field>

      <Field label="Product weight (kg)">
        <input
          type="text"
          inputMode="decimal"
          value={form.product_weight}
          onChange={(e) => onChange("product_weight", e.target.value)}
          className={inputClassName()}
          placeholder="Optional"
        />
        <p className="mt-1 text-xs text-slate-500">
          Used to calculate total order weight when loading deliveries onto a vehicle.
        </p>
      </Field>

      <EntityPhotoField
        label="Product image (optional)"
        previewUrl={imagePreview}
        onFileSelect={onImageSelect}
      />

      <div className="md:col-span-2 xl:col-span-3 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pricing</p>
        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
          Wholesale prices are per <strong>{packLabel}</strong>
          {selectedUom && uomHasFullPack(selectedUom) ? (
            <>
              {" "}
              (1 {packLabel} = {selectedUom.conversion_factor} {smallLabel})
            </>
          ) : (
            <> (base {smallLabel})</>
          )}
          . Cost, selling price, and discounts all apply to that same wholesale unit — e.g. price
          for one bag of sugar, not per kg.
        </p>
      </div>

      <Field label={`Cost price per ${packLabel} (KES)`}>
        <input
          type="text"
          inputMode="decimal"
          value={form.last_cost_price}
          onChange={(e) => onChange("last_cost_price", e.target.value)}
          className={inputClassName()}
          placeholder="0.00"
        />
        <p className="mt-1 text-xs text-slate-500">What you pay suppliers per {packLabel}.</p>
      </Field>

      <Field label={`Selling price per ${packLabel} (KES)`}>
        <input
          type="text"
          inputMode="decimal"
          value={form.unit_price}
          onChange={(e) => onChange("unit_price", e.target.value)}
          required
          className={inputClassName()}
          placeholder="0.00"
        />
        <p className="mt-1 text-xs text-slate-500">Wholesale price charged per {packLabel}.</p>
      </Field>

      {allowDiscounts ? (
        <>
          <Field label="Discount type">
            <select
              value={form.discount_type}
              onChange={(e) => onChange("discount_type", e.target.value)}
              className={inputClassName()}
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed amount (KES)</option>
            </select>
          </Field>

          {form.discount_type === "fixed" ? (
            <Field label={`Discount amount per ${packLabel} (KES)`}>
              <input
                type="text"
                inputMode="decimal"
                value={form.discount_value}
                onChange={(e) => onChange("discount_value", e.target.value)}
                className={inputClassName()}
                placeholder="0"
              />
            </Field>
          ) : (
            <Field label={`Discount on ${packLabel} (%)`}>
              <input
                type="text"
                inputMode="decimal"
                value={form.discount_percentage}
                onChange={(e) => onChange("discount_percentage", e.target.value)}
                className={inputClassName()}
                placeholder="0"
              />
            </Field>
          )}
        </>
      ) : null}

      <Field label="VAT status">
        <select
          value={form.vat_id}
          onChange={(e) => onChange("vat_id", e.target.value)}
          required
          className={inputClassName()}
        >
          <option value="" disabled>
            Select VAT rate
          </option>
          {vats.map((v) => (
            <option key={v.id} value={String(v.id)}>
              {v.vat_name ?? v.vat_code} ({v.vat_percentage}%)
            </option>
          ))}
        </select>
      </Field>

      <div className="md:col-span-2 xl:col-span-3">
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.sell_on_retail}
            onChange={(e) => {
              const checked = e.target.checked;
              onChange("sell_on_retail", checked);
              if (checked) {
                onChange("retail_pricing_tiers", [defaultRetailPricingTier(selectedUom)]);
              }
            }}
            className="mt-0.5 rounded border-slate-300"
          />
          <span>Sell on retail — configure pack sizes and markups below</span>
        </label>
        {form.sell_on_retail ? (
          <RetailPackageFields
            form={form}
            onChange={onChange}
            productUom={selectedUom}
          />
        ) : null}
      </div>

      <div className="md:col-span-2 xl:col-span-3 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory</p>
      </div>

      <ProductInventoryFields
        form={form}
        onChange={onChange}
        productUom={selectedUom}
        globalReorderLevel={globalReorderLevel}
      />

      {mode === "edit" ? (
        <div className="md:col-span-2 xl:col-span-3 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="product_status"
                checked={form.is_active}
                onChange={() => onChange("is_active", true)}
              />
              Active
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="product_status"
                checked={!form.is_active}
                onChange={() => onChange("is_active", false)}
              />
              Inactive
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProductFormPageShell(props) {
  return <CustomerFormPageShell {...props} />;
}

export function ProductFormCard(props) {
  return <CustomerFormCard {...props} />;
}
