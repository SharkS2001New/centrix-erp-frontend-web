/** Hospitality Backoffice — F&B stock / Hotel POS settings helpers. */

export function hospitalityStockFormFromApi(res = {}) {
  const h = res?.hospitality ?? res ?? {};
  return {
    stock_deduct_on_settle: Boolean(h.stock_deduct_on_settle),
    stock_location: h.stock_location === "store" ? "store" : "shop",
    block_settle_if_insufficient: h.block_settle_if_insufficient !== false,
    require_recipe_for_stocked_items: Boolean(h.require_recipe_for_stocked_items),
  };
}

export function hospitalityStockPayloadFromForm(form) {
  return {
    stock_deduct_on_settle: Boolean(form.stock_deduct_on_settle),
    stock_location: form.stock_location === "store" ? "store" : "shop",
    block_settle_if_insufficient: Boolean(form.block_settle_if_insufficient),
    require_recipe_for_stocked_items: Boolean(form.require_recipe_for_stocked_items),
  };
}

export const DEDUCT_MODE_OPTIONS = [
  {
    value: "recipe",
    label: "Recipe (cooked / prepared)",
    hint: "Deduct ingredients — e.g. Ugali plate → kg of unga",
  },
  {
    value: "direct",
    label: "Direct (packaged item)",
    hint: "Deduct the sold product itself — e.g. bottled soda",
  },
  {
    value: "none",
    label: "No stock",
    hint: "Service / non-inventory — no deduction",
  },
];

export function emptyRecipeDraft() {
  return {
    id: null,
    menu_product_code: "",
    menu_product_name: "",
    deduct_mode: "recipe",
    is_active: true,
    notes: "",
    ingredients: [{ ingredient_product_code: "", ingredient_product_name: "", quantity: "", waste_percent: "0" }],
  };
}

export function recipeDraftFromApi(recipe) {
  if (!recipe) return emptyRecipeDraft();
  return {
    id: recipe.id ?? null,
    menu_product_code: recipe.menu_product_code ?? "",
    menu_product_name: recipe.menu_product_name ?? "",
    deduct_mode: recipe.deduct_mode ?? "recipe",
    is_active: recipe.is_active !== false,
    notes: recipe.notes ?? "",
    ingredients:
      Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
        ? recipe.ingredients.map((ing) => ({
            ingredient_product_code: ing.ingredient_product_code ?? "",
            ingredient_product_name: ing.ingredient_product_name ?? "",
            quantity: ing.quantity != null ? String(ing.quantity) : "",
            waste_percent: ing.waste_percent != null ? String(ing.waste_percent) : "0",
          }))
        : [{ ingredient_product_code: "", ingredient_product_name: "", quantity: "", waste_percent: "0" }],
  };
}

export function recipePayloadFromDraft(draft) {
  const payload = {
    menu_product_code: String(draft.menu_product_code ?? "").trim(),
    deduct_mode: draft.deduct_mode || "recipe",
    is_active: Boolean(draft.is_active),
    notes: String(draft.notes ?? "").trim() || null,
  };
  if (payload.deduct_mode === "recipe") {
    payload.ingredients = (draft.ingredients ?? [])
      .map((ing) => ({
        ingredient_product_code: String(ing.ingredient_product_code ?? "").trim(),
        quantity: Number(ing.quantity),
        waste_percent: Number(ing.waste_percent) || 0,
      }))
      .filter((ing) => ing.ingredient_product_code && Number.isFinite(ing.quantity) && ing.quantity > 0);
  }
  return payload;
}
