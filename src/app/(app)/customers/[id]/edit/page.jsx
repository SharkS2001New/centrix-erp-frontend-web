"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { isRouteOnlyCustomers } from "@/lib/distribution-settings";
import { apiRequest, ApiError, resolveCustomerMediaUrl, uploadCustomerShopImage } from "@/lib/api";
import { customerLocationPayload } from "@/lib/customer-location";
import {
  buildCustomerBody,
  CustomerFormCard,
  CustomerFormFields,
  CustomerFormPageShell,
  customerToForm,
  resolveFormBranchId,
  updateCustomerFormField,
  useCustomerFormResources,
  validateCustomerLocationFields,
} from "@/components/customers/customer-form";
import { confirmRemoveOptions, useConfirm } from "@/lib/use-confirm";

export default function EditCustomerPage() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const customerNum = params.id;
  const { capabilities } = useAuth();
  const routeCustomersOnly = isRouteOnlyCustomers(capabilities);

  const { user, routes, branches, loading: resourcesLoading, showBranchSelect } =
    useCustomerFormResources();

  const [form, setForm] = useState(null);
  const [shopImageFile, setShopImageFile] = useState(null);
  const [shopImagePreview, setShopImagePreview] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [removingShopImage, setRemovingShopImage] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadCustomer = useCallback(async () => {
    setLoading(true);
    try {
      const customer = await apiRequest(`/customers/${customerNum}`);
      setForm(customerToForm(customer));
      setShopImagePreview(null);
      setShopImageFile(null);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  }, [customerNum]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  useEffect(() => {
    return () => {
      if (shopImagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(shopImagePreview);
      }
    };
  }, [shopImagePreview]);

  function updateField(key, value) {
    setLocationError(null);
    setForm((prev) => updateCustomerFormField(prev, key, value, { routeCustomersOnly }));
  }

  function onShopImageSelect(file) {
    if (shopImagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(shopImagePreview);
    }
    setShopImageFile(file);
    setShopImagePreview(URL.createObjectURL(file));
  }

  async function removeShopImage() {
    const ok = await confirm(confirmRemoveOptions("the shop photo"));
    if (!ok) return;
    setRemovingShopImage(true);
    setFormError(null);
    try {
      const updated = await apiRequest(`/customers/${customerNum}/shop-image`, {
        method: "DELETE",
      });
      setForm((prev) => ({
        ...prev,
        shop_image_url: resolveCustomerMediaUrl(updated.shop_image_url ?? updated.shop_image) ?? "",
      }));
      if (shopImagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(shopImagePreview);
      }
      setShopImagePreview(null);
      setShopImageFile(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to remove photo");
    } finally {
      setRemovingShopImage(false);
    }
  }

  async function saveLocationOnly() {
    const locErr = validateCustomerLocationFields(form);
    if (locErr) {
      setLocationError(locErr);
      return;
    }

    setSavingLocation(true);
    setLocationError(null);
    try {
      const updated = await apiRequest(`/customers/${customerNum}`, {
        method: "PUT",
        body: customerLocationPayload(form.latitude, form.longitude),
      });
      setForm((prev) => ({
        ...prev,
        latitude:
          updated.latitude != null ? String(updated.latitude) : "",
        longitude:
          updated.longitude != null ? String(updated.longitude) : "",
      }));
    } catch (err) {
      setLocationError(err instanceof ApiError ? err.message : "Failed to save location");
    } finally {
      setSavingLocation(false);
    }
  }

  async function saveCustomer(e) {
    e.preventDefault();

    const locErr = validateCustomerLocationFields(form);
    if (locErr) {
      setLocationError(locErr);
      return;
    }

    const branchId = resolveFormBranchId(form, user, branches, showBranchSelect);
    if (!branchId) {
      setFormError("Please select a branch.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setLocationError(null);
    try {
      await apiRequest(`/customers/${customerNum}`, {
        method: "PUT",
        body: {
          ...buildCustomerBody(form, { routeCustomersOnly }),
          branch_id: branchId,
        },
      });
      if (shopImageFile) {
        const withImage = await uploadCustomerShopImage(customerNum, shopImageFile);
        setForm((prev) => ({
          ...prev,
          shop_image_url:
            resolveCustomerMediaUrl(withImage.shop_image_url ?? withImage.shop_image) ?? "",
        }));
      }
      router.push(`/customers/${customerNum}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const pageLoading = loading || resourcesLoading;

  return (
    <CustomerFormPageShell
      backHref={`/customers/${customerNum}`}
      backLabel="← Back to profile"
      title="Edit customer"
      subtitle="Update customer details, shop photo, and GPS location"
    >
      {pageLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : form ? (
        <CustomerFormCard
          onSubmit={saveCustomer}
          actions={
            <>
              {formError && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              )}
              <div className="mt-6 flex gap-2 border-t border-slate-200 pt-4">
                <Link
                  href={`/customers/${customerNum}`}
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
          <CustomerFormFields
            form={form}
            routes={routes}
            branches={branches}
            showBranchSelect={showBranchSelect}
            onChange={updateField}
            routeCustomersOnly={routeCustomersOnly}
            customerNum={customerNum}
            shopImagePreview={shopImagePreview}
            onShopImageSelect={onShopImageSelect}
            onShopImageRemove={
              form.shop_image_url || shopImagePreview ? removeShopImage : undefined
            }
            removingShopImage={removingShopImage}
            locationError={locationError}
            showSaveLocation
            onSaveLocation={saveLocationOnly}
            savingLocation={savingLocation}
          />
        </CustomerFormCard>
      ) : null}
    </CustomerFormPageShell>
  );
}
