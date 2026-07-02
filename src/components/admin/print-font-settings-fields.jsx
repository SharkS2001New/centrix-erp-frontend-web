"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { printFontFormKeys, PRINT_FONT_VARIANTS } from "@/lib/print-font-settings";
import {
  ORG_PRINT_FONT_FAMILIES,
  ORG_PRINT_FONT_SCALES,
  ORG_PRINT_FONT_SIZE_LIMITS,
  ORG_PRINT_FONT_WEIGHTS,
} from "@/lib/print-typography";

function SectionTypographyFields({
  title,
  hint,
  scale,
  sizePx,
  weight,
  defaultSizePx,
  onScaleChange,
  onSizePxChange,
  onWeightChange,
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Size">
          <select className={inputClassName()} value={scale} onChange={onScaleChange}>
            {ORG_PRINT_FONT_SCALES.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Boldness">
          <select className={inputClassName()} value={weight} onChange={onWeightChange}>
            {ORG_PRINT_FONT_WEIGHTS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {scale === "custom" ? (
        <Field label="Custom size (px)">
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              className={inputClassName()}
              min={ORG_PRINT_FONT_SIZE_LIMITS.min}
              max={ORG_PRINT_FONT_SIZE_LIMITS.max}
              step={1}
              value={sizePx}
              onChange={onSizePxChange}
            />
            <span className="text-sm text-slate-500">px</span>
          </div>
        </Field>
      ) : null}
    </div>
  );
}

export function PrintFontSettingsFields({
  form,
  setForm,
  variantKey,
  description,
}) {
  const config = PRINT_FONT_VARIANTS[variantKey];
  const keys = printFontFormKeys(variantKey);

  if (!config) return null;

  const bodyScale = form?.[keys.scale] ?? config.defaultScale ?? "standard";
  const headerScale = form?.[keys.headerScale] ?? config.defaultHeaderScale ?? "large";
  const footerScale = form?.[keys.footerScale] ?? config.defaultFooterScale ?? "standard";

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      <div>
        <p className="text-sm font-medium text-slate-900">{config.label} typography</p>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <Field label="Font type (all sections)">
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

      <SectionTypographyFields
        title="Header"
        hint="Company name, address, email, phone, and PIN on the printout."
        scale={headerScale}
        sizePx={form?.[keys.headerSizePx] ?? String(config.defaultSizePx)}
        weight={form?.[keys.headerWeight] ?? config.defaultHeaderWeight ?? "semibold"}
        defaultSizePx={config.defaultSizePx}
        onScaleChange={(e) =>
          setForm((current) => ({ ...current, [keys.headerScale]: e.target.value }))
        }
        onSizePxChange={(e) =>
          setForm((current) => ({ ...current, [keys.headerSizePx]: e.target.value }))
        }
        onWeightChange={(e) =>
          setForm((current) => ({ ...current, [keys.headerWeight]: e.target.value }))
        }
      />

      <SectionTypographyFields
        title="Body"
        hint="Line items, totals, tables, and main document content."
        scale={bodyScale}
        sizePx={form?.[keys.sizePx] ?? String(config.defaultSizePx)}
        weight={form?.[keys.weight] ?? config.defaultWeight ?? "semibold"}
        defaultSizePx={config.defaultSizePx}
        onScaleChange={(e) =>
          setForm((current) => ({ ...current, [keys.scale]: e.target.value }))
        }
        onSizePxChange={(e) =>
          setForm((current) => ({ ...current, [keys.sizePx]: e.target.value }))
        }
        onWeightChange={(e) =>
          setForm((current) => ({ ...current, [keys.weight]: e.target.value }))
        }
      />

      <SectionTypographyFields
        title="Footer"
        hint="Footer notes, powered-by line, and print edge footer on A4 documents."
        scale={footerScale}
        sizePx={form?.[keys.footerSizePx] ?? String(Math.max(8, config.defaultSizePx - 2))}
        weight={form?.[keys.footerWeight] ?? config.defaultFooterWeight ?? "semibold"}
        defaultSizePx={Math.max(8, config.defaultSizePx - 2)}
        onScaleChange={(e) =>
          setForm((current) => ({ ...current, [keys.footerScale]: e.target.value }))
        }
        onSizePxChange={(e) =>
          setForm((current) => ({ ...current, [keys.footerSizePx]: e.target.value }))
        }
        onWeightChange={(e) =>
          setForm((current) => ({ ...current, [keys.footerWeight]: e.target.value }))
        }
      />
    </div>
  );
}
