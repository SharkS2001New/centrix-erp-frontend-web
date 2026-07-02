import { escapeHtml } from "@/lib/sale-document-print-shared";

/** @typedef {"left" | "center" | "right"} FooterLineAlign */
/** @typedef {"sm" | "md" | "lg"} FooterLineSize */

/**
 * @typedef {object} FooterLine
 * @property {string} text
 * @property {FooterLineAlign} [align]
 * @property {boolean} [bold]
 * @property {boolean} [italic]
 * @property {FooterLineSize} [size]
 */

const ALIGNMENTS = new Set(["left", "center", "right"]);
const SIZES = new Set(["sm", "md", "lg"]);

export function linesFromMultilineText(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/u, ""))
    .filter((line) => line.trim());
}

function escapeFooterLineHtml(text) {
  return escapeHtml(String(text ?? "")).replace(/\n/g, "<br>");
}

export { escapeFooterLineHtml };

/** @param {unknown} line */
export function normalizeFooterLine(line) {
  if (typeof line === "string") {
    return { text: String(line), align: "left", bold: false, italic: false, size: "md" };
  }
  if (!line || typeof line !== "object") {
    return { text: "", align: "left", bold: false, italic: false, size: "md" };
  }
  const text = String(line.text ?? "");
  const align = ALIGNMENTS.has(line.align) ? line.align : "left";
  const size = SIZES.has(line.size) ? line.size : "md";
  return {
    text,
    align,
    bold: Boolean(line.bold),
    italic: Boolean(line.italic),
    size,
  };
}

/** Lines with non-empty text — used for print output. */
export function normalizeFooterLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map(normalizeFooterLine)
    .filter((line) => line.text.trim());
}

/** All lines including empty placeholders — used by the admin editor. */
export function normalizeFooterLinesForEditor(lines) {
  return (Array.isArray(lines) ? lines : []).map(normalizeFooterLine);
}

function lineIsPlain(line) {
  return line.align === "left" && !line.bold && !line.italic && line.size === "md";
}

/**
 * Parse stored footer — plain multiline text or JSON array of styled lines.
 * @param {unknown} raw
 * @param {{ includeEmpty?: boolean }} [options]
 * @returns {FooterLine[]}
 */
export function parseFooterLines(raw, { includeEmpty = false } = {}) {
  const text = String(raw ?? "");
  if (!text.trim()) return [];

  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const normalized = normalizeFooterLinesForEditor(parsed);
        return includeEmpty ? normalized : normalized.filter((line) => line.text.trim());
      }
    } catch {
      /* legacy plain text */
    }
  }

  return linesFromMultilineText(text).map((line) => ({
    text: line,
    align: "left",
    bold: false,
    italic: false,
    size: "md",
  }));
}

/**
 * @param {FooterLine[]} lines
 * @param {{ forEditor?: boolean }} [options]
 */
export function serializeFooterLines(lines, { forEditor = false } = {}) {
  const allLines = normalizeFooterLinesForEditor(lines);
  const withContent = allLines.filter((line) => line.text.trim());
  const hasEmptySlots = allLines.some((line) => !line.text.trim());
  const hasStyle = allLines.some((line) => !lineIsPlain(line));

  if (!withContent.length && !forEditor) return "";
  if (!allLines.length) return "";

  // JSON preserves empty placeholder rows and per-line styling for the editor.
  if (forEditor || hasEmptySlots || hasStyle) {
    return JSON.stringify(allLines);
  }

  return withContent.map((line) => line.text).join("\n");
}

function alignStyle(align) {
  if (align === "center") return "text-align:center";
  if (align === "right") return "text-align:right";
  return "text-align:left";
}

function sizeStyle(size) {
  if (size === "sm") return "font-size:0.85em";
  if (size === "lg") return "font-size:1.15em";
  return "";
}

function lineInlineStyle(line) {
  const parts = [alignStyle(line.align)];
  if (line.bold) parts.push("font-weight:700");
  if (line.italic) parts.push("font-style:italic");
  const size = sizeStyle(line.size);
  if (size) parts.push(size);
  return parts.filter(Boolean).join(";");
}

/**
 * Render styled footer lines for print HTML.
 * @param {FooterLine[]} lines
 * @param {{ layout?: "thermal" | "a4" | "block", tag?: "div" | "p" }} [options]
 */
export function buildStyledFooterLinesHtml(lines, { layout = "a4", tag } = {}) {
  const normalized = normalizeFooterLines(lines);
  if (!normalized.length) return "";

  const useTag = tag ?? (layout === "thermal" ? "div" : "p");
  const className = layout === "thermal" ? "footer-text" : "body-footer-line";

  return normalized
    .map((line) => {
      const style = lineInlineStyle(line);
      return `<${useTag} class="${className}" style="${style}">${escapeFooterLineHtml(line.text)}</${useTag}>`;
    })
    .join("");
}

/** Plain text for single-block document edge footers (fallback). */
export function footerLinesToPlainText(lines) {
  return normalizeFooterLines(lines)
    .map((line) => line.text)
    .join("\n");
}

/** Build HTML for a stored footer field (plain or JSON). */
export function documentFooterHtmlFromText(raw, options = {}) {
  const lines = parseFooterLines(raw);
  if (!lines.length) return "";
  return buildStyledFooterLinesHtml(lines, options);
}
