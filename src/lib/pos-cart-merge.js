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
      if (line.product_code == null || productCode == null) return false;
      if (String(line.product_code) !== String(productCode)) return false;
      const lineOnWholesaleRetail = Number(line.on_wholesale_retail) === 1;
      if (lineOnWholesaleRetail !== nextOnWholesaleRetail) return false;
      return true;
    }) ?? null
  );
}

/**
 * After F12 flips retail/wholesale on an *existing* line (qty Enter), helpers may
 * still look up the sole opposite-mode row. New adds must NOT use this — bag + kg
 * for the same SKU are intentional separate lines.
 */
export function findModeConvertibleCartLine(
  cartLines,
  productCode,
  nextOnWholesaleRetail,
  { combineIdenticalLines: _combineIdenticalLines = true } = {},
) {
  void _combineIdenticalLines;
  if (!cartLines?.length || !productCode) return null;
  const sameSku = cartLines.filter(
    (line) => String(line.product_code) === String(productCode),
  );
  if (sameSku.length !== 1) return null;
  const line = sameSku[0];
  const lineRetail = Number(line.on_wholesale_retail) === 1;
  const nextRetail = Boolean(nextOnWholesaleRetail);
  if (lineRetail === nextRetail) return null;
  return line;
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
        String(line.update_code) === ref) ||
      (line?.client_line_id != null &&
        String(line.client_line_id).trim() !== "" &&
        String(line.client_line_id) === ref),
  );
  return idx;
}

/**
 * Resolve a cart row for qty/swap even when TemporaryCart remints ids after restore.
 * Prefer id/client_line_id matches; fall back to product_code (+ retail flag / qty).
 */
export function findCartLineForEdit(lines, needle, { preferProductCode = null } = {}) {
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length || needle == null) return null;

  const needleCode =
    preferProductCode ??
    (needle && typeof needle === "object" ? needle.product_code : null);
  const needleRetail =
    needle && typeof needle === "object" ? Number(needle.on_wholesale_retail ?? 0) : null;
  const needleQty =
    needle && typeof needle === "object" ? Number(needle.quantity) : NaN;

  const byRef = list.find((row) => cartLineMatchesRef(row, needle));
  if (byRef) return byRef;

  if (needleCode == null || String(needleCode).trim() === "") return null;

  const byCodeAndRetail = list.filter(
    (row) =>
      String(row.product_code) === String(needleCode) &&
      (needleRetail == null || Number(row.on_wholesale_retail ?? 0) === needleRetail),
  );
  if (byCodeAndRetail.length === 1) return byCodeAndRetail[0];
  if (byCodeAndRetail.length > 1) {
    if (Number.isFinite(needleQty)) {
      const byQty = byCodeAndRetail.find((row) => Number(row.quantity ?? 0) === needleQty);
      if (byQty) return byQty;
    }
    return byCodeAndRetail[0];
  }

  // Retail flag may have drifted after remint — still prefer the SKU being replaced.
  const byCodeOnly = list.filter((row) => String(row.product_code) === String(needleCode));
  if (byCodeOnly.length === 1) return byCodeOnly[0];
  if (byCodeOnly.length > 1) {
    if (Number.isFinite(needleQty)) {
      const byQty = byCodeOnly.find((row) => Number(row.quantity ?? 0) === needleQty);
      if (byQty) return byQty;
    }
    return byCodeOnly[0];
  }

  return null;
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

/** Merge key matches classic POS merge (SKU + retail/wholesale), not UOM label. */
export function cartLineMergeKey(line) {
  return `${line?.product_code ?? ""}|${Number(line?.on_wholesale_retail) ? 1 : 0}`;
}

export function findCartLineIndexByMergeKey(lines, line) {
  if (!line?.product_code) return -1;
  const key = cartLineMergeKey(line);
  return (Array.isArray(lines) ? lines : []).findIndex((row) => cartLineMergeKey(row) === key);
}

/**
 * Collapse duplicate SKU (+ retail/wholesale) rows into one line.
 * System races must never leave two visible rows for the same product mode.
 */
export function collapseCombineableCartLines(lines, { combineIdenticalLines = true } = {}) {
  if (combineIdenticalLines === false) return Array.isArray(lines) ? [...lines] : [];
  if (!Array.isArray(lines) || lines.length < 2) return lines ?? [];
  const byKey = new Map();
  for (const line of lines) {
    if (!line?.product_code) continue;
    const key = cartLineMergeKey(line);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...line });
      continue;
    }
    const nextQty = Number(existing.quantity ?? 0) + Number(line.quantity ?? 0);
    const existingAmount =
      existing.amount != null && Number.isFinite(Number(existing.amount))
        ? Number(existing.amount)
        : Number(existing.quantity ?? 0) * Number(existing.unit_price ?? 0);
    const addAmount =
      line.amount != null && Number.isFinite(Number(line.amount))
        ? Number(line.amount)
        : Number(line.quantity ?? 0) * Number(line.unit_price ?? 0);
    byKey.set(key, {
      ...existing,
      ...line,
      id: existing.id ?? line.id,
      update_code: existing.update_code ?? line.update_code,
      client_line_id: existing.client_line_id ?? line.client_line_id,
      quantity: nextQty,
      unit_price: Number(line.unit_price ?? existing.unit_price ?? 0),
      amount: Math.round((existingAmount + addAmount) * 100) / 100,
      discount_given:
        Number(existing.discount_given ?? 0) + Number(line.discount_given ?? 0),
      _optimistic: Boolean(existing._optimistic || line._optimistic),
    });
  }
  return [...byKey.values()];
}

/**
 * Replace one cart row in place and drop any other row with the same SKU + retail flag.
 * Prevents failed/mistaken swaps from leaving an exact duplicate line.
 */
export function applyInPlaceLineSwap(
  lines,
  { targetLine, nextLine, combineIdenticalLines = true } = {},
) {
  const list = Array.isArray(lines) ? [...lines] : [];
  if (!targetLine || !nextLine || !list.length) {
    return { lines: list, idx: -1 };
  }

  const replaceNeedle = targetLine;
  let idx = list.findIndex((row) => cartLineMatchesRef(row, replaceNeedle));
  if (idx < 0) {
    idx = findCartLineIndexByRef(list, cartLineRef(targetLine));
  }
  if (idx < 0 && targetLine.product_code) {
    idx = list.findIndex(
      (row) =>
        String(row.product_code) === String(targetLine.product_code) &&
        Number(row.on_wholesale_retail ?? 0) ===
          Number(targetLine.on_wholesale_retail ?? 0),
    );
  }
  if (idx < 0) return { lines: list, idx: -1 };

  list[idx] = nextLine;
  const mergeKey = cartLineMergeKey(nextLine);
  const filtered =
    combineIdenticalLines === false
      ? list
      : list.filter((row, i) => {
          if (i === idx) return true;
          // Drop duplicate SKU rows — keep the swapped target row only.
          return cartLineMergeKey(row) !== mergeKey;
        });

  return {
    idx,
    lines: collapseCombineableCartLines(filtered, { combineIdenticalLines }),
  };
}

/** Always collapse duplicate SKU rows on a cart snapshot. */
export function finalizeCartLineList(lines, { combineIdenticalLines = true } = {}) {
  return collapseCombineableCartLines(lines, { combineIdenticalLines });
}

function replaceCartLineInPlace(lines, idx, optimisticLine) {
  const existing = lines[idx];
  const preservedCode =
    existing.update_code != null && String(existing.update_code).trim() !== ""
      ? existing.update_code
      : existing.id;
  lines[idx] = {
    ...optimisticLine,
    id: existing.id,
    update_code: preservedCode,
    client_line_id: existing.client_line_id ?? optimisticLine.client_line_id,
  };
}

/**
 * Keep in-flight optimistic lines that the server cart does not yet include
 * (parallel classic adds must not wipe a newer pending row).
 */
export function mergePreservedOptimisticLines(
  serverLines,
  prevLines,
  { combineIdenticalLines = true, excludedLineRefs = null, excludedProductCodes = null } = {},
) {
  const lines = filterCartLinesExcludedProductCodes(
    filterCartLinesExcludedRefs(serverLines, excludedLineRefs),
    excludedProductCodes,
  );
  const optimisticPrev = (prevLines ?? []).filter((line) => {
    if (!line?._optimistic) return false;
    if (!excludedProductCodes?.size) return true;
    const code = String(line?.product_code ?? "").trim();
    return !code || !excludedProductCodes.has(code);
  });
  if (optimisticPrev.length === 0) {
    return collapseCombineableCartLines(lines, { combineIdenticalLines });
  }

  if (combineIdenticalLines !== false) {
    for (const line of optimisticPrev) {
      const localOptimisticId =
        line?.id == null ||
        String(line.id).startsWith("pending-") ||
        String(line.id).startsWith("opt-");
      const optCode = String(line.product_code ?? "");
      const optMode = Number(line.on_wholesale_retail ?? 0) ? 1 : 0;
      const already =
        (line?.id != null &&
          !String(line.id).startsWith("pending-") &&
          !String(line.id).startsWith("opt-") &&
          lines.some((row) => String(row.id) === String(line.id))) ||
        lines.some(
          (row) =>
            String(row.product_code) === optCode &&
            (Number(row.on_wholesale_retail ?? 0) ? 1 : 0) === optMode,
        ) ||
        // Pending/opt paint after DELETE: server may return the new SKU under a
        // different retail flag — absorb when this SKU was not already confirmed
        // on the cart before the add (avoids Kamande twin after removing Banjab).
        (localOptimisticId &&
          lines.some((row) => {
            if (String(row.product_code) !== optCode) return false;
            if ((Number(row.on_wholesale_retail ?? 0) ? 1 : 0) === optMode) return true;
            const hadSku = (prevLines ?? []).some(
              (prev) =>
                !prev?._optimistic && String(prev.product_code ?? "") === optCode,
            );
            return !hadSku;
          })) ||
        lines.some((row) => String(cartLineRef(row)) === String(cartLineRef(line)));
      if (!already) lines.push(line);
    }
    return collapseCombineableCartLines(lines, { combineIdenticalLines });
  }

  // Combine off: Sugar 2kg + Sugar 10kg are separate lines. Only drop an optimistic
  // row when the server has "absorbed" it (more server rows for that SKU than the
  // non-optimistic rows we already had) — never because the SKU merely exists.
  const confirmedPrev = (prevLines ?? []).filter((line) => !line?._optimistic);
  const serverCountByKey = new Map();
  for (const row of lines) {
    const key = cartLineMergeKey(row);
    if (!key) continue;
    serverCountByKey.set(key, (serverCountByKey.get(key) ?? 0) + 1);
  }
  const confirmedCountByKey = new Map();
  for (const row of confirmedPrev) {
    const key = cartLineMergeKey(row);
    if (!key) continue;
    confirmedCountByKey.set(key, (confirmedCountByKey.get(key) ?? 0) + 1);
  }
  const absorbedRemainingByKey = new Map();
  for (const [key, serverCount] of serverCountByKey) {
    const confirmed = confirmedCountByKey.get(key) ?? 0;
    absorbedRemainingByKey.set(key, Math.max(0, serverCount - confirmed));
  }

  for (const line of optimisticPrev) {
    const sameIdentity =
      (line?.id != null &&
        !String(line.id).startsWith("pending-") &&
        !String(line.id).startsWith("opt-") &&
        lines.some((row) => String(row.id) === String(line.id))) ||
      lines.some((row) => String(cartLineRef(row)) === String(cartLineRef(line)));
    if (sameIdentity) continue;

    const key = cartLineMergeKey(line);
    const remaining = absorbedRemainingByKey.get(key) ?? 0;
    if (remaining > 0) {
      absorbedRemainingByKey.set(key, remaining - 1);
      continue;
    }
    lines.push(line);
  }

  return collapseCombineableCartLines(lines, { combineIdenticalLines });
}

/** Never let a TemporaryCart response rewind the displayed Cash Sales #. */
export function raisePosNextTicketNumber(...candidates) {
  const nums = candidates
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => (v != null && v !== "" ? Number(v) : NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.max(...nums) : null;
}

function lineIdentityKeys(line) {
  return cartLineIdentityKeys(line);
}

/** Stable keys for a cart row (id, update_code, client_line_id, cartLineRef). */
export function cartLineIdentityKeys(line) {
  return [cartLineRef(line), line?.id, line?.update_code, line?.client_line_id]
    .filter((key) => key != null && String(key).trim() !== "")
    .map((key) => String(key));
}

/**
 * Delete exclusion key scoped by product_code so TemporaryCart recycling a
 * CLU-/numeric id onto a *new* SKU does not treat that add as still-deleted.
 */
export function lineDeleteExclusionKey(ref, productCode) {
  const key = String(ref ?? "").trim();
  if (!key) return null;
  const code = String(productCode ?? "").trim();
  return code ? `${key}::${code}` : key;
}

/** True when two cart rows share any id / update_code / client_line_id. */
export function cartLinesShareIdentity(a, b) {
  if (a == null || b == null) return false;
  if (cartLineMatchesRef(a, b) || cartLineMatchesRef(b, a)) return true;
  const keysB = new Set(cartLineIdentityKeys(b));
  return cartLineIdentityKeys(a).some((key) => keysB.has(key));
}

/**
 * After qty Enter / F12 mode flip on a line that was the only row for that SKU,
 * drop accidental copies of the same SKU (edit must never leave a twin).
 */
export function dedupeSkuLinesAfterInPlaceEdit(
  lines,
  { productCode, keepLine, modeFlipped = false, skuLineCountBefore = null } = {},
) {
  const list = Array.isArray(lines) ? lines : [];
  const code = String(productCode ?? keepLine?.product_code ?? "").trim();
  if (!code || !keepLine) return list;

  const skuRows = list.filter((row) => String(row.product_code) === code);
  if (skuRows.length <= 1) return list;

  const onlySkuBefore =
    skuLineCountBefore == null ? modeFlipped : Number(skuLineCountBefore) <= 1;
  if (!onlySkuBefore && !modeFlipped) return list;

  const kept =
    skuRows.find((row) => cartLinesShareIdentity(row, keepLine)) ??
    skuRows.find((row) => cartLineMatchesRef(row, keepLine)) ??
    skuRows[0];

  if (onlySkuBefore) {
    // Sole SKU line was edited (qty or F12) — that SKU must stay a single row.
    return list.filter(
      (row) => String(row.product_code) !== code || cartLinesShareIdentity(row, kept),
    );
  }

  // Mode flip with siblings: drop same-mode twins only (keep intentional bags+kg).
  const keptMode = Number(kept.on_wholesale_retail ?? 0);
  return list.filter((row) => {
    if (String(row.product_code) !== code) return true;
    if (cartLinesShareIdentity(row, kept)) return true;
    return Number(row.on_wholesale_retail ?? 0) !== keptMode;
  });
}

/** Drop server rows the cashier already removed locally (DELETE still in flight). */
export function filterCartLinesExcludedRefs(lines, excludedRefSet) {
  if (!excludedRefSet?.size) return Array.isArray(lines) ? lines : [];
  return (Array.isArray(lines) ? lines : []).filter((line) => {
    const code = String(line?.product_code ?? "").trim();
    const keys = cartLineIdentityKeys(line);
    return !keys.some((key) => {
      // Product-scoped exclusion (preferred): recycled TemporaryCart ids on a new SKU stay.
      if (code && excludedRefSet.has(lineDeleteExclusionKey(key, code))) return true;
      // Legacy bare ref — still honored for older in-session exclusions / tests.
      if (excludedRefSet.has(key)) return true;
      return false;
    });
  });
}

/**
 * Drop TemporaryCart rows for SKUs the cashier already swapped away.
 * Swap paints Sugar in place, but the server may keep Banjab until a later
 * response — without this, the next add resurrects Banjab.
 */
export function filterCartLinesExcludedProductCodes(lines, excludedProductCodes) {
  if (!excludedProductCodes?.size) return Array.isArray(lines) ? lines : [];
  return (Array.isArray(lines) ? lines : []).filter((line) => {
    const code = String(line?.product_code ?? "").trim();
    if (!code) return true;
    return !excludedProductCodes.has(code);
  });
}

/**
 * Do not prune delete exclusions from a single TemporaryCart payload.
 *
 * Out-of-order responses: DELETE lands (line gone) then an older in-flight POST
 * returns the pre-delete cart and would resurrect the row if we cleared the
 * exclusion early. Exclusions are cleared when the till workspace is replaced
 * (new order / clear / failed remove rollback).
 */
function pruneConfirmedLineDeleteRefs(_excludedRefSet, _serverLines) {
  // Intentionally a no-op — see registerPendingLineDeletes in pos-screen.
}

/** Keep swapped-away codes until the server no longer returns that SKU. */
function pruneConfirmedSwappedAwayProductCodes(excludedProductCodes, serverLines) {
  if (!excludedProductCodes?.size) return;
  const stillOnServer = new Set(
    (serverLines ?? [])
      .map((line) => String(line?.product_code ?? "").trim())
      .filter(Boolean),
  );
  for (const code of [...excludedProductCodes]) {
    if (!stillOnServer.has(code)) {
      excludedProductCodes.delete(code);
    }
  }
}

function restorePrevCartLineFields(line, prev) {
  return {
    ...line,
    product_code: prev.product_code,
    product_name: prev.product_name,
    quantity: prev.quantity,
    unit_price: prev.unit_price,
    display_unit_price: prev.display_unit_price,
    amount: prev.amount,
    product_vat: prev.product_vat,
    discount_given: prev.discount_given,
    on_wholesale_retail: prev.on_wholesale_retail,
    uom: prev.uom,
  };
}

/**
 * After a swap PATCH, TemporaryCart may still return the old SKU on the target row
 * (update_no race, merge quirk). Keep the cashier's painted SKU when we already
 * committed the swap locally.
 */
export function preserveClientLineSkuAfterMutation(
  prevCart,
  nextCart,
  {
    targetLineRef = null,
    expectedProductCode = null,
    replacedProductCode = null,
  } = {},
) {
  const expected = String(expectedProductCode ?? "").trim();
  const replaced = String(replacedProductCode ?? "").trim();
  if (!expected || !prevCart?.lines?.length || !nextCart?.lines?.length) {
    return nextCart;
  }
  const ref =
    targetLineRef != null && String(targetLineRef).trim() !== ""
      ? String(targetLineRef)
      : null;
  if (!ref) return nextCart;

  const needle = { id: ref, update_code: ref, client_line_id: ref };
  const prevLine = findCartLineForEdit(prevCart.lines, needle);
  if (!prevLine || String(prevLine.product_code) !== expected) return nextCart;

  const serverLine =
    findCartLineForEdit(nextCart.lines, {
      id: prevLine.id,
      update_code: prevLine.update_code,
      client_line_id: prevLine.client_line_id,
    }) ?? findCartLineForEdit(nextCart.lines, needle);

  let lines = nextCart.lines ?? [];
  if (serverLine && String(serverLine.product_code) !== expected) {
    lines = lines.map((row) => {
      if (!cartLineMatchesRef(row, serverLine)) return row;
      return {
        ...prevLine,
        id: row.id,
        update_code: row.update_code ?? prevLine.update_code,
        client_line_id: row.client_line_id ?? prevLine.client_line_id,
      };
    });
  }
  // TemporaryCart may keep the old SKU as a separate row after a failed swap PATCH.
  if (replaced) {
    lines = lines.filter((row) => String(row?.product_code ?? "") !== replaced);
  }
  if (lines === nextCart.lines) return nextCart;
  return { ...nextCart, lines };
}

/**
 * After a single-line add/PATCH, keep every other cart row as the cashier left it.
 * TemporaryCart returns the full cart; F12 retail/wholesale on one line must not
 * rewrite sibling prices, qty, or on_wholesale_retail flags.
 *
 * @param {object|null} prevCart
 * @param {object|null} nextCart
 * @param {{
 *   targetLineRef?: string|null,
 *   targetProductCode?: string|null,
 *   targetOnWholesaleRetailFlag?: boolean|number|null,
 * }} [opts]
 */
export function preserveUntouchedCartLines(
  prevCart,
  nextCart,
  {
    targetLineRef = null,
    targetProductCode = null,
    targetOnWholesaleRetailFlag = null,
  } = {},
) {
  if (!prevCart?.lines?.length || !nextCart?.lines?.length) return nextCart;

  const prevByKey = new Map();
  for (const row of prevCart.lines) {
    for (const key of lineIdentityKeys(row)) {
      prevByKey.set(key, row);
    }
  }

  const target =
    targetLineRef != null && String(targetLineRef).trim() !== ""
      ? String(targetLineRef)
      : null;
  const targetCode =
    targetProductCode != null && String(targetProductCode).trim() !== ""
      ? String(targetProductCode)
      : null;
  const modeScoped = targetOnWholesaleRetailFlag != null;
  const targetMode = modeScoped
    ? Number(targetOnWholesaleRetailFlag) ? 1 : 0
    : null;

  function isTargetLine(line) {
    if (target) return lineIdentityKeys(line).includes(target);
    if (!targetCode) return false;
    if (String(line?.product_code ?? "") !== targetCode) return false;
    if (!modeScoped) return true;
    return (Number(line?.on_wholesale_retail ?? 0) ? 1 : 0) === targetMode;
  }

  const lines = (nextCart.lines ?? []).map((line) => {
    if (isTargetLine(line)) return line;
    const prev = lineIdentityKeys(line)
      .map((key) => prevByKey.get(key))
      .find(Boolean);
    if (!prev) return line;
    // Scoped add/PATCH: never let TemporaryCart rewrite a non-target sibling
    // (adding Shibe must not flip Kamande qty/mode).
    if (target || targetCode) {
      return restorePrevCartLineFields(line, prev);
    }
    // Unscoped full-cart sync: accept real qty changes from the server, but
    // still restore pricing/mode when qty is unchanged.
    if (
      Math.abs(Number(prev.quantity ?? 0) - Number(line.quantity ?? 0)) > 0.0001
    ) {
      return line;
    }
    return restorePrevCartLineFields(line, prev);
  });
  return { ...nextCart, lines };
}

/** Merge a single-line API payload into the current cart (legacy fallback). */
export function applyCartMutationResponse(
  prevCart,
  res,
  {
    targetLineRef = null,
    extraPosTickets = [],
    combineIdenticalLines = true,
    excludedLineRefs = null,
    excludedProductCodes = null,
  } = {},
) {
  const normalized = normalizeCartResponse(res);
  if (normalized) {
    // Ignore older TemporaryCart snapshots (delete/qty already advanced update_no).
    if (
      prevCart?.id != null &&
      normalized.id != null &&
      String(prevCart.id) === String(normalized.id)
    ) {
      const prevNo = Number(prevCart.update_no);
      const nextNo = Number(normalized.update_no);
      if (
        Number.isFinite(prevNo) &&
        Number.isFinite(nextNo) &&
        prevNo > 0 &&
        nextNo > 0 &&
        nextNo < prevNo
      ) {
        return prevCart;
      }
    }
    const serverLines = filterCartLinesExcludedProductCodes(
      filterCartLinesExcludedRefs(normalized.lines, excludedLineRefs),
      excludedProductCodes,
    );
    pruneConfirmedLineDeleteRefs(excludedLineRefs, normalized.lines);
    pruneConfirmedSwappedAwayProductCodes(excludedProductCodes, normalized.lines);
    const nextPos = raisePosNextTicketNumber(
      normalized.next_pos_order_num,
      prevCart?.next_pos_order_num,
      ...extraPosTickets,
    );
    const merged = {
      ...prevCart,
      ...normalized,
      lines: mergePreservedOptimisticLines(serverLines, prevCart?.lines, {
        combineIdenticalLines,
        excludedLineRefs,
        excludedProductCodes,
      }),
      // Line mutations used to omit next_order_num → caption became "New Order - —".
      next_order_num: normalized.next_order_num ?? prevCart?.next_order_num ?? null,
      next_pos_order_num:
        nextPos ?? normalized.next_pos_order_num ?? prevCart?.next_pos_order_num ?? null,
    };
    // Never let a TemporaryCart response wipe previous-order edit identity mid-session
    // (e.g. after DELETE /lines cleared markers on the server).
    if (prevCart?.held_order_num != null && (normalized.held_order_num == null || normalized.held_order_num === "")) {
      merged.held_order_num = prevCart.held_order_num;
    }
    if (
      prevCart?.superseded_sale_id != null &&
      (normalized.superseded_sale_id == null || normalized.superseded_sale_id === "")
    ) {
      merged.superseded_sale_id = prevCart.superseded_sale_id;
    }
    const preserved = preserveUntouchedCartLines(prevCart, merged, { targetLineRef });
    return {
      ...preserved,
      lines: collapseCombineableCartLines(preserved.lines, { combineIdenticalLines }),
    };
  }
  if (!prevCart?.id || !res?.product_code) return prevCart;

  const lines = [...(prevCart.lines ?? [])];
  const ref = cartLineRef(res);
  let idx =
    targetLineRef != null && String(targetLineRef).trim() !== ""
      ? findCartLineIndexByRef(lines, targetLineRef)
      : findCartLineIndexByRef(lines, ref);

  if (idx < 0 && targetLineRef != null && String(targetLineRef).trim() !== "") {
    // Edit/PATCH target drifted (CLU- vs numeric id) — resolve before appending.
    idx = lines.findIndex((row) => cartLinesShareIdentity(row, { update_code: targetLineRef, id: targetLineRef }));
  }
  if (idx >= 0) {
    const { _optimistic: _dropOptimistic, ...rest } = lines[idx];
    lines[idx] = { ...rest, ...res };
  } else if (combineIdenticalLines !== false) {
    const mergeIdx = findCartLineIndexByMergeKey(lines, res);
    if (mergeIdx >= 0) {
      const { _optimistic: _dropOptimistic, ...rest } = lines[mergeIdx];
      lines[mergeIdx] = { ...rest, ...res };
    } else {
      lines.push(res);
    }
  } else if (targetLineRef != null && String(targetLineRef).trim() !== "") {
    // In-place edit missed the row — never invent a twin when combine is off.
    return prevCart;
  } else {
    lines.push(res);
  }

  return {
    ...prevCart,
    update_no: res.update_no ?? Number(prevCart.update_no ?? 0) + 1,
    lines: collapseCombineableCartLines(lines, { combineIdenticalLines }),
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
  {
    mergeTarget = null,
    editingRef = null,
    editingId = null,
    combineIdenticalLines = true,
  } = {},
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
    if (idx < 0) {
      // Only resolve by the provided edit refs — never by product_code alone
      // (a missing target must not rewrite another row of the same SKU).
      idx = lines.findIndex(
        (line) =>
          cartLineMatchesRef(line, editingRef) ||
          cartLineMatchesRef(line, editingId) ||
          cartLinesShareIdentity(line, {
            id: editingId,
            update_code: editingRef,
            client_line_id: editingRef,
          }),
      );
    }
    if (idx >= 0) {
      replaceCartLineInPlace(lines, idx, optimisticLine);
      // When combine is on, F12 bags↔kg / edit must not leave a twin same-mode row.
      // When off, Sugar 2kg + Sugar 10kg stay as siblings — never drop the other line.
      if (combineIdenticalLines !== false) {
        const mergeKey = cartLineMergeKey(lines[idx]);
        for (let i = lines.length - 1; i >= 0; i -= 1) {
          if (i === idx) continue;
          if (cartLineMergeKey(lines[i]) === mergeKey) {
            lines.splice(i, 1);
            if (i < idx) idx -= 1;
          }
        }
      } else {
        // Still drop exact identity copies (qty/F12 must not leave a cloned row).
        for (let i = lines.length - 1; i >= 0; i -= 1) {
          if (i === idx) continue;
          if (cartLinesShareIdentity(lines[i], lines[idx])) {
            lines.splice(i, 1);
            if (i < idx) idx -= 1;
          }
        }
      }
    }
    // Editing must never invent a second row when the target line is missing.
  } else if (mergeTarget) {
    const idx = findCartLineIndexByRef(lines, cartLineRef(mergeTarget));
    if (idx >= 0) {
      replaceCartLineInPlace(lines, idx, optimisticLine);
    } else if (combineIdenticalLines !== false) {
      const mergeIdx = findCartLineIndexByMergeKey(lines, optimisticLine);
      if (mergeIdx >= 0) replaceCartLineInPlace(lines, mergeIdx, optimisticLine);
      else lines.push(optimisticLine);
    } else {
      lines.push(optimisticLine);
    }
  } else if (combineIdenticalLines !== false) {
    const mergeIdx = findCartLineIndexByMergeKey(lines, optimisticLine);
    if (mergeIdx >= 0) replaceCartLineInPlace(lines, mergeIdx, optimisticLine);
    else lines.push(optimisticLine);
  } else {
    lines.push(optimisticLine);
  }

  // Keep server update_no unchanged — optimistic paint is UI-only. Bumping here made
  // PATCH send N+1 while TemporaryCart still had N ("Cart was updated elsewhere"),
  // which broke line edits and item swaps (UI showed the new SKU; server kept the old).
  return {
    ...prevCart,
    lines: collapseCombineableCartLines(lines, { combineIdenticalLines }),
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
