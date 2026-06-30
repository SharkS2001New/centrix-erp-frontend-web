"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, resolveCustomerMediaUrl } from "@/lib/api";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { CustomerLocationSection } from "@/components/customers/customer-location-section";
import { CustomerShopImageField } from "@/components/customers/customer-shop-image-field";
import { customerLocationPayload } from "@/lib/customer-location";

export const EMPTY_CUSTOMER_FORM = {
  branch_id: "",
  customer_name: "",
  customer_type: "debtor",
  phone_number: "",
  additional_phone: "",
  town: "",
  latitude: "",
  longitude: "",
  route_id: "",
  kra_pin: "",
  terms_of_payment: "",
  credit_limit: "",
  shop_image_url: "",
};

export function isAdminUser(user) {
  return user?.is_admin === true || user?.is_admin === 1;
}

export function shouldShowBranchSelect(user, branches) {
  return isAdminUser(user) || branches.length > 1;
}

export function defaultBranchId(user, branches) {
  if (user?.branch_id != null) return String(user.branch_id);
  if (branches.length === 1) return String(branches[0].id);
  return "";
}

export function customerToForm(customer) {
  return {
    branch_id: customer.branch_id != null ? String(customer.branch_id) : "",
    customer_name: customer.customer_name ?? "",
    customer_type: customer.customer_type ?? "debtor",
    phone_number: customer.phone_number ?? "",
    additional_phone: customer.additional_phone ?? "",
    town: customer.town ?? "",
    route_id: customer.route_id != null ? String(customer.route_id) : "",
    latitude:
      customer.latitude != null && customer.latitude !== ""
        ? String(customer.latitude)
        : "",
    longitude:
      customer.longitude != null && customer.longitude !== ""
        ? String(customer.longitude)
        : "",
    kra_pin: customer.kra_pin ?? "",
    terms_of_payment: customer.terms_of_payment ?? "",
    credit_limit: customer.credit_limit != null ? String(customer.credit_limit) : "",
    shop_image_url: resolveCustomerMediaUrl(customer.shop_image_url ?? customer.shop_image) ?? "",
  };
}

export function buildCustomerBody(form, { includeBranch = true, includeLocation = true } = {}) {
  const routeId = form.route_id ? Number(form.route_id) : null;
  const body = {
    customer_name: form.customer_name.trim(),
    customer_type: form.customer_type,
    phone_number: form.phone_number.trim() || null,
    additional_phone: form.additional_phone.trim() || null,
    town: form.town.trim() || null,
    route_id: form.customer_type === "route" ? routeId : null,
    kra_pin: form.kra_pin.trim() || null,
    terms_of_payment: form.terms_of_payment.trim() || null,
    credit_limit: form.credit_limit !== "" ? parseFloat(form.credit_limit) : 0,
  };
  if (includeBranch) {
    body.branch_id = form.branch_id ? Number(form.branch_id) : null;
  }
  if (includeLocation) {
    Object.assign(body, customerLocationPayload(form.latitude, form.longitude));
  }
  return body;
}

export function validateCustomerLocationFields(form) {
  try {
    customerLocationPayload(form.latitude, form.longitude);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid location";
  }
}

export function updateCustomerFormField(form, key, value) {
  const next = { ...form, [key]: value };
  if (key === "customer_type" && (value === "debtor" || value === "regular")) {
    next.route_id = "";
  }
  if (key === "route_id" && value) {
    next.customer_type = "route";
  }
  return next;
}

export function useCustomerFormResources() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [routeRes, branchRes] = await Promise.all([
        apiRequest("/routes", { searchParams: { per_page: 200 } }),
        apiRequest("/branches", { searchParams: { per_page: 200 } }),
      ]);
      const orgId = user?.organization_id;
      const orgBranches = (branchRes.data ?? []).filter(
        (b) => !orgId || b.organization_id === orgId,
      );
      setRoutes(routeRes.data ?? []);
      setBranches(orgBranches);
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  useEffect(() => {
    load();
  }, [load]);

  const showBranchSelect = useMemo(
    () => shouldShowBranchSelect(user, branches),
    [user, branches],
  );

  const defaultBranch = useMemo(() => defaultBranchId(user, branches), [user, branches]);

  return { user, routes, branches, loading, showBranchSelect, defaultBranch };
}

export function CustomerFormFields({
  form,
  routes,
  branches,
  showBranchSelect,
  onChange,
  customerNum,
  shopImagePreview,
  onShopImageSelect,
  onShopImageRemove,
  removingShopImage = false,
  locationError = null,
  showSaveLocation = false,
  onSaveLocation,
  savingLocation = false,
}) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2 xl:grid-cols-3">
      {customerNum != null && (
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Customer #">
            <input
              type="text"
              value={customerNum}
              readOnly
              className={`${inputClassName()} bg-slate-50 font-mono text-slate-500`}
            />
          </Field>
        </div>
      )}

      <Field label="Name" required>
        <input
          type="text"
          value={form.customer_name}
          onChange={(e) => onChange("customer_name", e.target.value)}
          required
          className={inputClassName()}
          placeholder="Eastlands Mini Mart"
        />
      </Field>

      <Field label="Type">
        <select
          value={form.customer_type}
          onChange={(e) => onChange("customer_type", e.target.value)}
          className={inputClassName()}
        >
          <option value="debtor">Debtor</option>
          <option value="route">Route</option>
          <option value="regular">Regular customer</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Debtors are on account. Route customers belong to a delivery route. Regular customers are
          for records that are not on credit.
        </p>
      </Field>

      {showBranchSelect && (
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Branch" required>
            <select
              value={form.branch_id}
              onChange={(e) => onChange("branch_id", e.target.value)}
              required
              className={inputClassName()}
            >
              <option value="" disabled>
                Select branch
              </option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.branch_name}
                  {b.branch_code ? ` (${b.branch_code})` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <Field label="Phone">
        <input
          type="tel"
          value={form.phone_number}
          onChange={(e) => onChange("phone_number", e.target.value)}
          className={inputClassName()}
          placeholder="0712345678"
        />
      </Field>

      <Field label="Alt. phone">
        <input
          type="tel"
          value={form.additional_phone}
          onChange={(e) => onChange("additional_phone", e.target.value)}
          className={inputClassName()}
        />
      </Field>

      <Field label="Town">
        <input
          type="text"
          value={form.town}
          onChange={(e) => onChange("town", e.target.value)}
          className={inputClassName()}
          placeholder="Nairobi"
        />
      </Field>

      {form.customer_type === "route" ? (
        <Field label="Route" required>
          <select
            value={form.route_id}
            onChange={(e) => onChange("route_id", e.target.value)}
            required
            className={inputClassName()}
          >
            <option value="" disabled>
              Select route
            </option>
            {routes.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.route_name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="hidden md:block" aria-hidden="true" />
      )}

      <Field label="KRA PIN">
        <input
          type="text"
          value={form.kra_pin}
          onChange={(e) => onChange("kra_pin", e.target.value)}
          className={inputClassName()}
        />
      </Field>

      <Field label="Payment terms">
        <input
          type="text"
          value={form.terms_of_payment}
          onChange={(e) => onChange("terms_of_payment", e.target.value)}
          className={inputClassName()}
          placeholder="Net 30"
        />
      </Field>

      <Field label="Credit limit (KES)">
        <input
          type="number"
          value={form.credit_limit}
          onChange={(e) => onChange("credit_limit", e.target.value)}
          min="0"
          step="0.01"
          className={inputClassName()}
          placeholder="0 = no limit"
        />
        <p className="mt-1 text-xs text-slate-500">
          Leave 0 for unlimited credit at POS (registered customers only). Set a positive amount to cap
          outstanding balance.
        </p>
      </Field>

      <CustomerShopImageField
        customerNum={customerNum}
        previewUrl={shopImagePreview ?? form.shop_image_url ?? null}
        onFileSelect={onShopImageSelect}
        onRemove={onShopImageRemove}
        removing={removingShopImage}
      />

      <CustomerLocationSection
        latitude={form.latitude}
        longitude={form.longitude}
        onChange={onChange}
        locationError={locationError}
        showSaveButton={showSaveLocation}
        onSaveLocation={onSaveLocation}
        savingLocation={savingLocation}
      />
    </div>
  );
}

export function CustomerFormPageShell({ backHref, backLabel, title, subtitle, children }) {
  return (
    <div className="theme-workspace min-h-full">
      <div className="w-full">
        <div className="mb-6">
          <Link href={backHref} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
            {backLabel}
          </Link>
          <h1 className="mt-2 text-xl font-medium text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function CustomerFormCard({ children, onSubmit, actions }) {
  return (
    <form
      onSubmit={onSubmit}
      className="w-full theme-panel rounded-xl border p-6 shadow-sm md:p-8"
    >
      {children}
      {actions}
    </form>
  );
}

export function formatCustomerKes(value) {
  if (value == null || value === "") return "—";
  return `KES ${Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function customerInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function resolveFormBranchId(form, user, branches, showBranchSelect) {
  if (showBranchSelect) {
    return form.branch_id ? Number(form.branch_id) : null;
  }
  const fallback = defaultBranchId(user, branches);
  return fallback ? Number(fallback) : user?.branch_id ?? null;
}
