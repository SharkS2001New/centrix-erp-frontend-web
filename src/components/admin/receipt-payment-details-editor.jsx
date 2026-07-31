"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  EMPTY_RECEIPT_PAYMENT_DETAILS,
  MAX_PAYMENT_DETAIL_BLOCKS,
  MAX_PAYMENT_LINES_PER_BLOCK,
  normalizeReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";

const PAYMENT_BLOCK_PRESETS = [
  {
    id: "paybill",
    label: "M-Pesa Paybill",
    blockTitle: "M-Pesa Paybill",
    lines: [
      { label: "M-Pesa Paybill", value: "" },
      { label: "Account no.", value: "" },
    ],
  },
  {
    id: "till",
    label: "Till number",
    blockTitle: "Till number",
    lines: [{ label: "Till no.", value: "" }],
  },
  {
    id: "bank",
    label: "Bank account",
    blockTitle: "Bank account",
    lines: [
      { label: "Bank", value: "" },
      { label: "Account no.", value: "" },
      { label: "Branch", value: "" },
      { label: "Swift code", value: "" },
    ],
  },
];

function updateLine(lines, index, key, value) {
  return lines.map((line, i) => (i === index ? { ...line, [key]: value } : line));
}

function blockIsBlank(block) {
  return !(block?.title || "").trim() && !(block?.lines ?? []).some((line) => line.label || line.value);
}

export function ReceiptPaymentDetailsEditor({
  value,
  onChange,
  idPrefix = "pay",
  description = "Add one or more payment methods (e.g. two different bank accounts). Each method has its own lines — use Add line for Swift code or other fields.",
}) {
  const details = normalizeReceiptPaymentDetails(value ?? EMPTY_RECEIPT_PAYMENT_DETAILS, {
    keepEmptyLines: true,
  });

  function patch(next) {
    onChange(
      normalizeReceiptPaymentDetails({ ...details, ...next }, { keepEmptyLines: true }),
    );
  }

  function updateBlock(blockIndex, patchBlock) {
    const blocks = details.blocks.map((block, i) =>
      i === blockIndex ? { ...block, ...patchBlock } : block,
    );
    patch({ blocks });
  }

  function addBlankBlock() {
    if (details.blocks.length >= MAX_PAYMENT_DETAIL_BLOCKS) return;
    patch({
      blocks: [
        ...details.blocks,
        { title: "", lines: [{ label: "", value: "" }] },
      ],
    });
  }

  function applyPreset(preset) {
    const presetBlock = {
      title: preset.blockTitle || preset.label,
      lines: preset.lines.map((line) => ({ ...line })),
    };

    // Fill a trailing blank block instead of stacking empties.
    const last = details.blocks[details.blocks.length - 1];
    if (details.blocks.length > 0 && blockIsBlank(last)) {
      const blocks = [...details.blocks];
      blocks[blocks.length - 1] = presetBlock;
      patch({ blocks });
      return;
    }

    if (details.blocks.length >= MAX_PAYMENT_DETAIL_BLOCKS) return;
    patch({ blocks: [...details.blocks, presetBlock] });
  }

  function removeBlock(blockIndex) {
    if (details.blocks.length <= 1) {
      patch({ blocks: [{ title: "", lines: [{ label: "", value: "" }] }] });
      return;
    }
    patch({ blocks: details.blocks.filter((_, i) => i !== blockIndex) });
  }

  function addLine(blockIndex) {
    const block = details.blocks[blockIndex];
    if (!block || block.lines.length >= MAX_PAYMENT_LINES_PER_BLOCK) return;
    updateBlock(blockIndex, {
      lines: [...block.lines, { label: "", value: "" }],
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      {description ? <p className="text-xs text-slate-600">{description}</p> : null}
      <Field label="Section title">
        <input
          type="text"
          className={inputClassName()}
          value={details.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Payment details"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Add payment method</span>
        {PAYMENT_BLOCK_PRESETS.map((preset) => (
          <button
            key={`${idPrefix}-preset-${preset.id}`}
            type="button"
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            disabled={details.blocks.length >= MAX_PAYMENT_DETAIL_BLOCKS && !blockIsBlank(details.blocks.at(-1))}
            onClick={() => applyPreset(preset)}
          >
            + {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="text-xs font-medium text-[#185FA5] hover:underline disabled:opacity-40"
          disabled={details.blocks.length >= MAX_PAYMENT_DETAIL_BLOCKS}
          onClick={addBlankBlock}
        >
          Add blank method
        </button>
      </div>

      <div className="space-y-4">
        {details.blocks.map((block, blockIndex) => (
          <div
            key={`${idPrefix}-block-${blockIndex}`}
            className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-[12rem] flex-1">
                <Field label={`Method ${blockIndex + 1} title (optional)`}>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={block.title}
                    onChange={(e) => updateBlock(blockIndex, { title: e.target.value })}
                    placeholder="e.g. Equity Bank / KCB / M-Pesa"
                  />
                </Field>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                disabled={details.blocks.length <= 1 && blockIsBlank(block)}
                onClick={() => removeBlock(blockIndex)}
              >
                Remove method
              </button>
            </div>

            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">Lines</span>
              <button
                type="button"
                className="text-xs font-medium text-[#185FA5] hover:underline disabled:opacity-40"
                disabled={block.lines.length >= MAX_PAYMENT_LINES_PER_BLOCK}
                onClick={() => addLine(blockIndex)}
              >
                Add line
              </button>
            </div>

            <div className="space-y-2">
              {block.lines.map((line, index) => (
                <div
                  key={`${idPrefix}-block-${blockIndex}-line-${index}`}
                  className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <input
                    type="text"
                    className={inputClassName()}
                    value={line.label}
                    onChange={(e) =>
                      updateBlock(blockIndex, {
                        lines: updateLine(block.lines, index, "label", e.target.value),
                      })
                    }
                    placeholder="Label e.g. Swift code"
                  />
                  <input
                    type="text"
                    className={inputClassName()}
                    value={line.value}
                    onChange={(e) =>
                      updateBlock(blockIndex, {
                        lines: updateLine(block.lines, index, "value", e.target.value),
                      })
                    }
                    placeholder="Value"
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    disabled={block.lines.length <= 1}
                    onClick={() =>
                      updateBlock(blockIndex, {
                        lines:
                          block.lines.length <= 1
                            ? [{ label: "", value: "" }]
                            : block.lines.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Field label="Note (optional)">
        <textarea
          className={`${inputClassName()} min-h-[72px]`}
          value={details.note}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder="e.g. Quote your receipt number as the account reference."
        />
      </Field>
    </div>
  );
}
