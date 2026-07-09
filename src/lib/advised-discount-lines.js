import { lineDiscountTotal } from "@/lib/pos-line";

export function formatAdvisedDiscountKes(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  return `Ksh ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function discountApprovalLinesFromSource(source) {
  const fromTop = source?.discount_approval?.lines;
  if (Array.isArray(fromTop) && fromTop.length > 0) return fromTop;
  const fromPayload = source?.action_request?.payload?.lines;
  return Array.isArray(fromPayload) ? fromPayload : [];
}

export function advisedDiscountLinesFromRejection(rejection) {
  const lines = rejection?.advised_discount_lines;
  return Array.isArray(lines) ? lines : [];
}

export function hasPerLineAdvisedDiscounts(rejection) {
  return (
    rejection?.rejection_guidance_type === "advised_amount" &&
    advisedDiscountLinesFromRejection(rejection).length > 0
  );
}

export function buildAdvisedDiscountMap(advisedLines) {
  const map = new Map();
  for (const line of advisedLines ?? []) {
    const code = String(line?.product_code ?? "").trim();
    if (!code) continue;
    map.set(code, Number(line?.advised_discount ?? 0));
  }
  return map;
}

export function applyAdvisedDiscountsToDraftLines(lines, advisedLines, { getProductCode } = {}) {
  const resolveCode =
    typeof getProductCode === "function"
      ? getProductCode
      : (line) => line?.product_code ?? line?.product?.product_code ?? "";

  const advisedByCode = buildAdvisedDiscountMap(advisedLines);
  if (!advisedByCode.size) return lines;

  return lines.map((line) => {
    const code = String(resolveCode(line) ?? "").trim();
    if (!code || !advisedByCode.has(code)) return line;
    const advised = advisedByCode.get(code);
    const baseQty = Number(line?.quantity ?? 0);
    return {
      ...line,
      draftDiscount: advised,
      discount_given: lineDiscountTotal(advised, baseQty),
    };
  });
}

export function draftLinesMatchAdvisedDiscounts(lines, advisedLines, { getProductCode, getDraftDiscount } = {}) {
  const resolveCode =
    typeof getProductCode === "function"
      ? getProductCode
      : (line) => line?.product_code ?? line?.product?.product_code ?? "";
  const resolveDiscount =
    typeof getDraftDiscount === "function"
      ? getDraftDiscount
      : (line) => Number(line?.draftDiscount ?? line?.discount_given ?? 0);

  const advisedByCode = buildAdvisedDiscountMap(advisedLines);
  if (!advisedByCode.size) return false;

  for (const line of lines) {
    const code = String(resolveCode(line) ?? "").trim();
    const discount = Number(resolveDiscount(line) ?? 0);
    if (!code) continue;
    if (advisedByCode.has(code)) {
      if (Math.abs(discount - advisedByCode.get(code)) > 0.01) return false;
      continue;
    }
    if (discount > 0.01) return false;
  }

  return true;
}
