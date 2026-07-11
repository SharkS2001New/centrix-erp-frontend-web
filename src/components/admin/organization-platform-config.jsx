"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { PasswordInput } from "@/components/auth/password-input";
import {
  OrderWorkflowSettingsEditor,
  orderWorkflowFromApi,
} from "@/components/admin/order-workflow-settings";
import { DEFAULT_ORDER_WORKFLOW, workflowPipelineSteps } from "@/lib/order-workflow";
import { normalizeStockDeductOn, normalizeOrdersListDefaultDays, normalizeOrdersListSort } from "@/lib/sales-settings";
import { OrdersListDefaultsFields } from "@/components/admin/orders-list-defaults-fields";
import {
  DOMAIN_MODULE_ORDER,
  buildDomainChildrenMap,
  patchEnabledModules,
} from "@/lib/module-registry";
import {
  isProvisionableWorkspaceEnabled,
  patchEnabledModulesForWorkspace,
  sortProvisionableWorkspaces,
  workspaceToggleIcon,
} from "@/lib/workspace-modules";
import { OrganizationCachePanel } from "@/components/admin/organization-cache-panel";
import { useConfirm } from "@/lib/use-confirm";
import {
  ADVANCED_DATA_IMPORT_PAGE_OPTIONS,
  advancedDataImportPagesFromApi,
  defaultAdvancedDataImportPages,
} from "@/lib/advanced-data-import-pages";
import {
  availableLoginChannelsFromCapabilities,
  defaultLoginChannelsForCapabilities,
  formatLoginChannels,
} from "@/lib/login-channels";
import { platformCapabilitiesFromOrgConfig } from "@/lib/sales-channels";
import { OrganizationBillingPanel } from "@/components/platform/organization-billing-panel";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-[#185FA5]";

function OrgRegisterField({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function PlatformFormSection({ title, description, children }) {
  return (
    <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-sm">
      <h2 className="theme-accent-label text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {description ? <p className="theme-subtext mt-1 text-sm">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const PROFILE_TAB_BTN = "rounded-md px-3 py-1.5 text-sm font-medium transition";
const PROFILE_TAB_BTN_ACTIVE = "bg-white text-[#185FA5] shadow-sm";
const PROFILE_TAB_BTN_IDLE = "text-slate-600 hover:text-slate-900";

/**
 * @param {{
 *   mode: 'register' | 'manage',
 *   values: Record<string, string>,
 *   onChange: (field: string, value: string) => void,
 *   profilePresets?: Array<{ key: string, label: string }>,
 *   deploymentProfile?: string,
 *   onProfileChange?: (key: string) => void,
 * }} props
 */
export function OrganizationTenantProfile({
  mode,
  values,
  onChange,
  profilePresets = [],
  deploymentProfile,
  onProfileChange,
}) {
  const isRegister = mode === "register";
  const description = isRegister
    ? "Legal identity and business type for the new organization. Company code is used at sign-in."
    : "Organization identity and business type. Company code cannot be changed after registration.";

  return (
    <PlatformFormSection title="Tenant profile" description={description}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isRegister ? (
          <OrgRegisterField label="Company code *">
            <input
              className={`${inputClass} uppercase`}
              value={values.company_code ?? ""}
              onChange={(e) => onChange("company_code", e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
              placeholder="e.g. ACME"
              required
            />
          </OrgRegisterField>
        ) : (
          <OrgRegisterField label="Company code">
            <input
              className={`${inputClass} font-mono uppercase`}
              value={values.company_code ?? ""}
              readOnly
            />
            <p className="mt-1 text-xs text-slate-500">Set at registration and cannot be changed.</p>
          </OrgRegisterField>
        )}
        <OrgRegisterField label="Company name *">
          <input
            className={inputClass}
            value={values.org_name ?? ""}
            onChange={(e) => onChange("org_name", e.target.value)}
            required
          />
        </OrgRegisterField>
        <OrgRegisterField label="Email *">
          <input
            type="email"
            className={inputClass}
            value={values.org_email ?? ""}
            onChange={(e) => onChange("org_email", e.target.value)}
            required
          />
        </OrgRegisterField>
        <OrgRegisterField label="Telephone *">
          <input
            className={inputClass}
            value={values.primary_tel ?? ""}
            onChange={(e) => onChange("primary_tel", e.target.value)}
            required
          />
        </OrgRegisterField>
        {!isRegister ? (
          <>
            <OrgRegisterField label="Secondary telephone">
              <input
                className={inputClass}
                value={values.secondary_tel ?? ""}
                onChange={(e) => onChange("secondary_tel", e.target.value)}
              />
            </OrgRegisterField>
            <OrgRegisterField label="Additional telephone 1">
              <input
                className={inputClass}
                value={values.addn_tel1 ?? ""}
                onChange={(e) => onChange("addn_tel1", e.target.value)}
              />
            </OrgRegisterField>
            <OrgRegisterField label="Additional telephone 2">
              <input
                className={inputClass}
                value={values.addn_tel2 ?? ""}
                onChange={(e) => onChange("addn_tel2", e.target.value)}
              />
            </OrgRegisterField>
          </>
        ) : null}
        <OrgRegisterField label="Physical address *" className="sm:col-span-2">
          <input
            className={inputClass}
            value={values.org_address ?? ""}
            onChange={(e) => onChange("org_address", e.target.value)}
            required
          />
        </OrgRegisterField>
        <OrgRegisterField label="KRA PIN (optional)">
          <input
            className={`${inputClass} uppercase`}
            value={values.org_pin ?? ""}
            onChange={(e) => onChange("org_pin", e.target.value)}
          />
        </OrgRegisterField>
        <OrgRegisterField label="VAT reg no (optional)">
          <input
            className={inputClass}
            value={values.vat_regno ?? ""}
            onChange={(e) => onChange("vat_regno", e.target.value)}
          />
        </OrgRegisterField>
        {profilePresets.length > 0 ? (
          <OrgRegisterField label="Deployment profile *" className="sm:col-span-2 sm:max-w-md">
            <select
              className={inputClass}
              value={deploymentProfile}
              onChange={(e) => onProfileChange?.(e.target.value)}
              required
            >
              {profilePresets.map((profile) => (
                <option key={profile.key} value={profile.key}>
                  {profile.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {deploymentProfile === "custom"
                ? "Start from a blank setup and enable only the applications you need on the Applications tab."
                : "Business type preset. Changing this updates the default application toggles on the Applications tab."}
            </p>
          </OrgRegisterField>
        ) : null}
      </div>
    </PlatformFormSection>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function defaultSalesPlatformState(deploymentProfile = "wholesale_retail") {
  const mobileProfiles = new Set(["wholesale_retail", "distribution"]);
  const driverProfiles = new Set(["distribution", "wholesale_retail"]);

  return {
    show_checkout_on_create_order: true,
    enable_mobile_orders: mobileProfiles.has(deploymentProfile),
    mobile_enable_field_attendance: false,
    mobile_enable_driver_app: driverProfiles.has(deploymentProfile),
    mobile_enable_driver_attendance: false,
    enable_mpesa_stk: true,
    enable_kra_integration: true,
    enable_ai: true,
    enable_whatsapp_orders: false,
    enable_advanced_data_import: false,
    advanced_data_import_pages: defaultAdvancedDataImportPages(),
    stock_deduct_on: {
      pos: "order_created",
      mobile: "order_completed",
      backend: "order_completed",
    },
    require_pos_till_float: false,
    enable_pos_order_edit: false,
    enable_backoffice_order_edit: true,
    order_workflow: structuredClone(DEFAULT_ORDER_WORKFLOW),
    reserve_stock_on_cart: true,
    cart_reservation_ttl_minutes: "15",
    orders_list_default_days: "5",
    orders_list_sort: "-created_at",
    order_expiry_enabled: true,
    order_expiry_days: "5",
    order_expiry_before_status: "processed",
    order_cancellation_enabled: true,
  };
}

export function salesPlatformFromApi(apiPayload) {
  if (!apiPayload) return defaultSalesPlatformState();
  return {
    show_checkout_on_create_order: Boolean(apiPayload.show_checkout_on_create_order ?? true),
    enable_mobile_orders: apiPayload.enable_mobile_orders !== false,
    mobile_enable_field_attendance: Boolean(apiPayload.mobile_enable_field_attendance),
    mobile_enable_driver_app: apiPayload.mobile_enable_driver_app !== false,
    mobile_enable_driver_attendance: Boolean(apiPayload.mobile_enable_driver_attendance),
    enable_mpesa_stk: apiPayload.enable_mpesa_stk !== false,
    enable_kra_integration: apiPayload.enable_kra_integration !== false,
    enable_ai: apiPayload.enable_ai !== false,
    enable_whatsapp_orders: Boolean(apiPayload.enable_whatsapp_orders ?? false),
    enable_advanced_data_import: Boolean(apiPayload.enable_advanced_data_import ?? false),
    advanced_data_import_pages: advancedDataImportPagesFromApi(apiPayload.advanced_data_import_pages),
    stock_deduct_on: normalizeStockDeductOn(apiPayload.stock_deduct_on, {
      hasPosSales: Boolean(apiPayload?.enabled_modules?.["sales.pos"]),
      showCheckoutOnCreate: apiPayload.show_checkout_on_create_order !== false,
    }),
    require_pos_till_float: Boolean(apiPayload.require_pos_till_float ?? false),
    enable_pos_order_edit: Boolean(apiPayload.enable_pos_order_edit ?? false),
    enable_backoffice_order_edit: apiPayload.enable_backoffice_order_edit !== false,
    order_workflow: orderWorkflowFromApi({ order_workflow: apiPayload.order_workflow }),
    reserve_stock_on_cart: apiPayload.reserve_stock_on_cart !== false,
    cart_reservation_ttl_minutes:
      apiPayload.cart_reservation_ttl_minutes != null && apiPayload.cart_reservation_ttl_minutes !== ""
        ? String(Math.min(15, Math.max(0, Number(apiPayload.cart_reservation_ttl_minutes) || 0)))
        : "15",
    orders_list_default_days: String(normalizeOrdersListDefaultDays(apiPayload.orders_list_default_days)),
    orders_list_sort: normalizeOrdersListSort(apiPayload.orders_list_sort),
    order_expiry_enabled: apiPayload.order_expiry_enabled !== false,
    order_expiry_days: String(
      Math.min(90, Math.max(1, Number(apiPayload.order_expiry_days) || 5)),
    ),
    order_expiry_before_status: String(apiPayload.order_expiry_before_status ?? "processed"),
    order_cancellation_enabled: apiPayload.order_cancellation_enabled !== false,
  };
}

export function OrganizationPlatformSalesSettings({
  salesPlatform,
  onChange,
  enabledModules = {},
}) {
  const salesEnabled = Boolean(enabledModules.sales);
  const mobileOrdersEnabled = salesPlatform?.enable_mobile_orders !== false;
  const description =
    "Platform-only checkout mode, mobile application access, and payment integrations.";

  function patch(partial) {
    onChange?.({ ...salesPlatform, ...partial });
  }

  const showCheckout = salesPlatform?.show_checkout_on_create_order !== false;

  return (
    <>
    <PlatformFormSection title="Sales behaviour" description={description}>
      {!salesEnabled ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Enable the <strong>Sales</strong> module to configure sales behaviour for this organization.
        </p>
      ) : (
        <div className="space-y-3">
          <Toggle
            label="Show checkout on create order (POS)"
            description="When off, cashiers use Save order instead of opening the payment screen immediately."
            checked={showCheckout}
            onChange={(v) => patch({ show_checkout_on_create_order: v })}
          />
          <Toggle
            label="Enable mobile orders"
            description="When on, the mobile app, mobile user logins, and backoffice mobile-order views are available. When off, only backoffice (and external POS when enabled) can be used."
            checked={mobileOrdersEnabled}
            onChange={(v) => patch({ enable_mobile_orders: v })}
          />
          {mobileOrdersEnabled ? (
            <div className="ml-4 space-y-3 border-l border-slate-200 pl-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mobile application modules
              </p>
              <Toggle
                label="Field sales attendance (sign-in photo & GPS)"
                description="Sales reps must sign in with photo and location on the mobile app. Sessions appear under HR field attendance."
                checked={Boolean(salesPlatform?.mobile_enable_field_attendance)}
                onChange={(v) => patch({ mobile_enable_field_attendance: v })}
              />
              <Toggle
                label="Driver module on mobile app"
                description="Drivers can view trips, navigate stops, and capture proof of delivery on the mobile app. Requires Distribution."
                checked={salesPlatform?.mobile_enable_driver_app !== false}
                onChange={(v) =>
                  patch({
                    mobile_enable_driver_app: v,
                    mobile_enable_driver_attendance: v
                      ? salesPlatform?.mobile_enable_driver_attendance
                      : false,
                  })
                }
              />
              <Toggle
                label="Driver attendance (sign-in photo & GPS)"
                description="Drivers must sign in and out with photo and GPS on the mobile app."
                checked={Boolean(salesPlatform?.mobile_enable_driver_attendance)}
                onChange={(v) => patch({ mobile_enable_driver_attendance: v })}
                disabled={salesPlatform?.mobile_enable_driver_app === false}
              />
            </div>
          ) : null}
          <Toggle
            label="Require operating till float at external POS"
            description="When on, cashiers on the external POS workspace (/pos) must open a till session and declare operating float before sales. Backoffice create order uses a separate setting below. X/Z reports and end-of-day include float breakdown."
            checked={Boolean(salesPlatform?.require_pos_till_float)}
            onChange={(v) => patch({ require_pos_till_float: v })}
          />
          <Toggle
            label="Allow editing completed POS orders"
            description="When on, cashiers on external POS can reload a completed order by number to correct mistakes. Stock is restored, a KRA credit note is issued when the original sale was fiscalized, and checkout creates a new sale."
            checked={Boolean(salesPlatform?.enable_pos_order_edit)}
            onChange={(v) => patch({ enable_pos_order_edit: v })}
          />
          <Toggle
            label="Allow editing backoffice orders"
            description="When on, staff can correct line quantities on backoffice sales orders from the orders list (including older orders). Unit prices stay fixed; totals and stock adjust on save."
            checked={salesPlatform?.enable_backoffice_order_edit !== false}
            onChange={(v) => patch({ enable_backoffice_order_edit: v })}
          />
          <Toggle
            label="Enable M-Pesa STK Push"
            description="When off, this organization cannot configure M-Pesa and STK Push is hidden on POS checkout."
            checked={salesPlatform?.enable_mpesa_stk !== false}
            onChange={(v) => patch({ enable_mpesa_stk: v })}
          />
          <Toggle
            label="Enable KRA integration"
            description="When off, this organization cannot configure a KRA fiscal device."
            checked={salesPlatform?.enable_kra_integration !== false}
            onChange={(v) => patch({ enable_kra_integration: v })}
          />
          <Toggle
            label="Enable AI assistant"
            description="When off, this organization cannot configure or use the floating AI assistant, regardless of user permissions."
            checked={salesPlatform?.enable_ai !== false}
            onChange={(v) => patch({ enable_ai: v })}
          />
          <Toggle
            label="Enable WhatsApp ordering"
            description="When off, this organization cannot configure WhatsApp credentials or receive orders through the shared platform webhook."
            checked={Boolean(salesPlatform?.enable_whatsapp_orders)}
            onChange={(v) => patch({ enable_whatsapp_orders: v })}
          />
          <Toggle
            label="Advanced data import"
            description="When on, users with the relevant manage permissions (and organization administrators) can import master data from CSV or Excel. Choose which screens show import below."
            checked={Boolean(salesPlatform?.enable_advanced_data_import)}
            onChange={(v) =>
              patch({
                enable_advanced_data_import: v,
                advanced_data_import_pages:
                  v && !salesPlatform?.advanced_data_import_pages
                    ? defaultAdvancedDataImportPages()
                    : salesPlatform?.advanced_data_import_pages ?? defaultAdvancedDataImportPages(),
              })
            }
          />
          {salesPlatform?.enable_advanced_data_import ? (
            <div className="ml-6 space-y-2 border-l border-slate-200 pl-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Import screens for this organization
              </p>
              {ADVANCED_DATA_IMPORT_PAGE_OPTIONS.map(({ key, label }) => (
                <Toggle
                  key={key}
                  label={label}
                  checked={Boolean(salesPlatform?.advanced_data_import_pages?.[key])}
                  onChange={(enabled) =>
                    patch({
                      advanced_data_import_pages: {
                        ...(salesPlatform?.advanced_data_import_pages ?? defaultAdvancedDataImportPages()),
                        [key]: enabled,
                      },
                    })
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </PlatformFormSection>
    {salesEnabled ? (
      <PlatformFormSection
        title="Orders list"
        description="Default date range and sort order when staff open Sales → Orders and workflow order queues."
      >
        <OrdersListDefaultsFields
          value={salesPlatform}
          onChange={onChange}
          idPrefix="platform-orders-list"
        />
      </PlatformFormSection>
    ) : null}
  </>
  );
}

export function OrganizationOrderWorkflowSettings({
  salesPlatform,
  onChange,
  enabledModules = {},
}) {
  const wf = salesPlatform?.order_workflow ?? DEFAULT_ORDER_WORKFLOW;
  const salesEnabled = Boolean(enabledModules.sales);
  const distributionEnabled = Boolean(enabledModules.distribution);
  const hasPosSales = Boolean(enabledModules["sales.pos"]);
  const showCheckout = salesPlatform?.show_checkout_on_create_order !== false;
  const stockDeductOn = normalizeStockDeductOn(salesPlatform?.stock_deduct_on, {
    hasPosSales,
    showCheckoutOnCreate: showCheckout,
  });
  const reserveStockOnCart = salesPlatform?.reserve_stock_on_cart !== false;
  const expiryPipelineSteps = useMemo(
    () => workflowPipelineSteps(wf).filter((step) => step.key !== "cancelled" && step.key !== "expired"),
    [wf],
  );

  function patch(partial) {
    onChange?.({ ...salesPlatform, ...partial });
  }

  return (
    <PlatformFormSection
      title="Order workflow"
      description="Order pipeline stages, save and checkout rules, stock deduction timing, and cart reservations."
    >
      {!salesEnabled ? (
        <p className="theme-subtext rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 text-sm">
          Enable the <strong className="theme-heading font-semibold">Sales</strong> module to configure order workflow for this organization.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cart reservations</p>
            <p className="mt-1 text-xs text-slate-500">
              Hold stock while a cart is open so other tills cannot oversell the same quantity before checkout.
              Order-level stock reservation below applies after an order is saved.
            </p>
            <div className="mt-3 space-y-3">
              <Toggle
                label="Reserve stock when added to cart"
                checked={reserveStockOnCart}
                onChange={(v) => patch({ reserve_stock_on_cart: v })}
              />
              {reserveStockOnCart ? (
                <OrgRegisterField label="Cart reservation time (minutes)">
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={1}
                    className={inputClass}
                    value={salesPlatform?.cart_reservation_ttl_minutes ?? "15"}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        patch({ cart_reservation_ttl_minutes: "" });
                        return;
                      }
                      const parsed = Math.min(15, Math.max(0, Number(raw) || 0));
                      patch({ cart_reservation_ttl_minutes: String(parsed) });
                    }}
                    placeholder="15"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    How long stock stays held on an open cart (max 15 minutes). Use 0 for no expiry.
                  </p>
                </OrgRegisterField>
              ) : null}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stale order expiry</p>
            <p className="mt-1 text-xs text-slate-500">
              Unprocessed orders are moved to Expired automatically after the configured number of days.
              Expired and cancelled orders are excluded from active order counts and revenue totals. When
              enabled, an Expired orders link appears under Backoffice → Sales → Orders.
            </p>
            <div className="mt-3 space-y-3">
              <Toggle
                label="Auto-expire stale orders"
                checked={salesPlatform?.order_expiry_enabled !== false}
                onChange={(v) => patch({ order_expiry_enabled: v })}
              />
              {salesPlatform?.order_expiry_enabled !== false ? (
                <>
                  <OrgRegisterField label="Expire after (days without processing)">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      step={1}
                      className={inputClass}
                      value={salesPlatform?.order_expiry_days ?? "5"}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          patch({ order_expiry_days: "" });
                          return;
                        }
                        const parsed = Math.min(90, Math.max(1, Number(raw) || 5));
                        patch({ order_expiry_days: String(parsed) });
                      }}
                    />
                  </OrgRegisterField>
                  <OrgRegisterField label="Still in pipeline before">
                    <select
                      className={inputClass}
                      value={salesPlatform?.order_expiry_before_status ?? "processed"}
                      onChange={(e) => patch({ order_expiry_before_status: e.target.value })}
                    >
                      {expiryPipelineSteps.map((step) => (
                        <option key={step.key} value={step.key}>
                          {step.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Orders in earlier stages (e.g. booked, pending) are expired once the day limit passes.
                    </p>
                  </OrgRegisterField>
                </>
              ) : null}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order cancellation</p>
            <p className="mt-1 text-xs text-slate-500">
              When enabled, staff can cancel orders that are still booked, pending, or unpaid. Partially paid
              and later stages cannot be cancelled. A Cancelled orders link appears under Backoffice → Sales →
              Orders.
            </p>
            <div className="mt-3 space-y-3">
              <Toggle
                label="Allow order cancellation"
                checked={salesPlatform?.order_cancellation_enabled !== false}
                onChange={(v) => patch({ order_cancellation_enabled: v })}
              />
            </div>
          </div>
          <OrderWorkflowSettingsEditor
            embedded
            workflow={wf}
            onChange={(next) => patch({ order_workflow: next })}
            showCheckoutOnCreate={showCheckout}
            stockDeductOn={stockDeductOn}
            onStockDeductOnChange={(value) => patch({ stock_deduct_on: value })}
            distributionOpsEnabled={distributionEnabled}
            hasPosSales={hasPosSales}
          />
        </div>
      )}
    </PlatformFormSection>
  );
}

const MANAGE_ORG_TABS = [
  { id: "profile", label: "Tenant profile" },
  { id: "sales", label: "Sales behaviour" },
  { id: "workflow", label: "Order workflow" },
  { id: "status", label: "Organization status" },
  { id: "modules", label: "Applications" },
  { id: "users", label: "Users" },
  { id: "maintenance", label: "Maintenance" },
];

const REGISTER_ORG_TABS = [
  { id: "profile", label: "Tenant profile" },
  { id: "sales", label: "Sales behaviour" },
  { id: "workflow", label: "Order workflow" },
  { id: "modules", label: "Applications" },
  { id: "admin", label: "Initial administrator" },
];

function OrganizationConfigTabBar({ tabs, activeTab, onTabChange }) {
  return (
    <div className="w-full overflow-x-auto">
      <div
        className="flex w-full min-w-[42rem] flex-nowrap gap-1 rounded-lg bg-slate-100 p-0.5"
        role="tablist"
        aria-label="Organization configuration"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`${PROFILE_TAB_BTN} min-w-0 flex-1 shrink-0 whitespace-nowrap px-2 text-center sm:px-3 ${
              activeTab === tab.id ? PROFILE_TAB_BTN_ACTIVE : PROFILE_TAB_BTN_IDLE
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OrganizationConfigTabs({
  mode,
  tenantValues,
  onTenantChange,
  profilePresets = [],
  deploymentProfile,
  onProfileChange,
  salesPlatform,
  onSalesChange,
  enabledModules = {},
  moduleOptions = [],
  onToggleModule,
  onSetModules,
  mobileOrdersEnabled = true,
  organization,
  organizationId,
  isActive,
  onStatusChange,
  adminPanel,
}) {
  const tabs = mode === "register" ? REGISTER_ORG_TABS : MANAGE_ORG_TABS;
  const [activeTab, setActiveTab] = useState("profile");

  return (
    <div className="w-full min-w-0 space-y-4">
      <OrganizationConfigTabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "profile" ? (
        <OrganizationTenantProfile
          mode={mode}
          values={tenantValues}
          onChange={onTenantChange}
          profilePresets={profilePresets}
          deploymentProfile={deploymentProfile}
          onProfileChange={onProfileChange}
        />
      ) : null}

      {activeTab === "sales" ? (
        <OrganizationPlatformSalesSettings
          salesPlatform={salesPlatform}
          onChange={onSalesChange}
          enabledModules={enabledModules}
        />
      ) : null}

      {activeTab === "workflow" ? (
        <OrganizationOrderWorkflowSettings
          salesPlatform={salesPlatform}
          onChange={onSalesChange}
          enabledModules={enabledModules}
        />
      ) : null}

      {activeTab === "status" && mode === "manage" ? (
        <OrganizationStatusPanel
          organization={organization}
          isActive={isActive}
          onChange={onStatusChange}
        />
      ) : null}

      {activeTab === "modules" ? (
        <OrganizationModuleToggles
          moduleOptions={moduleOptions}
          enabledModules={enabledModules}
          onToggle={onToggleModule}
          onSetModules={onSetModules}
          mobileOrdersEnabled={mobileOrdersEnabled}
        />
      ) : null}

      {activeTab === "users" && mode === "manage" ? (
        <OrganizationUsersPanel
          organizationId={organizationId ?? organization?.id}
          companyCode={tenantValues.company_code}
          enabledModules={enabledModules}
          mobileOrdersEnabled={mobileOrdersEnabled}
          salesPlatform={salesPlatform}
          detailed
        />
      ) : null}

      {activeTab === "maintenance" && mode === "manage" ? (
        <div className="space-y-6">
          <OrganizationCachePanel organizationId={organizationId ?? organization?.id} />
          <OrganizationDeletePanel
            organizationId={organizationId ?? organization?.id}
            organizationName={organization?.org_name}
          />
        </div>
      ) : null}

      {activeTab === "admin" && mode === "register" && adminPanel ? adminPanel : null}
    </div>
  );
}

export function groupModulesByDomain(moduleOptions) {
  const byKey = new Map((moduleOptions ?? []).map((m) => [m.key, m]));
  const domains = (moduleOptions ?? []).filter((m) => m.kind === "domain");
  domains.sort((a, b) => {
    const ai = DOMAIN_MODULE_ORDER.indexOf(a.key);
    const bi = DOMAIN_MODULE_ORDER.indexOf(b.key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return domains.map((domain) => {
    const childKeys = domain.children?.length
      ? domain.children
      : (moduleOptions ?? []).filter((m) => m.parent === domain.key).map((m) => m.key);
    const children = childKeys.map((key) => byKey.get(key)).filter(Boolean);

    return { domain, children };
  });
}

export function OrganizationModuleToggles({
  moduleOptions = [],
  enabledModules,
  onToggle,
  onSetModules,
  mobileOrdersEnabled = true,
}) {
  const domainChildrenMap = useMemo(() => buildDomainChildrenMap(moduleOptions), [moduleOptions]);
  const workspaces = useMemo(() => sortProvisionableWorkspaces(), []);

  function setWorkspaceEnabled(workspaceId, enable) {
    const next = patchEnabledModulesForWorkspace(
      enabledModules,
      workspaceId,
      enable,
      domainChildrenMap,
      mobileOrdersEnabled,
    );
    if (onSetModules) {
      onSetModules(next);
      return;
    }
    for (const [key, value] of Object.entries(next)) {
      if (Boolean(enabledModules[key]) !== Boolean(value)) {
        onToggle(key);
      }
    }
  }

  return (
    <PlatformFormSection
      title="Applications"
      description="Choose which applications appear on the login workspace screen for this organization. When Administration is disabled, tenant managers cannot open the Administration workspace — configure users and organization settings from the platform instead."
    >
      <div className="space-y-4">
        {workspaces.map((workspace) => {
          const enabled = isProvisionableWorkspaceEnabled(workspace, enabledModules);
          const isDistribution = workspace.id === "distribution";
          const distributionBlocked = isDistribution && !mobileOrdersEnabled;

          return (
            <label
              key={workspace.id}
              className={`flex items-start gap-4 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] p-4 ${
                distributionBlocked ? "opacity-60" : ""
              }`}
            >
              <input
                type="checkbox"
                className="mt-1 rounded border-[var(--theme-border)]"
                checked={enabled}
                disabled={distributionBlocked}
                onChange={(e) => setWorkspaceEnabled(workspace.id, e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden>
                    {workspaceToggleIcon(workspace.icon)}
                  </span>
                  <span className="theme-heading block text-sm font-semibold">{workspace.label}</span>
                </span>
                <span className="theme-subtext mt-1 block text-xs">{workspace.description}</span>
                {isDistribution ? (
                  <span className="theme-subtext mt-1 block text-xs">
                    {mobileOrdersEnabled
                      ? "Requires mobile orders to be enabled."
                      : "Enable mobile orders on the Sales behaviour tab before turning on Distribution."}
                  </span>
                ) : null}
                {workspace.id === "admin" && !enabled ? (
                  <span className="mt-1 block text-xs text-amber-800 dark:text-amber-300">
                    Organization settings, security, notifications, and AI preferences move to Platform → Organization
                    settings for this tenant.
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </PlatformFormSection>
  );
}

function pickDefaultBranch(branches) {
  if (!Array.isArray(branches) || branches.length === 0) return null;
  const hq = branches.find((b) => String(b.branch_code ?? "").toUpperCase() === "HQ");
  return hq ?? branches[0];
}

function pickDefaultRole(roles, { admin = false } = {}) {
  if (!Array.isArray(roles) || roles.length === 0) return null;
  if (admin) {
    return (
      roles.find((r) => String(r.role_name ?? "").toLowerCase() === "administrator") ??
      roles.find((r) => r.scope === "org") ??
      roles[0]
    );
  }
  return (
    roles.find((r) => String(r.role_name ?? "").toLowerCase() === "branch manager") ??
    roles.find((r) => String(r.role_name ?? "").toLowerCase() === "cashier") ??
    roles[0]
  );
}

export function OrganizationUsersPanel({
  organizationId,
  companyCode,
  enabledModules = {},
  mobileOrdersEnabled = true,
  salesPlatform = {},
  detailed = false,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branchId, setBranchId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [loginChannels, setLoginChannels] = useState(["backoffice"]);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createMessage, setCreateMessage] = useState(null);

  const platformCapabilities = useMemo(
    () =>
      platformCapabilitiesFromOrgConfig({
        enabledModules,
        mobileOrdersEnabled,
        salesPlatform,
      }),
    [enabledModules, mobileOrdersEnabled, salesPlatform],
  );

  const availableLoginChannels = useMemo(
    () => availableLoginChannelsFromCapabilities(platformCapabilities),
    [platformCapabilities],
  );

  const loadUsers = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { apiRequest } = await import("@/lib/api");
      const res = await apiRequest(`/admin/organizations/${organizationId}/users`, {
        searchParams: { per_page: 200 },
      });
      setUsers(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      const { ApiError } = await import("@/lib/api");
      setLoadError(err instanceof ApiError ? err.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const loadReferenceData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { apiRequest } = await import("@/lib/api");
      const [branchRes, roleRes] = await Promise.all([
        apiRequest(`/admin/organizations/${organizationId}/branches`, { searchParams: { per_page: 200 } }),
        apiRequest(`/admin/organizations/${organizationId}/roles`, { searchParams: { per_page: 200 } }),
      ]);
      const branchList = Array.isArray(branchRes?.data) ? branchRes.data : [];
      const roleList = Array.isArray(roleRes?.data) ? roleRes.data : [];
      setBranches(branchList);
      setRoles(roleList);
      const branch = pickDefaultBranch(branchList);
      const staffRole = pickDefaultRole(roleList, { admin: false });
      setBranchId(branch?.id ? String(branch.id) : "");
      setRoleId(staffRole?.id ? String(staffRole.id) : "");
    } catch {
      setBranches([]);
      setRoles([]);
      setBranchId("");
      setRoleId("");
    }
  }, [organizationId]);

  useEffect(() => {
    loadUsers();
    loadReferenceData();
  }, [loadUsers, loadReferenceData]);

  function openCreateModal() {
    setCreateError(null);
    setFullName("");
    setUsername("");
    setEmail("");
    setPassword("");
    setIsAdmin(false);
    setMustChangePassword(true);
    setLoginChannels(defaultLoginChannelsForCapabilities(platformCapabilities));
    const branch = pickDefaultBranch(branches);
    const staffRole = pickDefaultRole(roles, { admin: false });
    setBranchId(branch?.id ? String(branch.id) : "");
    setRoleId(staffRole?.id ? String(staffRole.id) : "");
    setModalOpen(true);
  }

  function closeCreateModal() {
    if (saving) return;
    setModalOpen(false);
    setCreateError(null);
  }

  async function handleCreateUser() {
    if (!organizationId) return;
    if (!fullName.trim() || !username.trim() || !password.trim()) {
      setCreateError("Full name, username, and password are required.");
      return;
    }
    const resolvedBranchId = branchId ? Number(branchId) : null;
    const resolvedRoleId = isAdmin
      ? pickDefaultRole(roles, { admin: true })?.id ?? (roleId ? Number(roleId) : null)
      : roleId
        ? Number(roleId)
        : null;
    if (!resolvedBranchId) {
      setCreateError("Select a branch. Add a branch first if none exist.");
      return;
    }
    if (!resolvedRoleId) {
      setCreateError("Select a role. Seed roles first if none exist.");
      return;
    }
    if (!loginChannels.length) {
      setCreateError("Select at least one login channel.");
      return;
    }
    setSaving(true);
    setCreateError(null);
    setCreateMessage(null);
    try {
      const { apiRequest } = await import("@/lib/api");
      const res = await apiRequest(`/admin/organizations/${organizationId}/users`, {
        method: "POST",
        body: {
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim() || null,
          password,
          is_admin: isAdmin,
          must_change_password: mustChangePassword,
          access_scope: "org",
          branch_id: resolvedBranchId,
          role_id: resolvedRoleId,
          login_channels: loginChannels,
        },
      });
      setCreateMessage(`User ${res.username ?? username} created.`);
      setModalOpen(false);
      await loadUsers();
    } catch (err) {
      const { ApiError } = await import("@/lib/api");
      setCreateError(err instanceof ApiError ? err.message : "Could not create user.");
    } finally {
      setSaving(false);
    }
  }

  const createModal =
    modalOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/45 p-4">
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="org-create-user-title"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 id="org-create-user-title" className="text-lg font-semibold text-slate-900">
                  Create user
                </h3>
                <button
                  type="button"
                  className="text-sm text-slate-500 hover:text-slate-800"
                  onClick={closeCreateModal}
                  disabled={saving}
                >
                  Close
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                New sign-in account for {companyCode ? `company code ${companyCode}` : "this organization"}.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <OrgRegisterField label="Full name *">
                  <input
                    className={inputClass}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </OrgRegisterField>
                <OrgRegisterField label="Username *">
                  <input
                    className={inputClass}
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                  />
                </OrgRegisterField>
                <OrgRegisterField label="Email">
                  <input
                    type="email"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </OrgRegisterField>
                <OrgRegisterField label="Password *">
                  <input
                    type="password"
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                  />
                </OrgRegisterField>
                <OrgRegisterField label="Branch *">
                  <select
                    className={inputClass}
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    <option value="">Select branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={String(branch.id)}>
                        {branch.branch_name}
                      </option>
                    ))}
                  </select>
                </OrgRegisterField>
                <OrgRegisterField label="Role *">
                  <select
                    className={inputClass}
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    disabled={isAdmin}
                  >
                    <option value="">Select role</option>
                    {roles.map((role) => (
                      <option key={role.id} value={String(role.id)}>
                        {role.role_name}
                      </option>
                    ))}
                  </select>
                </OrgRegisterField>
              </div>

              <div className="mt-4">
                <span className="text-xs font-medium text-slate-600">Login channels *</span>
                <div className="mt-2 flex flex-wrap gap-3">
                  {availableLoginChannels.map((channel) => (
                    <label key={channel.value} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={loginChannels.includes(channel.value)}
                        onChange={(e) =>
                          setLoginChannels((prev) =>
                            e.target.checked
                              ? [...prev, channel.value]
                              : prev.filter((c) => c !== channel.value),
                          )
                        }
                      />
                      {channel.label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className="rounded"
                />
                Organization administrator (full access)
              </label>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={mustChangePassword}
                  onChange={(e) => setMustChangePassword(e.target.checked)}
                  className="rounded"
                />
                Require password change on first sign-in
              </label>

              {createError ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateUser()}
                  disabled={saving}
                  className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#144f8a] disabled:opacity-50"
                >
                  {saving ? "Creating…" : "Create user"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <PlatformFormSection
      title="Users & logins"
      description={
        companyCode
          ? `Sign-in accounts for this tenant (company code ${companyCode}). ${detailed ? "Shows last login and active sessions." : ""}`
          : "Sign-in accounts for this tenant."
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {loading ? "Loading users…" : `${users.length} user${users.length === 1 ? "" : "s"}`}
        </p>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Create user
        </button>
      </div>

      {loadError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : null}

      {createMessage ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {createMessage}
        </p>
      ) : null}

      {!loading && users.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Username</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Channels</th>
                <th className="px-4 py-2">Last login</th>
                <th className="px-4 py-2">Sessions</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <OrganizationUserRow
                  key={user.id}
                  user={user}
                  organizationId={organizationId}
                  onUpdated={loadUsers}
                  detailed={detailed}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && users.length === 0 && !loadError ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          No users yet. Use Create user to add the first sign-in account.
        </p>
      ) : null}

      {createModal}
    </PlatformFormSection>
  );
}

function userIsPasswordLocked(user) {
  return Boolean(user?.password_locked ?? user?.must_change_password);
}

function OrganizationUserRow({ user, organizationId, onUpdated, detailed = false }) {
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFullName(user.full_name ?? "");
    setUsername(user.username ?? "");
    setEmail(user.email ?? "");
  }, [user.full_name, user.username, user.email]);

  async function updateUser(body) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { apiRequest } = await import("@/lib/api");
      await apiRequest(`/admin/organizations/${organizationId}/users/${user.id}`, {
        method: "PATCH",
        body,
      });
      setPassword("");
      setSaved(true);
      setEditing(false);
      await onUpdated?.();
    } catch (err) {
      const { ApiError } = await import("@/lib/api");
      setError(err instanceof ApiError ? err.message : "Could not update user.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(e) {
    e?.preventDefault?.();
    await updateUser({
      full_name: fullName.trim(),
      username: username.trim(),
      email: email.trim(),
    });
  }

  async function clearPasswordLock() {
    const ok = await confirm({
      title: "Clear password lock?",
      message: `Clear the password lock for "${user.full_name}"? They can sign in and use the application without changing their password.`,
      confirmLabel: "Clear lock",
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { apiRequest } = await import("@/lib/api");
      await apiRequest(`/admin/organizations/${organizationId}/users/${user.id}/clear-password-lock`, {
        method: "POST",
      });
      setSaved(true);
      await onUpdated?.();
    } catch (err) {
      const { ApiError } = await import("@/lib/api");
      setError(err instanceof ApiError ? err.message : "Could not clear password lock.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    const ok = await confirm({
      title: "Delete user",
      message: `Delete "${user.full_name}"? Users with sales or activity history are archived; users without records are removed permanently.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { apiRequest, ApiError } = await import("@/lib/api");
      await apiRequest(`/admin/organizations/${organizationId}/users/${user.id}`, {
        method: "DELETE",
      });
      await onUpdated?.();
    } catch (err) {
      const { ApiError } = await import("@/lib/api");
      setError(err instanceof ApiError ? err.message : "Could not delete user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr>
      <td className="px-4 py-2 font-mono text-xs">{user.username}</td>
      <td className="px-4 py-2">{user.full_name}</td>
      <td className="px-4 py-2 text-slate-600">{user.email}</td>
      <td className="px-4 py-2">
        {user.is_admin ? (
          <span className="rounded bg-[#185FA5]/10 px-2 py-0.5 text-xs font-medium text-[#185FA5]">
            Administrator
          </span>
        ) : (
          <span className="text-slate-600">Staff</span>
        )}
      </td>
      <td className="px-4 py-2 text-xs text-slate-600">{formatLoginChannels(user.login_channels)}</td>
      <td className="px-4 py-2 text-xs text-slate-600">
        {user.last_login ? new Date(user.last_login).toLocaleString() : "—"}
      </td>
      <td className="px-4 py-2 text-xs text-slate-600">
        {user.active_login_count > 0 ? (
          detailed ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="font-medium text-emerald-700 hover:underline"
            >
              {user.active_login_count} active
            </button>
          ) : (
            <span className="font-medium text-emerald-700">{user.active_login_count} active</span>
          )
        ) : (
          <span className="text-slate-400">None</span>
        )}
      </td>
      <td className="px-4 py-2">
        {user.is_active ? (
          <span className="text-emerald-700">Active</span>
        ) : (
          <span className="text-slate-400">Inactive</span>
        )}
        {userIsPasswordLocked(user) ? (
          <span className="mt-1 block text-[11px] font-medium text-amber-700">Password locked</span>
        ) : null}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {userIsPasswordLocked(user) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearPasswordLock()}
                className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
              >
                Clear password lock
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing((v) => !v);
                setError(null);
                setSaved(false);
              }}
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
            >
              {editing ? "Cancel edit" : "Edit details"}
            </button>
            <input
              type="password"
              className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={mustChangePassword}
                onChange={(e) => setMustChangePassword(e.target.checked)}
              />
              Require change on sign-in
            </label>
            <button
              type="button"
              disabled={busy || password.length < 6}
              onClick={() =>
                void updateUser({ password, must_change_password: mustChangePassword })
              }
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
            >
              Reset password
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void updateUser({ is_active: !user.is_active })}
              className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
            >
              {user.is_active ? "Disable login" : "Enable login"}
            </button>
            {!user.is_admin ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void deleteUser()}
                className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Delete user
              </button>
            ) : null}
          </div>
          {saved ? <p className="text-xs text-emerald-700">User details saved.</p> : null}
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
      </td>
    </tr>
      {editing ? (
        <tr className="bg-slate-50">
          <td colSpan={9} className="px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs text-slate-600">
                Full name
                <input
                  className={`${inputClass} mt-1`}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
              <label className="block text-xs text-slate-600">
                Username
                <input
                  className={`${inputClass} mt-1 font-mono`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                />
              </label>
              <label className="block text-xs text-slate-600">
                Email
                <input
                  type="email"
                  className={`${inputClass} mt-1`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  onClick={() => void saveDetails()}
                  disabled={busy}
                  className="rounded-lg bg-[#185FA5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#144f8a] disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save user details"}
                </button>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
      {detailed && expanded && user.active_logins?.length > 0 ? (
        <tr className="bg-slate-50">
          <td colSpan={9} className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Active sessions</p>
            <ul className="mt-2 space-y-2">
              {user.active_logins.map((session) => (
                <li
                  key={session.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                >
                  <span className="font-medium text-slate-900">
                    {session.active_workspace_label ?? session.channel}
                  </span>
                  {session.channel ? (
                    <span className="text-slate-500"> · {session.channel}</span>
                  ) : null}
                  {session.device ? <span className="text-slate-500"> · {session.device}</span> : null}
                  <span className="mt-1 block text-slate-500">
                    Signed in {session.signed_in_at ? new Date(session.signed_in_at).toLocaleString() : "—"}
                    {session.last_used_at
                      ? ` · Last used ${new Date(session.last_used_at).toLocaleString()}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function OrganizationStatusPanel({ organization, isActive: isActiveProp, onChange }) {
  const isActive = isActiveProp ?? organization?.is_active !== false;
  const organizationId = organization?.id;

  return (
    <div className="space-y-6">
      <PlatformFormSection
        title="Organization status"
        description="Disabling an organization signs out all users and blocks sign-in until re-enabled."
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={isActive}
            onChange={(e) => onChange?.({ is_active: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              {isActive ? "Organization is active" : "Organization is disabled"}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {isActive
                ? "Users can sign in normally."
                : "All users are signed out and cannot sign in until you re-enable this organization."}
            </span>
          </span>
        </label>
      </PlatformFormSection>

      {organizationId ? (
        <OrganizationBillingPanel
          organizationId={organizationId}
          organization={organization}
          showRevoke
        />
      ) : null}
    </div>
  );
}

export function OrganizationDeletePanel({ organizationId, organizationName }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const nameMatches = confirmation.trim() === (organizationName ?? "").trim();
  const canDelete = Boolean(organizationId && nameMatches && password.length > 0);

  async function handleDelete() {
    if (!canDelete) return;
    const ok = await confirm({
      title: "Delete organization",
      message:
        "Permanently remove this organization from the platform? All users will be signed out and cannot sign in again.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setDeleting(true);
    setError(null);
    try {
      await apiRequest(`/admin/organizations/${organizationId}`, {
        method: "DELETE",
        body: {
          confirmation: confirmation.trim(),
          password,
        },
      });
      router.push("/platform");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete organization.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PlatformFormSection
      title="Delete organization"
      description="Removes the organization from the platform. Tenant data remains in the database but users can no longer sign in."
    >
      <div className="space-y-4 rounded-lg border border-red-200 bg-red-50/60 px-4 py-4">
        <p className="text-sm text-red-900">
          This action signs out every user and removes the organization from the platform list. Type{" "}
          <span className="font-semibold">{organizationName}</span> and enter your password to confirm.
        </p>

        <label className="block text-sm">
          <span className="text-xs font-medium text-slate-600">Organization name</span>
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={organizationName ?? "Organization name"}
            autoComplete="off"
          />
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium text-slate-600">Your password</span>
          <PasswordInput
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}

        <button
          type="button"
          disabled={!canDelete || deleting}
          onClick={() => void handleDelete()}
          className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete organization"}
        </button>
      </div>
    </PlatformFormSection>
  );
}
