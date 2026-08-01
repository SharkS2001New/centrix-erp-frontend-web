"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  SecondaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";
import {
  DEDUCT_MODE_OPTIONS,
  emptyRecipeDraft,
  hospitalityStockFormFromApi,
  hospitalityStockPayloadFromForm,
  recipeDraftFromApi,
  recipePayloadFromDraft,
} from "@/lib/hospitality-settings";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-page-bg)] px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-[var(--theme-text)]">{label}</span>
        {description ? (
          <span className="theme-subtext mt-0.5 block text-xs">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

function ProductSearchField({
  label,
  valueCode,
  valueName,
  onSelect,
  placeholder = "Search product…",
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setOptions([]);
      return undefined;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setBusy(true);
      void apiRequest("/products", {
        searchParams: { q, per_page: 12, status: "active" },
        loading: false,
        reportIssues: false,
      })
        .then((res) => {
          if (cancelled) return;
          const rows = res?.data ?? res?.products ?? (Array.isArray(res) ? res : []);
          setOptions(rows);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  return (
    <Field label={label}>
      {valueCode ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm">
          <span className="font-medium text-[var(--theme-text)]">
            {valueName || valueCode}
          </span>
          <span className="theme-subtext text-xs">{valueCode}</span>
          <button
            type="button"
            className="ml-auto text-xs font-semibold uppercase text-red-600"
            onClick={() => onSelect({ product_code: "", product_name: "" })}
          >
            Clear
          </button>
        </div>
      ) : null}
      <input
        className={inputClassName()}
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => options.length > 0 && setOpen(true)}
      />
      {busy ? <p className="theme-subtext mt-1 text-[11px]">Searching…</p> : null}
      {open && options.length > 0 ? (
        <ul className="mt-1 max-h-48 overflow-auto rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-lg">
          {options.map((p) => (
            <li key={p.product_code}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--theme-hover)]"
                onClick={() => {
                  onSelect({
                    product_code: p.product_code,
                    product_name: p.product_name,
                  });
                  setQuery("");
                  setOpen(false);
                  setOptions([]);
                }}
              >
                <span className="font-medium text-[var(--theme-text)]">{p.product_name}</span>
                <span className="theme-subtext text-xs">{p.product_code}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Field>
  );
}

export function HospitalitySettingsScreen() {
  const { user, capabilities, hasPermission } = useAuth();
  const canEdit = hasPermission?.(P.hospitality.settings.edit) ?? Boolean(user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stockForm, setStockForm] = useState(() => hospitalityStockFormFromApi({}));
  const [setupGuide, setSetupGuide] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [draft, setDraft] = useState(() => emptyRecipeDraft());
  const [editing, setEditing] = useState(false);

  const inventoryEnabled = Boolean(capabilities?.modules?.inventory);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, recipesRes] = await Promise.all([
        apiRequest("/hospitality/settings"),
        apiRequest("/hospitality/recipes"),
      ]);
      setStockForm(hospitalityStockFormFromApi(settingsRes));
      setSetupGuide(settingsRes?.setup_guide ?? null);
      setRecipes(recipesRes?.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not load hospitality settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStockSettings() {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await apiRequest("/hospitality/settings", {
        method: "PATCH",
        body: hospitalityStockPayloadFromForm(stockForm),
      });
      setStockForm(hospitalityStockFormFromApi(res));
      setSetupGuide(res?.setup_guide ?? null);
      notifySuccess("Hospitality settings saved");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  function startNewRecipe() {
    setDraft(emptyRecipeDraft());
    setEditing(true);
  }

  function startEditRecipe(recipe) {
    setDraft(recipeDraftFromApi(recipe));
    setEditing(true);
  }

  async function saveRecipe() {
    if (!canEdit) return;
    const payload = recipePayloadFromDraft(draft);
    if (!payload.menu_product_code) {
      notifyError("Select a menu item product");
      return;
    }
    if (payload.deduct_mode === "recipe" && (!payload.ingredients || payload.ingredients.length < 1)) {
      notifyError("Add at least one ingredient with quantity (base units, e.g. kg)");
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        await apiRequest(`/hospitality/recipes/${draft.id}`, {
          method: "PUT",
          body: payload,
        });
      } else {
        await apiRequest("/hospitality/recipes", {
          method: "POST",
          body: payload,
        });
      }
      notifySuccess("Recipe saved");
      setEditing(false);
      setDraft(emptyRecipeDraft());
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not save recipe");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecipe(recipe) {
    if (!canEdit || !recipe?.id) return;
    if (!window.confirm(`Delete recipe for ${recipe.menu_product_name || recipe.menu_product_code}?`)) {
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/hospitality/recipes/${recipe.id}`, { method: "DELETE" });
      notifySuccess("Recipe deleted");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not delete recipe");
    } finally {
      setSaving(false);
    }
  }

  const steps = setupGuide?.steps ?? [];

  const exampleBlurb = useMemo(
    () => (
      <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Example: 1 bale unga → ugali plates</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed">
          <li>Create product <strong>UNGA</strong> with UOM that converts bale → kg.</li>
          <li>Receive stock (e.g. 1 bale = 48 kg) via Inventory receipts.</li>
          <li>Create menu product <strong>Ugali plate</strong> (sellable on Hotel POS).</li>
          <li>
            Here, add a <strong>Recipe</strong>: Ugali plate → 0.3 kg UNGA (optional waste %).
          </li>
          <li>Enable <strong>Deduct stock when check is settled</strong>.</li>
          <li>Each settled plate deducts 0.3 kg unga from kitchen stock.</li>
        </ol>
      </div>
    ),
    [],
  );

  if (loading) {
    return (
      <CatalogPageShell
        title="Hospitality settings"
        subtitle="Hotel F&B stock balancing and Hotel POS configuration."
      >
        <p className="theme-subtext text-sm">Loading…</p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="Hospitality settings"
      subtitle="Configure restaurant-style stock balancing for Hotel POS. This does not change retail Sales/POS stock rules."
    >
      <div className="space-y-8">
        {exampleBlurb}

        <section id="setup-guide" className="space-y-3">
          <h2 className="theme-heading text-base font-semibold">Setup guide</h2>
          <p className="theme-subtext text-sm">
            Follow these steps so cooked meals and packaged bar items balance correctly when a check is
            settled on Hotel POS.
          </p>
          {!inventoryEnabled ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Inventory module looks off for this organization. Enable it under Applications / Organization
              settings before turning on stock deduct.
            </p>
          ) : null}
          <ul className="space-y-2">
            {steps.map((step, index) => (
              <li
                key={step.id}
                className="flex flex-wrap items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step.done
                      ? "bg-emerald-600 text-white"
                      : "bg-[var(--theme-page-bg)] text-[var(--theme-text)]"
                  }`}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--theme-text)]">{step.title}</p>
                  <p className="theme-subtext mt-1 text-xs leading-relaxed">{step.description}</p>
                  {step.action_href?.startsWith("#") ? (
                    <a
                      href={step.action_href}
                      className="mt-2 inline-block text-xs font-semibold uppercase text-[var(--theme-accent)]"
                    >
                      {step.action_label}
                    </a>
                  ) : step.action_href ? (
                    <Link
                      href={step.action_href}
                      className="mt-2 inline-block text-xs font-semibold uppercase text-[var(--theme-accent)]"
                    >
                      {step.action_label}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {setupGuide?.ready ? (
            <p className="text-sm font-medium text-emerald-700">
              Ready — Hotel POS settle will deduct stock using your recipes.
            </p>
          ) : (
            <p className="theme-subtext text-sm">
              Complete the steps above. Deduct stays off until you enable it, so existing Hotel POS
              behaviour is unchanged.
            </p>
          )}
        </section>

        <section id="stock-balancing" className="space-y-3">
          <h2 className="theme-heading text-base font-semibold">Stock balancing</h2>
          <div className="space-y-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
            <Toggle
              disabled={!canEdit || saving}
              checked={stockForm.stock_deduct_on_settle}
              onChange={(v) => setStockForm((f) => ({ ...f, stock_deduct_on_settle: v }))}
              label="Deduct stock when Hotel POS check is settled"
              description="Restaurant mode: explode recipes into ingredients. Packaged items use Direct mode on the recipe."
            />
            <Field label="Deduct from location">
              <select
                className={inputClassName()}
                disabled={!canEdit || saving}
                value={stockForm.stock_location}
                onChange={(e) => setStockForm((f) => ({ ...f, stock_location: e.target.value }))}
              >
                <option value="shop">Shop / outlet</option>
                <option value="store">Store / kitchen store</option>
              </select>
            </Field>
            <Toggle
              disabled={!canEdit || saving}
              checked={stockForm.block_settle_if_insufficient}
              onChange={(v) => setStockForm((f) => ({ ...f, block_settle_if_insufficient: v }))}
              label="Block settle if stock is insufficient"
              description="When on, Hotel POS cannot settle if ingredients or packaged items would go below zero (unless Allow negative stock is on in Inventory)."
            />
            <Toggle
              disabled={!canEdit || saving}
              checked={stockForm.require_recipe_for_stocked_items}
              onChange={(v) => setStockForm((f) => ({ ...f, require_recipe_for_stocked_items: v }))}
              label="Require a recipe for every sold item"
              description="When on, settle fails if a menu line has no active recipe/direct/none configuration."
            />
            {canEdit ? (
              <div className="pt-2">
                <PrimaryButton
                  showIcon={false}
                  disabled={saving}
                  onClick={() => void saveStockSettings()}
                >
                  {saving ? "Saving…" : "Save stock settings"}
                </PrimaryButton>
              </div>
            ) : null}
          </div>
        </section>

        <section id="pos-email-reports" className="space-y-3">
          <h2 className="theme-heading text-base font-semibold">POS maths email reports</h2>
          <p className="theme-subtext text-sm">
            Send Hotel &amp; Bar receipts and cashier totals to as many email addresses as you need.
            Hourly emails list every receipt sold in that hour plus running day totals per cashier up to
            that hour. Daily emails send the full day rollup. Optional: email each receipt as soon as it
            is settled.
          </p>
          <div className="space-y-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
            <Toggle
              disabled={!canEdit || saving}
              checked={stockForm.pos_email_enabled}
              onChange={(v) => setStockForm((f) => ({ ...f, pos_email_enabled: v }))}
              label="Enable Hotel POS maths emails"
              description="Requires organization email / SMTP to be configured under Notifications."
            />
            <Toggle
              disabled={!canEdit || saving || !stockForm.pos_email_enabled}
              checked={stockForm.pos_email_send_hourly}
              onChange={(v) => setStockForm((f) => ({ ...f, pos_email_send_hourly: v }))}
              label="Send hourly digest"
              description="At the top of each hour: receipts sold in the previous hour + running totals per cashier for the day so far."
            />
            <Toggle
              disabled={!canEdit || saving || !stockForm.pos_email_enabled}
              checked={stockForm.pos_email_send_daily}
              onChange={(v) => setStockForm((f) => ({ ...f, pos_email_send_daily: v }))}
              label="Send daily end-of-day maths"
              description="Full-day receipts and cashier totals at the time below."
            />
            <Field label="Daily email time (24h)">
              <input
                type="time"
                className={inputClassName()}
                disabled={
                  !canEdit ||
                  saving ||
                  !stockForm.pos_email_enabled ||
                  !stockForm.pos_email_send_daily
                }
                value={stockForm.pos_email_daily_at}
                onChange={(e) => setStockForm((f) => ({ ...f, pos_email_daily_at: e.target.value }))}
              />
            </Field>
            <Toggle
              disabled={!canEdit || saving || !stockForm.pos_email_enabled}
              checked={stockForm.pos_email_send_on_settle}
              onChange={(v) => setStockForm((f) => ({ ...f, pos_email_send_on_settle: v }))}
              label="Email each receipt as soon as it is settled"
              description="Sends the receipt lines plus that cashier’s day-to-date totals immediately when a check is paid."
            />
            <Field label="Email recipients (comma or newline separated — add as many as you need)">
              <textarea
                className={`${inputClassName()} min-h-[88px]`}
                disabled={!canEdit || saving || !stockForm.pos_email_enabled}
                placeholder="owner@hotel.com, accounts@hotel.com, manager@hotel.com"
                value={stockForm.pos_email_recipients_text}
                onChange={(e) =>
                  setStockForm((f) => ({ ...f, pos_email_recipients_text: e.target.value }))
                }
              />
              <p className="theme-subtext mt-1 text-xs">
                Up to 50 addresses. Invalid emails are dropped when saving.
              </p>
            </Field>
            {canEdit ? (
              <div className="pt-2">
                <PrimaryButton
                  showIcon={false}
                  disabled={saving}
                  onClick={() => void saveStockSettings()}
                >
                  {saving ? "Saving…" : "Save email report settings"}
                </PrimaryButton>
              </div>
            ) : null}
          </div>
        </section>

        <section id="recipes" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="theme-heading text-base font-semibold">Recipes & deduct modes</h2>
            {canEdit ? (
              <SecondaryButton disabled={saving || editing} onClick={startNewRecipe}>
                Add recipe
              </SecondaryButton>
            ) : null}
          </div>
          <p className="theme-subtext text-sm">
            Link each Hotel POS sellable to how stock should move. Cooked food = Recipe. Bottled beer =
            Direct.
          </p>

          {editing ? (
            <div className="space-y-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
              <ProductSearchField
                label="Menu item (sold on Hotel POS)"
                valueCode={draft.menu_product_code}
                valueName={draft.menu_product_name}
                onSelect={(p) =>
                  setDraft((d) => ({
                    ...d,
                    menu_product_code: p.product_code,
                    menu_product_name: p.product_name,
                  }))
                }
                placeholder="Search ugali, soda, …"
              />
              <Field label="Deduct mode">
                <select
                  className={inputClassName()}
                  value={draft.deduct_mode}
                  onChange={(e) => setDraft((d) => ({ ...d, deduct_mode: e.target.value }))}
                >
                  {DEDUCT_MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="theme-subtext mt-1 text-xs">
                  {DEDUCT_MODE_OPTIONS.find((o) => o.value === draft.deduct_mode)?.hint}
                </p>
              </Field>
              <Toggle
                checked={draft.is_active}
                onChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
                label="Active"
                description="Inactive recipes are ignored on settle."
              />

              {draft.deduct_mode === "recipe" ? (
                <div className="space-y-3 border-t border-[var(--theme-border)] pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-text)]">
                    Ingredients (base stock units)
                  </p>
                  {draft.ingredients.map((ing, idx) => (
                    <div
                      key={`ing-${idx}`}
                      className="grid gap-2 rounded-lg border border-[var(--theme-border)] p-3 sm:grid-cols-2"
                    >
                      <div className="sm:col-span-2">
                        <ProductSearchField
                          label={`Ingredient ${idx + 1}`}
                          valueCode={ing.ingredient_product_code}
                          valueName={ing.ingredient_product_name}
                          onSelect={(p) =>
                            setDraft((d) => {
                              const next = [...d.ingredients];
                              next[idx] = {
                                ...next[idx],
                                ingredient_product_code: p.product_code,
                                ingredient_product_name: p.product_name,
                              };
                              return { ...d, ingredients: next };
                            })
                          }
                          placeholder="Search unga, oil, …"
                        />
                      </div>
                      <Field label="Qty per 1 menu unit">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className={inputClassName()}
                          value={ing.quantity}
                          onChange={(e) =>
                            setDraft((d) => {
                              const next = [...d.ingredients];
                              next[idx] = { ...next[idx], quantity: e.target.value };
                              return { ...d, ingredients: next };
                            })
                          }
                          placeholder="0.3"
                        />
                      </Field>
                      <Field label="Waste %">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          className={inputClassName()}
                          value={ing.waste_percent}
                          onChange={(e) =>
                            setDraft((d) => {
                              const next = [...d.ingredients];
                              next[idx] = { ...next[idx], waste_percent: e.target.value };
                              return { ...d, ingredients: next };
                            })
                          }
                        />
                      </Field>
                      {draft.ingredients.length > 1 ? (
                        <button
                          type="button"
                          className="text-left text-xs font-semibold uppercase text-red-600 sm:col-span-2"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              ingredients: d.ingredients.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          Remove ingredient
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <SecondaryButton
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        ingredients: [
                          ...d.ingredients,
                          {
                            ingredient_product_code: "",
                            ingredient_product_name: "",
                            quantity: "",
                            waste_percent: "0",
                          },
                        ],
                      }))
                    }
                  >
                    Add ingredient
                  </SecondaryButton>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-2">
                <PrimaryButton showIcon={false} disabled={saving} onClick={() => void saveRecipe()}>
                  {saving ? "Saving…" : draft.id ? "Update recipe" : "Save recipe"}
                </PrimaryButton>
                <SecondaryButton
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setDraft(emptyRecipeDraft());
                  }}
                >
                  Cancel
                </SecondaryButton>
              </div>
            </div>
          ) : null}

          {recipes.length === 0 && !editing ? (
            <p className="theme-subtext rounded-xl border border-dashed border-[var(--theme-border)] px-4 py-8 text-center text-sm">
              No recipes yet. Add one for each prepared meal or packaged bar item sold on Hotel POS.
            </p>
          ) : (
            <ul className="space-y-2">
              {recipes.map((recipe) => (
                <li
                  key={recipe.id}
                  className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--theme-text)]">
                        {recipe.menu_product_name || recipe.menu_product_code}
                        {!recipe.is_active ? (
                          <span className="ml-2 text-xs font-normal text-amber-700">(inactive)</span>
                        ) : null}
                      </p>
                      <p className="theme-subtext text-xs">
                        {recipe.menu_product_code} ·{" "}
                        {DEDUCT_MODE_OPTIONS.find((o) => o.value === recipe.deduct_mode)?.label ||
                          recipe.deduct_mode}
                      </p>
                      {recipe.deduct_mode === "recipe" && recipe.ingredients?.length ? (
                        <ul className="mt-2 space-y-0.5 text-xs text-[var(--theme-text)]">
                          {recipe.ingredients.map((ing) => (
                            <li key={ing.id || ing.ingredient_product_code}>
                              {ing.effective_quantity ?? ing.quantity}{" "}
                              {ing.ingredient_product_name || ing.ingredient_product_code}
                              {Number(ing.waste_percent) > 0
                                ? ` (incl. ${ing.waste_percent}% waste)`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs font-semibold uppercase text-[var(--theme-accent)]"
                          onClick={() => startEditRecipe(recipe)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold uppercase text-red-600"
                          onClick={() => void deleteRecipe(recipe)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </CatalogPageShell>
  );
}
