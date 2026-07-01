"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { printFontFormKeys, PRINT_FONT_VARIANTS } from "@/lib/print-font-settings";
import {
  ORG_PRINT_FONT_FAMILIES,
  ORG_PRINT_FONT_SCALES,
  ORG_PRINT_FONT_SIZE_LIMITS,
} from "@/lib/print-typography";

export function PrintFontSettingsFields({
  form,
  setForm,
  variantKey,
  description,
}) {
  const config = PRINT_FONT_VARIANTS[variantKey];
  const keys = printFontFormKeys(variantKey);
  const scale = form?.[keys.scale] ?? config?.defaultScale ?? "standard";

  if (!config) return null;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      <div>
        <p className="text-sm font-medium text-slate-900">{config.label} font</p>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <Field label="Font type">
        <select
          className={inputClassName()}
          value={form?.[keys.family] ?? config.defaultFamily}
          onChange={(e) =>
            setForm((current) => ({
              ...current,
              [keys.family]: e.target.value,
            }))
          }
        >
          {ORG_PRINT_FONT_FAMILIES.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Text size">
        <select
          className={inputClassName()}
          value={scale}
          onChange={(e) =>
            setForm((current) => ({
              ...current,
              [keys.scale]: e.target.value,
            }))
          }
        >
          {ORG_PRINT_FONT_SCALES.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </Field>
      {scale === "custom" ? (
        <Field label="Custom body text size">
          <div className="flex items-center gap-2">
            <input
              type="number"
              className={inputClassName()}
              min={ORG_PRINT_FONT_SIZE_LIMITS.min}
              max={ORG_PRINT_FONT_SIZE_LIMITS.max}
              step={1}
              value={form?.[keys.sizePx] ?? String(config.defaultSizePx)}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  [keys.sizePx]: e.target.value,
                }))
              }
            />
            <span className="text-sm text-slate-500">px</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Main text size ({ORG_PRINT_FONT_SIZE_LIMITS.min}–{ORG_PRINT_FONT_SIZE_LIMITS.max} px).
            Headings and tables scale proportionally.
          </p>
        </Field>
      ) : null}
    </div>
  );
}
