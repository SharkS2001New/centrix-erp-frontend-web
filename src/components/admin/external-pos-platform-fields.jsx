"use client";

import {
  CLASSIC_POS_THEME_TEMPLATES,
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

/** Classic External POS color template picker — editable by organization admins. */
export function ClassicPosThemePicker({
  value,
  onChange,
  description = "Workspace, Find dropdown, held orders, hold/save, payment, and other popups use this palette.",
}) {
  const selectedId = normalizeClassicPosThemeTemplate(value);
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">Classic POS colors</p>
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
              <span className="block text-sm font-semibold text-slate-900">{theme.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                {theme.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * External POS controls for platform org configuration / platform-managed settings.
 * Classic colors are primarily owned by the organization admin in Organization settings.
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

  if (!posEnabled) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Enable the <strong>External POS</strong> application under Applications to configure layout and
        cashier behaviour for <code className="text-xs">/pos</code>.
      </p>
    );
  }

  const showPosCheckout = value?.show_pos_checkout_on_create !== false;
  const layout = value?.external_pos_layout === "classic" ? "classic" : "modern";

  return (
    <div className="space-y-6">
      {showLayout ? (
        <div className="space-y-4">
          <Field label="POS layout">
            <select
              className={inputClass}
              value={layout}
              onChange={(e) => patch({ external_pos_layout: e.target.value })}
            >
              <option value="modern">Modern — current Centrix POS</option>
              <option value="classic">Classic — cart on top, Find window, themeable colors</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Only affects the external POS workspace (/pos). Organization admins choose Classic color
              themes under Administration → Organization settings → External POS.
            </p>
          </Field>

          {showTheme && layout === "classic" ? (
            <ClassicPosThemePicker
              value={value?.classic_pos_theme_template}
              onChange={(id) => patch({ classic_pos_theme_template: id })}
              description="Optional default palette. Organization admins can change this anytime under Organization settings → External POS."
            />
          ) : null}

          {!showTheme && layout === "classic" ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Classic layout is on. The organization admin picks color themes in{" "}
              <strong>Organization settings → External POS</strong>.
            </p>
          ) : null}
        </div>
      ) : null}

      {showBehaviourToggles ? (
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
