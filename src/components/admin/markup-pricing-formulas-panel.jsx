"use client";

import { useEffect, useState } from "react";
import { Field, inputClassName, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { formatSaleKes } from "@/lib/sales";
import { useSettingsApi } from "@/contexts/settings-api-context";
import {
  DEFAULT_PRICING_FORMULAS,
  PRICING_FORMULA_LABELS,
  PRICING_FORMULA_PLACEHOLDERS,
  PRICING_FORMULA_EXAMPLES,
  normalizePricingFormulas,
} from "@/lib/pricing-formula";

const FORMULA_KEYS = ["retail_line", "wholesale_line", "route_retail", "route_wholesale"];

export function MarkupPricingFormulasPanel({ salesForm, setSalesForm }) {
  const { settingsPath } = useSettingsApi();
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

  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [qty, setQty] = useState("25");
  const [isRetail, setIsRetail] = useState(true);
  const [routeId, setRouteId] = useState("");
  const [routes, setRoutes] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);

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
    try {
      const res = await apiRequest(settingsPath("sales/pricing-formula-preview"), {
        method: "POST",
        body: {
          product_code: selectedProduct.product_code,
          qty: Number(qty) || 1,
          is_retail: isRetail,
          route_id: routeId ? Number(routeId) : null,
          pricing_formulas: formulas,
        },
        loading: false,
      });
      setPreview(res?.preview ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Preview failed.");
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--theme-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="theme-heading text-sm font-semibold">Markup price formulas</h3>
          <p className="theme-subtext mt-1 text-xs">
            Type any formula with + − × ÷ and parentheses. You choose whether markup is once on the
            whole line or per quantity / pack / chunk by how you multiply. Defaults match current
            Centrix math — use Return to default anytime.
          </p>
          <p className="theme-subtext mt-1 text-xs">
            Examples: once → <code className="rounded bg-slate-100 px-1">{"{aggregate_wholesale} + {tier_markup}"}</code>
            {" · "}
            per qty → <code className="rounded bg-slate-100 px-1">{"{aggregate_wholesale} + {tier_markup} * {qty}"}</code>
            {" · "}
            per chunk → <code className="rounded bg-slate-100 px-1">{"{aggregate_wholesale} + {tier_markup} * {markup_apps}"}</code>
          </p>
        </div>
        <button type="button" className={SECONDARY_BTN_CLASS} onClick={resetAll}>
          Return to default
        </button>
      </div>

      <div className="space-y-4">
        {FORMULA_KEYS.map((key) => (
          <div key={key} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="theme-heading text-sm font-medium">
                {PRICING_FORMULA_LABELS[key] ?? key}
              </label>
              <button
                type="button"
                className="text-xs font-medium text-[var(--theme-primary)] hover:underline"
                onClick={() => resetOne(key)}
              >
                Reset
              </button>
            </div>
            <textarea
              className={`${inputClassName()} min-h-[56px] font-mono text-xs`}
              value={formulas[key] ?? ""}
              onChange={(e) => patchFormula(key, e.target.value)}
              spellCheck={false}
              placeholder={defaults[key] ?? DEFAULT_PRICING_FORMULAS[key]}
            />
            <div className="flex flex-wrap gap-1.5">
              {(examples[key] ?? []).map((ex) => (
                <button
                  key={`${key}-${ex.label}`}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:border-[var(--theme-primary)] hover:text-[var(--theme-primary)]"
                  title={ex.formula}
                  onClick={() => patchFormula(key, ex.formula)}
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <p className="theme-subtext text-[11px]">
              Placeholders: {(placeholders[key] ?? []).map((p) => `{${p}}`).join(" · ")}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-[var(--theme-border)] pt-4">
        <h4 className="theme-heading text-sm font-semibold">Preview on a product</h4>
        <p className="theme-subtext text-xs">
          Pick an item with a retail package, enter quantity in small units (e.g. kg), then preview
          how your formula prices the line — try once-on-line vs per-qty chips above and compare.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Product">
            <input
              className={inputClassName()}
              value={selectedProduct ? `${selectedProduct.product_code} — ${selectedProduct.product_name ?? ""}` : productQuery}
              onChange={(e) => {
                setSelectedProduct(null);
                setProductQuery(e.target.value);
                setPreview(null);
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
          <Field label="Quantity (small units)">
            <input
              type="number"
              min={0.001}
              step="any"
              className={inputClassName()}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <fieldset className="space-y-2">
            <legend className="theme-heading text-sm font-medium">Session</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={isRetail} onChange={() => setIsRetail(true)} />
              Retail
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={!isRetail} onChange={() => setIsRetail(false)} />
              Wholesale
            </label>
          </fieldset>
          <Field label="Route (optional)">
            <select
              className={inputClassName()}
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
            >
              <option value="">No route markup</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.route_name ?? route.name ?? `Route #${route.id}`}
                  {route.route_markup_price != null ? ` (+${route.route_markup_price})` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={previewBusy || !selectedProduct}
          onClick={() => void runPreview()}
        >
          {previewBusy ? "Calculating…" : "Preview markup"}
        </button>

        {preview ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            {!preview.has_retail_package ? (
              <p className="text-amber-800">This product has no retail package settings.</p>
            ) : null}
            <dl className="grid gap-1 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Wholesale aggregate</dt>
                <dd className="font-medium tabular-nums">{formatSaleKes(preview.aggregate_wholesale)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tier markup × apps</dt>
                <dd className="font-medium tabular-nums">
                  {formatSaleKes(preview.tier_markup)} × {preview.markup_apps}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Line before route</dt>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
