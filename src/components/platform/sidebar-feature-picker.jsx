"use client";

import { useMemo, useState } from "react";
import {
  normalizeSidebarFeatures,
  SIDEBAR_FEATURE_CATALOG,
} from "@/lib/sidebar-features";

export function SidebarFeaturePicker({
  title = "Sidebar features",
  description,
  features,
  onChange,
  restricted,
  onRestrictedChange,
  defaultValue = true,
  disabled = false,
}) {
  const [query, setQuery] = useState("");
  const values = normalizeSidebarFeatures(features, defaultValue);
  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const bySection = new Map();
    for (const feature of SIDEBAR_FEATURE_CATALOG) {
      if (
        normalizedQuery &&
        !`${feature.label} ${feature.sectionLabel}`.toLowerCase().includes(normalizedQuery)
      ) {
        continue;
      }
      if (!bySection.has(feature.sectionId)) {
        bySection.set(feature.sectionId, {
          id: feature.sectionId,
          label: feature.sectionLabel,
          features: [],
        });
      }
      bySection.get(feature.sectionId).features.push(feature);
    }
    return [...bySection.values()];
  }, [query]);
  const featureControlsDisabled = disabled || (onRestrictedChange && !restricted);

  function setFeature(key, checked) {
    onChange({ ...values, [key]: checked });
  }

  function setGroup(group, checked) {
    onChange({
      ...values,
      ...Object.fromEntries(group.features.map((feature) => [feature.key, checked])),
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 px-3 py-3">
      <h3 className="text-sm font-medium text-slate-800">{title}</h3>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      {onRestrictedChange ? (
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-slate-300"
            checked={Boolean(restricted)}
            disabled={disabled}
            onChange={(event) => onRestrictedChange(event.target.checked)}
          />
          <span>
            Limit this setup type to the selected sidebar links
            <span className="mt-0.5 block text-xs text-slate-500">
              When limited, unselected links stay hidden unless granted for an individual organization.
            </span>
          </span>
        </label>
      ) : null}
      <label className="mt-3 block max-w-md text-xs font-medium text-slate-600">
        <span className="sr-only">Search sidebar features</span>
        <input
          type="search"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sidebar features…"
        />
      </label>
      <div className="mt-3 space-y-2">
        {groups.map((group) => (
          <details key={group.id} className="rounded-md border border-slate-200 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-800">
              {group.label}
              <span className="ml-2 text-xs font-normal text-slate-500">
                {group.features.filter((feature) => values[feature.key]).length}/
                {group.features.length} enabled
              </span>
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs font-medium text-blue-700 hover:text-blue-900 disabled:text-slate-400"
                disabled={featureControlsDisabled}
                onClick={() => setGroup(group, true)}
              >
                Enable all
              </button>
              <button
                type="button"
                className="text-xs font-medium text-blue-700 hover:text-blue-900 disabled:text-slate-400"
                disabled={featureControlsDisabled}
                onClick={() => setGroup(group, false)}
              >
                Disable all
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {group.features.map((feature) => (
                <label
                  key={feature.key}
                  className="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-slate-300"
                    checked={Boolean(values[feature.key])}
                    disabled={featureControlsDisabled}
                    onChange={(event) => setFeature(feature.key, event.target.checked)}
                  />
                  <span>{feature.label}</span>
                </label>
              ))}
            </div>
          </details>
        ))}
        {groups.length === 0 ? (
          <p className="text-xs text-slate-500">No sidebar features match this search.</p>
        ) : null}
      </div>
    </section>
  );
}
