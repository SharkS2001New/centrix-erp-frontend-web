"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { suggestReportBuilderWithAi } from "@/lib/reports/report-builder-ai-suggest";
import { SECONDARY_BTN_CLASS, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { EntityMentionTextarea } from "@/components/ai/entity-mention-textarea";
import { serializeEntityRefs } from "@/lib/ai/entity-mention-search";
import {
  workspaceBuilderExamplePrompts,
  workspaceBuilderMentionHint,
  workspaceBuilderMentionTypes,
  workspaceBuilderPlaceholder,
} from "@/lib/workspace-reports";

const MAX_WORDS = 150;

function wordCount(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Natural-language report draft — works with keyword matching; uses org AI when connected.
 * Examples, @mentions, and placeholders stay scoped to the active workspace module.
 */
export function ReportBuilderAiSuggest({ workspaceId, onApply, className = "" }) {
  const [instruction, setInstruction] = useState("");
  const [entityRefs, setEntityRefs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [selectedCodes, setSelectedCodes] = useState(() => new Set());
  const [selectedCustomerNums, setSelectedCustomerNums] = useState(() => new Set());
  const [selectedSupplierIds, setSelectedSupplierIds] = useState(() => new Set());
  const words = wordCount(instruction);

  const examplePrompts = useMemo(
    () => workspaceBuilderExamplePrompts(workspaceId),
    [workspaceId],
  );
  const mentionTypes = useMemo(
    () => workspaceBuilderMentionTypes(workspaceId),
    [workspaceId],
  );
  const mentionHint = useMemo(
    () => workspaceBuilderMentionHint(workspaceId),
    [workspaceId],
  );
  const placeholder = useMemo(
    () => workspaceBuilderPlaceholder(workspaceId),
    [workspaceId],
  );

  useEffect(() => {
    setInstruction("");
    setEntityRefs([]);
    setPending(null);
    setSelectedCodes(new Set());
    setSelectedCustomerNums(new Set());
    setSelectedSupplierIds(new Set());
  }, [workspaceId]);

  const productCandidateRows = useMemo(() => {
    const groups = pending?.product_resolution?.queries ?? [];
    return groups.flatMap((group) =>
      (group.matches ?? []).map((match) => ({
        ...match,
        query: group.query,
        autoSelected: Boolean(group.auto_selected),
      })),
    );
  }, [pending]);

  const customerCandidateRows = useMemo(() => {
    const groups = pending?.customer_resolution?.queries ?? [];
    return groups.flatMap((group) =>
      (group.matches ?? []).map((match) => ({
        ...match,
        query: group.query,
        autoSelected: Boolean(group.auto_selected),
      })),
    );
  }, [pending]);

  const supplierCandidateRows = useMemo(() => {
    const groups = pending?.supplier_resolution?.queries ?? [];
    return groups.flatMap((group) =>
      (group.matches ?? []).map((match) => ({
        ...match,
        query: group.query,
        autoSelected: Boolean(group.auto_selected),
      })),
    );
  }, [pending]);

  function toggleInSet(setter, key) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyResult(result) {
    onApply?.(result);
    const filterBits = [];
    if (result?.filters?.from_date) {
      filterBits.push(
        result.filters.from_date === result.filters.to_date
          ? `date ${result.filters.from_date}`
          : `dates ${result.filters.from_date} → ${result.filters.to_date}`,
      );
    }
    if (result?.filters?.product_codes?.length) {
      filterBits.push(`${result.filters.product_codes.length} product(s)`);
    }
    if (result?.filters?.customer_nums?.length) {
      filterBits.push(`${result.filters.customer_nums.length} customer(s)`);
    }
    if (result?.filters?.supplier_ids?.length) {
      filterBits.push(`${result.filters.supplier_ids.length} supplier(s)`);
    }
    notifySuccess(
      `Suggestions applied${filterBits.length ? ` (${filterBits.join(", ")})` : ""} — review then Preview / Save.`,
    );
    setPending(null);
    setSelectedCodes(new Set());
    setSelectedCustomerNums(new Set());
    setSelectedSupplierIds(new Set());
  }

  async function run(extra = {}) {
    const text = instruction.trim();
    if (!text) {
      notifyError("Describe the report you need first.");
      return;
    }
    if (wordCount(text) > MAX_WORDS) {
      notifyError(`Keep the description under ${MAX_WORDS} words.`);
      return;
    }
    setBusy(true);
    try {
      const result = await suggestReportBuilderWithAi({
        instruction: text,
        workspaceId,
        entityRefs: serializeEntityRefs(entityRefs),
        selectedProductCodes: extra.selectedProductCodes,
        selectedCustomerNums: extra.selectedCustomerNums,
        selectedSupplierIds: extra.selectedSupplierIds,
      });
      if (!result?.spec?.columns?.length) {
        notifyError("No matching columns found. Try a clearer description.");
        return;
      }

      if (result.needs_product_selection) {
        const preselected = new Set([
          ...(result.product_resolution?.matched_codes ?? []),
          ...((result.product_resolution?.queries ?? [])
            .filter((g) => g.auto_selected && g.matches?.[0]?.product_code)
            .map((g) => g.matches[0].product_code)),
        ]);
        for (const group of result.product_resolution?.queries ?? []) {
          if (!group.auto_selected && group.matches?.[0]?.product_code) {
            preselected.add(group.matches[0].product_code);
          }
        }
        setPending(result);
        setSelectedCodes(preselected);
        notifySuccess(result.message || "Pick the products that match your request.");
        return;
      }

      if (result.needs_customer_selection) {
        const preselected = new Set([
          ...(result.customer_resolution?.matched_nums ?? []),
          ...((result.customer_resolution?.queries ?? [])
            .filter((g) => g.auto_selected && g.matches?.[0]?.customer_num)
            .map((g) => String(g.matches[0].customer_num))),
        ]);
        for (const group of result.customer_resolution?.queries ?? []) {
          if (!group.auto_selected && group.matches?.[0]?.customer_num) {
            preselected.add(String(group.matches[0].customer_num));
          }
        }
        setPending(result);
        setSelectedCustomerNums(preselected);
        notifySuccess(result.message || "Pick the customers that match your request.");
        return;
      }

      if (result.needs_supplier_selection) {
        const preselected = new Set([
          ...(result.supplier_resolution?.matched_ids ?? []).map(String),
          ...((result.supplier_resolution?.queries ?? [])
            .filter((g) => g.auto_selected && g.matches?.[0]?.id)
            .map((g) => String(g.matches[0].id))),
        ]);
        for (const group of result.supplier_resolution?.queries ?? []) {
          if (!group.auto_selected && group.matches?.[0]?.id) {
            preselected.add(String(group.matches[0].id));
          }
        }
        setPending(result);
        setSelectedSupplierIds(preselected);
        notifySuccess(result.message || "Pick the suppliers that match your request.");
        return;
      }

      if (result.product_resolution?.status === "unmatched") {
        notifyError(result.message || "No products matched those names. Try clearer product names.");
      }

      applyResult(result);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Suggest failed. Try a shorter, clearer description.");
    } finally {
      setBusy(false);
    }
  }

  async function applyWithSelectedProducts() {
    if (selectedCodes.size === 0) {
      notifyError("Select at least one product.");
      return;
    }
    await run({ selectedProductCodes: [...selectedCodes] });
  }

  async function applyWithSelectedCustomers() {
    if (selectedCustomerNums.size === 0) {
      notifyError("Select at least one customer.");
      return;
    }
    await run({ selectedCustomerNums: [...selectedCustomerNums] });
  }

  async function applyWithSelectedSuppliers() {
    if (selectedSupplierIds.size === 0) {
      notifyError("Select at least one supplier.");
      return;
    }
    await run({ selectedSupplierIds: [...selectedSupplierIds].map((id) => Number(id)) });
  }

  return (
    <section
      className={`theme-panel rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 ${className}`}
    >
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Describe the report you need
      </h2>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        Plain English, under {MAX_WORDS} words. {mentionHint} Mention dates (e.g. yesterday) when needed.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {examplePrompts.map((example) => (
          <button
            key={example}
            type="button"
            disabled={busy}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            onClick={() => {
              setInstruction(example);
              setEntityRefs([]);
              setPending(null);
            }}
          >
            {example}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <EntityMentionTextarea
          rows={3}
          value={instruction}
          entityRefs={entityRefs}
          disabled={busy}
          maxLength={1200}
          allowedTypes={mentionTypes}
          placeholder={placeholder}
          hint={mentionHint}
          textareaClassName={`${inputClassName()} resize-y bg-white dark:bg-slate-900`}
          onChange={({ text, entityRefs: nextRefs }) => {
            setInstruction(text);
            setEntityRefs(nextRefs);
            setPending(null);
          }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${words > MAX_WORDS ? "text-red-600" : "text-slate-500"}`}>
          {words}/{MAX_WORDS} words
        </p>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={busy || words === 0 || words > MAX_WORDS}
          onClick={() => void run()}
        >
          {busy ? "Suggesting…" : "Suggest report"}
        </button>
      </div>

      {pending?.needs_product_selection ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Pick products close to your description</p>
          <p className="mt-1 text-xs text-amber-800">
            {pending.message || "Select the products to include, then apply the suggestion."}
          </p>
          {(pending.product_resolution?.unmatched ?? []).length > 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              No catalog match for: {(pending.product_resolution.unmatched ?? []).join(", ")}
            </p>
          ) : null}
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {productCandidateRows.map((row) => (
              <li key={`${row.query}-${row.product_code}`}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-100 bg-white/80 px-2 py-1.5">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedCodes.has(row.product_code)}
                    onChange={() => toggleInSet(setSelectedCodes, row.product_code)}
                    disabled={busy}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{row.product_name}</span>
                    <span className="block text-xs text-slate-500">
                      {row.product_code}
                      {row.query ? ` · matched “${row.query}”` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton type="button" disabled={busy || selectedCodes.size === 0} onClick={() => void applyWithSelectedProducts()}>
              {busy ? "Applying…" : `Apply with ${selectedCodes.size} product(s)`}
            </PrimaryButton>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={busy}
              onClick={() => {
                setPending(null);
                setSelectedCodes(new Set());
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {pending?.needs_customer_selection ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Pick customers close to your description</p>
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {customerCandidateRows.map((row) => (
              <li key={`${row.query}-${row.customer_num}`}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-100 bg-white/80 px-2 py-1.5">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedCustomerNums.has(String(row.customer_num))}
                    onChange={() => toggleInSet(setSelectedCustomerNums, String(row.customer_num))}
                    disabled={busy}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{row.customer_name}</span>
                    <span className="block text-xs text-slate-500">#{row.customer_num}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton
              type="button"
              disabled={busy || selectedCustomerNums.size === 0}
              onClick={() => void applyWithSelectedCustomers()}
            >
              {busy ? "Applying…" : `Apply with ${selectedCustomerNums.size} customer(s)`}
            </PrimaryButton>
            <button type="button" className={SECONDARY_BTN_CLASS} disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {pending?.needs_supplier_selection ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-medium">Pick suppliers close to your description</p>
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {supplierCandidateRows.map((row) => (
              <li key={`${row.query}-${row.id}`}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-100 bg-white/80 px-2 py-1.5">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedSupplierIds.has(String(row.id))}
                    onChange={() => toggleInSet(setSelectedSupplierIds, String(row.id))}
                    disabled={busy}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{row.supplier_name}</span>
                    <span className="block text-xs text-slate-500">ID {row.id}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton
              type="button"
              disabled={busy || selectedSupplierIds.size === 0}
              onClick={() => void applyWithSelectedSuppliers()}
            >
              {busy ? "Applying…" : `Apply with ${selectedSupplierIds.size} supplier(s)`}
            </PrimaryButton>
            <button type="button" className={SECONDARY_BTN_CLASS} disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
