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

/** Pack/display qty for discount approval notification lines. */
export function discountApprovalPackQty(line) {
  const displayQty = Number(line?.display_quantity ?? 0);
  if (Number.isFinite(displayQty) && displayQty > 0) return displayQty;

  const qtyDisp = String(line?.qty_disp ?? "").trim();
  const fromDisp = qtyDisp.match(/^([\d.]+)/);
  if (fromDisp) {
    const parsed = Number(fromDisp[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const qty = Number(line?.quantity ?? 0);
  return qty > 0 ? qty : 1;
}

/** Gross unit price per sold pack — prefers cart-calculated display price. */
export function discountApprovalUnitPrice(line) {
  if (line?.display_unit_price != null && line.display_unit_price !== "") {
    const fromApi = Number(line.display_unit_price);
    if (Number.isFinite(fromApi) && fromApi >= 0) return fromApi;
  }

  const amount = Number(line?.amount ?? 0);
  const discount = Math.max(0, Number(line?.discount_given ?? 0));
  const packQty = discountApprovalPackQty(line);
  if (packQty > 0 && (amount > 0 || discount > 0)) {
    return Math.round(((amount + discount) / packQty) * 100) / 100;
  }

  const stored = Number(line?.unit_price ?? line?.selling_price ?? 0);
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

/** Per-pack discount shown in approval tables (matches cashier input). */
export function discountApprovalDiscountPerUnit(line) {
  if (line?.display_discount_per_unit != null && line.display_discount_per_unit !== "") {
    const fromApi = Number(line.display_discount_per_unit);
    if (Number.isFinite(fromApi) && fromApi >= 0) return fromApi;
  }

  const discount = Math.max(0, Number(line?.discount_given ?? 0));
  const packQty = discountApprovalPackQty(line);
  if (packQty > 0) {
    return Math.round((discount / packQty) * 100) / 100;
  }

  return discount;
}

/** Net line amount for approval tables. */
export function discountApprovalLineAmount(line) {
  if (line?.display_amount != null && line.display_amount !== "") {
    const fromApi = Number(line.display_amount);
    if (Number.isFinite(fromApi)) return fromApi;
  }

  return Number(line?.amount ?? 0);
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
    const packQty = Number(line?.draftQty ?? 0);
    const divisor = packQty > 0 ? packQty : Math.max(Number(line?.quantity ?? 0), 1);
    return {
      ...line,
      draftDiscount: advised,
      discount_given: lineDiscountTotal(advised, divisor),
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
