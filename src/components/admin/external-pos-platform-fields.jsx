"use client";

import { SearchableSelect } from "@/components/catalog/catalog-shared";
import {
  CLASSIC_POS_COLOR_OVERRIDE_FIELDS,
  CLASSIC_POS_THEME_TEMPLATES,
  classicPosThemeCssVars,
  normalizeClassicPosHexColor,
  normalizeClassicPosThemeColors,
  normalizeClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]";

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 ${
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-slate-300"
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 rounded border-slate-300"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

function ClassicPosColorField({ field, value, fallback, onChange }) {
  const display = normalizeClassicPosHexColor(value) || normalizeClassicPosHexColor(fallback) || "#888888";
  const custom = Boolean(normalizeClassicPosHexColor(value));

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{field.label}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{field.description}</p>
        </div>
        {custom ? (
          <button
            type="button"
            onClick={() => onChange?.("")}
            className="shrink-0 text-[11px] font-medium text-[#185FA5] hover:underline"
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
          className="h-9 w-11 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
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
          className={`${inputClass} font-mono uppercase`}
        />
      </div>
    </div>
  );
}

/** Centrix ERP theme picker — sidebar + buttons org-wide; full palette on Classic POS only. */
export function ClassicPosThemePicker({
  value,
  onChange,
  colors = {},
  onColorsChange,
  description = "In backoffice modules (including Hotel Backoffice), this changes the sidebar background and primary button colors. Classic External POS still uses the full palette (workspace, footer, dialogs). Default is Centrix.",
}) {
  const selectedId = normalizeClassicPosThemeTemplate(value);
  const overrides = normalizeClassicPosThemeColors(colors);
  const baseVars = classicPosThemeCssVars(selectedId);
  const hasCustomColors = Object.keys(overrides).length > 0;

  function patchColor(key, nextValue) {
    const hex = normalizeClassicPosHexColor(nextValue);
    const next = { ...overrides };
    if (hex) next[key] = hex;
    else delete next[key];
    onColorsChange?.(normalizeClassicPosThemeColors(next));
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Centrix ERP Themes</p>
        {description ? <p className="mb-3 text-xs text-slate-500">{description}</p> : null}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CLASSIC_POS_THEME_TEMPLATES.map((theme) => {
            const selected = selectedId === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onChange?.(theme.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  selected
                    ? "border-[#185FA5] bg-[#185FA5]/[0.06] ring-2 ring-[#185FA5]/40"
                    : "border-slate-200 bg-white hover:border-slate-300"
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
                <span className="flex items-center gap-2">
                  <span className="block text-sm font-semibold text-slate-900">{theme.label}</span>
                  {theme.id === "centrix" ? (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      Default
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                  {theme.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {typeof onColorsChange === "function" ? (
        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Custom colors</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Optional overrides on top of the selected template. Header tints the ERP sidebar
                (Retail, Distribution, and Hotel Backoffice); button colors apply org-wide; workspace
                and footer apply on Classic External POS only. Leave blank to use the template default.
              </p>
            </div>
            {hasCustomColors ? (
              <button
                type="button"
                onClick={() => onColorsChange?.({})}
                className="text-xs font-medium text-[#185FA5] hover:underline"
              >
                Reset all custom colors
              </button>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {CLASSIC_POS_COLOR_OVERRIDE_FIELDS.map((field) => (
              <ClassicPosColorField
                key={field.key}
                field={field}
                value={overrides[field.key] ?? ""}
                fallback={baseVars[field.cssVar] || baseVars["--classic-header"]}
                onChange={(next) => patchColor(field.key, next)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * External POS / Centrix ERP Themes controls for platform org configuration.
 * Themes apply org-wide; layout and cashier behaviour require External POS.
 */
export function ExternalPosPlatformFields({
  value,
  onChange,
  posEnabled = true,
  showLayout = true,
  showTheme = false,
  showBehaviourToggles = true,
}) {
  function patch(partial) {
    onChange?.({ ...(value ?? {}), ...partial });
  }

  const showPosCheckout = value?.show_pos_checkout_on_create !== false;
  const layout = value?.external_pos_layout === "classic" ? "classic" : "modern";

  return (
    <div className="space-y-6">
      {showTheme ? (
        <ClassicPosThemePicker
          value={value?.classic_pos_theme_template}
          onChange={(id) => patch({ classic_pos_theme_template: id })}
          colors={value?.classic_pos_theme_colors}
          onColorsChange={(next) => patch({ classic_pos_theme_colors: next })}
          description="Backoffice: sidebar + primary buttons only. Classic External POS: full palette. Organization admins can change this anytime under Centrix ERP Themes."
        />
      ) : null}

      {!posEnabled ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Enable the <strong>External POS</strong> application under Applications to configure layout and
          cashier behaviour for <code className="text-xs">/pos</code>.
        </p>
      ) : null}

      {posEnabled && showLayout ? (
        <div className="space-y-4">
          <Field label="POS layout">
            <SearchableSelect
              value={layout}
              onChange={(next) => patch({ external_pos_layout: next })}
              options={[
                { value: "modern", label: "Modern — current Centrix POS" },
                {
                  value: "classic",
                  label: "Classic — cart on top, Find window, themeable colors",
                },
              ]}
            />
            <p className="mt-1 text-xs text-slate-500">
              Only affects the external POS workspace (/pos). Organization sidebar color for the rest of
              the ERP is under Administration → Centrix ERP Themes.
            </p>
          </Field>
        </div>
      ) : null}

      {posEnabled && showBehaviourToggles ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cashier behaviour</p>
          <Toggle
            label="External POS uses checkout"
            description="When on, the external POS workspace (/pos) completes the sale with payment immediately. When off, cashiers use Save order instead."
            checked={showPosCheckout}
            onChange={(v) => patch({ show_pos_checkout_on_create: v })}
          />
          <Toggle
            label="Require operating till float at external POS"
            description="When on, cashiers must open a till session and declare operating float before sales. X/Z reports and end-of-day include float breakdown."
            checked={Boolean(value?.require_pos_till_float)}
            onChange={(v) => patch({ require_pos_till_float: v })}
          />
          <Toggle
            label="Cash rounding on POS and Create order"
            description="When on, external POS (/pos) and Sales → Create order round line and order amounts with last-digit rules (e.g. 105.4 → 106). Applies to Modern and Classic layouts."
            checked={Boolean(value?.enable_pos_cash_rounding)}
            onChange={(v) => patch({ enable_pos_cash_rounding: v })}
          />
          <Toggle
            label="Show all payment methods on thermal receipt"
            description="When on, all payment method rows (Cash, M-Pesa, Equity, KCB) are printed even when their amount is zero."
            checked={value?.receipt_show_all_payment_methods !== false}
            onChange={(v) => patch({ receipt_show_all_payment_methods: v })}
          />
          <Toggle
            label="Combine identical products on POS cart"
            description="When on (default), adding the same product again increases the existing line and recalculates price for the combined quantity. When off, each add stays as its own line so quantity-based markups (e.g. Sugar 10kg vs Sugar 2kg) are preserved; the receipt still prints one combined line with summed amounts."
            checked={value?.pos_combine_identical_lines !== false}
            onChange={(v) => patch({ pos_combine_identical_lines: v })}
          />
          <Toggle
            label="Allow editing completed POS orders"
            description="When on, cashiers can reload a completed order by number to correct mistakes. Stock is restored, a KRA credit note is issued when the original sale was fiscalized, and checkout creates a new sale."
            checked={Boolean(value?.enable_pos_order_edit)}
            onChange={(v) => patch({ enable_pos_order_edit: v })}
          />
        </div>
      ) : null}
    </div>
  );
}
