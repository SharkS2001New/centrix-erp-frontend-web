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
  if (! match) return null;
  return { level: match[1].length, text: match[2] };
}
