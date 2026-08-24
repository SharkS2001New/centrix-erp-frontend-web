/** Format Centrix AI reply text before markdown rendering. */
export function latexToPlain(text) {
  if (!text) return "";

  let out = String(text);
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => convertLatexFragment(inner));
  out = out.replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (_, inner) => convertLatexFragment(inner));
  return convertLatexFragment(out);
}

function convertLatexFragment(inner) {
  let out = String(inner ?? "");
  out = out.replace(/\\text\{([^}]+)\}/g, "$1");
  out = out.replace(/\\mathrm\{([^}]+)\}/g, "$1");
  out = out.replace(/\\textbf\{([^}]+)\}/g, "$1");
  out = out
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\div/g, "÷")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈");
  out = out.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 / $2");
  out = out.replace(/[{}]/g, "");
  out = out.replace(/\\left|\\right|\\,|\\;|\\!/g, " ");
  out = out.replace(/\\\\/g, " ");
  out = out.replace(/\\[a-zA-Z]+/g, "");
  return out.replace(/[ \t]+/g, " ").trim();
}

/**
 * @param {string} line
 * @returns {{ level: number, text: string } | null}
 */
export function parseMarkdownHeading(line) {
  const match = String(line ?? "").match(/^\s*(#{1,3})\s+(.+?)\s*$/);
  if (!match) return null;
  return { level: match[1].length, text: match[2] };
}

/**
 * @param {string} line
 * @returns {boolean}
 */
export function isMarkdownTableSeparator(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed.includes("|")) return false;
  // e.g. |---|:---|---:| or ---|---
  const cells = splitMarkdownTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

/**
 * @param {string} line
 * @returns {string[]}
 */
export function splitMarkdownTableRow(line) {
  let raw = String(line ?? "").trim();
  if (!raw.includes("|")) return [];
  if (raw.startsWith("|")) raw = raw.slice(1);
  if (raw.endsWith("|")) raw = raw.slice(0, -1);
  return raw.split("|").map((cell) => cell.trim());
}

/**
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {{ table: { headers: string[], rows: string[][] }, nextIndex: number } | null}
 */
export function parseMarkdownTableAt(lines, startIndex) {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];
  if (!headerLine || !separatorLine) return null;
  if (!headerLine.includes("|") || !isMarkdownTableSeparator(separatorLine)) return null;

  const headers = splitMarkdownTableRow(headerLine);
  if (headers.length === 0) return null;

  /** @type {string[][]} */
  const rows = [];
  let i = startIndex + 2;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || !line.includes("|") || isMarkdownTableSeparator(line)) break;
    const cells = splitMarkdownTableRow(line);
    if (cells.length === 0) break;
    // Pad / trim to header width for stable rendering
    const normalized = headers.map((_, col) => cells[col] ?? "");
    rows.push(normalized);
    i += 1;
  }

  return {
    table: { headers, rows },
    nextIndex: i,
  };
}

/**
 * Split plain AI markdown into render blocks (paragraphs / headings handled per line elsewhere).
 * Returns either line blocks or table blocks so the UI can render real HTML tables.
 *
 * @param {string[]} lines
 * @returns {Array<{ type: 'line', line: string, index: number } | { type: 'table', headers: string[], rows: string[][], startIndex: number }>}
 */
export function splitMarkdownContentBlocks(lines) {
  /** @type {Array<{ type: 'line', line: string, index: number } | { type: 'table', headers: string[], rows: string[][], startIndex: number }>} */
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const parsed = parseMarkdownTableAt(lines, i);
    if (parsed) {
      blocks.push({
        type: "table",
        headers: parsed.table.headers,
        rows: parsed.table.rows,
        startIndex: i,
      });
      i = parsed.nextIndex;
      continue;
    }
    blocks.push({ type: "line", line: lines[i], index: i });
    i += 1;
  }
  return blocks;
}
