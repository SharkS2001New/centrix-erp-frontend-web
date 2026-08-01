/** Hospitality Backoffice — F&B stock / Hotel POS settings helpers. */

import { emailsListToText, textToList } from "@/lib/ai-settings";

export function hospitalityStockFormFromApi(res = {}) {
  const h = res?.hospitality ?? res ?? {};
  const emailCfg = h.pos_email_reports ?? {};
  return {
    stock_deduct_on_settle: Boolean(h.stock_deduct_on_settle),
    stock_location: h.stock_location === "store" ? "store" : "shop",
    block_settle_if_insufficient: h.block_settle_if_insufficient !== false,
    require_recipe_for_stocked_items: Boolean(h.require_recipe_for_stocked_items),
    pos_email_enabled: Boolean(emailCfg.enabled),
    pos_email_send_hourly: emailCfg.send_hourly !== false,
    pos_email_send_daily: emailCfg.send_daily !== false,
    pos_email_send_on_settle: Boolean(emailCfg.send_on_settle),
    pos_email_daily_at: emailCfg.daily_at || "22:00",
    pos_email_recipients_text: emailsListToText(emailCfg.recipients),
  };
}

export function hospitalityStockPayloadFromForm(form) {
  return {
    stock_deduct_on_settle: Boolean(form.stock_deduct_on_settle),
    stock_location: form.stock_location === "store" ? "store" : "shop",
    block_settle_if_insufficient: Boolean(form.block_settle_if_insufficient),
    require_recipe_for_stocked_items: Boolean(form.require_recipe_for_stocked_items),
    pos_email_reports: {
      enabled: Boolean(form.pos_email_enabled),
      send_hourly: Boolean(form.pos_email_send_hourly),
      send_daily: Boolean(form.pos_email_send_daily),
      send_on_settle: Boolean(form.pos_email_send_on_settle),
      daily_at: form.pos_email_daily_at || "22:00",
      recipients: textToList(form.pos_email_recipients_text),
    },
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
