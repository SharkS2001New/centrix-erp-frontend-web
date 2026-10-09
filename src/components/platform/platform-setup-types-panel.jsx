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

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const res = await apiRequest("/admin/setup-profiles");
      setProfiles(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load setup types.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          </select>
        </label>
        <PrimaryButton type="submit" showIcon={false} disabled={creating || name.trim() === ""}>
          {creating ? "Creating…" : "Create setup type"}
        </PrimaryButton>
      </form>
      <p className="text-sm text-slate-600">
        Each setup type stores which applications it includes, such as External POS. Menu groups
        for Backoffice, Human Resources, and Accounting can be chosen only while that application
        is on. Saving here does not change an
        organisation that already uses that setup. Open the organisation and choose the setup type
        again to copy these applications and groups onto it, then adjust that organisation on its own.
      </p>
      {profiles.map((profile) => (
        <details key={profile.key} defaultOpen={profile.key === openKey} className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            {profile.label}
            {profile.custom ? (
              <span className="ml-2 text-xs font-normal text-slate-500">
                {profile.industry === "hospitality" ? "Hotel & Hospitality" : "Retail & Distribution"}
              </span>
            ) : null}
          </summary>
          <div className="mt-3 space-y-3">
            {profile.custom ? (
              <label className="block max-w-md text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={profile.label}
                  maxLength={80}
                  onChange={(event) => setLabel(profile.key, event.target.value)}
                />
              </label>
            ) : null}
            <details open className="rounded-lg border border-slate-200 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">Applications</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {provisionableWorkspacesForProfile(profile.key, profiles).map((app) => (
                  <label key={app.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={profile.applications?.[app.id] === true}
                      onChange={(event) => setApplication(profile.key, app.id, event.target.checked)}
                    />
                    <span>{app.label}</span>
                  </label>
                ))}
              </div>
            </details>
            {GROUPS.map((group) => {
              const moduleOn = menuGroupModuleOn(profile, group);
              const values = group.normalize(profile.menu_groups?.[group.id]);
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
                            setGroup(profile.key, group.id, group.catalog, group.normalize, section.key, event.target.checked)
                          }
                        />
                        <span>{section.label}</span>
                      </label>
                    ))}
                  </div>
                </details>
              );
            })}
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryButton type="button" showIcon={false} disabled={savingKey === profile.key} onClick={() => void save(profile)}>
                {savingKey === profile.key ? "Saving…" : "Save this setup type"}
              </PrimaryButton>
              {profile.custom ? (
                <button
                  type="button"
                  className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  disabled={savingKey === profile.key}
                  onClick={() => void removeSetup(profile)}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
