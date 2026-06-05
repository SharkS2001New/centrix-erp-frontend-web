"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, inputClassName, parseDecimalInput } from "@/components/catalog/catalog-shared";
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
  stock_in_shop: "",
  stock_in_store: "",
  reorder_point: "",
  sell_on_retail: false,
  retail_package_id: "",
  retail_max_qty_measure: "",
  retail_max_uom_measure: "",
  retail_markup_price: "",
  retail_wholesale_qty_measure: "",
  retail_min_uom_measure: "",
  retail_wholesale_markup_price: "",
  vat_id: "",
  is_active: true,
};

export function formatUomOption(uom) {
  const name = uom.full_name || uom.uom_type || `Unit ${uom.id}`;
  const factor = uom.conversion_factor != null ? Number(uom.conversion_factor) : 1;
  return `${name} (${factor})`;
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
      retail_max_qty_measure: "",
      retail_max_uom_measure: "",
      retail_markup_price: "",
      retail_wholesale_qty_measure: "",
      retail_min_uom_measure: "",
      retail_wholesale_markup_price: "",
    };
  }
  return {
    retail_package_id: row.id != null ? String(row.id) : "",
    retail_max_qty_measure:
      row.max_qty_measure != null ? String(row.max_qty_measure) : "",
    retail_max_uom_measure: row.max_uom_measure ?? "",
    retail_markup_price: row.markup_price != null ? String(row.markup_price) : "",
    retail_wholesale_qty_measure:
      row.wholesale_qty_measure != null ? String(row.wholesale_qty_measure) : "",
    retail_min_uom_measure: row.min_uom_measure ?? "",
    retail_wholesale_markup_price:
      row.wholesale_markup_price != null ? String(row.wholesale_markup_price) : "",
  };
}

export function productToForm(product, retailPackage = null) {
  const discountType = product.discount_type === "fixed" ? "fixed" : "percentage";
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
    stock_in_shop:
      product.stock_in_shop != null ? String(product.stock_in_shop) : "0",
    stock_in_store:
      product.stock_in_store != null ? String(product.stock_in_store) : "0",
    reorder_point: product.reorder_point != null ? String(product.reorder_point) : "",
    sell_on_retail: product.sell_on_retail === 1 || product.sell_on_retail === true,
    vat_id: product.vat_id ? String(product.vat_id) : "",
    is_active: product.is_active !== false && !product.deleted_at,
    ...retailPackageToFormFields(retailPackage),
  };
}

export function buildProductBody(form) {
  const unitPrice = parseDecimalInput(form.unit_price);
  const body = {
    product_code: form.product_code.trim(),
    product_name: form.product_name.trim(),
    subcategory_id: Number(form.subcategory_id),
    unit_id: Number(form.unit_id),
    unit_price: unitPrice,
    last_selling_price: unitPrice,
    last_cost_price: parseDecimalInput(form.last_cost_price),
    discount_type: form.discount_type === "fixed" ? "fixed" : "percentage",
    product_weight: parseDecimalInput(form.product_weight) || null,
    stock_in_shop: parseDecimalInput(form.stock_in_shop),
    stock_in_store: parseDecimalInput(form.stock_in_store),
    supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
    sell_on_retail: Boolean(form.sell_on_retail),
    vat_id: form.vat_id ? Number(form.vat_id) : undefined,
    reorder_point: parseDecimalInput(form.reorder_point),
    deleted_at: form.is_active ? null : new Date().toISOString(),
  };

  if (body.discount_type === "fixed") {
    body.discount_value = parseDecimalInput(form.discount_value);
    body.discount_percentage = 0;
  } else {
    body.discount_percentage = parseDecimalInput(form.discount_percentage);
    body.discount_value = 0;
  }

  return body;
}

export function buildRetailPackageBody(form, productCode) {
  return {
    product_code: productCode,
    max_qty_measure:
      form.retail_max_qty_measure === ""
        ? null
        : parseDecimalInput(form.retail_max_qty_measure),
    max_uom_measure: form.retail_max_uom_measure?.trim() || null,
    markup_price: parseDecimalInput(form.retail_markup_price),
    wholesale_qty_measure: parseDecimalInput(form.retail_wholesale_qty_measure),
    min_uom_measure: form.retail_min_uom_measure?.trim() || null,
    wholesale_markup_price: parseDecimalInput(form.retail_wholesale_markup_price),
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
  if (form.retail_max_qty_measure === "" || form.retail_max_qty_measure == null) {
    return "Retail pack quantity is required when sell on retail is enabled.";
  }
  if (!form.retail_max_uom_measure?.trim()) {
    return "Retail UOM (e.g. piece, bag) is required.";
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

function RetailPackageFields({ form, onChange }) {
  return (
    <div className="md:col-span-2 xl:col-span-3 mt-3 grid grid-cols-1 gap-x-4 gap-y-3.5 rounded-lg border border-[#B5D4F4] bg-[#E6F1FB]/40 p-4 md:grid-cols-2 xl:grid-cols-3">
      <p className="md:col-span-2 xl:col-span-3 text-xs leading-relaxed text-[#0C447C]">
        Retail price per unit = <strong>(unit price ÷ pack qty) + markup</strong>. Wholesale price
        = <strong>unit price + wholesale markup</strong>.
      </p>
      <Field label="Pack qty (max)">
        <input
          type="text"
          inputMode="decimal"
          value={form.retail_max_qty_measure}
          onChange={(e) => onChange("retail_max_qty_measure", e.target.value)}
          className={inputClassName()}
          placeholder="e.g. 12"
        />
      </Field>
      <Field label="Retail UOM">
        <input
          type="text"
          value={form.retail_max_uom_measure}
          onChange={(e) => onChange("retail_max_uom_measure", e.target.value)}
          className={inputClassName()}
          placeholder="piece, bag, carton"
        />
      </Field>
      <Field label="Markup (retail) KES">
        <input
          type="text"
          inputMode="decimal"
          value={form.retail_markup_price}
          onChange={(e) => onChange("retail_markup_price", e.target.value)}
          className={inputClassName()}
          placeholder="0"
        />
      </Field>
      <Field label="Wholesale pack qty">
        <input
          type="text"
          inputMode="decimal"
          value={form.retail_wholesale_qty_measure}
          onChange={(e) => onChange("retail_wholesale_qty_measure", e.target.value)}
          className={inputClassName()}
          placeholder="0"
        />
      </Field>
      <Field label="Wholesale UOM">
        <input
          type="text"
          value={form.retail_min_uom_measure}
          onChange={(e) => onChange("retail_min_uom_measure", e.target.value)}
          className={inputClassName()}
          placeholder="crate, carton"
        />
      </Field>
      <Field label="Markup (wholesale) KES">
        <input
          type="text"
          inputMode="decimal"
          value={form.retail_wholesale_markup_price}
          onChange={(e) => onChange("retail_wholesale_markup_price", e.target.value)}
          className={inputClassName()}
          placeholder="0"
        />
      </Field>
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
}) {
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const activeUoms = useMemo(
    () => uoms.filter((u) => u.is_active !== false && u.is_active !== 0),
    [uoms],
  );

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
          onChange={(e) => onChange("unit_id", e.target.value)}
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
      </div>

      <Field label="Cost price (KES)">
        <input
          type="text"
          inputMode="decimal"
          value={form.last_cost_price}
          onChange={(e) => onChange("last_cost_price", e.target.value)}
          className={inputClassName()}
          placeholder="0.00"
        />
      </Field>

      <Field label="Selling price (KES)">
        <input
          type="text"
          inputMode="decimal"
          value={form.unit_price}
          onChange={(e) => onChange("unit_price", e.target.value)}
          required
          className={inputClassName()}
          placeholder="0.00"
        />
      </Field>

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
        <Field label="Discount amount (KES)">
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
        <Field label="Discount (%)">
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
            onChange={(e) => onChange("sell_on_retail", e.target.checked)}
            className="mt-0.5 rounded border-slate-300"
          />
          <span>Sell on retail — configure pack sizes and markups below</span>
        </label>
        {form.sell_on_retail ? <RetailPackageFields form={form} onChange={onChange} /> : null}
      </div>

      <div className="md:col-span-2 xl:col-span-3 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory</p>
      </div>

      <Field label="Stock in shop">
        <input
          type="text"
          inputMode="decimal"
          value={form.stock_in_shop}
          onChange={(e) => onChange("stock_in_shop", e.target.value)}
          className={inputClassName()}
          placeholder="0"
        />
      </Field>

      <Field label="Stock in store">
        <input
          type="text"
          inputMode="decimal"
          value={form.stock_in_store}
          onChange={(e) => onChange("stock_in_store", e.target.value)}
          className={inputClassName()}
          placeholder="0"
        />
      </Field>

      <Field label="Reorder level">
        <input
          type="text"
          inputMode="decimal"
          value={form.reorder_point}
          onChange={(e) => onChange("reorder_point", e.target.value)}
          className={inputClassName()}
          placeholder="0"
        />
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Minimum quantity in the system before a low-stock alert is raised. Leave at{" "}
          <strong>0</strong> to use the organisation&apos;s general reorder level
          {globalReorderLevel != null ? (
            <>
              {" "}
              (<strong>{globalReorderLevel}</strong> units)
            </>
          ) : (
            ""
          )}{" "}
          from system settings.
        </p>
      </Field>

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
