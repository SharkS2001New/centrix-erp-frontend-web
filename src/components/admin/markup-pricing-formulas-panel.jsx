"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Field, inputClassName, SECONDARY_BTN_CLASS, SearchableSelect } from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { formatSaleKes } from "@/lib/sales";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { useAuth } from "@/contexts/auth-context";
import { fetchRetailPackagesForProductCodes, fetchUomsCached } from "@/lib/reference-data-cache";
import {
  retailMarkupApplications,
  tierForQuantity,
  tiersForRetailPackage,
  tiersWithPriceMode,
} from "@/lib/retail-pricing";
import {
  measureLevelLabel,
  smallPackagingLabel,
  tierPriceModeLabel,
} from "@/lib/uom-packaging";
import {
  DEFAULT_PRICING_FORMULAS,
  PRICING_FORMULA_DESCRIPTIONS,
  PRICING_FORMULA_EXAMPLES,
  PRICING_FORMULA_LABELS,
  PRICING_FORMULA_PLACEHOLDERS,
  PRICING_FORMULA_PRIMARY_TOKENS,
  formatPricingFormulaFriendly,
  normalizePricingFormulas,
  pricingFormulaTokenLabel,
} from "@/lib/pricing-formula";

const FORMULA_KEYS = ["retail_line", "wholesale_line", "route_retail", "route_wholesale"];
const PREVIEW_QTY = 1;

function formatTierQtyRange(tier, uom) {
  const small = smallPackagingLabel(uom);
  const to = tier.max_qty == null ? "∞" : tier.max_qty;
  return `${tier.min_qty}–${to} ${small}`;
}

function resolveActiveTier(tiers, isRetail, qty = PREVIEW_QTY) {
  const applicable = isRetail ? tiers : tiersWithPriceMode(tiers, "wholesale");
  return tierForQuantity(applicable, qty, { extendPastMax: isRetail });
}

function tiersMatch(a, b) {
  if (!a || !b) return false;
  return (
    Number(a.min_qty) === Number(b.min_qty) &&
    (a.max_qty == null ? b.max_qty == null : Number(a.max_qty) === Number(b.max_qty)) &&
    String(a.price_mode ?? "") === String(b.price_mode ?? "")
  );
}

function MarkupPreviewDialog({ open, onClose, preview, isRetail, routeLabel, productUom }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !preview || typeof document === "undefined") return null;

  const tier = preview.tier;
  const allTiers = Array.isArray(preview.tiers) ? preview.tiers : [];
  const formulas = preview.formulas_used ?? {};

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="markup-preview-title"
      onClick={onClose}
    >
      <div
        className="theme-modal max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="markup-preview-title" className="theme-heading text-base font-semibold">
              Markup preview
            </h2>
            <p className="theme-subtext mt-1 text-sm">
              {preview.product_code}
              {preview.product_name ? ` — ${preview.product_name}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="theme-subtext rounded-md px-2 py-1 text-sm hover:bg-slate-100"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!preview.has_retail_package ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This product has no retail package settings.
          </p>
        ) : null}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Quantity</dt>
            <dd className="font-medium tabular-nums">{PREVIEW_QTY} small unit</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Session</dt>
            <dd className="font-medium">{isRetail ? "Retail" : "Wholesale"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">Route</dt>
            <dd className="font-medium">{routeLabel || "No route markup"}</dd>
          </div>
        </dl>

        {tier ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
              Markup used at qty {PREVIEW_QTY}
            </p>
            <p className="mt-1 font-medium text-emerald-950">
              {formatSaleKes(preview.tier_markup)} tier markup
              {preview.markup_apps > 1 ? (
                <span className="font-normal text-emerald-900">
                  {" "}
                  × {preview.markup_apps} applications
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-emerald-900">
              {tierPriceModeLabel(tier.price_mode)} · qty {formatTierQtyRange(tier, productUom)} ·{" "}
              sold as {measureLevelLabel(productUom, tier.measure_level || "small")}
            </p>
          </div>
        ) : preview.has_retail_package ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            No retail tier applies at quantity {PREVIEW_QTY} for this session.
          </p>
        ) : null}

        {allTiers.length > 1 ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Retail package tiers
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Mode</th>
                    <th className="px-3 py-2 font-medium">Qty range</th>
                    <th className="px-3 py-2 font-medium">Measure</th>
                    <th className="px-3 py-2 font-medium">Markup</th>
                  </tr>
                </thead>
                <tbody>
                  {allTiers.map((row, index) => {
                    const active = tiersMatch(row, tier);
                    return (
                      <tr
                        key={`${row.min_qty}-${row.max_qty ?? "inf"}-${index}`}
                        className={active ? "bg-emerald-50/80" : "border-t border-slate-100"}
                      >
                        <td className="px-3 py-2">{tierPriceModeLabel(row.price_mode)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatTierQtyRange(row, productUom)}</td>
                        <td className="px-3 py-2">
                          {measureLevelLabel(productUom, row.measure_level || "small")}
                        </td>
                        <td className="px-3 py-2 font-medium tabular-nums">
                          {formatSaleKes(row.markup_price)}
                          {active ? (
                            <span className="ml-1 text-[10px] font-semibold uppercase text-emerald-700">
                              used
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <dl className="mt-4 grid gap-2 border-t border-slate-200 pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Wholesale total</dt>
            <dd className="font-medium tabular-nums">{formatSaleKes(preview.aggregate_wholesale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Tier markup × applications</dt>
            <dd className="font-medium tabular-nums">
              {formatSaleKes(preview.tier_markup)} × {preview.markup_apps}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Line total (before route)</dt>
            <dd className="font-medium tabular-nums">{formatSaleKes(preview.line_before_route)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Route markup</dt>
            <dd className="font-medium tabular-nums">{formatSaleKes(preview.route_markup)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">Line total</dt>
            <dd className="text-base font-semibold tabular-nums text-slate-900">
              {formatSaleKes(preview.line_total)}
            </dd>
          </div>
        </dl>

        {Object.keys(formulas).length ? (
          <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Formulas applied</p>
            {FORMULA_KEYS.map((key) =>
              formulas[key] ? (
                <div key={key} className="text-xs">
                  <span className="font-medium text-slate-800">{PRICING_FORMULA_LABELS[key]}:</span>{" "}
                  <span className="text-slate-600">{formatPricingFormulaFriendly(formulas[key])}</span>
                </div>
              ) : null,
            )}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SelectedProductMarkupPanel({ retailPackage, productUom, isRetail, loading }) {
  const tiers = useMemo(
    () => tiersForRetailPackage(retailPackage, productUom),
    [retailPackage, productUom],
  );
  const activeTier = useMemo(
    () => (tiers.length ? resolveActiveTier(tiers, isRetail, PREVIEW_QTY) : null),
    [tiers, isRetail],
  );
  const markupApps = useMemo(() => {
    if (!activeTier) return 0;
    if (isRetail) return retailMarkupApplications(PREVIEW_QTY, activeTier, productUom);
    return 1;
  }, [activeTier, isRetail, productUom]);

  if (loading) {
    return <p className="text-xs text-slate-500">Loading retail package…</p>;
  }

  if (!retailPackage) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        No retail package settings for this product.
      </p>
    );
  }

  if (!tiers.length) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Retail package exists but has no pricing tiers configured.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
      {activeTier ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Markup at qty {PREVIEW_QTY} ({isRetail ? "retail" : "wholesale"} session)
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {formatSaleKes(activeTier.markup_price)}
            {markupApps > 1 ? (
              <span className="font-normal text-slate-600"> × {markupApps} applications</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {tierPriceModeLabel(activeTier.price_mode)} tier · {formatTierQtyRange(activeTier, productUom)} ·{" "}
            sold as {measureLevelLabel(productUom, activeTier.measure_level || "small")}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          No {isRetail ? "retail" : "wholesale"} tier applies at quantity {PREVIEW_QTY}.
        </p>
      )}

      {tiers.length > 1 ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            All retail package tiers
          </p>
          <ul className="space-y-1.5">
            {tiers.map((tier, index) => {
              const applicable = isRetail
                ? tiers
                : tiersWithPriceMode(tiers, "wholesale");
              const active = tiersMatch(tier, activeTier);
              const appliesInSession = applicable.some(
                (row) => row.min_qty === tier.min_qty && row.max_qty === tier.max_qty,
              );
              return (
                <li
                  key={`${tier.min_qty}-${tier.max_qty ?? "inf"}-${index}`}
                  className={`rounded-md border px-2.5 py-2 text-xs ${
                    active
                      ? "border-emerald-300 bg-emerald-50/80 text-emerald-950"
                      : appliesInSession
                        ? "border-slate-200 bg-slate-50 text-slate-700"
                        : "border-slate-100 bg-white text-slate-400"
                  }`}
                >
                  <span className="font-medium">{tierPriceModeLabel(tier.price_mode)}</span>
                  {" · "}
                  {formatTierQtyRange(tier, productUom)}
                  {" · "}
                  {measureLevelLabel(productUom, tier.measure_level || "small")}
                  {" · markup "}
                  <span className="font-semibold tabular-nums">{formatSaleKes(tier.markup_price)}</span>
                  {active ? (
                    <span className="ml-1 text-[10px] font-semibold uppercase">used now</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : activeTier ? (
        <p className="text-xs text-slate-500">Single tier configured for this product.</p>
      ) : null}
    </div>
  );
}

function MarkupFormulasHelpDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="markup-formulas-help-title"
      onClick={onClose}
    >
      <div
        className="theme-modal max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="markup-formulas-help-title" className="theme-heading text-base font-semibold">
            How to set up markup formulas
          </h2>
          <button
            type="button"
            className="theme-subtext rounded-md px-2 py-1 text-sm hover:bg-slate-100"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="theme-subtext mt-3 space-y-4 text-sm">
          <p>
            Each formula is a small math expression using named values in square brackets below
            (stored as <code className="rounded bg-slate-100 px-1 text-xs">{"{token}"}</code> in the
            formula box). Use <strong>+</strong>, <strong>−</strong>, <strong>×</strong>,{" "}
            <strong>÷</strong>, and parentheses.
          </p>

          <div>
            <p className="theme-heading font-medium text-slate-900">The four formulas</p>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {FORMULA_KEYS.map((key) => (
                <li key={key}>
                  <span className="font-medium text-slate-800">
                    {PRICING_FORMULA_LABELS[key]}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-600">
                    {PRICING_FORMULA_DESCRIPTIONS[key]}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="theme-heading font-medium text-slate-900">Common building blocks</p>
            <ul className="mt-2 space-y-1.5 text-xs">
              <li>
                <strong>Wholesale total</strong> — wholesale amount for the quantity sold.
              </li>
              <li>
                <strong>Tier markup</strong> — markup from the product&apos;s retail package tier.
              </li>
              <li>
                <strong>Markup applications</strong> — how many times tier markup applies (e.g. half
                bags).
              </li>
              <li>
                <strong>Line total</strong> — line amount after package/tier pricing, before route
                markup.
              </li>
              <li>
                <strong>Route markup</strong> — amount from the selected sales route.
              </li>
              <li>
                <strong>Quantity</strong> — quantity in small units (kg, pcs, …).
              </li>
              <li>
                <strong>Pack quantity</strong> — number of packs/bags sold.
              </li>
            </ul>
          </div>

          <div>
            <p className="theme-heading font-medium text-slate-900">Once vs per qty / pack</p>
            <p className="mt-1 text-xs">
              Add markup once on the whole line, or multiply it by quantity / packs / applications:
            </p>
            <ul className="mt-2 space-y-1.5 font-mono text-[11px] text-slate-700">
              <li>
                Once →{" "}
                <span className="rounded bg-slate-100 px-1">
                  {formatPricingFormulaFriendly("{line_total} + {route_markup}")}
                </span>
              </li>
              <li>
                Per pack →{" "}
                <span className="rounded bg-slate-100 px-1">
                  {formatPricingFormulaFriendly("{line_total} + {route_markup} * {pack_qty}")}
                </span>
              </li>
              <li>
                Per qty →{" "}
                <span className="rounded bg-slate-100 px-1">
                  {formatPricingFormulaFriendly("{line_total} + {route_markup} * {qty}")}
                </span>
              </li>
            </ul>
          </div>

          <div>
            <p className="theme-heading font-medium text-slate-900">Quick setup</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
              <li>Enable “Add route markup prices” under Prices &amp; discounts if you use routes.</li>
              <li>Pick a preset chip under each formula, or click a named value to insert it.</li>
              <li>Pick a product and use Preview on a product (always qty 1) to compare results before saving.</li>
              <li>Click Save on the Sales settings page when finished.</li>
            </ol>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MarkupPricingFormulasPanel({ salesForm, setSalesForm }) {
  const { settingsPath } = useSettingsApi();
  const { user } = useAuth();
  const formulas = normalizePricingFormulas(salesForm.pricing_formulas);
  const defaults = normalizePricingFormulas(
    salesForm.pricing_formula_defaults ?? DEFAULT_PRICING_FORMULAS,
  );
  const placeholders =
    salesForm.pricing_formula_placeholders && typeof salesForm.pricing_formula_placeholders === "object"
      ? salesForm.pricing_formula_placeholders
      : PRICING_FORMULA_PLACEHOLDERS;

  const examples =
    salesForm.pricing_formula_examples && typeof salesForm.pricing_formula_examples === "object"
      ? salesForm.pricing_formula_examples
      : PRICING_FORMULA_EXAMPLES;

  const [helpOpen, setHelpOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [retailPackage, setRetailPackage] = useState(null);
  const [productUom, setProductUom] = useState(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [isRetail, setIsRetail] = useState(true);
  const [routeId, setRouteId] = useState("");
  const [routes, setRoutes] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);

  const selectedRouteLabel = useMemo(() => {
    if (!routeId) return "";
    const route = routes.find((row) => String(row.id) === String(routeId));
    if (!route) return "";
    const name = route.route_name ?? route.name ?? `Route #${route.id}`;
    const markup =
      route.route_markup_price != null ? ` (+${formatSaleKes(route.route_markup_price)})` : "";
    return `${name}${markup}`;
  }, [routeId, routes]);

  const loadProductContext = useCallback(
    async (product) => {
      if (!product?.product_code) {
        setRetailPackage(null);
        setProductUom(null);
        return;
      }
      setPackageLoading(true);
      try {
        const [pkgRows, uoms] = await Promise.all([
          fetchRetailPackagesForProductCodes([product.product_code]),
          fetchUomsCached(user?.organization_id),
        ]);
        const pkg = pkgRows[0] ?? null;
        setRetailPackage(pkg);
        const unitId = product.unit_id ?? pkg?.product_unit_id;
        setProductUom(uoms?.find((row) => String(row.id) === String(unitId)) ?? null);
      } catch {
        setRetailPackage(null);
        setProductUom(null);
      } finally {
        setPackageLoading(false);
      }
    },
    [user?.organization_id],
  );

  useEffect(() => {
    if (!selectedProduct) {
      setRetailPackage(null);
      setProductUom(null);
      return;
    }
    void loadProductContext(selectedProduct);
  }, [selectedProduct, loadProductContext]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("/routes", {
          searchParams: { per_page: 100 },
          loading: false,
        });
        const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        if (!cancelled) setRoutes(rows);
      } catch {
        if (!cancelled) setRoutes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 2) {
      setProductHits([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);
      try {
        const res = await apiRequest("/products", {
          searchParams: { q, per_page: 12, sell_on_retail: 1 },
          loading: false,
        });
        const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        if (!cancelled) setProductHits(rows);
      } catch {
        if (!cancelled) setProductHits([]);
      } finally {
        if (!cancelled) setSearchBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productQuery]);

  function patchFormula(key, value) {
    setSalesForm((f) => ({
      ...f,
      pricing_formulas: {
        ...normalizePricingFormulas(f.pricing_formulas),
        [key]: value,
      },
    }));
  }

  function insertToken(key, token) {
    const current = String(formulas[key] ?? "").trim();
    const piece = `{${token}}`;
    const next = current ? `${current} ${piece}` : piece;
    patchFormula(key, next);
  }

  function resetAll() {
    setSalesForm((f) => ({
      ...f,
      pricing_formulas: { ...defaults },
    }));
  }

  function resetOne(key) {
    patchFormula(key, defaults[key] ?? DEFAULT_PRICING_FORMULAS[key]);
  }

  async function runPreview() {
    if (!selectedProduct?.product_code) {
      notifyError("Select a product with a retail package first.");
      return;
    }
    setPreviewBusy(true);
    setPreview(null);
    setPreviewOpen(false);
    try {
      const res = await apiRequest(settingsPath("sales/pricing-formula-preview"), {
        method: "POST",
        body: {
          product_code: selectedProduct.product_code,
          qty: PREVIEW_QTY,
          is_retail: isRetail,
          route_id: routeId ? Number(routeId) : null,
          pricing_formulas: formulas,
        },
        loading: false,
      });
      setPreview(res?.preview ?? null);
      setPreviewOpen(true);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Preview failed.");
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--theme-border)] p-4">
      <MarkupFormulasHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <MarkupPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        preview={preview}
        isRetail={isRetail}
        routeLabel={selectedRouteLabel}
        productUom={productUom}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="theme-heading text-sm font-semibold">Markup price formulas</h3>
          <p className="theme-subtext mt-1 text-xs">
            Build each price with named values (Line total, Route markup, Pack quantity, …). Click a
            name to insert it, or use a preset. Defaults match current Centrix math.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => setHelpOpen(true)}>
            How to set up
          </button>
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={resetAll}>
            Return to default
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {FORMULA_KEYS.map((key) => {
          const primaryTokens = PRICING_FORMULA_PRIMARY_TOKENS[key] ?? [];
          const friendly = formatPricingFormulaFriendly(formulas[key] ?? "");
          return (
            <div key={key} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <label className="theme-heading text-sm font-medium">
                    {PRICING_FORMULA_LABELS[key] ?? key}
                  </label>
                  <p className="theme-subtext mt-0.5 text-[11px]">
                    {PRICING_FORMULA_DESCRIPTIONS[key]}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--theme-primary)] hover:underline"
                  onClick={() => resetOne(key)}
                >
                  Reset
                </button>
              </div>

              <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                Reads as: <span className="font-medium text-slate-900">{friendly || "—"}</span>
              </p>

              <textarea
                className={`${inputClassName()} min-h-[56px] font-mono text-xs`}
                value={formulas[key] ?? ""}
                onChange={(e) => patchFormula(key, e.target.value)}
                spellCheck={false}
                placeholder={defaults[key] ?? DEFAULT_PRICING_FORMULAS[key]}
                aria-label={PRICING_FORMULA_LABELS[key] ?? key}
              />

              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Insert value
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {primaryTokens.map((row) => (
                    <button
                      key={`${key}-${row.token}`}
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 hover:border-[var(--theme-primary)] hover:text-[var(--theme-primary)]"
                      title={`${row.hint} — inserts {${row.token}}`}
                      onClick={() => insertToken(key, row.token)}
                    >
                      {pricingFormulaTokenLabel(row.token)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Presets
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(examples[key] ?? []).map((ex) => (
                    <button
                      key={`${key}-${ex.label}`}
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:border-[var(--theme-primary)] hover:text-[var(--theme-primary)]"
                      title={formatPricingFormulaFriendly(ex.formula)}
                      onClick={() => patchFormula(key, ex.formula)}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="theme-subtext text-[11px]">
                Also available:{" "}
                {(placeholders[key] ?? [])
                  .filter((p) => !primaryTokens.some((row) => row.token === p))
                  .map((p) => pricingFormulaTokenLabel(p))
                  .join(" · ")}
              </p>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 border-t border-[var(--theme-border)] pt-4">
        <h4 className="theme-heading text-sm font-semibold">Preview on a product</h4>
        <p className="theme-subtext text-xs">
          Pick an item with a retail package. Preview always uses quantity{" "}
          <strong>1 small unit</strong> so you can compare once-on-line vs per-qty presets fairly.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Product">
            <input
              className={inputClassName()}
              value={
                selectedProduct
                  ? `${selectedProduct.product_code} — ${selectedProduct.product_name ?? ""}`
                  : productQuery
              }
              onChange={(e) => {
                setSelectedProduct(null);
                setProductQuery(e.target.value);
                setPreview(null);
                setPreviewOpen(false);
              }}
              placeholder="Search retail products…"
            />
            {!selectedProduct && productHits.length ? (
              <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                {productHits.map((row) => (
                  <li key={row.id ?? row.product_code}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setSelectedProduct(row);
                        setProductQuery("");
                        setProductHits([]);
                        setPreview(null);
                        setPreviewOpen(false);
                      }}
                    >
                      <span className="font-medium">{row.product_code}</span>
                      <span className="text-slate-500"> — {row.product_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {searchBusy ? <p className="mt-1 text-xs text-slate-500">Searching…</p> : null}
          </Field>
          <fieldset className="space-y-2">
            <legend className="theme-heading text-sm font-medium">Session</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={isRetail}
                onChange={() => {
                  setIsRetail(true);
                  setPreview(null);
                  setPreviewOpen(false);
                }}
              />
              Retail
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={!isRetail}
                onChange={() => {
                  setIsRetail(false);
                  setPreview(null);
                  setPreviewOpen(false);
                }}
              />
              Wholesale
            </label>
          </fieldset>
          <div className="lg:col-span-2">
            <Field label="Route (optional)">
              <SearchableSelect
                className={inputClassName()}
                value={routeId}
                onChange={(next) => {
                  setRouteId(next);
                  setPreview(null);
                  setPreviewOpen(false);
                }}
                options={routes.map((route) => ({
                  value: String(route.id),
                  label: `${route.route_name ?? route.name ?? `Route #${route.id}`}${
                    route.route_markup_price != null ? ` (+${route.route_markup_price})` : ""
                  }`,
                }))}
              />
            </Field>
          </div>
        </div>

        {selectedProduct ? (
          <SelectedProductMarkupPanel
            retailPackage={retailPackage}
            productUom={productUom}
            isRetail={isRetail}
            loading={packageLoading}
          />
        ) : null}

        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={previewBusy || !selectedProduct || packageLoading}
          onClick={() => void runPreview()}
        >
          {previewBusy ? "Calculating…" : "Preview markup"}
        </button>
      </div>
    </div>
  );
}
