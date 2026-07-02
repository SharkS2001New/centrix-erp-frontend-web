"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { MultilinePrintNotesField } from "@/components/admin/multiline-print-notes-field";

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="theme-heading block text-sm font-medium">{label}</span>
        {description ? <span className="theme-subtext mt-0.5 block text-xs">{description}</span> : null}
      </span>
    </label>
  );
}

/**
 * Loading list print layout — shared by Distribution settings and Printouts.
 */
export function LoadingListPrintSettingsFields({
  form,
  setForm,
  showExtendedFields = true,
  showFontNote = false,
}) {
  return (
    <div className="space-y-3">
      {showFontNote ? (
        <p className="theme-subtext text-xs">
          Font size and family for loading lists are configured under Admin → Printouts → Loading sheets.
        </p>
      ) : null}
      <Toggle
        label="Show quantity column"
        description="Turn off when pickers only need product names (e.g. product labels on shelf)."
        checked={form.loading_sheet_show_qty_column !== false}
        onChange={(v) => setForm((f) => ({ ...f, loading_sheet_show_qty_column: v }))}
      />
      <Toggle
        label="Show price and amount columns"
        description="Includes unit price (R/W) and line totals. Turn off for quantity-only pick lists."
        checked={form.loading_sheet_show_price_columns !== false}
        onChange={(v) => setForm((f) => ({ ...f, loading_sheet_show_price_columns: v }))}
      />
      <Toggle
        label="Show loading sheet total"
        description="Print trip totals below the list: sales amount, trip expenses, profit, and net profit after expenses."
        checked={form.loading_sheet_show_total !== false}
        onChange={(v) => setForm((f) => ({ ...f, loading_sheet_show_total: v }))}
      />
      {showExtendedFields ? (
        <>
          <Toggle
            label="Show prepared / checked signature blocks"
            checked={form.loading_sheet_show_signatures !== false}
            onChange={(v) => setForm((f) => ({ ...f, loading_sheet_show_signatures: v }))}
          />
          <Field label="Default checked by">
            <input
              type="text"
              className={inputClassName()}
              value={form.loading_sheet_default_checked_by ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  loading_sheet_default_checked_by: e.target.value,
                }))
              }
            />
          </Field>
          <MultilinePrintNotesField
            label="Loading list footer lines"
            hint="One line per row below the table."
            value={form.loading_sheet_footer_lines ?? ""}
            onChange={(value) => setForm((f) => ({ ...f, loading_sheet_footer_lines: value }))}
            rows={4}
          />
        </>
      ) : null}
    </div>
  );
}
