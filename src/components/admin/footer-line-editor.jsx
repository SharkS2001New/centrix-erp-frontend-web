"use client";

import { useMemo } from "react";
import {
  normalizeFooterLines,
  parseFooterLines,
  serializeFooterLines,
} from "@/lib/footer-line-format";
import { inputClassName } from "@/components/catalog/catalog-shared";

const ALIGN_OPTIONS = [
  { value: "left", label: "Left", short: "L" },
  { value: "center", label: "Center", short: "C" },
  { value: "right", label: "Right", short: "R" },
];

const SIZE_OPTIONS = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Normal" },
  { value: "lg", label: "Large" },
];

const EMPTY_LINE = { text: "", align: "left", bold: false, italic: false, size: "md" };

function ToolbarButton({ active, onClick, title, children, className = "" }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded border px-2 py-1 text-xs font-medium transition ${
        active
          ? "border-[#185FA5] bg-[#185FA5]/10 text-[#185FA5]"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function previewLineClass(line) {
  const classes = [];
  if (line.bold) classes.push("font-bold");
  if (line.italic) classes.push("italic");
  if (line.size === "sm") classes.push("text-xs");
  else if (line.size === "lg") classes.push("text-base");
  else classes.push("text-sm");
  if (line.align === "center") classes.push("text-center");
  else if (line.align === "right") classes.push("text-right");
  else classes.push("text-left");
  return classes.join(" ");
}

/**
 * Per-line footer editor — alignment, size, bold, and italic per row.
 * Stores plain multiline text or JSON when styling is applied.
 */
export function FooterLineEditor({
  value = "",
  onChange,
  placeholder = "",
  minRows = 2,
  maxRows = 12,
  showPlaceholdersHint = false,
  placeholdersHint = "",
}) {
  const lines = useMemo(() => {
    const parsed = parseFooterLines(value);
    if (parsed.length >= minRows) return parsed;
    const padded = [...parsed];
    while (padded.length < minRows) {
      padded.push({ ...EMPTY_LINE });
    }
    return padded;
  }, [value, minRows]);

  function commit(nextLines) {
    onChange(serializeFooterLines(nextLines));
  }

  function updateLine(index, patch) {
    const next = lines.map((line, i) => (i === index ? { ...line, ...patch } : line));
    commit(next);
  }

  function addLine() {
    if (lines.length >= maxRows) return;
    commit([...lines, { ...EMPTY_LINE }]);
  }

  function removeLine(index) {
    if (lines.length <= 1) {
      commit([{ ...EMPTY_LINE }]);
      return;
    }
    commit(lines.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        {lines.map((line, index) => (
          <div
            key={index}
            className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Line {index + 1}
              </span>
              <div className="flex gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                {ALIGN_OPTIONS.map((opt) => (
                  <ToolbarButton
                    key={opt.value}
                    title={`Align ${opt.label.toLowerCase()}`}
                    active={line.align === opt.value}
                    onClick={() => updateLine(index, { align: opt.value })}
                    className="min-w-[2rem] sm:min-w-[3.25rem]"
                  >
                    <span className="hidden sm:inline">{opt.label}</span>
                    <span className="sm:hidden">{opt.short}</span>
                  </ToolbarButton>
                ))}
              </div>
              <ToolbarButton
                title="Bold"
                active={line.bold}
                onClick={() => updateLine(index, { bold: !line.bold })}
                className="min-w-[2rem] font-bold"
              >
                B
              </ToolbarButton>
              <ToolbarButton
                title="Italic"
                active={line.italic}
                onClick={() => updateLine(index, { italic: !line.italic })}
                className="min-w-[2rem] italic"
              >
                I
              </ToolbarButton>
              <select
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                value={line.size ?? "md"}
                title="Text size"
                onChange={(e) => updateLine(index, { size: e.target.value })}
              >
                {SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Remove line"
                onClick={() => removeLine(index)}
                className="ml-auto rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                Remove
              </button>
            </div>
            <input
              type="text"
              className={inputClassName()}
              value={line.text}
              placeholder={index === 0 ? placeholder : "Footer line text…"}
              onChange={(e) => updateLine(index, { text: e.target.value })}
            />
          </div>
        ))}
      </div>

      {lines.length < maxRows ? (
        <button
          type="button"
          onClick={addLine}
          className="text-xs font-medium text-[#185FA5] hover:underline"
        >
          + Add footer line
        </button>
      ) : null}

      {showPlaceholdersHint && placeholdersHint ? (
        <p className="text-xs text-slate-500">Placeholders: {placeholdersHint}</p>
      ) : null}

      <div className="rounded-md border border-dashed border-slate-200 bg-white px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Preview
        </p>
        <div className="space-y-1 text-slate-800">
          {normalizeFooterLines(lines).length === 0 ? (
            <p className="text-xs text-slate-400">Styled footer lines appear here as you edit…</p>
          ) : (
            normalizeFooterLines(lines).map((line, index) => (
              <p key={index} className={previewLineClass(line)}>
                {line.text}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
