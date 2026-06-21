/** Words that stay lowercase unless they start the label. */
const SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "for",
  "nor",
  "on",
  "at",
  "to",
  "from",
  "by",
  "in",
  "of",
  "as",
]);

/** Tokens that should remain uppercase (or specially cased). */
const SPECIAL_TOKENS = {
  hr: "HR",
  kpi: "KPI",
  kpis: "KPIs",
  vat: "VAT",
  lpo: "LPO",
  kra: "KRA",
  pos: "POS",
  uom: "UOM",
  uoms: "UOMs",
  "m-pesa": "M-Pesa",
  mpesa: "M-Pesa",
};

/**
 * Title Case for sidebar / navigation link labels.
 * @param {string | null | undefined} label
 */
export function formatNavLabel(label) {
  if (!label || typeof label !== "string") return label;

  let wordIndex = 0;

  return label.replace(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g, (word) => {
    const lower = word.toLowerCase();
    const special = SPECIAL_TOKENS[lower];
    if (special) {
      wordIndex += 1;
      return special;
    }

    if (wordIndex > 0 && SMALL_WORDS.has(lower)) {
      wordIndex += 1;
      return lower;
    }

    wordIndex += 1;
    if (word === word.toUpperCase() && word.length <= 4) {
      return word;
    }

    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}
