import {
  saleLineSoldUnitPrice,
  saleLineDiscountTotalFromEntered,
  saleLineEnteredDiscountPerUnit,
  saleLineEntryQtyForEdit,
  saleLineEntryQtyToBase,
  saleLinePreviewRowAmount,
  saleLinePackQtyForDiscount,
} from "@/lib/sale-line-items";
import {
  computePosLine,
  defaultPosEntryQty,
  lineDiscountTotal,
  productHasRetailTiers,
} from "@/lib/pos-line";

export function lineLabel(line) {
  const code = line?.product_code ?? line?.product?.product_code ?? "";
  const name = line?.product?.product_name ?? line?.description ?? "";
  if (name && code) return `${name} (${code})`;
  return name || code || "Item";
}

export function lineKey(line) {
  return line?.id != null ? `id-${line.id}` : `new-${line.clientKey}`;
}

export function isRetailLine(line) {
  return Number(line?.on_wholesale_retail) === 1;
}

/** Product can be sold at retail only when retail package tiers exist. */
export function productAllowsRetail(productCode, retailMap) {
  if (!productCode) return false;
  return productHasRetailTiers(retailMap[String(productCode)] ?? null);
}

export function indexRetailPackages(rows) {
  const map = {};
  for (const row of rows ?? []) {
    if (row?.product_code) map[row.product_code] = row;
  }
  return map;
}

export function productWithUom(product, uomById) {
  if (!product) return product;
  if (product.uom && typeof product.uom === "object") return product;
  const unit =
    product.unit_id != null && uomById?.get
      ? uomById.get(product.unit_id)
      : (product.unit ?? null);
  return unit ? { ...product, uom: unit } : product;
}

export function snapshotDraft(lines) {
  return lines.map((line) => ({
    key: lineKey(line),
    id: line.id ?? null,
    product_code: String(line.product_code ?? ""),
    draftQty: String(line.draftQty ?? ""),
    draftDiscount: String(line.draftDiscount ?? 0),
    on_wholesale_retail: isRetailLine(line) ? 1 : 0,
  }));
}

export function draftsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.key !== right.key ||
      left.id !== right.id ||
      left.product_code !== right.product_code ||
      left.draftQty !== right.draftQty ||
      left.draftDiscount !== right.draftDiscount ||
      left.on_wholesale_retail !== right.on_wholesale_retail
    ) {
      return false;
    }
  }
  return true;
}

/** @returns {"new" | "edited" | null} */
export function lineChangeKind(line, baselineByKey) {
  if (line?.id == null) return "new";
  const base = baselineByKey?.get(lineKey(line));
  if (!base) return "edited";
  const qty = String(line.draftQty ?? "");
  const discount = String(line.draftDiscount ?? 0);
  const pricing = isRetailLine(line) ? 1 : 0;
  if (
    qty !== String(base.draftQty ?? "") ||
    discount !== String(base.draftDiscount ?? 0) ||
    pricing !== Number(base.on_wholesale_retail ?? 0)
  ) {
    return "edited";
  }
  return null;
}

export function lineChangeRowClass(kind) {
  if (kind === "new") {
    return "border-l-[3px] border-l-emerald-500 bg-emerald-50/90 dark:border-l-emerald-400 dark:bg-emerald-950/35";
  }
  if (kind === "edited") {
    return "border-l-[3px] border-l-amber-500 bg-amber-50/90 dark:border-l-amber-400 dark:bg-amber-950/35";
  }
  return "";
}

export function buildEditLine(line, uomById, retailMap) {
  const editLine = {
    id: line.id,
    clientKey: line.clientKey ?? null,
    product_code: line.product_code,
    product: line.product ? productWithUom(line.product, uomById) : line.product,
    quantity: Number(line.quantity ?? 0),
    selling_price: Number(line.selling_price ?? 0),
    display_unit_price: line.display_unit_price,
    amount: Number(line.amount ?? 0),
    product_vat: Number(line.product_vat ?? 0),
    discount_given: Number(line.discount_given ?? 0),
    uom: line.uom,
    on_wholesale_retail: line.on_wholesale_retail,
  };
  return {
    ...editLine,
    draftDiscount: saleLineEnteredDiscountPerUnit(editLine, uomById, retailMap),
    draftQty: saleLineEntryQtyForEdit(editLine, uomById, retailMap),
  };
}

/**
 * POS-aligned pricing for edit drafts: wholesale/retail tiers, package markups, and route markup.
 */
export function priceDraftLine(
  line,
  uomById,
  retailMap,
  routeMarkupPerUnit,
  { discountEditEnabled = false, cashRound = false } = {},
) {
  const product = productWithUom(
    line.product ?? {
      product_code: line.product_code,
      unit_price: line.selling_price,
      uom: line.uom,
    },
    uomById,
  );
  if (!product?.product_code) {
    return {
      amount: saleLinePreviewRowAmount(line, line.draftQty, uomById, {
        retailByCode: retailMap,
        draftDiscount: line.draftDiscount,
        discountEditEnabled,
      }),
      unitPrice: saleLineSoldUnitPrice(line, uomById, retailMap),
      baseQty: saleLineEntryQtyToBase(line, line.draftQty, uomById, retailMap),
      displayUnitPrice: saleLineSoldUnitPrice(line, uomById, retailMap),
    };
  }

  const retailPackage = retailMap[line.product_code] ?? null;
  const asRetail = isRetailLine(line) && productHasRetailTiers(retailPackage);
  const sellWholesale = !asRetail;
  const entryQty = String(line.draftQty ?? defaultPosEntryQty(product, sellWholesale, retailPackage));

  // Existing saved lines: keep sold economics. Unit price = line total ÷ qty (whole KES).
  // Repricing from today's catalog would show the wrong PRICE vs AMOUNT on Edit Order.
  if (line.id != null) {
    const amount = saleLinePreviewRowAmount(line, line.draftQty, uomById, {
      retailByCode: retailMap,
      draftDiscount: line.draftDiscount,
      discountEditEnabled,
    });
    const packQty = saleLinePackQtyForDiscount(line, uomById, retailMap, line.draftQty);
    let discountTotal = 0;
    if (discountEditEnabled) {
      discountTotal = lineDiscountTotal(Number(line.draftDiscount ?? 0), packQty);
    } else {
      const oldBase = Number(line.quantity ?? 0);
      const newBase = saleLineEntryQtyToBase(line, line.draftQty, uomById, retailMap);
      if (oldBase > 0 && newBase > 0) {
        discountTotal = Math.round((Number(line.discount_given ?? 0) * newBase) / oldBase * 100) / 100;
      } else {
        discountTotal = Math.max(0, Number(line.discount_given ?? 0));
      }
    }
    const gross = amount + discountTotal;
    const unitPrice = packQty > 0 ? Math.round(gross / packQty) : 0;
    return {
      amount,
      unitPrice,
      displayUnitPrice: unitPrice,
      baseQty: saleLineEntryQtyToBase(line, line.draftQty, uomById, retailMap),
      packQty,
      discountTotal,
    };
  }

  const base = computePosLine({
    product,
    entryQty,
    sellWholesale,
    retailPackage,
    discount: 0,
    routeMarkupPerUnit,
    retailLine: asRetail,
    cashRound,
  });

  let discountTotal = 0;
  if (discountEditEnabled) {
    discountTotal = lineDiscountTotal(Number(line.draftDiscount ?? 0), base.packQty);
  } else if (line.id != null) {
    const oldBase = Number(line.quantity ?? 0);
    if (oldBase > 0 && base.baseQty > 0) {
      discountTotal = Math.round((Number(line.discount_given ?? 0) * base.baseQty) / oldBase * 100) / 100;
    }
  }

  const computed =
    discountTotal > 0
      ? computePosLine({
          product,
          entryQty,
          sellWholesale,
          retailPackage,
          discount: discountTotal,
          routeMarkupPerUnit,
          retailLine: asRetail,
          cashRound,
        })
      : base;

  return {
    amount: computed.lineAmount,
    unitPrice: computed.displayUnitPrice,
    displayUnitPrice: computed.displayUnitPrice,
    baseQty: computed.baseQty,
    packQty: computed.packQty,
    discountTotal: computed.discountApplied,
  };
}

export function buildNewDraftLine(
  product,
  uomById,
  retailMap,
  { asRetail = false, routeMarkupPerUnit = 0, cashRound = false, draftQty = null } = {},
) {
  const productResolved = productWithUom(product, uomById);
  const retailPackage = retailMap[product.product_code] ?? null;
  const useRetail = Boolean(asRetail && productHasRetailTiers(retailPackage));
  const sellWholesale = !useRetail;
  const entryQty =
    draftQty != null && String(draftQty).trim() !== ""
      ? String(draftQty)
      : defaultPosEntryQty(productResolved, sellWholesale, retailPackage);
  const computed = computePosLine({
    product: productResolved,
    entryQty,
    sellWholesale,
    retailPackage,
    discount: 0,
    routeMarkupPerUnit,
    retailLine: useRetail,
    cashRound,
  });
  const baseQty =
    Number.isFinite(computed.baseQty) && computed.baseQty > 0 ? computed.baseQty : 1;

  return {
    id: null,
    clientKey: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    product_code: product.product_code,
    product: productResolved,
    quantity: baseQty,
    selling_price: computed.displayUnitPrice,
    display_unit_price: computed.displayUnitPrice,
    amount: computed.lineAmount,
    product_vat: 0,
    discount_given: 0,
    uom: productResolved.uom,
    on_wholesale_retail: useRetail ? 1 : 0,
    draftDiscount: 0,
    draftQty: String(entryQty),
  };
}

/**
 * Replace a draft line with a new product. Saved lines become remove + new draft.
 * @returns {{ lines: array, removedIds: number[], focusKey: string } | { error: string }}
 */
export function swapLineWithProduct({
  lines,
  removedIds = [],
  targetKey,
  product,
  entryQty,
  uomById,
  retailMap,
  asRetail = false,
  routeMarkupPerUnit = 0,
  cashRound = false,
}) {
  if (!product?.product_code) {
    return { error: "Select a replacement product." };
  }
  const index = lines.findIndex((line) => lineKey(line) === targetKey);
  if (index < 0) {
    return { error: "Could not find the line to replace." };
  }
  const target = lines[index];
  if (lines.length <= 1 && target.id != null) {
    // Still allowed: remove saved + add new keeps one line.
  }

  const allowsRetail = productAllowsRetail(product.product_code, retailMap);
  const useRetail = Boolean(asRetail && allowsRetail);
  const nextLine = buildNewDraftLine(product, uomById, retailMap, {
    asRetail: useRetail,
    routeMarkupPerUnit,
    cashRound,
    draftQty: entryQty,
  });

  const nextRemoved = [...removedIds];
  if (target.id != null && !nextRemoved.includes(target.id)) {
    nextRemoved.push(target.id);
  }

  const nextLines = [...lines];
  nextLines[index] = nextLine;

  return {
    lines: nextLines,
    removedIds: nextRemoved,
    focusKey: lineKey(nextLine),
  };
}

/**
 * Build PATCH /sales/orders/{id}/line-quantities body items + meta.
 * @returns {{ items: array, remove_item_ids?: number[], customer_num?: number } | { error: string }}
 */
export function buildLineQuantitiesSaveBody({
  lines,
  removedIds = [],
  customerNum = "",
  baselineCustomerNum = "",
  uomById,
  retailByCode,
  discountEditEnabled = false,
}) {
  if (!lines.length) {
    return { error: "An order must keep at least one line item." };
  }
  const customerDirty = String(customerNum ?? "") !== String(baselineCustomerNum ?? "");
  if (customerDirty && !customerNum) {
    return { error: "Select the correct customer for this order." };
  }

  const items = [];
  for (const line of lines) {
    const entryQty = Number(line.draftQty);
    if (!Number.isFinite(entryQty) || entryQty <= 0) {
      return { error: "Each line needs a quantity greater than zero." };
    }
    const baseQty = saleLineEntryQtyToBase(line, entryQty, uomById, retailByCode);
    if (!Number.isFinite(baseQty) || baseQty <= 0) {
      return { error: "Each line needs a quantity greater than zero." };
    }

    const item =
      line.id != null
        ? { id: line.id, quantity: baseQty }
        : {
            product_code: line.product_code,
            quantity: baseQty,
            on_wholesale_retail:
              isRetailLine(line) && productAllowsRetail(line.product_code, retailByCode),
          };

    if (discountEditEnabled) {
      const perUnit = Number(line.draftDiscount ?? 0);
      if (Number.isFinite(perUnit)) {
        item.discount_given = saleLineDiscountTotalFromEntered(
          perUnit,
          line,
          entryQty,
          uomById,
          retailByCode,
        );
      }
    }
    items.push(item);
  }

  const body = { items };
  if (removedIds.length) body.remove_item_ids = removedIds;
  if (customerDirty && customerNum) {
    body.customer_num = Number(customerNum);
  }
  return body;
}
