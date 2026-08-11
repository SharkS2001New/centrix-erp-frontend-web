import { posLineWholesaleRetailFlag } from "@/lib/pos-line";

export function findMergeableCartLine(
  cartLines,
  productCode,
  computed,
  posSalesConfig,
  sellWholesale,
  excludeLineId = null,
  product = null,
  { combineIdenticalLines = true } = {},
) {
  if (combineIdenticalLines === false) return null;
  if (!cartLines?.length || !productCode || !computed) return null;
  const excludedId = excludeLineId != null ? String(excludeLineId) : null;
  const nextOnWholesaleRetail = posLineWholesaleRetailFlag(
    product,
    sellWholesale,
    computed.isRetail,
    posSalesConfig,
  );
  // Merge by SKU + retail/wholesale flag only. Packaging label mismatches
  // (e.g. "PCS" vs "Piece") used to spawn duplicate rows and a second "entry" feel.
  return (
    cartLines.find((line) => {
      if (excludedId != null && String(line.id) === excludedId) return false;
      if (line.product_code !== productCode) return false;
      const lineOnWholesaleRetail = Number(line.on_wholesale_retail) === 1;
      if (lineOnWholesaleRetail !== nextOnWholesaleRetail) return false;
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
  const code = line?.update_code;
  if (code != null && String(code).trim() !== "") return code;
  if (line?.client_line_id != null && String(line.client_line_id).trim() !== "") {
    return line.client_line_id;
  }
  if (line?.id != null && String(line.id).trim() !== "") return line.id;
  return null;
}

/** True when a cart row matches a replace/swap target (id, update_code, or client_line_id). */
export function cartLineMatchesRef(line, target) {
  if (line == null || target == null || target === "") return false;
  const keys = new Set(
    [target, target?.id, target?.update_code, target?.client_line_id, cartLineRef(target)]
      .filter((v) => v != null && String(v).trim() !== "")
      .map((v) => String(v)),
  );
  if (!keys.size) return false;
  for (const key of [
    line.id,
    line.update_code,
    line.client_line_id,
    cartLineRef(line),
  ]) {
    if (key != null && keys.has(String(key))) return true;
  }
  return false;
}

/** Resolve a cart line index for in-place edit/swap (id or update_code). */
export function findCartLineIndexByRef(lines, editingRef) {
  if (editingRef == null || String(editingRef).trim() === "") return -1;
  const ref = String(editingRef);
  const list = Array.isArray(lines) ? lines : [];
  let idx = list.findIndex((line) => String(cartLineRef(line)) === ref);
  if (idx >= 0) return idx;
  idx = list.findIndex(
    (line) =>
      (line?.id != null && String(line.id) === ref) ||
      (line?.update_code != null &&
        String(line.update_code).trim() !== "" &&
        String(line.update_code) === ref),
  );
  return idx;
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

/**
 * Keep in-flight optimistic lines that the server cart does not yet include
 * (parallel classic adds must not wipe a newer pending row).
 */
export function mergePreservedOptimisticLines(serverLines, prevLines) {
  const lines = Array.isArray(serverLines) ? [...serverLines] : [];
  for (const line of prevLines ?? []) {
    if (!line?._optimistic) continue;
    const already =
      (line?.id != null &&
        !String(line.id).startsWith("pending-") &&
        !String(line.id).startsWith("opt-") &&
        lines.some((row) => String(row.id) === String(line.id))) ||
      lines.some(
        (row) =>
          String(row.product_code) === String(line.product_code) &&
          Number(row.on_wholesale_retail ?? 0) === Number(line.on_wholesale_retail ?? 0),
      ) ||
      lines.some((row) => String(cartLineRef(row)) === String(cartLineRef(line)));
    if (!already) lines.push(line);
  }
  return lines;
}

/** Merge a single-line API payload into the current cart (legacy fallback). */
export function applyCartMutationResponse(prevCart, res, { targetLineRef = null } = {}) {
  const normalized = normalizeCartResponse(res);
  if (normalized) {
    return {
      ...prevCart,
      ...normalized,
      lines: mergePreservedOptimisticLines(normalized.lines, prevCart?.lines),
      // Line mutations used to omit next_order_num → caption became "New Order - —".
      next_order_num: normalized.next_order_num ?? prevCart?.next_order_num ?? null,
    };
  }
  if (!prevCart?.id || !res?.product_code) return prevCart;

  const lines = [...(prevCart.lines ?? [])];
  const ref = cartLineRef(res);
  const idx =
    targetLineRef != null && String(targetLineRef).trim() !== ""
      ? findCartLineIndexByRef(lines, targetLineRef)
      : findCartLineIndexByRef(lines, ref);

  if (idx >= 0) {
    const { _optimistic: _dropOptimistic, ...rest } = lines[idx];
    lines[idx] = { ...rest, ...res };
  } else {
    // Replace matching pending optimistic for this SKU instead of duplicating.
    const pendingIdx = lines.findIndex(
      (line) =>
        line?._optimistic &&
        String(line.product_code) === String(res.product_code) &&
        Number(line.on_wholesale_retail ?? 0) === Number(res.on_wholesale_retail ?? 0),
    );
    if (pendingIdx >= 0) {
      const { _optimistic: _dropOptimistic, ...rest } = lines[pendingIdx];
      lines[pendingIdx] = { ...rest, ...res };
    } else {
      lines.push(res);
    }
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
    display_unit_price: lineBody.display_unit_price,
    quantity: lineBody.quantity,
    uom: lineBody.uom,
    product_vat: lineBody.product_vat,
    amount: finalComputed.lineAmount,
    discount_given: lineBody.discount_given ?? 0,
    on_wholesale_retail: lineBody.on_wholesale_retail ?? 0,
    _optimistic: true,
  };
}

export function applyOptimisticCartMutation(
  prevCart,
  optimisticLine,
  { mergeTarget = null, editingRef = null, editingId = null } = {},
) {
  if (!prevCart?.id) return prevCart;
  const lines = [...(prevCart.lines ?? [])];

  const intendedEdit =
    (editingRef != null && String(editingRef).trim() !== "") || editingId != null;
  if (intendedEdit) {
    let idx =
      editingRef != null && String(editingRef).trim() !== ""
        ? findCartLineIndexByRef(lines, editingRef)
        : -1;
    if (idx < 0 && editingId != null) {
      idx = lines.findIndex((line) => String(line?.id) === String(editingId));
    }
    if (idx >= 0) {
      const existing = lines[idx];
      const preservedCode =
        existing.update_code != null && String(existing.update_code).trim() !== ""
          ? existing.update_code
          : existing.id;
      lines[idx] = {
        ...optimisticLine,
        id: existing.id,
        update_code: preservedCode,
      };
    }
    // Editing must never invent a second row when the target line is missing.
  } else if (mergeTarget) {
    const idx = findCartLineIndexByRef(lines, cartLineRef(mergeTarget));
    if (idx >= 0) {
      const existing = lines[idx];
      const preservedCode =
        existing.update_code != null && String(existing.update_code).trim() !== ""
          ? existing.update_code
          : existing.id;
      lines[idx] = {
        ...optimisticLine,
        id: existing.id,
        update_code: preservedCode,
      };
    } else lines.push(optimisticLine);
  } else {
    lines.push(optimisticLine);
  }

  // Keep server update_no unchanged — optimistic paint is UI-only. Bumping here made
  // PATCH send N+1 while TemporaryCart still had N ("Cart was updated elsewhere"),
  // which broke line edits and item swaps (UI showed the new SKU; server kept the old).
  return {
    ...prevCart,
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
    lines,
  };
}
