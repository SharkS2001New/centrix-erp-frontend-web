"use client";

import { useMemo } from "react";
import {
  OrderWorkflowSettingsEditor,
  orderWorkflowFromApi,
} from "@/components/admin/order-workflow-settings";
import { DEFAULT_ORDER_WORKFLOW } from "@/lib/order-workflow";
import { DOMAIN_MODULE_ORDER } from "@/lib/module-registry";

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
  return {
    show_checkout_on_create_order: true,
    enable_mobile_orders: true,
    stock_deduct_on: "order_completed",
    order_workflow: structuredClone(DEFAULT_ORDER_WORKFLOW),
  };
}

export function salesPlatformFromApi(apiPayload) {
  if (!apiPayload) return defaultSalesPlatformState();
  return {
    show_checkout_on_create_order: Boolean(apiPayload.show_checkout_on_create_order ?? true),
    enable_mobile_orders: apiPayload.enable_mobile_orders !== false,
    stock_deduct_on: apiPayload.stock_deduct_on ?? "order_completed",
    order_workflow: orderWorkflowFromApi({ order_workflow: apiPayload.order_workflow }),
  };
}

export function OrganizationPlatformSalesSettings({
  salesPlatform,
  onChange,
  deploymentProfile,
  enabledModules = {},
}) {
  const wf = salesPlatform?.order_workflow ?? DEFAULT_ORDER_WORKFLOW;
  const posEnabled = Boolean(enabledModules["sales.pos"]);
  const mobileEnabled = Boolean(enabledModules["sales.mobile"]);
  const distributionEnabled = Boolean(enabledModules.distribution);

  function patch(partial) {
    onChange?.({ ...salesPlatform, ...partial });
  }

  const showCheckout = salesPlatform?.show_checkout_on_create_order !== false;

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#185FA5]">Sales behaviour</h2>
      <p className="mt-1 text-sm text-slate-500">
        Platform-only settings. The organization manager cannot change checkout mode or order workflow — they
        configure payment fields, receipts, and other day-to-day preferences after sign-in.
      </p>

      <div className="mt-4 space-y-3">
        {posEnabled ? (
          <Toggle
            label="Show checkout on create order (POS)"
            description="When off, cashiers use Save order instead of opening the payment screen immediately."
            checked={showCheckout}
            onChange={(v) => patch({ show_checkout_on_create_order: v })}
          />
        ) : null}
        {mobileEnabled ? (
          <Toggle
            label="Show mobile orders in sidebar"
            description="On by default when the Mobile sales module is enabled. Turn off if this organization does not use mobile orders."
            checked={salesPlatform?.enable_mobile_orders !== false}
            onChange={(v) => patch({ enable_mobile_orders: v })}
          />
        ) : null}
        {!posEnabled && !mobileEnabled ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Enable at least one sales submodule above (POS, mobile, or backend) to configure channel-specific
            behaviour.
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <OrderWorkflowSettingsEditor
          workflow={wf}
          onChange={(next) => patch({ order_workflow: next })}
          showCheckoutOnCreate={showCheckout}
          stockDeductOn={salesPlatform?.stock_deduct_on ?? "order_completed"}
          onStockDeductOnChange={(value) => patch({ stock_deduct_on: value })}
          distributionOpsEnabled={distributionEnabled}
        />
      </div>
    </section>
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

export function groupModulesByNav(modules, navGroups) {
  const grouped = new Map();
  for (const group of navGroups ?? []) {
    grouped.set(group.label, []);
  }
  grouped.set("Other", []);

  for (const mod of modules ?? []) {
    const group = mod.nav_group ?? "Other";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(mod);
  }

  const order = (navGroups ?? []).map((g) => g.label);
  return [...grouped.entries()]
    .filter(([, items]) => items.length > 0)
    .sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}

export function OrganizationModuleToggles({
  moduleOptions,
  navGroups,
  enabledModules,
  onToggle,
  onSetModules,
  onProfileChange,
  profilePresets,
  deploymentProfile,
}) {
  const grouped = useMemo(() => groupModulesByDomain(moduleOptions), [moduleOptions]);

  function domainCheckState(domain, children) {
    const keys = [domain.key, ...children.map((c) => c.key)];
    const onCount = keys.filter((key) => enabledModules[key]).length;
    if (onCount === 0) return "none";
    if (onCount === keys.length) return "all";
    return "partial";
  }

  function setDomainModules(domain, children, enable) {
    const patch = { [domain.key]: enable };
    for (const child of children) {
      patch[child.key] = enable;
    }
    if (onSetModules) {
      onSetModules(patch);
      return;
    }
    for (const [key, value] of Object.entries(patch)) {
      if (Boolean(enabledModules[key]) !== value) {
        onToggle(key);
      }
    }
  }

  function toggleDomainChild(domainKey, childKey, enable) {
    const patch = { [childKey]: enable };
    if (enable) {
      patch[domainKey] = true;
    }
    if (onSetModules) {
      onSetModules(patch);
      return;
    }
    if (enable && !enabledModules[domainKey]) {
      onToggle(domainKey);
    }
    if (Boolean(enabledModules[childKey]) !== enable) {
      onToggle(childKey);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#185FA5]">ERP modules</h2>
      <p className="mt-1 text-sm text-slate-500">
        Each domain is a master switch — disabling it hides its features, dashboard, and reports. When a
        domain is on, you can turn individual submodules off per organization (for example, sales reports on
        org A but not org B).
      </p>
      {profilePresets.length > 0 ? (
        <OrgRegisterField label="Deployment profile" className="mt-4 sm:max-w-md">
          <select
            className={inputClass}
            value={deploymentProfile}
            onChange={(e) => onProfileChange?.(e.target.value)}
          >
            {profilePresets.map((profile) => (
              <option key={profile.key} value={profile.key}>
                {profile.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Profiles preset module toggles below. Adjust individual sidebar areas before saving.
          </p>
        </OrgRegisterField>
      ) : null}

      <div className="mt-4 space-y-6">
        {grouped.map(({ domain, children }) => {
          const groupState = domainCheckState(domain, children);
          const childItems = children.filter((c) => c.key !== domain.key);
          return (
            <div key={domain.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{domain.label}</h3>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">{domain.key}</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={groupState === "all"}
                    ref={(el) => {
                      if (el) el.indeterminate = groupState === "partial";
                    }}
                    onChange={(e) => setDomainModules(domain, children, e.target.checked)}
                  />
                  Enable domain
                </label>
              </div>
              {childItems.length > 0 ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {childItems.map((module) => (
                    <label
                      key={module.key}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(enabledModules[module.key])}
                        disabled={!enabledModules[domain.key] && !enabledModules[module.key]}
                        onChange={(e) =>
                          toggleDomainChild(domain.key, module.key, e.target.checked)
                        }
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-900">{module.label}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                          {module.kind ?? "feature"}
                          {module.kind === "dashboard" ? " · analytics home" : null}
                          {module.kind === "reports" ? " · reports in sidebar" : null}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
