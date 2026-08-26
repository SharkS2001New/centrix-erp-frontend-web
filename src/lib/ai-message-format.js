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
  // e.g. |---|:---|---:| or short LLM forms like |---|--:|:--:|
  const cells = splitMarkdownTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, "")));
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
  /** @type {Array<{ type: 'line', line: string, index: number } | { type: 'table', headers: string[], rows: string[][], startIndex: number } | { type: 'chart', chart: object, startIndex: number }>} */
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const chart = parseChartFenceAt(lines, i);
    if (chart) {
      if (chart.chart) {
        blocks.push({
          type: "chart",
          chart: chart.chart,
          startIndex: i,
        });
      }
      i = chart.nextIndex;
      continue;
    }
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

/**
 * Optional fenced chart block:
 * ```chart
 * {"type":"bar","title":"Expenses","items":[{"label":"Utilities","value":751435},{"label":"Other","value":380}]}
 * ```
 *
 * Always consumes the fence (even when JSON is broken) so raw ```chart never leaks into the chat.
 * Repairs the common LLM mistake of stuffing many label/value pairs into one object.
 *
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {{ chart: object | null, nextIndex: number } | null}
 */
export function parseChartFenceAt(lines, startIndex) {
  const open = String(lines[startIndex] ?? "").trim();
  const openMatch = open.match(/^```\s*chart\s*$/i);
  if (!openMatch) return null;

  const body = [];
  let i = startIndex + 1;
  let closed = false;
  while (i < lines.length) {
    const line = lines[i];
    if (String(line ?? "").trim() === "```") {
      closed = true;
      break;
    }
    body.push(line);
    i += 1;
  }

  // Unclosed fence: still consume through EOF so backticks are not shown as text.
  const nextIndex = closed ? i + 1 : lines.length;
  const bodyText = body.join("\n").trim();
  if (!bodyText) {
    return { chart: null, nextIndex };
  }

  const chart = coerceChartPayload(bodyText);
  return { chart, nextIndex };
}

/**
 * Build a chart object from fence body text, repairing common LLM JSON mistakes.
 *
 * @param {string} bodyText
 * @returns {object | null}
 */
export function coerceChartPayload(bodyText) {
  const text = String(bodyText ?? "").trim();
  if (!text) return null;

  /** @type {object | null} */
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try wrapping if the model omitted outer braces.
    try {
      parsed = JSON.parse(`{${text.replace(/^\{|\}$/g, "")}}`);
    } catch {
      parsed = null;
    }
  }

  const repairedItems = extractChartItemsFromText(text);
  const typeFromText = text.match(/"type"\s*:\s*"(bar|donut|pie)"/i)?.[1]?.toLowerCase();
  const titleFromText = text.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/i)?.[1]
    ?.replace(/\\"/g, '"');

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const fromParsed = normalizeChartItems(parsed.items ?? parsed.segments);
    const items = repairedItems.length > fromParsed.length ? repairedItems : fromParsed;
    if (items.length < 2) return null;
    return {
      type: String(parsed.type ?? typeFromText ?? "bar").toLowerCase(),
      title: parsed.title != null ? String(parsed.title) : titleFromText,
      items,
    };
  }

  if (repairedItems.length < 2) return null;
  return {
    type: typeFromText ?? "bar",
    title: titleFromText,
    items: repairedItems,
  };
}

/**
 * Pull label/value pairs in order from fence text (survives duplicate JSON keys).
 *
 * @param {string} text
 * @returns {Array<{ label: string, value: number }>}
 */
export function extractChartItemsFromText(text) {
  /** @type {Array<{ label: string, value: number }>} */
  const items = [];
  const re = /"label"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"value"\s*:\s*(-?\d+(?:\.\d+)?)/gi;
  for (const match of String(text ?? "").matchAll(re)) {
    const label = match[1].replace(/\\"/g, '"').trim();
    const value = Number(match[2]);
    if (!label || !Number.isFinite(value) || value < 0) continue;
    items.push({ label, value });
  }
  return items.slice(0, 8);
}

/**
 * @param {unknown} raw
 * @returns {Array<{ label: string, value: number }>}
 */
function normalizeChartItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      label: String(row?.label ?? row?.name ?? "").trim(),
      value: Number(row?.value ?? row?.amount ?? 0),
    }))
    .filter((row) => row.label && Number.isFinite(row.value) && row.value >= 0)
    .slice(0, 8);
}

/**
 * Detect a Category/Label + Amount table suitable for a small chart.
 * Callers should only use this when the user explicitly asked for a chart.
 *
 * @param {{ headers: string[], rows: string[][] }} table
 * @param {{ type?: string } | undefined} options
 * @returns {{ type: string, title?: string, items: Array<{ label: string, value: number }> } | null}
 */
export function chartFromMarkdownTable(table, options = undefined) {
  const headers = (table?.headers ?? []).map((h) => String(h ?? "").trim());
  if (headers.length < 2 || !(table?.rows?.length >= 2)) return null;

  const labelIdx = headers.findIndex((h) =>
    /^(category|categories|product|products|cashier|branch|item|name|label|expense|type)$/i.test(h)
    || /\b(category|product|cashier|branch|name)\b/i.test(h),
  );
  const amountIdx = headers.findIndex((h) =>
    /amount|total|value|sales|kes|cost|expense/i.test(h),
  );
  if (labelIdx < 0 || amountIdx < 0 || labelIdx === amountIdx) return null;

  /** @type {Array<{ label: string, value: number }>} */
  const items = [];
  for (const row of table.rows) {
    const label = String(row[labelIdx] ?? "")
      .replace(/\*\*/g, "")
      .trim();
    if (!label || /^total$/i.test(label)) continue;
    const value = parseAmountCell(row[amountIdx]);
    if (value == null || value < 0) continue;
    items.push({ label, value });
  }

  if (items.length < 2) return null;
  const top = [...items].sort((a, b) => b.value - a.value).slice(0, 8);
  const type = normalizePreferredChartType(options?.type) ?? "bar";
  return { type, items: top };
}

/**
 * True when the user asked for a chart / graph / pie / visualization.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function userAskedForChart(text) {
  const s = String(text ?? "").toLowerCase();
  if (!s.trim()) return false;
  return /\b(chart|charts|graph|graphs|pie|donut|doughnut|histogram|visualization|visuali[sz]e)\b/.test(s)
    || /\b(show|plot|draw)\b.{0,40}\b(as |a |the )?(chart|graph|pie|donut)\b/.test(s);
}

/**
 * Chart type the user named (pie / donut / bar). Null if they only said "chart" or "graph".
 *
 * @param {unknown} text
 * @returns {'bar' | 'donut' | 'pie' | null}
 */
export function preferredChartType(text) {
  const s = String(text ?? "").toLowerCase();
  if (!s.trim()) return null;
  if (/\b(donut|doughnut)\b/.test(s)) return "donut";
  if (/\bpie\b/.test(s)) return "pie";
  if (/\b(bar|histogram|column)\b/.test(s)) return "bar";
  return null;
}

/**
 * @param {unknown} type
 * @returns {'bar' | 'donut' | 'pie' | null}
 */
export function normalizePreferredChartType(type) {
  const t = String(type ?? "").toLowerCase();
  if (t === "bar" || t === "donut" || t === "pie") return t;
  return null;
}

/**
 * @param {unknown} cell
 * @returns {number | null}
 */
export function parseAmountCell(cell) {
  const raw = String(cell ?? "")
    .replace(/kes/gi, "")
    .replace(/,/g, "")
    .replace(/[^\d.\-]/g, "")
    .trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
