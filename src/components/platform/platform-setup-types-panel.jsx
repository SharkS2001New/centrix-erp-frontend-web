"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  ACCOUNTING_MENU_CATALOG,
  BACKOFFICE_SECTION_CATALOG,
  HR_MENU_CATALOG,
  normalizeMenuGroups,
} from "@/lib/menu-groups";
import { normalizeBackofficeSections } from "@/lib/backoffice-sections";
import { provisionableWorkspacesForProfile } from "@/lib/workspace-modules";

const GROUPS = [
  { id: "backoffice", title: "Backoffice menu groups", catalog: BACKOFFICE_SECTION_CATALOG, normalize: normalizeBackofficeSections },
  { id: "hr", title: "Human resources menu groups", catalog: HR_MENU_CATALOG, normalize: (raw) => normalizeMenuGroups(HR_MENU_CATALOG, raw) },
  { id: "accounting", title: "Accounting menu groups", catalog: ACCOUNTING_MENU_CATALOG, normalize: (raw) => normalizeMenuGroups(ACCOUNTING_MENU_CATALOG, raw) },
];

export function PlatformSetupTypesPanel() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/setup-profiles");
      setProfiles(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load setup types.");
    } finally {
      setLoading(false);
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
        return { ...row, applications };
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
        backoffice: normalizeBackofficeSections(profile.menu_groups?.backoffice),
        hr: normalizeMenuGroups(HR_MENU_CATALOG, profile.menu_groups?.hr),
        accounting: normalizeMenuGroups(ACCOUNTING_MENU_CATALOG, profile.menu_groups?.accounting),
        applications: profile.applications ?? {},
      };
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

  if (loading) {
    return <p className="text-sm text-slate-500">Loading setup types…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Each setup type stores which applications it includes, such as External POS, plus the
        Backoffice, Human Resources, and Accounting menu groups. Saving here does not change an
        organisation that already uses that setup. Open the organisation and choose the setup type
        again to copy these applications and groups onto it, then adjust that organisation on its own.
      </p>
      {profiles.map((profile) => (
        <details key={profile.key} className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">{profile.label}</summary>
          <div className="mt-3 space-y-3">
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
              const values = group.normalize(profile.menu_groups?.[group.id]);
              return (
                <details key={group.id} className="rounded-lg border border-slate-200 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium text-slate-800">{group.title}</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {group.catalog.map((section) => (
                      <label key={section.key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={values[section.key] !== false}
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
            <PrimaryButton type="button" showIcon={false} disabled={savingKey === profile.key} onClick={() => void save(profile)}>
              {savingKey === profile.key ? "Saving…" : "Save this setup type"}
            </PrimaryButton>
          </div>
        </details>
      ))}
    </div>
  );
}
