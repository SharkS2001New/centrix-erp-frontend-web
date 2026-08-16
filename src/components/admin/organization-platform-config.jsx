"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/catalog/catalog-shared";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { PasswordInput } from "@/components/auth/password-input";
import {
  OrderWorkflowSettingsEditor,
  orderWorkflowFromApi,
} from "@/components/admin/order-workflow-settings";
import {
  defaultCancelOrderStatusesFromWorkflow,
  syncCancelOrderStatusesForWorkflowChange,
} from "@/lib/order-action-stages-defaults";
import {
  DEFAULT_ORDER_WORKFLOW,
  ORDER_STATUS_OPTIONS,
  orderActionStageOptionsFromWorkflow,
  workflowPipelineSteps,
} from "@/lib/order-workflow";
import {
  getOrdersListVisibleColumns,
  normalizeStockDeductOn,
  STOCK_DEDUCT_TIMING_OPTIONS,
  normalizeOrdersListDefaultDays,
  normalizeOrdersListSearchDays,
  normalizeOrdersListSort,
  normalizeOrderActionStatuses,
  normalizeReportsDefaultDateRangeDays,
  defaultBackofficeCheckoutOnCreate,
} from "@/lib/sales-settings";
import { OrdersListDefaultsFields } from "@/components/admin/orders-list-defaults-fields";
import {
  DOMAIN_MODULE_ORDER,
  buildDomainChildrenMap,
  patchEnabledModules,
} from "@/lib/module-registry";
import {
  isProvisionableWorkspaceEnabled,
  patchEnabledModulesForWorkspace,
  provisionableWorkspacesForProfile,
  workspaceToggleIcon,
} from "@/lib/workspace-modules";
import {
  HOSPITALITY_SERVICE_CATALOG,
  HOSPITALITY_SERVICE_DEFAULTS,
  normalizeHospitalityServices,
} from "@/lib/hospitality-services";
import {
  HOSPITALITY_PAYMENT_WORKFLOW_CATALOG,
  HOSPITALITY_PAYMENT_WORKFLOW_DEFAULTS,
  normalizeHospitalityPaymentWorkflow,
} from "@/lib/hospitality-payment-workflow";
import {
  HOTEL_POS_PAYMENT_METHOD_CATALOG,
  HOTEL_POS_PAYMENT_METHOD_DEFAULTS,
  normalizeHotelPosPaymentMethods,
} from "@/lib/hotel-pos-payment-methods";
import {
  CLASSIC_POS_THEME_DEFAULT,
  normalizeClassicPosThemeColors,
  normalizeClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import { ExternalPosPlatformFields } from "@/components/admin/external-pos-platform-fields";
import {
  HOTEL_POS_THEME_DEFAULT,
  HOTEL_POS_THEME_TEMPLATES,
  normalizeHotelPosThemeTemplate,
} from "@/lib/hotel-pos-theme-templates";
import { OrganizationCachePanel } from "@/components/admin/organization-cache-panel";
import { PlatformFormSection } from "@/components/admin/platform-form-section";
import { useConfirm } from "@/lib/use-confirm";
import {
  advancedDataImportPageOptionsForIndustry,
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
import { notifyError, notifySuccess } from "@/lib/notify";

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

export { PlatformFormSection } from "@/components/admin/platform-form-section";

const PROFILE_TAB_BTN = "rounded-md px-3 py-1.5 text-sm font-medium transition";
const PROFILE_TAB_BTN_ACTIVE = "bg-white text-[#185FA5] shadow-sm";
const PROFILE_TAB_BTN_IDLE = "text-slate-600 hover:text-slate-900";

/**
 * @param {{
 *   mode: 'register' | 'manage',
 *   values: Record<string, string>,
 *   onChange: (field: string, value: string) => void,
 *   profilePresets?: Array<{ key: string, label: string, industry?: string }>,
 *   industries?: Array<{ id: string, label: string, description?: string }>,
 *   industry?: string,
 *   onIndustryChange?: (industryId: string) => void,
 *   deploymentProfile?: string,
 *   onProfileChange?: (key: string) => void,
 * }} props
 */
export function OrganizationTenantProfile({
  mode,
  values,
  onChange,
  profilePresets = [],
  industries = [],
  industry,
  onIndustryChange,
  deploymentProfile,
  onProfileChange,
  enableTabWorkspace,
  onEnableTabWorkspaceChange,
}) {
  const isRegister = mode === "register";
  const description = isRegister
    ? "Select industry first, then the setup type. Company code is used at sign-in."
    : "Organization identity and industry. Existing tenants stay on Retail & Distribution unless you switch them to Hotel & Hospitality. Company code cannot be changed after registration.";

  const industryOptions = industries.length
    ? industries
    : [
        { id: "commerce", label: "Retail & Distribution", description: "Shops, wholesale, and logistics." },
        { id: "hospitality", label: "Hotel & Hospitality", description: "Hotels, bars, and restaurants." },
      ];

  const setupProfiles = profilePresets.filter((profile) => {
    if (!industry) return true;
    if (profile.industry) return profile.industry === industry;
    const match = industryOptions.find((item) => item.id === industry);
    const keys = match?.profile_keys ?? match?.profileKeys ?? [];
    return keys.length === 0 || keys.includes(profile.key);
  });

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
        {industryOptions.length > 0 ? (
          <OrgRegisterField label="Industry *" className="sm:col-span-2 sm:max-w-md">
            <SearchableSelect
  className={inputClass}
  value={industry ?? ""}
  nativeEvent
  onChange={((e) => onIndustryChange?.(e.target.value))}
  options={industryOptions.map((item) => ({ value: item.id, label: item.label }))}
/>
            <p className="mt-1 text-xs text-slate-500">
              {industryOptions.find((item) => item.id === industry)?.description ||
                "Applications, roles, and permissions follow the selected industry."}
            </p>
          </OrgRegisterField>
        ) : null}
        {setupProfiles.length > 0 ? (
          <OrgRegisterField label="Setup type *" className="sm:col-span-2 sm:max-w-md">
            <SearchableSelect
  className={inputClass}
  value={deploymentProfile}
  nativeEvent
  onChange={((e) => onProfileChange?.(e.target.value))}
  options={setupProfiles.map((profile) => ({ value: profile.key, label: profile.label }))}
/>
            <p className="mt-1 text-xs text-slate-500">
              {industry === "hospitality"
                ? "Hotel & Hospitality setup. Applications tab shows Hotel POS and Hotel Backoffice only."
                : deploymentProfile === "custom"
                  ? "Start from a blank setup and enable only the applications you need on the Applications tab."
                  : "Preset within this industry. Changing it updates the default application toggles."}
            </p>
          </OrgRegisterField>
        ) : null}
      </div>

      {!isRegister && typeof onEnableTabWorkspaceChange === "function" ? (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <h3 className="text-sm font-medium text-slate-900">Workspace (platform)</h3>
          <p className="mt-1 text-xs text-slate-500">
            Enabled by default for all organizations. Uncheck to turn off the desktop-style tab bar for this org.
          </p>
          <label className="mt-3 flex items-start gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={Boolean(enableTabWorkspace)}
              onChange={(e) => onEnableTabWorkspaceChange(e.target.checked)}
            />
            <span>
              <span className="font-medium">Enable tab workspace</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Users can open Dashboard, Customers, invoices, and other pages in separate in-app tabs.
              </span>
            </span>
          </label>
        </div>
      ) : null}
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

function AdvancedDataImportPlatformFields({ salesPlatform, onPatch, industry = "commerce" }) {
  const pages = advancedDataImportPageOptionsForIndustry(industry);

  return (
    <>
      <Toggle
        label="Advanced data import"
        description="When on, users who can create catalogue records (and organization administrators) can import master data from CSV or Excel. Choose which screens show import below."
        checked={Boolean(salesPlatform?.enable_advanced_data_import)}
        onChange={(v) =>
          onPatch({
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
          {pages.map(({ key, label }) => (
            <Toggle
              key={key}
              label={label}
              checked={Boolean(salesPlatform?.advanced_data_import_pages?.[key])}
              onChange={(enabled) =>
                onPatch({
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
    </>
  );
}

export function defaultSalesPlatformState(deploymentProfile = "wholesale_retail") {
  const mobileProfiles = new Set(["wholesale_retail", "distribution"]);
  const driverProfiles = new Set(["distribution", "wholesale_retail"]);

  return {
    show_checkout_on_create_order: defaultBackofficeCheckoutOnCreate(deploymentProfile),
    show_pos_checkout_on_create: true,
    enable_mobile_orders: mobileProfiles.has(deploymentProfile),
    enable_mobile_orders_returns_card: false,
    enable_mobile_orders_payments_card: false,
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
      mobile: deploymentProfile === "distribution" ? "order_completed" : "order_created",
      backend: deploymentProfile === "distribution" ? "order_completed" : "order_created",
    },
    require_pos_till_float: false,
    external_pos_layout: "modern",
    classic_pos_theme_template: CLASSIC_POS_THEME_DEFAULT,
    classic_pos_theme_colors: {},
    hotel_pos_grid_columns: 4,
    hotel_pos_collect_payment: true,
    hotel_pos_catalog_limit: 30,
    hotel_pos_theme_template: HOTEL_POS_THEME_DEFAULT,
    hospitality_services: { ...HOSPITALITY_SERVICE_DEFAULTS },
    hospitality_payment_workflow: { ...HOSPITALITY_PAYMENT_WORKFLOW_DEFAULTS },
    hotel_pos_payment_methods: { ...HOTEL_POS_PAYMENT_METHOD_DEFAULTS },
    enable_mpesa_code: false,
    enable_cheque_number: false,
    enable_pos_cash_rounding: false,
    receipt_show_all_payment_methods: true,
    enable_pos_order_edit: false,
    enable_held_order_amount_paid: false,
    pos_combine_identical_lines: true,
    append_same_day_customer_orders: false,
    enable_backoffice_order_edit: true,
    backoffice_order_edit_layout: "modern",
    order_workflow: structuredClone(DEFAULT_ORDER_WORKFLOW),
    reserve_stock_on_cart: true,
    cart_reservation_ttl_minutes: "15",
    orders_list_default_days: "14",
    reports_default_date_range_days: "30",
    orders_list_search_days: "30",
    orders_list_sort: "-created_at",
    orders_list_visible_columns: getOrdersListVisibleColumns(null),
    orders_list_visible_columns_by_queue: {},
    order_expiry_enabled: true,
    order_expiry_days: "5",
    order_expiry_before_status: "processed",
    order_cancellation_enabled: true,
    edit_order_statuses: ["booked", "pending", "editable"],
    print_invoice_statuses: [],
    collect_payment_statuses: ["unpaid", "pending_payment"],
    cancel_order_statuses: defaultCancelOrderStatusesFromWorkflow(DEFAULT_ORDER_WORKFLOW),
    convert_to_paid_statuses: [],
    convert_to_unpaid_statuses: [],
    customer_return_statuses: ["paid", "processed", "delivered", "completed"],
  };
}

export function salesPlatformFromApi(apiPayload) {
  if (!apiPayload) return defaultSalesPlatformState();
  const legacyCheckout = apiPayload.show_checkout_on_create_order !== false;
  const posCheckout = Object.prototype.hasOwnProperty.call(
    apiPayload,
    "show_pos_checkout_on_create",
  )
    ? Boolean(apiPayload.show_pos_checkout_on_create)
    : legacyCheckout;
  return {
    show_checkout_on_create_order: Boolean(apiPayload.show_checkout_on_create_order ?? true),
    show_pos_checkout_on_create: posCheckout,
    enable_mobile_orders: apiPayload.enable_mobile_orders !== false,
    enable_mobile_orders_returns_card: Boolean(apiPayload.enable_mobile_orders_returns_card),
    enable_mobile_orders_payments_card: Boolean(apiPayload.enable_mobile_orders_payments_card),
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
      showCheckoutOnCreate: posCheckout,
    }),
    require_pos_till_float: Boolean(apiPayload.require_pos_till_float ?? false),
    external_pos_layout:
      apiPayload.external_pos_layout === "classic" ? "classic" : "modern",
    classic_pos_theme_template: normalizeClassicPosThemeTemplate(
      apiPayload.classic_pos_theme_template,
    ),
    classic_pos_theme_colors: normalizeClassicPosThemeColors(
      apiPayload.classic_pos_theme_colors,
    ),
    hotel_pos_grid_columns:
      Number(apiPayload.hotel_pos_grid_columns) === 5 ? 5 : 4,
    hotel_pos_collect_payment: apiPayload.hotel_pos_collect_payment !== false,
    hotel_pos_catalog_limit: (() => {
      const n = Number(apiPayload.hotel_pos_catalog_limit);
      if (!Number.isFinite(n) || n < 8) return 30;
      return Math.min(60, Math.max(8, Math.round(n)));
    })(),
    hotel_pos_theme_template: normalizeHotelPosThemeTemplate(
      apiPayload.hotel_pos_theme_template,
    ),
    hospitality_services: normalizeHospitalityServices(apiPayload.hospitality_services),
    hospitality_payment_workflow: normalizeHospitalityPaymentWorkflow(
      apiPayload.hospitality_payment_workflow,
    ),
    hotel_pos_payment_methods: normalizeHotelPosPaymentMethods(
      apiPayload.hotel_pos_payment_methods,
      apiPayload,
    ),
    enable_mpesa_code: Boolean(apiPayload.enable_mpesa_code),
    enable_cheque_number: Boolean(apiPayload.enable_cheque_number),
    enable_pos_cash_rounding: Object.prototype.hasOwnProperty.call(
      apiPayload,
      "enable_pos_cash_rounding",
    )
      ? Boolean(apiPayload.enable_pos_cash_rounding)
      : apiPayload.external_pos_layout === "classic",
    receipt_show_all_payment_methods: apiPayload.receipt_show_all_payment_methods !== false,
    enable_pos_order_edit: Boolean(apiPayload.enable_pos_order_edit ?? false),
    enable_held_order_amount_paid: Boolean(apiPayload.enable_held_order_amount_paid ?? false),
    pos_combine_identical_lines: apiPayload.pos_combine_identical_lines !== false,
    append_same_day_customer_orders: Boolean(apiPayload.append_same_day_customer_orders ?? false),
    enable_backoffice_order_edit: apiPayload.enable_backoffice_order_edit !== false,
    backoffice_order_edit_layout:
      apiPayload.backoffice_order_edit_layout === "classic" ? "classic" : "modern",
    order_workflow: orderWorkflowFromApi({ order_workflow: apiPayload.order_workflow }),
    reserve_stock_on_cart: apiPayload.reserve_stock_on_cart !== false,
    cart_reservation_ttl_minutes:
      apiPayload.cart_reservation_ttl_minutes != null && apiPayload.cart_reservation_ttl_minutes !== ""
        ? String(Math.min(15, Math.max(0, Number(apiPayload.cart_reservation_ttl_minutes) || 0)))
        : "15",
    orders_list_default_days: String(normalizeOrdersListDefaultDays(apiPayload.orders_list_default_days)),
    reports_default_date_range_days: String(
      normalizeReportsDefaultDateRangeDays(apiPayload.reports_default_date_range_days),
    ),
    orders_list_search_days: String(
      normalizeOrdersListSearchDays(
        apiPayload.orders_list_search_days,
        normalizeOrdersListDefaultDays(apiPayload.orders_list_default_days),
      ),
    ),
    orders_list_sort: normalizeOrdersListSort(apiPayload.orders_list_sort),
    orders_list_visible_columns: getOrdersListVisibleColumns({
      sales: {
        orders_list_visible_columns: apiPayload.orders_list_visible_columns,
      },
    }),
    orders_list_visible_columns_by_queue: apiPayload.orders_list_visible_columns_by_queue ?? {},
    order_expiry_enabled: apiPayload.order_expiry_enabled !== false,
    order_expiry_days: String(
      Math.min(90, Math.max(1, Number(apiPayload.order_expiry_days) || 5)),
    ),
    order_expiry_before_status: String(apiPayload.order_expiry_before_status ?? "processed"),
    order_cancellation_enabled: apiPayload.order_cancellation_enabled !== false,
    edit_order_statuses: (() => {
      const list = normalizeOrderActionStatuses(apiPayload.edit_order_statuses);
      return list.length > 0 ? list : ["booked", "pending", "editable"];
    })(),
    print_invoice_statuses: normalizeOrderActionStatuses(apiPayload.print_invoice_statuses),
    collect_payment_statuses: (() => {
      const list = normalizeOrderActionStatuses(apiPayload.collect_payment_statuses);
      return list.length > 0 ? list : ["unpaid", "pending_payment"];
    })(),
    cancel_order_statuses: (() => {
      const workflow = orderWorkflowFromApi({ order_workflow: apiPayload.order_workflow });
      const list = normalizeOrderActionStatuses(apiPayload.cancel_order_statuses);
      return list.length > 0 ? list : defaultCancelOrderStatusesFromWorkflow(workflow);
    })(),
    convert_to_paid_statuses: normalizeOrderActionStatuses(apiPayload.convert_to_paid_statuses),
    convert_to_unpaid_statuses: normalizeOrderActionStatuses(apiPayload.convert_to_unpaid_statuses),
    customer_return_statuses: (() => {
      const list = normalizeOrderActionStatuses(apiPayload.customer_return_statuses);
      return list.length > 0 ? list : ["paid", "processed", "delivered", "completed"];
    })(),
  };
}

/** Platform-controlled Kenya payroll knobs (month days basis + SHIF floor). */
export function defaultPayrollPlatformState() {
  return {
    payroll_month_days_basis: "calendar",
    shif_minimum_monthly: "",
  };
}

export function payrollPlatformFromApi(apiPayload = {}) {
  const basis =
    String(apiPayload?.payroll_month_days_basis ?? "calendar").toLowerCase() === "fixed_30"
      ? "fixed_30"
      : "calendar";
  const shif = apiPayload?.shif_minimum_monthly;

  return {
    payroll_month_days_basis: basis,
    shif_minimum_monthly: shif == null || shif === "" ? "" : String(shif),
  };
}

export function payrollPlatformToApi(state = {}) {
  const basis =
    String(state?.payroll_month_days_basis ?? "calendar").toLowerCase() === "fixed_30"
      ? "fixed_30"
      : "calendar";
  const raw = state?.shif_minimum_monthly;
  let shif = null;
  if (raw !== "" && raw != null && raw !== false) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) shif = n;
  }

  return {
    payroll_month_days_basis: basis,
    shif_minimum_monthly: shif,
  };
}

function OrganizationPayrollPlatformSettings({
  payrollPlatform,
  onChange,
  enabledModules = {},
}) {
  const hrEnabled = Boolean(enabledModules.hr_payroll);
  const state = payrollPlatform ?? defaultPayrollPlatformState();

  function patch(partial) {
    onChange?.({ ...state, ...partial });
  }

  return (
    <PlatformFormSection
      title="Payroll"
      description="Platform-only Kenya payroll rules for this organization. Tenant HR settings cannot override these."
    >
      {!hrEnabled ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Enable the <strong>Human Resources</strong> application to configure payroll for this
          organization.
        </p>
      ) : (
        <div className="space-y-4">
          <label className="block max-w-md">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Payroll month days basis
            </span>
            <select
              className={inputClass}
              value={state.payroll_month_days_basis === "fixed_30" ? "fixed_30" : "calendar"}
              onChange={(e) => patch({ payroll_month_days_basis: e.target.value })}
            >
              <option value="calendar">Calendar days in the month</option>
              <option value="fixed_30">Fixed 30 days</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Used when prorating salary for mid-month joins, exits, and unpaid days.
            </span>
          </label>
          <label className="block max-w-md">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              SHIF minimum monthly (KES)
            </span>
            <input
              type="number"
              min="0"
              step="1"
              className={inputClass}
              value={state.shif_minimum_monthly ?? ""}
              placeholder="Leave blank for statutory default"
              onChange={(e) => patch({ shif_minimum_monthly: e.target.value })}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Optional floor for Social Health Insurance Fund contributions. Blank uses the platform
              statutory default.
            </span>
          </label>
        </div>
      )}
    </PlatformFormSection>
  );
}

export function OrganizationPlatformSalesSettings({
  salesPlatform,
  onChange,
  enabledModules = {},
  deploymentProfile = "wholesale_retail",
}) {
  const salesEnabled = Boolean(enabledModules.sales);
  const distributionEnabled = Boolean(enabledModules.distribution);
  const mobileOrdersEnabled = salesPlatform?.enable_mobile_orders !== false;
  const description =
    "Platform-only checkout mode for backoffice, mobile application access, and payment integrations.";

  function patch(partial) {
    onChange?.({ ...salesPlatform, ...partial });
  }

  const showBackofficeCheckout = salesPlatform?.show_checkout_on_create_order !== false;
  const stockDeductOn = normalizeStockDeductOn(salesPlatform?.stock_deduct_on, {
    hasPosSales: Boolean(enabledModules["sales.pos"]),
    showCheckoutOnCreate: salesPlatform?.show_pos_checkout_on_create !== false,
  });
  const mobileTimingOptions = STOCK_DEDUCT_TIMING_OPTIONS.filter(
    (opt) =>
      opt.value === "order_created" ||
      opt.value === "order_completed" ||
      (distributionEnabled &&
        (opt.value === "trip_pick" || opt.value === "trip_load" || opt.value === "trip_depart")),
  );
  const mobileStockTimingRaw = stockDeductOn.mobile ?? "order_created";
  const mobileStockTiming = mobileTimingOptions.some((opt) => opt.value === mobileStockTimingRaw)
    ? mobileStockTimingRaw
    : "order_created";
  const wf = salesPlatform?.order_workflow ?? DEFAULT_ORDER_WORKFLOW;
  const mobileDeductStage = wf?.deduct_stock_on?.mobile ?? "completed";
  const mobileStageOptions = (wf.steps ?? [])
    .filter((step) => step.enabled !== false && !["draft", "held", "cancelled"].includes(step.status))
    .map((step) => ({
      value: step.status,
      label: step.label || ORDER_STATUS_OPTIONS.find((o) => o.value === step.status)?.label || step.status,
    }));

  return (
    <PlatformFormSection title="Sales behaviour" description={description}>
      {!salesEnabled ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Enable the <strong>Sales</strong> module to configure sales behaviour for this organization.
        </p>
      ) : (
        <div className="space-y-3">
          <Toggle
            label="Backoffice Create order uses checkout"
            description={
              String(deploymentProfile) === "distribution"
                ? "When on, Sales → Create order opens payment immediately. Distribution profiles default to Save order (pay later during fulfillment)."
                : "When on, Sales → Create order opens payment immediately. Wholesale/retail, supermarket, and small shop typically leave this on; you can still choose Save order."
            }
            checked={showBackofficeCheckout}
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
              <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mobile orders queue shortcuts
              </p>
              <Toggle
                label="Returns card on Mobile orders"
                description="Off by default. Shows a Returns card beside search on Sales → Mobile orders. View returns performed for the selected dates, or approve pending returns."
                checked={Boolean(salesPlatform?.enable_mobile_orders_returns_card)}
                onChange={(v) => patch({ enable_mobile_orders_returns_card: v })}
              />
              <Toggle
                label="Payments card on Mobile orders"
                description="Off by default. Shows a Payments card beside search on Sales → Mobile orders. Mark all unpaid orders on the page as paid, or select specific orders."
                checked={Boolean(salesPlatform?.enable_mobile_orders_payments_card)}
                onChange={(v) => patch({ enable_mobile_orders_payments_card: v })}
              />
              <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mobile stock deduction
              </p>
              <OrgRegisterField label="Deduct mobile stock when">
                <SearchableSelect
                  className={inputClass}
                  value={mobileStockTiming}
                  nativeEvent
                  onChange={(e) =>
                    patch({
                      stock_deduct_on: {
                        ...stockDeductOn,
                        mobile: e.target.value,
                      },
                    })
                  }
                  options={mobileTimingOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {mobileStockTiming === "order_created"
                    ? "Shop and store stock reduce when the rep saves or checks out the order, including unpaid Save order."
                    : mobileStockTiming === "order_completed"
                      ? "Stock stays reserved until the order reaches the workflow stage below."
                      : "Stock stays reserved until the selected distribution trip event."}
                </p>
              </OrgRegisterField>
              {mobileStockTiming === "order_completed" ? (
                <OrgRegisterField label="Deduct at workflow stage">
                  <SearchableSelect
                    className={inputClass}
                    value={mobileDeductStage}
                    nativeEvent
                    onChange={(e) =>
                      patch({
                        order_workflow: {
                          ...wf,
                          deduct_stock_on: {
                            ...(wf.deduct_stock_on ?? {}),
                            mobile: e.target.value,
                          },
                        },
                      })
                    }
                    options={
                      mobileStageOptions.length > 0
                        ? mobileStageOptions
                        : [{ value: "completed", label: "Completed" }]
                    }
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Inventory is reduced when the mobile order reaches this stage (at Save if already
                    there, otherwise when staff move it in the workflow).
                  </p>
                </OrgRegisterField>
              ) : null}
            </div>
          ) : null}
          <Toggle
            label="Append same-day mobile sales to the customer’s open order"
            description="When on, mobile field sales for a registered customer append to that customer’s open mobile order from today at the same branch (same order #) instead of creating a new ticket. External POS and backoffice Create order are not affected."
            checked={Boolean(salesPlatform?.append_same_day_customer_orders)}
            onChange={(v) => patch({ append_same_day_customer_orders: v })}
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
          <AdvancedDataImportPlatformFields salesPlatform={salesPlatform} onPatch={patch} />
        </div>
      )}
    </PlatformFormSection>
  );
}

export function OrganizationOrdersListSettings({
  salesPlatform,
  onChange,
  enabledModules = {},
}) {
  const salesEnabled = Boolean(enabledModules.sales);

  return (
    <PlatformFormSection
      title="Orders list & reports"
      description="Platform defaults for Sales → Orders date filter, search scope, visible columns, and the default From/To window for all reports."
    >
      {!salesEnabled ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Enable the <strong>Sales</strong> module to configure orders list defaults for this
          organization.
        </p>
      ) : (
        <OrdersListDefaultsFields
          value={salesPlatform}
          onChange={onChange}
          idPrefix="platform-orders-list"
        />
      )}
    </PlatformFormSection>
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
  const mobileOrdersEnabled = salesPlatform?.enable_mobile_orders !== false;
  const showBackofficeCheckout = salesPlatform?.show_checkout_on_create_order !== false;
  const showPosCheckout = salesPlatform?.show_pos_checkout_on_create !== false;
  const stockDeductOn = normalizeStockDeductOn(salesPlatform?.stock_deduct_on, {
    hasPosSales,
    showCheckoutOnCreate: showPosCheckout,
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
                    <SearchableSelect
  className={inputClass}
  value={salesPlatform?.order_expiry_before_status ?? "processed"}
  nativeEvent
  onChange={((e) => patch({ order_expiry_before_status: e.target.value }))}
  options={expiryPipelineSteps.map((step) => ({ value: step.key, label: step.label }))}
/>
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
              When enabled, staff can cancel orders on the workflow stages you select under Order actions by
              stage (for example Unpaid, Partially paid, and Paid). A Cancelled orders link appears under
              Backoffice → Sales → Orders.
            </p>
            <div className="mt-3 space-y-3">
              <Toggle
                label="Allow order cancellation"
                checked={salesPlatform?.order_cancellation_enabled !== false}
                onChange={(v) => patch({ order_cancellation_enabled: v })}
              />
            </div>
          </div>
          <OrderActionStagesFields
            salesPlatform={salesPlatform}
            onPatch={patch}
            mobileOrdersEnabled={mobileOrdersEnabled}
            whatsappOrdersEnabled={Boolean(salesPlatform?.enable_whatsapp_orders)}
          />
          <OrderWorkflowSettingsEditor
            embedded
            workflow={wf}
            onChange={(next) =>
              patch({
                order_workflow: next,
                cancel_order_statuses: syncCancelOrderStatusesForWorkflowChange(
                  salesPlatform?.cancel_order_statuses,
                  wf,
                  next,
                ),
              })
            }
            showCheckoutOnCreate={showBackofficeCheckout}
            showPosCheckoutOnCreate={showPosCheckout}
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

function toggleStatusInList(list, status, checked, { allowEmpty = false } = {}) {
  const current = Array.isArray(list) ? list : [];
  if (checked) {
    return current.includes(status) ? current : [...current, status];
  }
  const next = current.filter((item) => item !== status);
  if (!allowEmpty && next.length === 0) return current;
  return next;
}

function OrderActionStagesFields({
  salesPlatform,
  onPatch,
  mobileOrdersEnabled = true,
  whatsappOrdersEnabled = false,
}) {
  const actionStatusOptions = useMemo(
    () =>
      orderActionStageOptionsFromWorkflow(salesPlatform?.order_workflow ?? DEFAULT_ORDER_WORKFLOW, {
        mobileOrdersEnabled,
        whatsappOrdersEnabled,
      }),
    [mobileOrdersEnabled, whatsappOrdersEnabled, salesPlatform?.order_workflow],
  );

  const editStatuses = Array.isArray(salesPlatform?.edit_order_statuses)
    ? salesPlatform.edit_order_statuses
    : ["booked", "pending", "editable"];
  const printStatuses = Array.isArray(salesPlatform?.print_invoice_statuses)
    ? salesPlatform.print_invoice_statuses
    : [];
  const collectStatuses = Array.isArray(salesPlatform?.collect_payment_statuses)
    ? salesPlatform.collect_payment_statuses
    : ["unpaid", "pending_payment"];
  const cancelStatuses = Array.isArray(salesPlatform?.cancel_order_statuses)
    ? salesPlatform.cancel_order_statuses
    : defaultCancelOrderStatusesFromWorkflow(salesPlatform?.order_workflow ?? DEFAULT_ORDER_WORKFLOW);
  const convertToPaidStatuses = Array.isArray(salesPlatform?.convert_to_paid_statuses)
    ? salesPlatform.convert_to_paid_statuses
    : [];
  const convertToUnpaidStatuses = Array.isArray(salesPlatform?.convert_to_unpaid_statuses)
    ? salesPlatform.convert_to_unpaid_statuses
    : [];
  const returnStatuses = Array.isArray(salesPlatform?.customer_return_statuses)
    ? salesPlatform.customer_return_statuses
    : ["paid", "processed", "delivered", "completed"];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order actions by stage</p>
      <p className="mt-1 text-xs text-slate-500">
        Choose which workflow stages allow Edit, Print, Collect payment, Convert to paid / unpaid, Cancel, and
        Customer returns on every web Sales order list. Only enabled stages from this organization&apos;s order
        pipeline are listed. Check <span className="font-medium text-slate-600">Mobile</span> or{" "}
        <span className="font-medium text-slate-600">WhatsApp</span> to enable those actions on those channels.
        Leave Print empty to allow all stages. Collect still needs an outstanding balance. Convert to paid /
        unpaid are off by default (no stages checked). Cancel still respects the master cancellation toggle.
        Settings load with org capabilities and refresh when you save.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ActionStageChecklist
          title="Edit order"
          hint="Web. At least one stage required."
          options={actionStatusOptions}
          selected={editStatuses}
          onToggle={(status, checked) =>
            onPatch({
              edit_order_statuses: toggleStatusInList(editStatuses, status, checked, {
                allowEmpty: false,
              }),
            })
          }
        />
        <ActionStageChecklist
          title="Print invoice"
          hint="Web. Empty = all stages."
          options={actionStatusOptions}
          selected={printStatuses}
          onToggle={(status, checked) =>
            onPatch({
              print_invoice_statuses: toggleStatusInList(printStatuses, status, checked, {
                allowEmpty: true,
              }),
            })
          }
        />
        <ActionStageChecklist
          title="Collect payment"
          hint="Web. At least one stage; balance must be outstanding. Checking Unpaid / Partially paid also covers double-status orders on those pages (e.g. Processed + Unpaid) and when the order is opened."
          options={actionStatusOptions}
          selected={collectStatuses}
          onToggle={(status, checked) =>
            onPatch({
              collect_payment_statuses: toggleStatusInList(collectStatuses, status, checked, {
                allowEmpty: false,
              }),
            })
          }
        />
        <ActionStageChecklist
          title="Convert to paid"
          hint="Off by default. Mark unpaid / partially paid as paid without Collect payment. Check Unpaid, Partially paid, Paid pages, Mobile, and/or WhatsApp as needed."
          options={actionStatusOptions}
          selected={convertToPaidStatuses}
          onToggle={(status, checked) =>
            onPatch({
              convert_to_paid_statuses: toggleStatusInList(convertToPaidStatuses, status, checked, {
                allowEmpty: true,
              }),
            })
          }
        />
        <ActionStageChecklist
          title="Convert to unpaid"
          hint="Off by default. Reverse paid / partially paid back to unpaid. Same stage checklist as Convert to paid."
          options={actionStatusOptions}
          selected={convertToUnpaidStatuses}
          onToggle={(status, checked) =>
            onPatch({
              convert_to_unpaid_statuses: toggleStatusInList(convertToUnpaidStatuses, status, checked, {
                allowEmpty: true,
              }),
            })
          }
        />
        <ActionStageChecklist
          title="Cancel order"
          hint="Web. At least one stage. Master cancel toggle still applies. Checking Paid also covers POS receipts stored as Completed. Unpaid / Partially paid also cover fulfillment stages that still have that payment status."
          options={actionStatusOptions}
          selected={cancelStatuses}
          onToggle={(status, checked) =>
            onPatch({
              cancel_order_statuses: toggleStatusInList(cancelStatuses, status, checked, {
                allowEmpty: false,
              }),
            })
          }
        />
        <ActionStageChecklist
          title="Customer returns"
          hint="Web. At least one stage for invoice lookup / create return."
          options={actionStatusOptions}
          selected={returnStatuses}
          onToggle={(status, checked) =>
            onPatch({
              customer_return_statuses: toggleStatusInList(returnStatuses, status, checked, {
                allowEmpty: false,
              }),
            })
          }
        />
      </div>
    </div>
  );
}

function ActionStageChecklist({ title, hint, options, selected, onToggle }) {
  const selectedSet = new Set(selected);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={selectedSet.has(opt.value)}
              onChange={(e) => onToggle(opt.value, e.target.checked)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

const MANAGE_ORG_TABS = [
  { id: "profile", label: "Tenant profile" },
  { id: "hotel", label: "Hotel services" },
  { id: "sales", label: "Sales behaviour" },
  { id: "orders_list", label: "Orders list" },
  { id: "workflow", label: "Order workflow" },
  { id: "status", label: "Organization status" },
  { id: "modules", label: "Applications" },
  { id: "payroll", label: "Payroll" },
  { id: "users", label: "Users" },
  { id: "maintenance", label: "Maintenance" },
];

const REGISTER_ORG_TABS = [
  { id: "profile", label: "Tenant profile" },
  { id: "hotel", label: "Hotel services" },
  { id: "sales", label: "Sales behaviour" },
  { id: "orders_list", label: "Orders list" },
  { id: "workflow", label: "Order workflow" },
  { id: "modules", label: "Applications" },
  { id: "payroll", label: "Payroll" },
  { id: "admin", label: "Initial administrator" },
];

function OrganizationHotelServicesPanel({
  salesPlatform,
  onSalesChange,
  mode = "manage",
  organizationId = null,
}) {
  const confirm = useConfirm();
  const [seedingHotelDemo, setSeedingHotelDemo] = useState(false);
  const [removingHotelDemo, setRemovingHotelDemo] = useState(false);
  const services = normalizeHospitalityServices(salesPlatform?.hospitality_services);
  const workflow = normalizeHospitalityPaymentWorkflow(
    salesPlatform?.hospitality_payment_workflow,
  );
  const posPaymentMethods = normalizeHotelPosPaymentMethods(
    salesPlatform?.hotel_pos_payment_methods,
    salesPlatform,
  );
  const collectMode = salesPlatform?.hotel_pos_collect_payment !== false;

  async function seedHotelDemoData() {
    if (!organizationId || seedingHotelDemo || removingHotelDemo) return;
    setSeedingHotelDemo(true);
    try {
      const res = await apiRequest(
        `/admin/organizations/${organizationId}/hospitality/seed-demo-data`,
        { method: "POST" },
      );
      notifySuccess(
        res?.message ??
          `Seeded ${res?.products ?? 0} menu products and ${res?.tables ?? 0} tables.`,
      );
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to seed Hotel POS demo data");
    } finally {
      setSeedingHotelDemo(false);
    }
  }

  async function removeHotelDemoData() {
    if (!organizationId || seedingHotelDemo || removingHotelDemo) return;
    const ok = await confirm({
      title: "Remove Hotel POS data?",
      message:
        "This permanently deletes hotel/bar menu items, demo floor tables (T1–T6, B1–B2), and all Hotel POS orders for this organization. Outlets, rooms, and reservations are kept. This cannot be undone.",
      confirmLabel: "Remove data",
      destructive: true,
    });
    if (!ok) return;

    setRemovingHotelDemo(true);
    try {
      const res = await apiRequest(
        `/admin/organizations/${organizationId}/hospitality/remove-demo-data`,
        { method: "POST" },
      );
      notifySuccess(
        res?.message ??
          `Removed ${res?.products ?? 0} menu products, ${res?.tables ?? 0} tables, and ${res?.orders ?? 0} orders.`,
      );
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to remove Hotel POS data");
    } finally {
      setRemovingHotelDemo(false);
    }
  }

  function patchSales(partial) {
    onSalesChange({ ...(salesPlatform ?? {}), ...partial });
  }

  return (
    <div className="space-y-6">
      <PlatformFormSection
        title="Hospitality services"
        description="Platform controls which hotel features this tenant can use. Main outlet is always on. Most hotels only need Rooms + Front desk (pay at check-in). Enable Guest folios only for pay-later stays and Charge to room from POS."
      >
        <div className="space-y-2">
          <label className="flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 opacity-80">
            <input type="checkbox" className="mt-1 rounded" checked disabled readOnly />
            <span className="min-w-0">
              <span className="theme-heading block text-sm font-medium">Main outlet</span>
              <span className="theme-subtext block text-xs">
                Always available for Hotel &amp; Bar POS. Not a toggle.
              </span>
            </span>
          </label>
          {HOSPITALITY_SERVICE_CATALOG.map((svc) => (
            <label
              key={svc.key}
              className="flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            >
              <input
                type="checkbox"
                className="mt-1 rounded border-[var(--theme-border)]"
                checked={Boolean(services[svc.key])}
                onChange={(e) =>
                  patchSales({
                    hospitality_services: normalizeHospitalityServices({
                      ...services,
                      [svc.key]: e.target.checked,
                      ...(svc.key === "table_pos" && e.target.checked
                        ? { floor_tables: true }
                        : {}),
                      ...(svc.key === "room_charge" && e.target.checked
                        ? { folios: true }
                        : {}),
                      ...(svc.key === "night_audit" && e.target.checked
                        ? { folios: true }
                        : {}),
                      ...(svc.key === "folios" && !e.target.checked
                        ? { room_charge: false, night_audit: false }
                        : {}),
                    }),
                  })
                }
              />
              <span className="min-w-0">
                <span className="theme-heading block text-sm font-medium">{svc.label}</span>
                <span className="theme-subtext block text-xs">{svc.description}</span>
              </span>
            </label>
          ))}
        </div>
      </PlatformFormSection>

      <PlatformFormSection
        title="Hotel POS checkout"
        description="How cashiers settle F&B checks. Collect payment vs save unpaid are mutually exclusive."
      >
        <div className="space-y-4">
          <OrgRegisterField label="Checkout mode">
            <SearchableSelect
  className={inputClass}
  value={collectMode ? "collect" : "save"}
  nativeEvent
  onChange={((e) => {
                const collect = e.target.value === "collect";
                patchSales({
                  hotel_pos_collect_payment: collect,
                  hospitality_payment_workflow: {
                    ...workflow,
                    unpaid: !collect,
                    paid: true,
                  },
                });
              })}
  options={[{ value: 'collect', label: 'Collect payment — buy and pay now' }, { value: 'save', label: 'Save order — print unpaid receipt, pay later' }]}
/>
          </OrgRegisterField>
          <div>
            <p className="theme-heading text-sm font-semibold">Payment statuses</p>
            <p className="theme-subtext mt-1 text-xs">
              Unpaid is locked to match checkout mode above.
            </p>
            <div className="mt-2 space-y-2">
              {HOSPITALITY_PAYMENT_WORKFLOW_CATALOG.map((step) => {
                const locked =
                  step.key === "paid" ||
                  (step.key === "unpaid" && (collectMode || !collectMode));
                return (
                  <label
                    key={step.key}
                    className={`flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 ${
                      locked ? "opacity-80" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-[var(--theme-border)]"
                      checked={
                        step.key === "unpaid" ? !collectMode : Boolean(workflow[step.key])
                      }
                      disabled={locked}
                      onChange={(e) =>
                        patchSales({
                          hospitality_payment_workflow: {
                            ...workflow,
                            [step.key]: e.target.checked,
                            paid: true,
                            unpaid:
                              step.key === "unpaid" ? e.target.checked : workflow.unpaid,
                          },
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span className="theme-heading block text-sm font-medium">{step.label}</span>
                      <span className="theme-subtext block text-xs">{step.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </PlatformFormSection>

      <PlatformFormSection
        title="Hotel POS payment methods"
        description="Choose which tenders cashiers see on Collect payment. Turn a method off to hide it. Extra methods from Admin → Payment methods stay hidden unless you enable the last option."
      >
        <div className="space-y-2">
          {HOTEL_POS_PAYMENT_METHOD_CATALOG.map((method) => (
            <label
              key={method.key}
              className="flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            >
              <input
                type="checkbox"
                className="mt-1 rounded border-[var(--theme-border)]"
                checked={Boolean(posPaymentMethods[method.key])}
                onChange={(e) =>
                  patchSales({
                    hotel_pos_payment_methods: normalizeHotelPosPaymentMethods({
                      ...posPaymentMethods,
                      [method.key]: e.target.checked,
                    }),
                  })
                }
              />
              <span className="min-w-0">
                <span className="theme-heading block text-sm font-medium">{method.label}</span>
                <span className="theme-subtext block text-xs">{method.description}</span>
              </span>
            </label>
          ))}
        </div>
      </PlatformFormSection>

      <PlatformFormSection
        title="Payment reference fields"
        description="M-Pesa code and cheque number stay hidden on Hotel POS unless you enable them here. Which tenders appear is set under Hotel POS payment methods above."
      >
        <div className="space-y-2">
          <label className="flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2">
            <input
              type="checkbox"
              className="mt-1 rounded border-[var(--theme-border)]"
              checked={Boolean(salesPlatform?.enable_mpesa_code)}
              onChange={(e) => patchSales({ enable_mpesa_code: e.target.checked })}
            />
            <span className="min-w-0">
              <span className="theme-heading block text-sm font-medium">Require M-Pesa code</span>
              <span className="theme-subtext block text-xs">
                Cashiers must enter an M-Pesa confirmation code when paying with M-Pesa.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2">
            <input
              type="checkbox"
              className="mt-1 rounded border-[var(--theme-border)]"
              checked={Boolean(salesPlatform?.enable_cheque_number)}
              onChange={(e) => patchSales({ enable_cheque_number: e.target.checked })}
            />
            <span className="min-w-0">
              <span className="theme-heading block text-sm font-medium">Require cheque number</span>
              <span className="theme-subtext block text-xs">
                Cashiers must enter a cheque number when paying by cheque.
              </span>
            </span>
          </label>
        </div>
      </PlatformFormSection>

      <PlatformFormSection
        title="Hotel POS appearance"
        description="Theme and catalog layout for the Hotel & Bar POS desk only."
      >
        <div className="space-y-4">
          <OrgRegisterField label="Hotel POS theme template">
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {HOTEL_POS_THEME_TEMPLATES.map((theme) => {
                const selected =
                  normalizeHotelPosThemeTemplate(salesPlatform?.hotel_pos_theme_template) ===
                  theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => patchSales({ hotel_pos_theme_template: theme.id })}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-[#185FA5] bg-[#185FA5]/[0.06] ring-2 ring-[#185FA5]/40"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="mb-2 flex gap-1">
                      {(theme.preview ?? []).map((color) => (
                        <span
                          key={color}
                          className="h-4 w-4 rounded-full border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="block text-sm font-semibold text-slate-900">{theme.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                      {theme.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </OrgRegisterField>
          <OrgRegisterField label="Hotel POS product grid">
            <SearchableSelect
  className={inputClass}
  value={Number(salesPlatform?.hotel_pos_grid_columns) === 5 ? 5 : 4}
  nativeEvent
  onChange={((e) => patchSales({ hotel_pos_grid_columns: Number(e.target.value) }))}
  options={[{ value: 4, label: '4 columns' }, { value: 5, label: '5 columns' }]}
/>
          </OrgRegisterField>
          <OrgRegisterField label="Menu items shown (before search)">
            <SearchableSelect
  className={inputClass}
  value={Number(salesPlatform?.hotel_pos_catalog_limit) || 30}
  nativeEvent
  onChange={((e) => patchSales({ hotel_pos_catalog_limit: Number(e.target.value) }))}
  options={[{ value: 20, label: '20' }, { value: 30, label: '30' }, { value: 40, label: '40' }, { value: 50, label: '50' }]}
/>
          </OrgRegisterField>
        </div>
      </PlatformFormSection>

      <PlatformFormSection
        title="Menu catalogue import"
        description="Same CSV / Excel import as Retail & Distribution Products. Enable it here — Hotel & Hospitality does not use the Sales tab."
      >
        <div className="space-y-3">
          <AdvancedDataImportPlatformFields
            salesPlatform={salesPlatform}
            onPatch={patchSales}
            industry="hospitality"
          />
        </div>
      </PlatformFormSection>

      {mode === "manage" && organizationId ? (
        <PlatformFormSection
          title="Hotel POS demo data"
          description="Seed 20 menu products (Food + Drinks), floor tables, and the main outlet for Hotel POS testing. Safe to re-run — existing HTL-* codes are updated. Remove deletes the hotel/bar menu, demo tables, and all Hotel POS orders so you can start with real data. Outlets, rooms, and reservations are kept."
        >
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={seedingHotelDemo || removingHotelDemo}
              onClick={() => void seedHotelDemoData()}
              className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#144f8a] disabled:opacity-50"
            >
              {seedingHotelDemo ? "Seeding…" : "Seed Hotel POS demo data"}
            </button>
            <button
              type="button"
              disabled={seedingHotelDemo || removingHotelDemo}
              onClick={() => void removeHotelDemoData()}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {removingHotelDemo ? "Removing…" : "Remove Hotel POS data"}
            </button>
          </div>
        </PlatformFormSection>
      ) : null}
    </div>
  );
}

function OrganizationConfigTabBar({ tabs, activeTab, onTabChange }) {
  return (
    <div className="w-full overflow-x-auto">
      <div
        className="flex w-full min-w-[54rem] flex-nowrap gap-1 rounded-lg bg-slate-100 p-0.5"
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
  industries = [],
  industry,
  onIndustryChange,
  deploymentProfile,
  onProfileChange,
  enableTabWorkspace,
  onEnableTabWorkspaceChange,
  salesPlatform,
  onSalesChange,
  payrollPlatform = null,
  onPayrollChange = null,
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
  const isHospitality = industry === "hospitality" || deploymentProfile === "hotel_bar";
  const resolvedOrgId = organizationId ?? organization?.id;
  const visibleTabs = tabs.filter((tab) => {
    if (tab.id === "hotel") return isHospitality;
    if (
      isHospitality &&
      (tab.id === "sales" || tab.id === "orders_list" || tab.id === "workflow")
    ) {
      return false;
    }
    if (tab.id === "payroll") {
      return Boolean(enabledModules.hr_payroll) && typeof onPayrollChange === "function";
    }
    return true;
  });

  useEffect(() => {
    if (!isHospitality && activeTab === "hotel") {
      setActiveTab("profile");
      return;
    }
    if (
      isHospitality &&
      (activeTab === "sales" || activeTab === "orders_list" || activeTab === "workflow")
    ) {
      setActiveTab("hotel");
      return;
    }
    if (
      activeTab === "payroll" &&
      (!enabledModules.hr_payroll || typeof onPayrollChange !== "function")
    ) {
      setActiveTab("profile");
    }
  }, [isHospitality, activeTab, enabledModules.hr_payroll, onPayrollChange]);

  return (
    <div className="w-full min-w-0 space-y-4">
      <OrganizationConfigTabBar tabs={visibleTabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "profile" ? (
        <OrganizationTenantProfile
          mode={mode}
          values={tenantValues}
          onChange={onTenantChange}
          profilePresets={profilePresets}
          industries={industries}
          industry={industry}
          onIndustryChange={onIndustryChange}
          deploymentProfile={deploymentProfile}
          onProfileChange={onProfileChange}
          enableTabWorkspace={enableTabWorkspace}
          onEnableTabWorkspaceChange={onEnableTabWorkspaceChange}
        />
      ) : null}

      {activeTab === "hotel" && isHospitality ? (
        <OrganizationHotelServicesPanel
          salesPlatform={salesPlatform}
          onSalesChange={onSalesChange}
          mode={mode}
          organizationId={resolvedOrgId}
        />
      ) : null}

      {activeTab === "sales" ? (
        <OrganizationPlatformSalesSettings
          salesPlatform={salesPlatform}
          onChange={onSalesChange}
          enabledModules={enabledModules}
          deploymentProfile={deploymentProfile}
        />
      ) : null}

      {activeTab === "orders_list" ? (
        <OrganizationOrdersListSettings
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
          deploymentProfile={deploymentProfile}
          profilePresets={profilePresets}
          salesPlatform={salesPlatform}
          onSalesChange={onSalesChange}
        />
      ) : null}

      {activeTab === "payroll" ? (
        <OrganizationPayrollPlatformSettings
          payrollPlatform={payrollPlatform ?? defaultPayrollPlatformState()}
          onChange={onPayrollChange}
          enabledModules={enabledModules}
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
  deploymentProfile = null,
  profilePresets = [],
  salesPlatform = null,
  onSalesChange = null,
}) {
  const domainChildrenMap = useMemo(() => buildDomainChildrenMap(moduleOptions), [moduleOptions]);
  const workspaces = useMemo(
    () => provisionableWorkspacesForProfile(deploymentProfile, profilePresets),
    [deploymentProfile, profilePresets],
  );

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

  const isHotelProfile = deploymentProfile === "hotel_bar";

  return (
    <PlatformFormSection
      title="Applications"
      description={
        isHotelProfile
          ? "For hotel tenants, only Hotel POS and Hotel Backoffice (plus Accounting / HR / Admin) can be enabled. They do not use retail sales / POS carts."
          : "Choose which applications appear on the login workspace screen for this organization. When Administration is disabled, tenant managers cannot open the Administration workspace — configure users and organization settings from the platform instead."
      }
    >
      <div className="space-y-4">
        {workspaces.length === 0 ? (
          <p className="theme-subtext text-sm">No applications available for this deployment profile.</p>
        ) : null}
        {workspaces.map((workspace) => {
          const enabled = isProvisionableWorkspaceEnabled(workspace, enabledModules);
          const isDistribution = workspace.id === "distribution";
          const distributionBlocked = isDistribution && !mobileOrdersEnabled;

          return (
            <div
              key={workspace.id}
              className={`rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] p-4 ${
                distributionBlocked ? "opacity-60" : ""
              }`}
            >
              <label className="flex items-start gap-4">
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
                  {workspace.id === "pos" && enabled ? (
                    <span className="theme-subtext mt-1 block text-xs">
                      Centrix ERP theme colors are configured by the organization under Administration
                      → Centrix ERP Themes. Till close, barcode, and customer prompts are under
                      Organization settings → Sales → Tills.
                    </span>
                  ) : null}
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
              {workspace.id === "pos" && enabled && typeof onSalesChange === "function" ? (
                <div className="mt-3 border-t border-[var(--theme-border)] pt-3 pl-8">
                  <ExternalPosPlatformFields
                    value={salesPlatform ?? {}}
                    onChange={onSalesChange}
                    posEnabled
                    showTheme={false}
                    showLayout
                    showBehaviourToggles
                  />
                </div>
              ) : null}
              {workspace.id === "backoffice" && enabled && typeof onSalesChange === "function" ? (
                <div className="mt-3 space-y-3 border-t border-[var(--theme-border)] pt-3 pl-8">
                  <Toggle
                    label="Allow editing orders from Sales"
                    description="When on, staff can Edit order from the Sales orders list for any source (Point of sale, Mobile, or Backoffice). Change customer, add/remove lines, adjust quantities and discounts; totals and stock update on save."
                    checked={salesPlatform?.enable_backoffice_order_edit !== false}
                    onChange={(v) =>
                      onSalesChange({
                        ...(salesPlatform ?? {}),
                        enable_backoffice_order_edit: v,
                      })
                    }
                  />
                  {salesPlatform?.enable_backoffice_order_edit !== false ? (
                    <div className="ml-6 space-y-1 border-l border-slate-200 pl-4">
                      <label className="block text-sm font-medium text-slate-900">Edit Orders mode</label>
                      <SearchableSelect
                        value={
                          salesPlatform?.backoffice_order_edit_layout === "classic"
                            ? "classic"
                            : "modern"
                        }
                        onChange={(next) =>
                          onSalesChange({
                            ...(salesPlatform ?? {}),
                            backoffice_order_edit_layout: next,
                          })
                        }
                        options={[
                          { value: "modern", label: "Modern — current Centrix Edit order popup" },
                          {
                            value: "classic",
                            label: "Classic — POS-style cart, item swap, retail/wholesale mode",
                          },
                        ]}
                      />
                      <p className="text-xs text-slate-500">
                        Same idea as External POS layout. Classic uses the Classic POS look and
                        interactions inside the Edit order popup (swap, F12 retail/wholesale) while
                        keeping the same pricing and route markups.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {workspace.id === "hotel_bar_pos" && enabled ? (
                <p className="mt-3 border-t border-[var(--theme-border)] pt-3 pl-8 text-xs text-slate-600">
                  Hotel POS theme, checkout mode, payment references, and services are configured on the{" "}
                  <strong>Hotel services</strong> tab.
                </p>
              ) : null}
              {workspace.id === "hospitality_backoffice" && enabled ? (
                <p className="mt-3 border-t border-[var(--theme-border)] pt-3 pl-8 text-xs text-slate-600">
                  Rooms, front desk, guest folios, housekeeping, and room charge are enabled on the{" "}
                  <strong>Hotel services</strong> tab.
                </p>
              ) : null}
            </div>
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
                  <PasswordInput
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                  />
                </OrgRegisterField>
                <OrgRegisterField label="Branch *">
                  <SearchableSelect
  className={inputClass}
  value={branchId}
  nativeEvent
  onChange={((e) => setBranchId(e.target.value))}
  options={branches.map((branch) => ({ value: String(branch.id), label: branch.branch_name }))}
/>
                </OrgRegisterField>
                <OrgRegisterField label="Role *">
                  <SearchableSelect
  className={inputClass}
  value={roleId}
  nativeEvent
  onChange={((e) => setRoleId(e.target.value))}
  disabled={isAdmin}
  options={roles.map((role) => ({ value: String(role.id), label: role.role_name }))}
/>
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
                {enabledModules["hospitality.backend"] || enabledModules["hospitality.bar_pos"] ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Centrix ERP is web sign-in. Managers App is the mobile manager app. Which
                    modules a user can open is controlled by their role and permissions.
                  </p>
                ) : null}
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
          ? `Sign-in accounts for this tenant (company code ${companyCode}). Promote or remove organization administrators here — at least one org admin must remain.${detailed ? " Shows last login and active sessions." : ""}`
          : "Sign-in accounts for this tenant. Promote or remove organization administrators here — at least one org admin must remain."
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
                  orgAdminCount={users.filter((u) => u.is_admin).length}
                  loginChannelCapabilities={platformCapabilities}
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

function OrganizationUserRow({
  user,
  organizationId,
  onUpdated,
  detailed = false,
  orgAdminCount = 0,
  loginChannelCapabilities,
}) {
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
  const isSoleOrgAdmin = Boolean(user.is_admin) && orgAdminCount <= 1;
  const canRemoveOrgAdmin = Boolean(user.is_admin) && orgAdminCount > 1;
  const canMakeOrgAdmin = !user.is_admin;

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

  async function setOrgAdmin(makeAdmin) {
    const ok = await confirm({
      title: makeAdmin ? "Make organization administrator?" : "Remove organization administrator?",
      message: makeAdmin
        ? `Make "${user.full_name}" an organization administrator? They get the Administrator role and full tenant access. Existing sessions will be signed out.`
        : `Remove organization administrator from "${user.full_name}"? They keep a staff role and can still sign in. At least one org admin must remain.`,
      confirmLabel: makeAdmin ? "Make org admin" : "Remove org admin",
      destructive: !makeAdmin,
    });
    if (!ok) return;
    await updateUser({ is_admin: makeAdmin });
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

  async function clearTwoFactor() {
    const ok = await confirm({
      title: "Clear two-factor authentication?",
      message: `Clear 2FA for "${user.full_name}"? They will sign in with password only until they enable 2FA again from My profile.`,
      confirmLabel: "Clear 2FA",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { apiRequest } = await import("@/lib/api");
      await apiRequest(`/admin/organizations/${organizationId}/users/${user.id}/clear-two-factor`, {
        method: "POST",
      });
      setSaved(true);
      await onUpdated?.();
    } catch (err) {
      const { ApiError } = await import("@/lib/api");
      setError(err instanceof ApiError ? err.message : "Could not clear 2FA.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (isSoleOrgAdmin) {
      setError("Cannot delete the only organization administrator. Promote another user first.");
      return;
    }
    const ok = await confirm({
      title: "Delete user",
      message: user.is_admin
        ? `Delete organization administrator "${user.full_name}"? Other org admins will remain. Users with sales history are archived.`
        : `Delete "${user.full_name}"? Users with sales or activity history are archived; users without records are removed permanently.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { apiRequest } = await import("@/lib/api");
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
      <td className="px-4 py-2 text-xs text-slate-600">
        {formatLoginChannels(user.login_channels, loginChannelCapabilities)}
      </td>
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
        {user.two_factor_enabled ? (
          <span className="mt-1 block text-[11px] font-medium text-indigo-700">2FA on</span>
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
            {user.two_factor_enabled ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearTwoFactor()}
                className="rounded border border-indigo-300 px-2 py-1 text-xs font-medium text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
              >
                Clear 2FA
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
            {canMakeOrgAdmin ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setOrgAdmin(true)}
                className="rounded border border-[#185FA5]/40 px-2 py-1 text-xs font-medium text-[#185FA5] hover:bg-[#185FA5]/5 disabled:opacity-50"
              >
                Make org admin
              </button>
            ) : null}
            {canRemoveOrgAdmin ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setOrgAdmin(false)}
                className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
              >
                Remove org admin
              </button>
            ) : null}
            <div className="w-36">
              <PasswordInput
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
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
              disabled={busy || (user.is_admin && isSoleOrgAdmin && user.is_active)}
              title={
                user.is_admin && isSoleOrgAdmin && user.is_active
                  ? "Cannot disable login for the only organization administrator"
                  : undefined
              }
              onClick={() => void updateUser({ is_active: !user.is_active })}
              className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
            >
              {user.is_active ? "Disable login" : "Enable login"}
            </button>
            <button
              type="button"
              disabled={busy || isSoleOrgAdmin}
              title={
                isSoleOrgAdmin
                  ? "Cannot delete the only organization administrator — promote another user first"
                  : undefined
              }
              onClick={() => void deleteUser()}
              className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Delete user
            </button>
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
