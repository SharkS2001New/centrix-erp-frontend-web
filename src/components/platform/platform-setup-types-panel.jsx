"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";
import {
  ACCOUNTING_MENU_CATALOG,
  BACKOFFICE_SECTION_CATALOG,
  HR_MENU_CATALOG,
  normalizeMenuGroups,
} from "@/lib/menu-groups";
import { normalizeBackofficeSections } from "@/lib/backoffice-sections";
import { provisionableWorkspacesForProfile } from "@/lib/workspace-modules";
import {
  OrganizationOrderWorkflowSettings,
  OrganizationOrdersListSettings,
  OrganizationPlatformSalesSettings,
  defaultSalesPlatformState,
} from "@/components/admin/organization-platform-config";
import {
  HOSPITALITY_SERVICE_CATALOG,
  normalizeHospitalityServices,
} from "@/lib/hospitality-services";
import {
  HOSPITALITY_PAYMENT_WORKFLOW_CATALOG,
  normalizeHospitalityPaymentWorkflow,
} from "@/lib/hospitality-payment-workflow";
import {
  HOTEL_POS_PAYMENT_METHOD_CATALOG,
  normalizeHotelPosPaymentMethods,
} from "@/lib/hotel-pos-payment-methods";

const GROUPS = [
  {
    id: "backoffice",
    title: "Backoffice menu groups",
    applicationIds: ["backoffice", "hospitality_backoffice"],
    catalog: BACKOFFICE_SECTION_CATALOG,
    normalize: normalizeBackofficeSections,
  },
  {
    id: "hr",
    title: "Human resources menu groups",
    applicationIds: ["hr"],
    catalog: HR_MENU_CATALOG,
    normalize: (raw) => normalizeMenuGroups(HR_MENU_CATALOG, raw),
  },
  {
    id: "accounting",
    title: "Accounting menu groups",
    applicationIds: ["accounting"],
    catalog: ACCOUNTING_MENU_CATALOG,
    normalize: (raw) => normalizeMenuGroups(ACCOUNTING_MENU_CATALOG, raw),
  },
];

function menuGroupModuleOn(profile, group) {
  const apps = profile?.applications ?? {};
  return group.applicationIds.some((id) => apps[id] === true);
}

function savedMenuGroup(profile, group) {
  if (!menuGroupModuleOn(profile, group)) {
    return Object.fromEntries(group.catalog.map((section) => [section.key, false]));
  }
  return group.normalize(profile.menu_groups?.[group.id]);
}

export function PlatformSetupTypesPanel() {
  const confirm = useConfirm();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("commerce");
  const [creating, setCreating] = useState(false);
  const [openKey, setOpenKey] = useState("");
  const activeProfile = profiles.find((profile) => profile.key === openKey) ?? null;
  const [profileTab, setProfileTab] = useState("applications");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const res = await apiRequest("/admin/setup-profiles");
      setProfiles(
        Array.isArray(res?.data)
          ? res.data.map((profile) => ({
              ...profile,
              sales_platform: defaultSalesPlatformState(
                profile.key,
                profile.default_sales_platform,
              ),
            }))
          : [],
      );
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load setup types.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeProfile) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpenKey("");
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeProfile]);

  function setApplication(profileKey, appId, checked) {
    setProfiles((rows) =>
      rows.map((row) => {
        if (row.key !== profileKey) return row;
        const applications = { ...(row.applications ?? {}), [appId]: checked };
        if (appId === "pos" && checked) applications.backoffice = true;
        if (appId === "hotel_bar_pos" && checked) applications.hospitality_backoffice = true;
        if (appId === "backoffice" && !checked) applications.pos = false;
        if (appId === "hospitality_backoffice" && !checked) applications.hotel_bar_pos = false;
        let menuGroups = row.menu_groups ?? {};
        for (const group of GROUPS) {
          const wasOn = menuGroupModuleOn(row, group);
          const nowOn = menuGroupModuleOn({ applications }, group);
          if (!nowOn || wasOn) continue;
          const current = group.normalize(menuGroups[group.id]);
          if (Object.values(current).every((value) => value === false)) {
            menuGroups = {
              ...menuGroups,
              [group.id]: Object.fromEntries(group.catalog.map((section) => [section.key, true])),
            };
          }
        }
        return { ...row, applications, menu_groups: menuGroups };
      }),
    );
  }

  function setGroup(profileKey, groupId, catalog, normalize, sectionKey, checked) {
    setProfiles((rows) =>
      rows.map((row) => {
        if (row.key !== profileKey) return row;
        const current = normalize(row.menu_groups?.[groupId]);
        return {
          ...row,
          menu_groups: {
            ...(row.menu_groups ?? {}),
            [groupId]: { ...current, [sectionKey]: checked },
          },
        };
      }),
    );
    void catalog;
  }

  async function save(profile) {
    setSavingKey(profile.key);
    try {
      const body = {
        backoffice: savedMenuGroup(profile, GROUPS[0]),
        hr: savedMenuGroup(profile, GROUPS[1]),
        accounting: savedMenuGroup(profile, GROUPS[2]),
        applications: profile.applications ?? {},
        sales_platform: profile.sales_platform ?? {},
      };
      if (profile.custom) body.label = profile.label;
      await apiRequest(`/admin/setup-profiles/${profile.key}`, {
        method: "PUT",
        body,
      });
      notifySuccess(`Saved ${profile.label}.`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save this setup type.");
    } finally {
      setSavingKey("");
    }
  }

  function setLabel(profileKey, label) {
    setProfiles((rows) => rows.map((row) => (row.key === profileKey ? { ...row, label } : row)));
  }

  function setSalesPlatform(profileKey, salesPlatform) {
    setProfiles((rows) =>
      rows.map((row) =>
        row.key === profileKey ? { ...row, sales_platform: salesPlatform } : row,
      ),
    );
  }

  function enabledModulesForProfile(profile) {
    const apps = profile?.applications ?? {};
    return {
      sales: Boolean(apps.pos || apps.backoffice),
      "sales.pos": Boolean(apps.pos),
      distribution: Boolean(apps.distribution),
      hospitality: Boolean(apps.hotel_bar_pos || apps.hospitality_backoffice),
      "hospitality.backend": Boolean(apps.hospitality_backoffice),
      "hospitality.bar_pos": Boolean(apps.hotel_bar_pos),
    };
  }

  async function createSetup(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await apiRequest("/admin/setup-profiles", {
        method: "POST",
        body: { name: trimmed, industry },
      });
      setName("");
      setProfileTab("applications");
      setOpenKey(res?.data?.key ?? "");
      notifySuccess(`Created ${res?.data?.label || trimmed}.`);
      await load({ quiet: true });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not create this setup type.");
    } finally {
      setCreating(false);
    }
  }

  async function removeSetup(profile) {
    const ok = await confirm(
      confirmDeleteOptions(
        profile.label,
        `Delete “${profile.label}”? An organisation that still uses it has to switch to another setup first.`,
      ),
    );
    if (!ok) return;
    setSavingKey(profile.key);
    try {
      await apiRequest(`/admin/setup-profiles/${profile.key}`, { method: "DELETE" });
      notifySuccess(`Deleted ${profile.label}.`);
      await load({ quiet: true });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not delete this setup type.");
    } finally {
      setSavingKey("");
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading setup types…</p>;
  }

  const isHospitalityProfile = activeProfile?.industry === "hospitality";
  const supportsSalesWorkflow = activeProfile?.industry === "commerce";
  const profileTabs = activeProfile
    ? [
        { id: "applications", label: "Applications & menus" },
        ...(supportsSalesWorkflow
          ? [
              { id: "sales", label: "Sales behaviour" },
              { id: "orders_list", label: "Orders list & reports" },
              { id: "workflow", label: "Order workflow" },
            ]
          : []),
        ...(isHospitalityProfile
          ? [
              { id: "hotel", label: "Hotel services & payment" },
              { id: "orders_list", label: "Orders & reports" },
            ]
          : []),
      ]
    : [];
  const profileSales = activeProfile?.sales_platform ?? {};
  const profileModules = activeProfile ? enabledModulesForProfile(activeProfile) : {};

  return (
    <div className="space-y-3">
      <form onSubmit={(event) => void createSetup(event)} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block min-w-[16rem] flex-1 text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Pharmacy, Hardware, Lodge…"
            maxLength={80}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Industry</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          >
            <option value="commerce">Retail & Distribution</option>
            <option value="hospitality">Hotel & Hospitality</option>
            <option value="spa">SPA & Kinyozi</option>
            <option value="driving">Driving School</option>
          </select>
        </label>
        <PrimaryButton type="submit" showIcon={false} disabled={creating || name.trim() === ""}>
          {creating ? "Creating…" : "Create setup type"}
        </PrimaryButton>
      </form>
      <p className="text-sm text-slate-600">
        Each setup type stores applications, menu groups, and the operational defaults for that
        business, including order workflow and sales behavior. New organizations use these defaults;
        choosing the setup type again on an existing organization applies the updated defaults there.
      </p>
      {profiles.map((profile) => (
        <div key={profile.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{profile.label}</p>
            <p className="mt-1 text-xs text-slate-500">
              {profile.industry === "hospitality"
                ? "Hotel & Hospitality"
                : profile.industry === "spa"
                  ? "SPA & Kinyozi"
                  : profile.industry === "driving"
                    ? "Driving School"
                    : "Retail & Distribution"}
            </p>
          </div>
          <PrimaryButton
            type="button"
            showIcon={false}
            onClick={() => {
              setProfileTab("applications");
              setOpenKey(profile.key);
            }}
          >
            Open setup type
          </PrimaryButton>
        </div>
      ))}
      {activeProfile ? (
        <div
          className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingKey) setOpenKey("");
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-type-dialog-title"
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
          >
            <header className="mb-4 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 id="setup-type-dialog-title" className="text-lg font-semibold text-slate-900">
                  {activeProfile.label}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Configure applications, menus, and the operational defaults applied to organizations using this setup.</p>
              </div>
              <button
                type="button"
                aria-label="Close setup type"
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setOpenKey("")}
              >
                ×
              </button>
            </header>
            {profileTabs.length > 1 ? (
              <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3" role="tablist" aria-label="Setup type settings">
                {profileTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={profileTab === tab.id}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      profileTab === tab.id
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                    onClick={() => setProfileTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
            {profileTab === "applications" ? (
              <div className="space-y-3">
                {activeProfile.custom ? (
                  <label className="block max-w-md text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={activeProfile.label}
                      maxLength={80}
                      onChange={(event) => setLabel(activeProfile.key, event.target.value)}
                    />
                  </label>
                ) : null}
              <details open className="rounded-lg border border-slate-200 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-slate-800">Applications</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {provisionableWorkspacesForProfile(activeProfile.key, profiles).map((app) => (
                    <label key={app.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={activeProfile.applications?.[app.id] === true}
                        onChange={(event) => setApplication(activeProfile.key, app.id, event.target.checked)}
                      />
                      <span>{app.label}</span>
                    </label>
                  ))}
                </div>
              </details>
              {GROUPS.map((group) => {
                const moduleOn = menuGroupModuleOn(activeProfile, group);
                const values = group.normalize(activeProfile.menu_groups?.[group.id]);
                return (
                  <details key={group.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <summary className={`cursor-pointer text-sm font-medium ${moduleOn ? "text-slate-800" : "text-slate-400"}`}>
                      {group.title}
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {group.catalog.map((section) => (
                        <label
                          key={section.key}
                          className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm ${
                            moduleOn ? "" : "cursor-not-allowed opacity-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            disabled={!moduleOn}
                            checked={moduleOn && values[section.key] !== false}
                            onChange={(event) =>
                              setGroup(activeProfile.key, group.id, group.catalog, group.normalize, section.key, event.target.checked)
                            }
                          />
                          <span>{section.label}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
                </div>
            ) : null}
            {profileTab === "sales" && supportsSalesWorkflow ? (
                <OrganizationPlatformSalesSettings
                  salesPlatform={profileSales}
                  onChange={(value) => setSalesPlatform(activeProfile.key, value)}
                  enabledModules={profileModules}
                  deploymentProfile={activeProfile.key}
                />
            ) : null}
            {profileTab === "orders_list" ? (
                <OrganizationOrdersListSettings
                  salesPlatform={profileSales}
                  onChange={(value) => setSalesPlatform(activeProfile.key, value)}
                  enabledModules={profileModules}
                  industry={activeProfile.industry}
                />
            ) : null}
            {profileTab === "workflow" && supportsSalesWorkflow ? (
                <OrganizationOrderWorkflowSettings
                  salesPlatform={profileSales}
                  onChange={(value) => setSalesPlatform(activeProfile.key, value)}
                  enabledModules={profileModules}
                />
            ) : null}
            {profileTab === "hotel" && isHospitalityProfile ? (
                <div className="space-y-4">
                  <section className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Hospitality services</h3>
                    <div className="mt-3 space-y-2">
                      {HOSPITALITY_SERVICE_CATALOG.map((service) => {
                        const services = normalizeHospitalityServices(profileSales.hospitality_services);
                        return (
                          <label key={service.key} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={Boolean(services[service.key])}
                              onChange={(event) =>
                                setSalesPlatform(activeProfile.key, {
                                  ...profileSales,
                                  hospitality_services: normalizeHospitalityServices({
                                    ...services,
                                    [service.key]: event.target.checked,
                                    ...(service.key === "table_pos" && event.target.checked
                                      ? { floor_tables: true }
                                      : {}),
                                    ...(service.key === "room_charge" && event.target.checked
                                      ? { folios: true }
                                      : {}),
                                    ...(service.key === "night_audit" && event.target.checked
                                      ? { folios: true }
                                      : {}),
                                    ...(service.key === "folios" && !event.target.checked
                                      ? { room_charge: false, night_audit: false }
                                      : {}),
                                  }),
                                })
                              }
                            />
                            <span>
                              <span className="block text-sm font-medium text-slate-800">{service.label}</span>
                              <span className="block text-xs text-slate-500">{service.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                  <section className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Hotel POS checkout</h3>
                    <label className="mt-3 block max-w-md text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Checkout mode</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                        value={profileSales.hotel_pos_collect_payment === false ? "save" : "collect"}
                        onChange={(event) => {
                          const collect = event.target.value === "collect";
                          setSalesPlatform(activeProfile.key, {
                            ...profileSales,
                            hotel_pos_collect_payment: collect,
                            hospitality_payment_workflow: {
                              ...normalizeHospitalityPaymentWorkflow(profileSales.hospitality_payment_workflow),
                              unpaid: !collect,
                              paid: true,
                            },
                          });
                        }}
                      >
                        <option value="collect">Collect payment at checkout</option>
                        <option value="save">Save unpaid order for later payment</option>
                      </select>
                    </label>
                    <div className="mt-4 space-y-2">
                      {HOSPITALITY_PAYMENT_WORKFLOW_CATALOG.map((status) => {
                        const workflow = normalizeHospitalityPaymentWorkflow(profileSales.hospitality_payment_workflow);
                        const locked = status.key === "paid" || status.key === "unpaid";
                        return (
                          <label key={status.key} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={Boolean(workflow[status.key])}
                              disabled={locked}
                              onChange={(event) =>
                                setSalesPlatform(activeProfile.key, {
                                  ...profileSales,
                                  hospitality_payment_workflow: normalizeHospitalityPaymentWorkflow({
                                    ...workflow,
                                    [status.key]: event.target.checked,
                                  }),
                                })
                              }
                            />
                            <span>
                              <span className="block text-sm font-medium text-slate-800">{status.label}</span>
                              <span className="block text-xs text-slate-500">{status.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-4 space-y-2">
                      {HOTEL_POS_PAYMENT_METHOD_CATALOG.map((method) => {
                        const methods = normalizeHotelPosPaymentMethods(profileSales.hotel_pos_payment_methods, profileSales);
                        return (
                          <label key={method.key} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={Boolean(methods[method.key])}
                              onChange={(event) =>
                                setSalesPlatform(activeProfile.key, {
                                  ...profileSales,
                                  hotel_pos_payment_methods: { ...methods, [method.key]: event.target.checked },
                                })
                              }
                            />
                            <span>
                              <span className="block text-sm font-medium text-slate-800">{method.label}</span>
                              <span className="block text-xs text-slate-500">{method.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
                <PrimaryButton type="button" showIcon={false} disabled={savingKey === activeProfile.key} onClick={() => void save(activeProfile)}>
                  {savingKey === activeProfile.key ? "Saving…" : "Save this setup type"}
                </PrimaryButton>
                {activeProfile.custom ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    disabled={savingKey === activeProfile.key}
                    onClick={() => void removeSetup(activeProfile)}
                  >
                    Delete
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                  onClick={() => setOpenKey("")}
                >
                  Close
                </button>
              </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
