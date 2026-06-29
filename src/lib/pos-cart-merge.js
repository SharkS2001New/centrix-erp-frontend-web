export function findMergeableCartLine(
  cartLines,
  productCode,
  computed,
  posSalesConfig,
  sellWholesale,
  excludeLineId = null,
) {
  if (!cartLines?.length || !productCode || !computed) return null;
  const excludedId = excludeLineId != null ? String(excludeLineId) : null;
  const nextRetail = posSalesConfig?.perLineStockRouting
    ? sellWholesale === false
    : Boolean(computed.isRetail);
  const nextUom = String(computed.uomLabel ?? "").trim();

  return (
    cartLines.find((line) => {
      if (excludedId != null && String(line.id) === excludedId) return false;
      if (line.product_code !== productCode) return false;
      const lineRetail = Number(line.on_wholesale_retail) === 1;
      if (lineRetail !== nextRetail) return false;
      const lineUom = String(line.uom ?? "").trim();
      if (lineUom && nextUom && lineUom !== nextUom) return false;
      return true;
    }) ?? null
  );
}

/** True when search query exactly matches a product barcode / SKU (product_code). */
export function isExactProductCodeQuery(query, productCode) {
  const q = String(query ?? "").trim();
  const code = String(productCode ?? "").trim();
  return q.length > 0 && code.length > 0 && q.toLowerCase() === code.toLowerCase();
}

export function cartHasOptimisticLines(cart) {
  return (cart?.lines ?? []).some((line) => Boolean(line?._optimistic));
}

export function cartLineRef(line) {
  return line?.update_code ?? line?.id ?? null;
}

/** SKU / barcode shaped queries skip search debounce. */
export function looksLikeProductCodeQuery(query) {
  const q = String(query ?? "").trim();
  if (q.length < 2) return false;
  return !/\s/.test(q) && /^[A-Za-z0-9#._/-]+$/.test(q);
}

export function normalizeCartResponse(res) {
  if (res?.id && Array.isArray(res.lines)) return res;
  if (res?.cart?.id && Array.isArray(res.cart?.lines)) return res.cart;
  return null;
}

/** Merge a single-line API payload into the current cart (legacy fallback). */
export function applyCartMutationResponse(prevCart, res, { targetLineRef = null } = {}) {
  const normalized = normalizeCartResponse(res);
  if (normalized) return normalized;
  if (!prevCart?.id || !res?.product_code) return prevCart;

  const lines = [...(prevCart.lines ?? [])];
  const ref = cartLineRef(res);
  const idx =
    targetLineRef != null
      ? lines.findIndex((line) => String(cartLineRef(line)) === String(targetLineRef))
      : lines.findIndex((line) => String(cartLineRef(line)) === String(ref));

  if (idx >= 0) {
    lines[idx] = { ...lines[idx], ...res };
  } else {
    lines.push(res);
  }

  return {
    ...prevCart,
    update_no: res.update_no ?? Number(prevCart.update_no ?? 0) + 1,
    lines,
  };
}

export function buildOptimisticCartLine(product, lineBody, finalComputed) {
  const token = `pending-${Date.now()}`;
  return {
    id: token,
    update_code: token,
    product_code: product.product_code,
    product_name: product.product_name,
    unit_price: lineBody.unit_price,
    quantity: lineBody.quantity,
    uom: lineBody.uom,
    product_vat: lineBody.product_vat,
    amount: finalComputed.lineAmount,
    discount_given: lineBody.discount_given ?? 0,
    on_wholesale_retail: lineBody.on_wholesale_retail ?? 0,
    _optimistic: true,
  };
}

export function applyOptimisticCartMutation(prevCart, optimisticLine, { mergeTarget = null, editingRef = null } = {}) {
  if (!prevCart?.id) return prevCart;
  const lines = [...(prevCart.lines ?? [])];

  if (editingRef) {
    const idx = lines.findIndex((line) => String(cartLineRef(line)) === String(editingRef));
    if (idx >= 0) lines[idx] = { ...lines[idx], ...optimisticLine };
    else lines.push(optimisticLine);
  } else if (mergeTarget) {
    const idx = lines.findIndex(
      (line) => String(cartLineRef(line)) === String(cartLineRef(mergeTarget)),
    );
    if (idx >= 0) lines[idx] = { ...lines[idx], ...optimisticLine };
    else lines.push(optimisticLine);
  } else {
    lines.push(optimisticLine);
  }

  return {
    ...prevCart,
    update_no: Number(prevCart.update_no ?? 0) + 1,
    lines,
  };
}

/** Undo one optimistic line mutation — other cart lines are left unchanged. */
export function revertOptimisticCartMutation(
  cartAfterOptimistic,
  { previousLineSnapshot = null, optimisticLine = null } = {},
) {
  if (!cartAfterOptimistic?.id) return cartAfterOptimistic;

  let lines = [...(cartAfterOptimistic.lines ?? [])];

  if (previousLineSnapshot) {
    const ref = cartLineRef(previousLineSnapshot);
    const idx = lines.findIndex((line) => String(cartLineRef(line)) === String(ref));
    if (idx >= 0) {
      lines[idx] = { ...previousLineSnapshot };
    }
  } else {
    const pendingRef = optimisticLine ? cartLineRef(optimisticLine) : null;
    lines = lines.filter((line) => {
      if (line?._optimistic) return false;
      if (pendingRef != null && String(cartLineRef(line)) === String(pendingRef)) return false;
      return true;
    });
  }

  return {
    ...cartAfterOptimistic,
    update_no: Math.max(0, Number(cartAfterOptimistic.update_no ?? 1) - 1),
    lines,
  };
}
