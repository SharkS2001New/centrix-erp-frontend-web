"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  buildProductBody,
  EMPTY_PRODUCT_FORM,
  generateProductSku,
  ProductFormCard,
  ProductFormFields,
  ProductFormPageShell,
  saveRetailPackageSetting,
  useProductFormResources,
  validateRetailPackage,
} from "@/components/products/product-form";
import { SubcategoryCreateModal } from "@/components/products/subcategory-create-modal";

export default function NewProductPage() {
  const router = useRouter();
  const {
    categories,
    subCategories,
    setSubCategories,
    suppliers,
    uoms,
    vats,
    globalReorderLevel,
    loading,
    error: loadError,
    reload,
  } = useProductFormResources();

  const [form, setForm] = useState(EMPTY_PRODUCT_FORM);
  const [imagePreview, setImagePreview] = useState(null);
  const [subcategoryModalOpen, setSubcategoryModalOpen] = useState(false);
  const [generatingSku, setGeneratingSku] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (loading) return;
    const defaultVat = vats[0]?.id ? String(vats[0].id) : "";
    const defaultUnit =
      uoms.find((u) => Number(u.conversion_factor ?? 1) === 1)?.id ?? uoms[0]?.id;
    setForm((prev) => ({
      ...prev,
      unit_id: prev.unit_id || (defaultUnit ? String(defaultUnit) : ""),
      vat_id: prev.vat_id || defaultVat,
    }));
  }, [loading, uoms, vats]);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  function updateField(key, value) {
    setFormError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onImageSelect(file) {
    if (imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(URL.createObjectURL(file));
  }

  async function onGenerateSku() {
    setGeneratingSku(true);
    setFormError(null);
    try {
      const code = await generateProductSku();
      if (code) updateField("product_code", code);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not generate SKU");
    } finally {
      setGeneratingSku(false);
    }
  }

  function handleSubcategoryCreated(sub) {
    setSubCategories((prev) => [...prev, sub]);
    reload();
    updateField("subcategory_id", String(sub.id));
  }

  async function saveProduct(e) {
    e.preventDefault();
    if (!form.product_name.trim()) {
      setFormError("Product name is required.");
      return;
    }
    if (!form.product_code.trim()) {
      setFormError("SKU / barcode is required — scan one or click Generate SKU.");
      return;
    }
    if (!form.subcategory_id) {
      setFormError("Select a sub-category.");
      return;
    }
    if (!form.unit_id) {
      setFormError("Select a unit of measure.");
      return;
    }
    const retailError = validateRetailPackage(form);
    if (retailError) {
      setFormError(retailError);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body = buildProductBody(form);
      const res = await apiRequest("/products", { method: "POST", body });
      const saved = res.data ?? res;
      const code = saved.product_code ?? form.product_code.trim();
      await saveRetailPackageSetting(form, code);
      router.push(`/products/${encodeURIComponent(code)}`);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProductFormPageShell
      backHref="/products"
      backLabel="← Back to products"
      title="Add product"
      subtitle="Register a new product with pricing and opening stock"
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : (
        <>
          <ProductFormCard
            onSubmit={saveProduct}
            actions={
              <>
                {formError ? (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
                ) : null}
                <div className="mt-6 flex gap-2 border-t border-slate-200 pt-4">
                  <Link
                    href="/products"
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-[#185FA5] px-6 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save product"}
                  </button>
                </div>
              </>
            }
          >
            <ProductFormFields
              form={form}
              mode="create"
              onChange={updateField}
              categories={categories}
              subCategories={subCategories}
              suppliers={suppliers}
              uoms={uoms}
              vats={vats}
              globalReorderLevel={globalReorderLevel}
              imagePreview={imagePreview}
              onImageSelect={onImageSelect}
              onOpenSubcategoryModal={() => setSubcategoryModalOpen(true)}
              generatingSku={generatingSku}
              onGenerateSku={onGenerateSku}
            />
          </ProductFormCard>

          <SubcategoryCreateModal
            open={subcategoryModalOpen}
            categories={categories}
            onClose={() => setSubcategoryModalOpen(false)}
            onCreated={handleSubcategoryCreated}
          />
        </>
      )}
    </ProductFormPageShell>
  );
}
