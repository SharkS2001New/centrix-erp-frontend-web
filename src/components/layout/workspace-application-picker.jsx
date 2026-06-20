"use client";

import { useEffect, useState } from "react";
import {
  getWorkspacePickerLayout,
  setWorkspacePickerLayout,
} from "@/lib/workspace-picker-prefs";
import { workspaceIcon } from "@/lib/workspaces";

function LayoutToggle({ layout, onChange, className = "" }) {
  return (
    <div
      className={`inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800 ${className}`}
      role="group"
      aria-label="Application layout"
    >
      <button
        type="button"
        title="Vertical list"
        aria-pressed={layout === "vertical"}
        onClick={() => onChange("vertical")}
        className={`rounded-md p-1.5 transition ${
          layout === "vertical"
            ? "bg-[#405189] text-white dark:bg-[#878a99]"
            : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700"
        }`}
      >
        <ListLayoutIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Horizontal grid"
        aria-pressed={layout === "horizontal"}
        onClick={() => onChange("horizontal")}
        className={`rounded-md p-1.5 transition ${
          layout === "horizontal"
            ? "bg-[#405189] text-white dark:bg-[#878a99]"
            : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700"
        }`}
      >
        <GridLayoutIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function ListLayoutIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GridLayoutIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

/**
 * @param {{
 *   workspaces: Array<{ id: string, label: string, description?: string, icon?: string }>,
 *   currentId?: string | null,
 *   onSelect: (id: string) => void,
 *   disabled?: boolean,
 *   variant?: "dropdown" | "page",
 *   showLayoutToggle?: boolean,
 * }} props
 */
export function WorkspaceApplicationPicker({
  workspaces,
  currentId = null,
  onSelect,
  disabled = false,
  variant = "dropdown",
  showLayoutToggle = true,
}) {
  const [layout, setLayout] = useState("horizontal");

  useEffect(() => {
    setLayout(getWorkspacePickerLayout());
  }, []);

  function changeLayout(next) {
    setWorkspacePickerLayout(next);
    setLayout(next);
  }

  const scrollClass =
    variant === "dropdown"
      ? "max-h-[min(60vh,380px)] overflow-y-auto overscroll-contain"
      : "max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain";

  return (
    <div>
      {showLayoutToggle && workspaces.length > 1 ? (
        <div
          className={
            variant === "dropdown"
              ? "flex items-center justify-end border-b px-3 py-2"
              : "mb-4 flex items-center justify-between gap-3"
          }
        >
          {variant === "page" ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Layout</p>
          ) : null}
          <LayoutToggle layout={layout} onChange={changeLayout} />
        </div>
      ) : null}

      <div className={scrollClass}>
        {layout === "vertical" ? (
          <VerticalList
            workspaces={workspaces}
            currentId={currentId}
            onSelect={onSelect}
            disabled={disabled}
            variant={variant}
          />
        ) : (
          <HorizontalGrid
            workspaces={workspaces}
            currentId={currentId}
            onSelect={onSelect}
            disabled={disabled}
            variant={variant}
          />
        )}
      </div>
    </div>
  );
}

function VerticalList({ workspaces, currentId, onSelect, disabled, variant }) {
  const pad = variant === "dropdown" ? "space-y-1 p-2" : "flex flex-col gap-3 p-0";

  return (
    <ul className={pad}>
      {workspaces.map((workspace) => {
        const active = workspace.id === currentId;
        if (variant === "page") {
          return (
            <li key={workspace.id}>
              <button
                type="button"
                onClick={() => onSelect(workspace.id)}
                disabled={disabled}
                className="group flex w-full items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#185FA5] hover:shadow-md disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-500 sm:p-6"
              >
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-3xl dark:bg-slate-800"
                  aria-hidden
                >
                  {workspaceIcon(workspace.icon)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-slate-900 group-hover:text-[#185FA5] dark:text-white dark:group-hover:text-emerald-400">
                    {workspace.label}
                  </span>
                  {workspace.description ? (
                    <span className="mt-1 block text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                      {workspace.description}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm font-semibold text-[#185FA5] dark:text-emerald-400">
                  Open →
                </span>
              </button>
            </li>
          );
        }

        return (
          <li key={workspace.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(workspace.id)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-60 ${
                active ? "velzon-app-tile-active" : "velzon-app-tile"
              }`}
            >
              <span className="velzon-app-tile-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg">
                {workspaceIcon(workspace.icon)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="block text-sm font-medium leading-tight">{workspace.label}</span>
                  {active ? (
                    <span className="rounded-full bg-[#405189]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#405189] dark:bg-white/10 dark:text-slate-200">
                      Open
                    </span>
                  ) : null}
                </span>
                {workspace.description ? (
                  <span className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {workspace.description}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function HorizontalGrid({ workspaces, currentId, onSelect, disabled, variant }) {
  const gridClass =
    variant === "page"
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
      : "grid grid-cols-2 gap-2 p-3 sm:grid-cols-3";

  return (
    <div className={gridClass}>
      {workspaces.map((workspace) => {
        const active = workspace.id === currentId;
        if (variant === "page") {
          return (
            <button
              key={workspace.id}
              type="button"
              onClick={() => onSelect(workspace.id)}
              disabled={disabled}
              className="group flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition hover:border-[#185FA5] hover:shadow-md disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-500"
            >
              <span
                className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50 text-3xl dark:bg-slate-800"
                aria-hidden
              >
                {workspaceIcon(workspace.icon)}
              </span>
              <span className="text-base font-semibold text-slate-900 group-hover:text-[#185FA5] dark:text-white dark:group-hover:text-emerald-400">
                {workspace.label}
              </span>
              {workspace.description ? (
                <span className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {workspace.description}
                </span>
              ) : null}
            </button>
          );
        }

        return (
          <button
            key={workspace.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(workspace.id)}
            className={`velzon-app-tile flex flex-col items-center rounded-lg border px-2 py-3 text-center transition disabled:opacity-60 ${
              active ? "velzon-app-tile-active" : ""
            }`}
          >
            <span className="velzon-app-tile-icon mb-2 flex h-10 w-10 items-center justify-center rounded-lg text-xl">
              {workspaceIcon(workspace.icon)}
            </span>
            <span className="line-clamp-2 text-[11px] font-medium leading-tight">{workspace.label}</span>
            {active ? (
              <span className="mt-1 rounded-full bg-[#405189]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#405189] dark:bg-white/10 dark:text-slate-200">
                Open
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
