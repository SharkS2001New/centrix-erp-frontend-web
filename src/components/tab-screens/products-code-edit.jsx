"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabPaneActive } from "@/contexts/tab-pane-activity-context";
import { useTabFormDirty } from "@/hooks/use-tab-form-dirty";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { catalogMetaFromCapabilities } from "@/lib/catalog-scope";
import { mergeSalesSettings } from "@/lib/sales-settings";
import { isProductShelfLocationEnabled } from "@/lib/distribution-settings";
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
import { productsCatalogHref } from "@/lib/products-list-state";
import { formDraftKey } from "@/stores/form-drafts";
import { useFormDraft } from "@/hooks/use-form-draft";

export function ProductsCodeEditScreen() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { abortSignal } = useTabPaneActive();
  const { enabled: tabWorkspaceEnabled, clearTabDirty } = useTabWorkspace();
  const { capabilities, user } = useAuth();
  const allowDiscounts = Boolean(mergeSalesSettings(capabilities?.module_settings).allow_discounts);
  const includeShelfLocation = isProductShelfLocationEnabled(capabilities);
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
  const [serverForm, setServerForm] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [subcategoryModalOpen, setSubcategoryModalOpen] = useState(false);
  const [productLoading, setProductLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const productLoadedRef = useRef(false);

  useTabFormDirty(isDirty);

  const isBaseline = useCallback(
    (value) => {
      if (!serverForm || !value) return true;
      return JSON.stringify(value) === JSON.stringify(serverForm);
    },
    [serverForm],
  );

  const { clearDraft } = useFormDraft({
    draftKey: formDraftKey("product", productCode),
    value: form,
    setValue: setForm,
    enabled: !metaLoading && !productLoading && serverForm != null,
    isBaseline,
  });

  const loadProduct = useCallback(async () => {
    if (abortSignal?.aborted) return;
    setLoadError(null);
    setProductLoading(true);
    try {
      const branchId =
        user?.branch_id ??
        catalogMetaFromCapabilities(capabilities).default_branch_id ??
        catalogMetaFromCapabilities(capabilities).head_office_branch_id;
      const [productRes, retailPackage] = await Promise.all([
        apiRequest(`/products/${encodeURIComponent(productCode)}`, {
          searchParams: branchId ? { branch_id: branchId } : {},
          signal: abortSignal ?? undefined,
        }),
        loadRetailPackageForProduct(productCode).catch(() => null),
      ]);
      if (abortSignal?.aborted) return;
      const product = productRes.data ?? productRes;
      const uom = uoms.find((u) => String(u.id) === String(product.unit_id)) ?? null;
      const next = productToForm({ ...product, is_active: !product.deleted_at }, retailPackage, uom);
      setServerForm(next);
      setForm(next);
    } catch (e) {
      if (e?.name === "AbortError" || abortSignal?.aborted) return;
      setLoadError(e instanceof Error ? e.message : "Failed to load product");
    } finally {
      setProductLoading(false);
    }
  }, [abortSignal, productCode, uoms, user?.branch_id, capabilities]);

  const { isActive } = useTabPaneActive();

  useEffect(() => {
    if (!isActive || metaLoading || productLoadedRef.current) return undefined;
    let cancelled = false;
    void (async () => {
      await loadProduct();
      if (!cancelled) productLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive, metaLoading, loadProduct]);

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
    setIsDirty(true);
    setFormError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onImageSelect(file) {
    setIsDirty(true);
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
      const body = buildProductBody(form, uom, { allowDiscounts, includeShelfLocation });
      await apiRequest(`/products/${encodeURIComponent(productCode)}`, {
        method: "PUT",
        body,
      });
      await saveRetailPackageSetting(form, productCode);
      setIsDirty(false);
      clearDraft();
      if (tabWorkspaceEnabled) clearTabDirty(pathname);
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
          <Link href={productsCatalogHref()} className="mt-3 inline-block text-sm text-[#185FA5] hover:underline">
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
