"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CLASSIC_POS_COLOR_OVERRIDE_FIELDS,
  CLASSIC_POS_THEME_DEFAULT,
  CLASSIC_POS_THEME_TEMPLATES,
  classicPosThemeCssVars,
  getClassicPosThemeTemplate,
  normalizeClassicPosHexColor,
  normalizeClassicPosThemeColors,
  normalizeClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import { posModalPanelClass } from "@/lib/pos-modal-shell";

function PosThemeColorField({ field, value, fallback, onChange }) {
  const display = normalizeClassicPosHexColor(value) || normalizeClassicPosHexColor(fallback) || "#888888";
  const custom = Boolean(normalizeClassicPosHexColor(value));

  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--theme-text)]">{field.label}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--theme-text-muted)]">{field.description}</p>
        </div>
        {custom ? (
          <button
            type="button"
            onClick={() => onChange?.("")}
            className="shrink-0 text-[11px] font-medium text-[var(--theme-primary)] hover:underline"
          >
            Reset
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          aria-label={`${field.label} color`}
          value={display}
          onChange={(e) => onChange?.(e.target.value)}
          className="h-9 w-11 cursor-pointer rounded border border-[var(--theme-border)] bg-[var(--theme-input-bg)] p-0.5"
        />
        <input
          type="text"
          value={custom ? String(value).toUpperCase() : ""}
          placeholder={String(fallback || display).toUpperCase()}
          spellCheck={false}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange?.("");
              return;
            }
            const hex = normalizeClassicPosHexColor(raw.startsWith("#") ? raw : `#${raw}`);
            if (hex) onChange?.(hex);
            else onChange?.(raw);
          }}
          onBlur={(e) => {
            const hex = normalizeClassicPosHexColor(e.target.value);
            onChange?.(hex || "");
          }}
          className="min-w-0 flex-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-input-bg)] px-2.5 py-1.5 font-mono text-sm uppercase text-[var(--theme-text)] focus:border-[var(--theme-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)]"
        />
      </div>
    </div>
  );
}

export function PosUserThemeDialog({
  open,
  onClose,
  orgTemplate = CLASSIC_POS_THEME_DEFAULT,
  userTemplate = null,
  userColors = {},
  onSave,
  embedded = true,
}) {
  const [selected, setSelected] = useState("org");
  const [customColors, setCustomColors] = useState({});

  useEffect(() => {
    if (!open) return;
    setSelected(userTemplate ? normalizeClassicPosThemeTemplate(userTemplate) : "org");
    setCustomColors(normalizeClassicPosThemeColors(userColors));
  }, [open, userTemplate, userColors]);

  const baseTemplateId = selected === "org" ? orgTemplate : selected;
  const baseVars = useMemo(
    () => classicPosThemeCssVars(normalizeClassicPosThemeTemplate(baseTemplateId)),
    [baseTemplateId],
  );
  const normalizedCustomColors = normalizeClassicPosThemeColors(customColors);
  const hasCustomColors = Object.keys(normalizedCustomColors).length > 0;

  if (!open) return null;

  const orgLabel = getClassicPosThemeTemplate(orgTemplate)?.label ?? "Organization";

  function patchColor(key, nextValue) {
    const hex = normalizeClassicPosHexColor(nextValue);
    setCustomColors((prev) => {
      const next = { ...normalizeClassicPosThemeColors(prev) };
      if (hex) next[key] = hex;
      else delete next[key];
      return next;
    });
  }

  function handleSave() {
    if (selected === "org") {
      onSave?.(null);
    } else {
      onSave?.({
        template: normalizeClassicPosThemeTemplate(selected),
        colors: normalizeClassicPosThemeColors(customColors),
      });
    }
    onClose?.();
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-user-theme-title"
        className={`${posModalPanelClass(embedded, "flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl")}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="classic-pos-themed-dialog-header shrink-0 border-b border-[var(--theme-primary-hover)] bg-[var(--theme-primary)] px-4 py-3 text-[var(--theme-primary-fg)]">
          <h2 id="pos-user-theme-title" className="text-base font-semibold">
            My POS color theme
          </h2>
          <p className="classic-pos-themed-dialog-sub mt-0.5 text-xs opacity-85">
            Personal preference on this device — does not change organization settings.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <button
            type="button"
            onClick={() => setSelected("org")}
            className={`mb-3 flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
              selected === "org"
                ? "border-[var(--theme-primary)] bg-[var(--theme-primary-subtle)] ring-2 ring-[var(--theme-primary)]/30"
                : "border-[var(--theme-border)] bg-[var(--theme-surface)] hover:border-[var(--theme-border-strong,var(--theme-border))]"
            }`}
          >
            <span className="mt-0.5 flex gap-1">
              {(getClassicPosThemeTemplate(orgTemplate)?.preview ?? ["#4c5ba4"]).slice(0, 3).map((color) => (
                <span
                  key={color}
                  className="h-4 w-4 rounded-full border border-black/10"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--theme-text)]">
                Organization default
              </span>
              <span className="mt-0.5 block text-xs text-[var(--theme-text-muted)]">
                Use {orgLabel} — set by your admin under Centrix ERP Themes.
              </span>
            </span>
          </button>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--theme-text-muted)]">
            My theme
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CLASSIC_POS_THEME_TEMPLATES.map((theme) => {
              const active = selected === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setSelected(theme.id)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-[var(--theme-primary)] bg-[var(--theme-primary-subtle)] ring-2 ring-[var(--theme-primary)]/30"
                      : "border-[var(--theme-border)] bg-[var(--theme-surface)] hover:border-[var(--theme-border-strong,var(--theme-border))]"
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
                  <span className="block text-sm font-semibold text-[var(--theme-text)]">{theme.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[var(--theme-text-muted)]">
                    {theme.description}
                  </span>
                </button>
              );
            })}
          </div>

          {selected !== "org" ? (
            <div className="mt-5 border-t border-[var(--theme-border)] pt-4">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Custom colors</p>
                  <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">
                    Optional — pick a base theme above, then enter hex codes (#RRGGBB) for any part
                    you want to change.
                  </p>
                </div>
                {hasCustomColors ? (
                  <button
                    type="button"
                    onClick={() => setCustomColors({})}
                    className="text-xs font-medium text-[var(--theme-primary)] hover:underline"
                  >
                    Reset all colors
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {CLASSIC_POS_COLOR_OVERRIDE_FIELDS.map((field) => (
                  <PosThemeColorField
                    key={field.key}
                    field={field}
                    value={normalizedCustomColors[field.key] ?? ""}
                    fallback={baseVars[field.cssVar] || baseVars["--classic-header"]}
                    onChange={(next) => patchColor(field.key, next)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--theme-border)] px-4 py-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-sm font-medium text-[var(--theme-text)] hover:bg-[var(--theme-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-primary-fg)] hover:opacity-95"
          >
            Apply theme
          </button>
        </footer>
      </div>
    </div>
  );
}
