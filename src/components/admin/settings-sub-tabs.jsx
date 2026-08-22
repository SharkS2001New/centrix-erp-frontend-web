"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const SETTINGS_SUB_TAB_BTN =
  "rounded-md px-3 py-1.5 text-sm font-medium transition whitespace-nowrap";
export const SETTINGS_SUB_TAB_BTN_ACTIVE =
  "bg-white text-[#185FA5] shadow-sm dark:bg-[var(--theme-surface,#1e293b)] dark:text-[#6ea8fe]";
export const SETTINGS_SUB_TAB_BTN_IDLE =
  "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100";

export function SettingsSubTabBar({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel = "Settings sections",
}) {
  if (tabs.length <= 1) return null;

  return (
    <div className="w-full overflow-x-auto">
      <div
        className="flex w-full min-w-0 flex-nowrap gap-1 rounded-lg bg-slate-100 p-0.5"
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`${SETTINGS_SUB_TAB_BTN} shrink-0 ${
              activeTab === tab.id ? SETTINGS_SUB_TAB_BTN_ACTIVE : SETTINGS_SUB_TAB_BTN_IDLE
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Keep active tab valid when visible tabs change (e.g. module gates). */
export function useSettingsSubTab(activeTab, setActiveTab, visibleTabs) {
  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, setActiveTab, visibleTabs]);
}

/**
 * Sync SettingsSubTabBar with `?section=` so Admin settings search can deep-link.
 * @returns {(nextId: string) => void} onTabChange that updates state + URL
 */
export function useSettingsSectionUrl(activeTab, setActiveTab, visibleTabs, { param = "section" } = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sectionFromUrl = String(searchParams?.get(param) ?? "").trim();

  useSettingsSubTab(activeTab, setActiveTab, visibleTabs);

  useEffect(() => {
    if (!sectionFromUrl || visibleTabs.length === 0) return;
    if (!visibleTabs.some((tab) => tab.id === sectionFromUrl)) return;
    if (sectionFromUrl !== activeTab) {
      setActiveTab(sectionFromUrl);
    }
  }, [sectionFromUrl, visibleTabs, activeTab, setActiveTab]);

  return useCallback(
    (nextId) => {
      setActiveTab(nextId);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (nextId) params.set(param, nextId);
      else params.delete(param);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [param, pathname, router, searchParams, setActiveTab],
  );
}
