"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { mergeSalesSettings } from "@/lib/sales-settings";
import {
  buildProductBody,
  EMPTY_PRODUCT_FORM,
  loadRetailPackageForProduct,
  ProductFormCard,
  ProductFormFields,
  ProductFormPageShell,
  productToForm,
  saveRetailPackageSetting,
  useProductFormResources,
  validateRetailPackage,
} from "@/components/products/product-form";
import { SubcategoryCreateModal } from "@/components/products/subcategory-create-modal";

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const { capabilities } = useAuth();
  const allowDiscounts = Boolean(mergeSalesSettings(capabilities?.module_settings).allow_discounts);
  const productCode = decodeURIComponent(params.code);

  const {
    categories,
    subCategories,
    setSubCategories,
    suppliers,
    uoms,
    vats,
    branches,
    globalReorderLevel,
    loading: metaLoading,
    error: metaError,
    reload,
  } = useProductFormResources();

  const [form, setForm] = useState(EMPTY_PRODUCT_FORM);
  const [imagePreview, setImagePreview] = useState(null);
  const [subcategoryModalOpen, setSubcategoryModalOpen] = useState(false);
  const [productLoading, setProductLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadProduct = useCallback(async () => {
    setLoadError(null);
    setProductLoading(true);
    try {
      const [productRes, retailPackage] = await Promise.all([
        apiRequest(`/products/${encodeURIComponent(productCode)}`),
        loadRetailPackageForProduct(productCode).catch(() => null),
      ]);
      const product = productRes.data ?? productRes;
      const uom = uoms.find((u) => String(u.id) === String(product.unit_id)) ?? null;
      setForm(
        productToForm({ ...product, is_active: !product.deleted_at }, retailPackage, uom),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load product");
    } finally {
      setProductLoading(false);
    }
  }, [productCode, uoms]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const loading = metaLoading || productLoading;
  const error = metaError || loadError;

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

    if (form.catalog_scope === "branch" && !form.branch_id) {
      setFormError("Select a branch for branch-scoped products.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const uom = uoms.find((u) => String(u.id) === String(form.unit_id)) ?? null;
      const body = buildProductBody(form, uom, { allowDiscounts });
      await apiRequest(`/products/${encodeURIComponent(productCode)}`, {
        method: "PUT",
        body,
      });
      await saveRetailPackageSetting(form, productCode);
      router.push(`/products/${encodeURIComponent(productCode)}`);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  const title = useMemo(() => form.product_name || productCode, [form.product_name, productCode]);

  return (
    <ProductFormPageShell
      backHref={`/products/${encodeURIComponent(productCode)}`}
      backLabel="← Back to product"
      title="Edit product"
      subtitle={title}
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <div>
          <p className="text-sm text-red-600">{error}</p>
          <Link href="/products" className="mt-3 inline-block text-sm text-[#185FA5] hover:underline">
            Back to products
          </Link>
        </div>
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
                    href={`/products/${encodeURIComponent(productCode)}`}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-[#185FA5] px-6 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </>
            }
          >
            <ProductFormFields
              form={form}
              mode="edit"
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
              allowDiscounts={allowDiscounts}
              branches={branches}
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
