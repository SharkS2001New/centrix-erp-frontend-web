"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { SearchInput } from "@/components/catalog/catalog-shared";
import { CheckoutModal } from "@/components/sales/checkout-modal";
import { ProductTile, formatSaleKes } from "@/components/sales/sales-shared";
import { cartTotals } from "@/lib/sales";
import { saleLineProductLabel } from "@/lib/sale-line-items";

export default function PosPage() {
  const { user, capabilities } = useAuth();
  const channel =
    capabilities?.channels?.includes("backend")
      ? "backend"
      : capabilities?.channels?.[0] ?? "pos";

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [completedSale, setCompletedSale] = useState(null);

  const totals = useMemo(() => cartTotals(cart?.lines), [cart?.lines]);

  const ensureCart = useCallback(async () => {
    if (cart?.id) return cart;
    const c = await apiRequest("/sales/carts", {
      method: "POST",
      body: { channel, branch_id: user?.branch_id },
    });
    setCart(c);
    return c;
  }, [cart, channel, user?.branch_id]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setProducts([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiRequest("/products", {
          searchParams: { per_page: 24, q: trimmed },
        });
        setProducts(res.data ?? []);
      } catch {
        setProducts([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  async function refreshCart(cartId) {
    const updated = await apiRequest(`/sales/carts/${cartId}`);
    setCart(updated);
    return updated;
  }

  async function addProduct(product) {
    setBusy(true);
    setMessage(null);
    try {
      const activeCart = await ensureCart();
      await apiRequest(`/sales/carts/${activeCart.id}/lines`, {
        method: "POST",
        body: { product_code: product.product_code, quantity: 1 },
      });
      await refreshCart(activeCart.id);
      setMessage(`${product.product_name} added`);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Failed to add line");
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(line) {
    if (!cart?.lines?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const remaining = cart.lines.filter((l) => l.id !== line.id);
      await apiRequest(`/sales/carts/${cart.id}/lines`, { method: "DELETE" });
      for (const row of remaining) {
        await apiRequest(`/sales/carts/${cart.id}/lines`, {
          method: "POST",
          body: { product_code: row.product_code, quantity: row.quantity },
        });
      }
      await refreshCart(cart.id);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Failed to update cart");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckout(body) {
    if (!cart?.id) return;
    setBusy(true);
    setCheckoutError(null);
    try {
      const sale = await apiRequest(`/sales/carts/${cart.id}/checkout`, {
        method: "POST",
        body,
      });
      setCompletedSale(sale);
      setCart(null);
      setCheckoutOpen(false);
      setMessage(`Sale completed — ${sale.order_num ? `order #${sale.order_num}` : "done"}`);
    } catch (e) {
      setCheckoutError(e instanceof ApiError ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-4 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/sales" className="text-sm text-[#185FA5] hover:text-[#144f8a]">
            ← Sales dashboard
          </Link>
          <h1 className="mt-1 text-xl font-medium text-slate-900">Point of sale</h1>
        </div>
        {completedSale ? (
          <Link
            href={`/sales/orders/${completedSale.id}`}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            View order #{completedSale.order_num}
          </Link>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product…"
            className="max-w-none"
          />

          {searching ? (
            <p className="text-sm text-slate-500">Searching…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-slate-500">
              {query.trim() ? "No products found." : "Type to search products."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {products.map((p) => (
                <ProductTile key={p.product_code} product={p} onSelect={addProduct} disabled={busy} />
              ))}
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:w-80">
          <h2 className="text-sm font-medium text-slate-900">Current cart</h2>
          {!cart?.lines?.length ? (
            <p className="mt-4 text-sm text-slate-500">Cart is empty.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {cart.lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {saleLineProductLabel(line)}
                    </p>
                    <p className="text-slate-500">
                      {line.quantity} × {formatSaleKes(line.unit_price)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line)}
                    disabled={busy}
                    className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal</dt>
              <dd>{formatSaleKes(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Discount</dt>
              <dd>{formatSaleKes(totals.discount)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Tax</dt>
              <dd>{formatSaleKes(totals.tax)}</dd>
            </div>
            <div className="flex justify-between font-semibold text-slate-900">
              <dt>Total</dt>
              <dd>{formatSaleKes(totals.total)}</dd>
            </div>
          </dl>

          <button
            type="button"
            disabled={busy || !cart?.lines?.length}
            onClick={() => {
              setCheckoutError(null);
              setCheckoutOpen(true);
            }}
            className="mt-4 w-full rounded-lg bg-[#185FA5] py-2.5 text-sm font-medium text-white hover:bg-[#144f8a] disabled:opacity-50"
          >
            Checkout
          </button>

          {message ? <p className="mt-2 text-xs text-slate-500">{message}</p> : null}
        </aside>
      </div>

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        saving={busy}
        error={checkoutError}
        onCheckout={handleCheckout}
      />
    </div>
  );
}
