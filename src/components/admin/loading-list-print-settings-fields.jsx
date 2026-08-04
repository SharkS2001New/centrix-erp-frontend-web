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

const LABELS = {
  loading: {
    fontNote:
      "Font size and family for loading lists are configured under Admin → Printouts → Loading sheets.",
    qtyDescription:
      "Turn off when staff only need product names (e.g. product labels on shelf).",
    priceDescription: "Includes unit price (R/W) and line totals. Turn off for quantity-only lists.",
    totalLabel: "Show loading sheet total",
    totalDescription: "Print the sales total amount below the loading list table.",
    tripExpensesDescription:
      "Print fuel, tolls, and other trip costs on the loading list totals block.",
    tripProfitDescription:
      "Print gross profit and net profit (after expenses) on the loading list.",
    footerLabel: "Loading list footer lines",
  },
  picking: {
    fontNote:
      "Font size and family for picking lists are configured under Admin → Printouts → Picking lists.",
    qtyDescription:
      "Turn off when pickers only need product names (e.g. product labels on shelf).",
    priceDescription: "Includes unit price and line totals. Turn off for quantity-only pick lists.",
    totalLabel: "Show picking list total",
    totalDescription: "Print the order total amount below the picking list table.",
    tripExpensesDescription:
      "Print fuel, tolls, and other trip costs on the list totals block.",
    tripProfitDescription: "Print gross profit and net profit (after expenses) on the list.",
    footerLabel: "Picking list footer lines",
  },
};

/**
 * Loading / picking list print layout — shared by Distribution, Printouts, and Mobile settings.
 * Pass variant="picking" in Mobile application settings (non-Distribution orgs).
 */
export function LoadingListPrintSettingsFields({
  form,
  setForm,
  showExtendedFields = true,
  showFontNote = false,
  showTripFields = true,
  variant = "loading",
}) {
  const copy = LABELS[variant] ?? LABELS.loading;

  return (
    <div className="space-y-3">
      {showFontNote ? <p className="theme-subtext text-xs">{copy.fontNote}</p> : null}
      <Toggle
        label="Show quantity column"
        description={copy.qtyDescription}
        checked={form.loading_sheet_show_qty_column !== false}
        onChange={(v) => setForm((f) => ({ ...f, loading_sheet_show_qty_column: v }))}
      />
      <Toggle
        label="Show price and amount columns"
        description={copy.priceDescription}
        checked={form.loading_sheet_show_price_columns !== false}
        onChange={(v) => setForm((f) => ({ ...f, loading_sheet_show_price_columns: v }))}
      />
      <Toggle
        label={copy.totalLabel}
        description={copy.totalDescription}
        checked={form.loading_sheet_show_total !== false}
        onChange={(v) => setForm((f) => ({ ...f, loading_sheet_show_total: v }))}
      />
      {showTripFields ? (
        <>
          <Toggle
            label="Show trip expenses"
            description={copy.tripExpensesDescription}
            checked={form.loading_sheet_show_trip_expenses !== false}
            onChange={(v) => setForm((f) => ({ ...f, loading_sheet_show_trip_expenses: v }))}
          />
          <Toggle
            label="Show trip profit"
            description={copy.tripProfitDescription}
            checked={form.loading_sheet_show_trip_profit !== false}
            onChange={(v) => setForm((f) => ({ ...f, loading_sheet_show_trip_profit: v }))}
          />
        </>
      ) : null}
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
            label={copy.footerLabel}
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
