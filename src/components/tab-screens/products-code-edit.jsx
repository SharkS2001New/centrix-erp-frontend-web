"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError, deleteProductImage, importProductImageFromUrl, uploadProductImage } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabPaneActive } from "@/contexts/tab-pane-activity-context";
import { useTabFormDirty } from "@/hooks/use-tab-form-dirty";
import { tabEditTitle, useTabFormExit } from "@/hooks/use-tab-form-exit";
import { TabFormCancelButton } from "@/components/layout/tab-form-exit-button";
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
  validateProductVatId,
  validateRetailPackage,
} from "@/components/products/product-form";
import { SubcategoryCreateModal } from "@/components/products/subcategory-create-modal";
import { productsCatalogHref } from "@/lib/products-list-state";
import { formDraftKey } from "@/stores/form-drafts";
import { isFormValuesEqual, useFormDraft } from "@/hooks/use-form-draft";
import { isHotelCatalogueContext } from "@/lib/catalog-mode";
import { isHttpImageUrl } from "@/components/products/product-image-field";
import { productPhotoFileUrl } from "@/components/media/entity-photo-display";

export function ProductsCodeEditScreen() {
  const params = useParams();
  const { abortSignal } = useTabPaneActive();
  const { workspaceId } = useTabWorkspace();
  const { capabilities, user } = useAuth();
  const hotelCatalogue = isHotelCatalogueContext(capabilities, workspaceId);
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
  const [imageFile, setImageFile] = useState(null);
  const [imageSource, setImageSource] = useState("upload");
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [hadStoredImage, setHadStoredImage] = useState(false);
  const [imageRemoved, setImageRemoved] = useState(false);
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
      return isFormValuesEqual(value, serverForm);
    },
    [serverForm],
  );

  const { clearDraft } = useFormDraft({
    draftKey: formDraftKey("product", productCode),
    value: form,
    setValue: setForm,
    enabled: !productLoading && serverForm != null,
    debounceMs: 800,
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
        hotelCatalogue
          ? Promise.resolve(null)
          : loadRetailPackageForProduct(productCode).catch(() => null),
      ]);
      if (abortSignal?.aborted) return;
      const product = productRes.data ?? productRes;
      // UOM list may still be loading; productToForm tolerates a missing UOM.
      const next = productToForm({ ...product, is_active: !product.deleted_at }, retailPackage, null);
      if (hotelCatalogue) {
        next.sell_on_retail = false;
      }
      setServerForm(next);
      setForm(next);
      setImageFile(null);
      setImageUrlDraft("");
      setImageSource("upload");
      setImageRemoved(false);
      const hasImage = Boolean(product.image_path || product.image_url);
      setHadStoredImage(hasImage);
      if (hasImage) {
        setImagePreview(productPhotoFileUrl(productCode));
      } else {
        setImagePreview(null);
      }
    } catch (e) {
      if (e?.name === "AbortError" || abortSignal?.aborted) return;
      setLoadError(e instanceof Error ? e.message : "Failed to load product");
    } finally {
      setProductLoading(false);
    }
  }, [abortSignal, productCode, user?.branch_id, capabilities, hotelCatalogue]);

  const { isActive } = useTabPaneActive();

  useEffect(() => {
    if (!isActive || productLoadedRef.current) return undefined;
    let cancelled = false;
    void (async () => {
      await loadProduct();
      if (!cancelled) productLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive, loadProduct]);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // Only wait on the product record for draft hydration — reference dropdowns fill while form paints.
  const error = loadError || (!productLoading && metaError && !serverForm ? metaError : null);

  const updateField = useCallback((key, value) => {
    setIsDirty(true);
    setFormError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onImageSelect = useCallback((file) => {
    setIsDirty(true);
    setImageRemoved(false);
    setImageSource("upload");
    setImageUrlDraft("");
    setImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setImageFile(file || null);
  }, []);

  const onImageSourceChange = useCallback((next) => {
    setIsDirty(true);
    setImageSource(next);
    if (next === "url") {
      setImageFile(null);
      setImagePreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, []);

  const onImageUrlChange = useCallback((value) => {
    setIsDirty(true);
    setImageRemoved(false);
    setImageSource("url");
    setImageFile(null);
    setImageUrlDraft(value);
  }, []);

  const onImageRemove = useCallback(() => {
    setIsDirty(true);
    setImageRemoved(true);
    setImageFile(null);
    setImageUrlDraft("");
    setImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const handleSubcategoryCreated = useCallback(
    (sub) => {
      setSubCategories((prev) => [...prev, sub]);
      reload();
      updateField("subcategory_id", String(sub.id));
    },
    [reload, setSubCategories, updateField],
  );

  const openSubcategoryModal = useCallback(() => setSubcategoryModalOpen(true), []);

  const displayName = useMemo(
    () => form.product_name || productCode,
    [form.product_name, productCode],
  );
  const editTabTitle = hotelCatalogue
    ? tabEditTitle("menu product", displayName)
    : tabEditTitle("Product", displayName);
  const { exitTo } = useTabFormExit(editTabTitle);
  const detailHref = `/products/${encodeURIComponent(productCode)}`;

  async function saveProduct(e) {
    e.preventDefault();
    if (productLoading || metaLoading) return;
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
    const vatError = validateProductVatId(form);
    if (vatError) {
      setFormError(vatError);
      return;
    }
    const retailError = validateRetailPackage(form, { hotelCatalogue });
    if (retailError) {
      setFormError(retailError);
      return;
    }

    if (form.catalog_scope === "branch" && !form.branch_id) {
      setFormError("Select a branch for branch-scoped products.");
      return;
    }
    if (imageSource === "url" && String(imageUrlDraft ?? "").trim() && !isHttpImageUrl(imageUrlDraft)) {
      setFormError("Enter a public http or https image URL.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const uom = uoms.find((u) => String(u.id) === String(form.unit_id)) ?? null;
      const body = buildProductBody(form, uom, { allowDiscounts, includeShelfLocation, hotelCatalogue });
      await apiRequest(`/products/${encodeURIComponent(productCode)}`, {
        method: "PUT",
        body,
      });
      if (imageSource === "url" && isHttpImageUrl(imageUrlDraft)) {
        await importProductImageFromUrl(productCode, imageUrlDraft);
      } else if (imageFile) {
        await uploadProductImage(productCode, imageFile);
      } else if (imageRemoved && hadStoredImage) {
        await deleteProductImage(productCode);
      }
      await saveRetailPackageSetting(form, productCode, { hotelCatalogue });
      setIsDirty(false);
      clearDraft();
      exitTo(detailHref);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    clearDraft();
  }

  return (
    <ProductFormPageShell
      backHref={detailHref}
      backLabel={hotelCatalogue ? "← Back to menu product" : "← Back to product"}
      title={hotelCatalogue ? "Edit menu product" : "Edit product"}
      subtitle={displayName}
    >
      {error ? (
        <div>
          <p className="text-sm text-red-600">{error}</p>
          <Link href={productsCatalogHref()} className="mt-3 inline-block text-sm text-[#185FA5] hover:underline">
            Back to products
          </Link>
        </div>
      ) : (
        <>
          {productLoading ? (
            <p className="mb-3 text-xs text-slate-500">Loading product…</p>
          ) : metaLoading ? (
            <p className="mb-3 text-xs text-slate-500">Loading dropdown options…</p>
          ) : null}
          <ProductFormCard
            onSubmit={saveProduct}
            actions={
              <>
                {formError ? (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
                ) : null}
                <div className="mt-6 flex gap-2 border-t border-slate-200 pt-4">
                  <TabFormCancelButton href={detailHref} onClick={handleCancel} />
                  <button
                    type="submit"
                    disabled={saving || productLoading || metaLoading}
                    className="rounded-lg bg-[#185FA5] px-6 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
                  >
                    {saving
                      ? "Saving…"
                      : productLoading || metaLoading
                        ? "Loading…"
                        : "Save changes"}
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
              imageFileUrl={!imageFile && !imageRemoved && hadStoredImage && imageSource === "upload" ? productPhotoFileUrl(productCode) : null}
              imageSource={imageSource}
              imageUrl={imageUrlDraft}
              onImageSourceChange={onImageSourceChange}
              onImageSelect={onImageSelect}
              onImageUrlChange={onImageUrlChange}
              onImageRemove={onImageRemove}
              onOpenSubcategoryModal={openSubcategoryModal}
              allowDiscounts={allowDiscounts}
              branches={branches}
              refsLoading={productLoading || metaLoading}
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
