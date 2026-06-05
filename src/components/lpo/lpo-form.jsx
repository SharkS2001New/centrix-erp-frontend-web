"use client";

import Link from "next/link";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { LpoOrderItemsSection } from "./lpo-order-items-section";
import { isLpoHeaderComplete } from "./lpo-shared";

const FORM_TABS = [
  { id: "header", label: "LPO Header" },
  { id: "items", label: "Order items" },
];

export function LpoFormShell({ backHref, backLabel, title, subtitle, children }) {
  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="w-full max-w-[1400px]">
        <div className="mb-6">
          <Link href={backHref} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
            {backLabel}
          </Link>
          <h1 className="mt-2 text-xl font-medium text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function LpoFormFields({
  form,
  onChange,
  suppliers = [],
  uomById,
  vatById,
  branchAddress = "",
  readOnlyLines = false,
  activeTab: controlledTab,
  onTabChange,
  cancelHref,
  saving = false,
  onSaveLpo,
  headerError = null,
  onHeaderError,
}) {
  const tab = controlledTab ?? "header";
  const headerComplete = isLpoHeaderComplete(form);
  const lineCount = form.lines?.length ?? 0;

  function setActiveTab(id) {
    if (id === "items" && !headerComplete) {
      onHeaderError?.("Complete the LPO header before adding items.");
      return;
    }
    onHeaderError?.(null);
    onTabChange?.(id);
  }

  function updateField(key, value) {
    onChange({ ...form, [key]: value });
    if (headerError) onHeaderError?.(null);
  }

  function updateLines(lines) {
    onChange({ ...form, lines });
  }

  function goToItems() {
    if (!headerComplete) {
      onHeaderError?.("Select a supplier, valid until date, and confirm delivery address.");
      return;
    }
    onHeaderError?.(null);
    onTabChange?.("items");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 px-4 pt-3">
        {FORM_TABS.map((t) => {
          const locked = t.id === "items" && !headerComplete;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              disabled={locked}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                tab === t.id
                  ? "border border-b-white border-slate-200 bg-white text-[#185FA5]"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
              {t.id === "items" && lineCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-[#E6F1FB] px-1.5 py-0.5 text-[11px] font-semibold text-[#0C447C]">
                  {lineCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="p-6">
        {tab === "header" ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Supplier">
                <select
                  className={inputClassName()}
                  value={form.supplier_id}
                  onChange={(e) => updateField("supplier_id", e.target.value)}
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.supplier_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Valid until">
                <input
                  type="date"
                  className={inputClassName()}
                  value={form.due_date}
                  onChange={(e) => updateField("due_date", e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-slate-500">
                  Last date this purchase order stays valid for pricing or delivery.
                </p>
              </Field>
              <Field label="Deliver at">
                <input
                  className={inputClassName()}
                  value={form.delivery_address}
                  onChange={(e) => updateField("delivery_address", e.target.value)}
                  placeholder="Branch delivery address"
                  required
                />
                {branchAddress ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Prefilled from your branch address. You can edit if needed.
                  </p>
                ) : null}
              </Field>
              <div className="md:col-span-2 border-t border-slate-100 pt-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Optional — for your records
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Your reference number">
                    <input
                      className={inputClassName()}
                      value={form.reference_number}
                      onChange={(e) => updateField("reference_number", e.target.value)}
                      placeholder="e.g. Quote REF-1024 or internal req #"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      A number or code you use to find this order later (not the PO number).
                    </p>
                  </Field>
                  <Field label="When to pay the supplier">
                    <input
                      className={inputClassName()}
                      value={form.terms}
                      onChange={(e) => updateField("terms", e.target.value)}
                      placeholder="e.g. Net 30 days, Pay on delivery"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Payment agreement for this order (for display; actual payments are
                      recorded separately).
                    </p>
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Notes for supplier or warehouse">
                      <textarea
                        className={`${inputClassName()} min-h-[72px]`}
                        value={form.instructions}
                        onChange={(e) => updateField("instructions", e.target.value)}
                        placeholder="e.g. Deliver to loading bay B, call before arrival…"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Extra instructions printed or shared with the supplier — not payment
                        terms.
                      </p>
                    </Field>
                  </div>
                </div>
              </div>
            </div>
            {headerError ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {headerError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <Link
                href={cancelHref}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <button
                type="button"
                onClick={goToItems}
                className="rounded-lg bg-[#185FA5] px-6 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
              >
                Add items →
              </button>
            </div>
          </>
        ) : null}

        {tab === "items" ? (
          <>
            <LpoOrderItemsSection
              lines={form.lines ?? []}
              onChange={updateLines}
              uomById={uomById}
              vatById={vatById}
              readOnly={readOnlyLines}
            />
            {headerError ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {headerError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => onTabChange?.("header")}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                ← Back to LPO header
              </button>
              <Link
                href={cancelHref}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <button
                type="button"
                disabled={saving}
                onClick={onSaveLpo}
                className="rounded-lg bg-[#185FA5] px-6 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save LPO"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
