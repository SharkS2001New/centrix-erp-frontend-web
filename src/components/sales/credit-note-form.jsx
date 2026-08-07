"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { tabAddTitle, useTabFormExit } from "@/hooks/use-tab-form-exit";
import { TabFormCancelButton, TabFormExitButton } from "@/components/layout/tab-form-exit-button";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, SearchableSelect, inputClassName } from "@/components/catalog/catalog-shared";
import { ProductSearchSelect } from "@/components/catalog/product-search-select";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import {
  resolveCustomerReturnStatuses,
  salesSettingsFromCapabilities,
} from "@/lib/sales-settings";
import {
  CREDIT_NOTE_REASONS,
  REFUND_METHODS,
  RETURN_REASON_OTHER,
  resolveReturnReason,
  parseInvoiceNumber,
  salesReturnSearchParams,
} from "@/components/sales/customer-returns-shared";
import {
  creditCustomerToOption,
  fetchCreditCustomerByNum,
  searchCreditCustomers,
} from "@/lib/credit-customer-search";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";

function emptyCreditLineFromSaleItem(item) {
  const lineTotal = Math.round(Number(item.amount ?? item.line_total ?? 0) * 100) / 100;
  return {
    sale_item_id: item.sale_item_id ?? item.id,
    product_code: item.product_code,
    product_name: item.product_name ?? item.product?.product_name ?? item.product_code,
    uom: item.uom ?? null,
    quantity_sold: Number(item.quantity_sold ?? item.quantity ?? 0),
    line_total: lineTotal,
    max_credit_amount: lineTotal,
    credit_amount: 0,
    line_no: item.line_no ?? null,
  };
}

function totalCreditAmount(lines) {
  return lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0);
}

function isCreditReasonValid(preset, otherText) {
  const selected = String(preset ?? "").trim();
  if (!selected) return false;
  if (selected === RETURN_REASON_OTHER) {
    return String(otherText ?? "").trim().length >= 3;
  }
  return true;
}

function isGenericWalkInName(name) {
  const trimmed = String(name ?? "").trim();
  return !trimmed || /^walk[\s-]*in$/i.test(trimmed);
}

export function CreditNoteForm({
  onSaved,
  onCancel,
  backHref = "/sales/credit-notes",
  backLabel = "← Back to credit notes",
  initialSaleId = "",
}) {
  const { exitTo } = useTabFormExit(tabAddTitle("credit note"));
  const { user, capabilities } = useAuth();
  const returnSearchStatuses = useMemo(
    () => resolveCustomerReturnStatuses(salesSettingsFromCapabilities(capabilities)),
    [capabilities],
  );
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [saleOptions, setSaleOptions] = useState([]);
  const [saleId, setSaleId] = useState("");
  const [walkIn, setWalkIn] = useState(true);
  const [walkInName, setWalkInName] = useState("");
  const [customerNum, setCustomerNum] = useState("");
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [invoiceBalance, setInvoiceBalance] = useState(null);
  const [creditDate, setCreditDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reasonPreset, setReasonPreset] = useState("Price adjustment");
  const [reasonOther, setReasonOther] = useState("");
  const [notes, setNotes] = useState("");
  const [itemizeProducts, setItemizeProducts] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [lines, setLines] = useState([]);
  const [loadingSale, setLoadingSale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [invoiceHint, setInvoiceHint] = useState(null);
  const [productPick, setProductPick] = useState("");
  const [pickedProduct, setPickedProduct] = useState(null);

  const lineCreditTotal = useMemo(() => totalCreditAmount(lines), [lines]);
  const amountOnlyTotal = Number(totalAmount) > 0 ? Number(totalAmount) : 0;
  const displayTotal = itemizeProducts ? lineCreditTotal : amountOnlyTotal;
  const canSubmit =
    Boolean(saleId) &&
    (itemizeProducts ? lines.some((line) => Number(line.credit_amount) > 0) : amountOnlyTotal > 0) &&
    (walkIn ? Boolean(walkInName.trim()) : Boolean(customerNum));

  const searchCustomersForSelect = useCallback(async (query) => {
    const rows = await searchCreditCustomers(query, { perPage: 30 });
    setCustomerOptions((prev) => {
      const byValue = new Map(prev.map((row) => [String(row.value), row]));
      for (const row of rows) byValue.set(String(row.value), row);
      return Array.from(byValue.values());
    });
    return rows;
  }, []);

  const applyCustomerFromSale = useCallback(async (sale, detailCustomer = null) => {
    const num = sale?.customer_num != null ? String(sale.customer_num) : "";
    const override = String(
      sale?.customer_name_override ?? detailCustomer?.customer_name ?? sale?.customer_name ?? "",
    ).trim();

    if (num) {
      setWalkIn(false);
      setWalkInName("");
      setCustomerNum(num);
      setCustomerLoading(true);
      try {
        const customer =
          detailCustomer?.customer_num != null
            ? detailCustomer
            : await fetchCreditCustomerByNum(num);
        if (customer) {
          setCustomerOptions([creditCustomerToOption(customer)]);
        } else {
          setCustomerOptions([
            {
              value: num,
              label: override || `Customer #${num}`,
              searchText: `${override} ${num}`,
            },
          ]);
        }
      } catch {
        setCustomerOptions([
          {
            value: num,
            label: override || `Customer #${num}`,
            searchText: `${override} ${num}`,
          },
        ]);
      } finally {
        setCustomerLoading(false);
      }
      return;
    }

    setWalkIn(true);
    setCustomerNum("");
    setCustomerOptions([]);
    setWalkInName(isGenericWalkInName(override) ? "" : override);
  }, []);

  useEffect(() => {
    const q = invoiceQuery.trim();
    if (q.length < 2) {
      setSaleOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      apiRequest("/sales", {
        searchParams: salesReturnSearchParams(q, returnSearchStatuses),
      })
        .then((res) => setSaleOptions(res.data ?? []))
        .catch(() => setSaleOptions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [invoiceQuery, returnSearchStatuses]);

  const loadSale = useCallback(async (id, displayQuery) => {
    if (!id) return;
    setLoadingSale(true);
    setError(null);
    setInvoiceHint(null);
    try {
      const res = await apiRequest(`/sales/${id}/return-lines`);
      const sale = res.sale ?? res;
      setSaleId(String(sale.id));
      await applyCustomerFromSale(sale, res.customer ?? sale.customer ?? null);
      setInvoiceQuery(displayQuery ?? formatReceiptNumber(sale));
      const balance = Number(sale.order_total ?? sale.balance ?? 0);
      setInvoiceBalance(Number.isFinite(balance) ? balance : null);
      const nextLines = (res.lines ?? sale.items ?? []).map((item) =>
        emptyCreditLineFromSaleItem(item),
      );
      setLines(nextLines);
      setInvoiceHint(
        nextLines.length
          ? `Loaded ${nextLines.length} item(s) from invoice.`
          : "Invoice loaded. Enter a credit amount for the price difference.",
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invoice");
      setLines([]);
      setInvoiceBalance(null);
    } finally {
      setLoadingSale(false);
    }
  }, [applyCustomerFromSale]);

  useEffect(() => {
    if (!initialSaleId) return;
    if (String(initialSaleId) === "undefined" || String(initialSaleId) === "null") return;
    loadSale(initialSaleId);
  }, [initialSaleId, loadSale]);

  const resolveAndLoadInvoice = useCallback(async () => {
    const q = invoiceQuery.trim();
    if (!q) return;

    const exactOption = saleOptions.find(
      (sale) => formatReceiptNumber(sale).toLowerCase() === q.toLowerCase(),
    );
    if (exactOption) {
      await loadSale(exactOption.id);
      return;
    }

    const orderNum = parseInvoiceNumber(q);
    if (orderNum != null) {
      const match = saleOptions.find(
        (sale) => Number(sale.order_num) === orderNum || Number(sale.id) === orderNum,
      );
      if (match) {
        await loadSale(match.id);
        return;
      }
    }

    setLoadingSale(true);
    setError(null);
    try {
      const res = await apiRequest("/sales", {
        searchParams: salesReturnSearchParams(q, returnSearchStatuses),
      });
      const sales = res.data ?? [];
      const match =
        sales.find((sale) => formatReceiptNumber(sale).toLowerCase() === q.toLowerCase()) ??
        (orderNum != null
          ? sales.find(
              (sale) => Number(sale.order_num) === orderNum || Number(sale.id) === orderNum,
            )
          : null) ??
        (sales.length === 1 ? sales[0] : null);

      if (!match) {
        setError("No matching invoice found. Check the number and try again.");
        setLines([]);
        return;
      }

      await loadSale(match.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not find invoice");
    } finally {
      setLoadingSale(false);
    }
  }, [invoiceQuery, saleOptions, loadSale, returnSearchStatuses]);

  function addManualProductLine() {
    if (!pickedProduct?.product_code) return;
    const code = String(pickedProduct.product_code);
    if (lines.some((line) => String(line.product_code) === code)) {
      setError("That product is already on the credit note.");
      return;
    }
    setError(null);
    setLines((prev) => [
      ...prev,
      {
        sale_item_id: null,
        product_code: code,
        product_name: pickedProduct.product_name ?? code,
        uom: pickedProduct.uom ?? null,
        quantity_sold: 0,
        line_total: null,
        max_credit_amount: null,
        credit_amount: 0,
        line_no: null,
        manual: true,
      },
    ]);
    setProductPick("");
    setPickedProduct(null);
  }

  function removeLine(index) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCreditAmount(index, rawValue) {
    const parsed = rawValue === "" ? 0 : Number(rawValue);
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const max = Number(line.max_credit_amount ?? line.line_total ?? 0);
        const creditAmount = Number.isFinite(parsed)
          ? max > 0
            ? Math.max(0, Math.min(parsed, max))
            : Math.max(0, parsed)
          : 0;
        return { ...line, credit_amount: creditAmount };
      }),
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user?.branch_id) {
      setError("Your user profile has no branch assigned.");
      return;
    }
    if (!saleId) {
      setError("Load an invoice first.");
      return;
    }
    if (!isCreditReasonValid(reasonPreset, reasonOther)) {
      setError("Reason for credit note is required.");
      return;
    }
    if (walkIn) {
      if (!walkInName.trim()) {
        setError("Enter the walk-in customer's name, or untick Walk-in and pick a customer.");
        return;
      }
    } else if (!customerNum) {
      setError("Select a customer, or tick Walk-in and enter their name.");
      return;
    }

    const resolvedReason = resolveReturnReason(reasonPreset, reasonOther);

    const payloadLines = itemizeProducts
      ? lines
          .filter((line) => Number(line.credit_amount) > 0)
          .map((line) => ({
            sale_item_id: line.sale_item_id,
            product_code: line.product_code,
            product_name: line.product_name,
            uom: line.uom ?? null,
            amount: line.credit_amount,
            line_no: line.line_no,
          }))
      : [];

    if (itemizeProducts && payloadLines.length === 0) {
      setError("Enter a credit amount for at least one product.");
      return;
    }
    if (!itemizeProducts && amountOnlyTotal <= 0) {
      setError("Enter the credit amount for the price difference.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const noteParts = [];
      if (walkIn && walkInName.trim()) {
        noteParts.push(`Walk-in: ${walkInName.trim()}`);
      }
      if (notes.trim()) noteParts.push(notes.trim());

      const body = {
        sale_id: Number(saleId),
        customer_num: walkIn ? null : Number(customerNum),
        branch_id: user.branch_id,
        credit_date: creditDate,
        return_date: creditDate,
        refund_method: refundMethod,
        reason: resolvedReason,
        notes: noteParts.length ? noteParts.join("\n") : null,
        ...(itemizeProducts
          ? { lines: payloadLines }
          : { total_amount: amountOnlyTotal, lines: [] }),
      };

      await apiRequest("/credit-notes", { method: "POST", body });
      if (onSaved) {
        await onSaved();
      } else {
        exitTo("/sales/credit-notes");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save credit note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="theme-panel rounded-xl border p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Create credit note</h1>
          <p className="mt-1 text-sm text-slate-500">
            Issue a credit for billing errors or price adjustments without returning stock. Product
            lines are optional when the customer underpaid due to a price difference.
          </p>
        </div>
        <TabFormExitButton href={backHref} className="text-sm text-[#185FA5] hover:underline">
          {backLabel}
        </TabFormExitButton>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Invoice / receipt no." required>
          <div className="flex gap-2">
            <input
              list="credit-note-sale-options"
              className={inputClassName()}
              value={invoiceQuery}
              onChange={(e) => setInvoiceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void resolveAndLoadInvoice();
                }
              }}
              placeholder="Search by receipt or invoice number"
              required
            />
            <datalist id="credit-note-sale-options">
              {saleOptions.map((sale) => (
                <option key={sale.id} value={formatReceiptNumber(sale)} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => void resolveAndLoadInvoice()}
              disabled={loadingSale}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingSale ? "Loading…" : "Load"}
            </button>
          </div>
          {invoiceHint ? <p className="mt-1 text-xs text-emerald-700">{invoiceHint}</p> : null}
          {invoiceBalance != null ? (
            <p className="mt-1 text-xs text-slate-500">
              Invoice balance: {formatSaleKes(invoiceBalance)}
            </p>
          ) : null}
        </Field>

        <Field label="Customer" required>
          <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={walkIn}
              disabled={saving || loadingSale}
              onChange={(e) => {
                const next = e.target.checked;
                setWalkIn(next);
                setError(null);
                if (next) {
                  setCustomerNum("");
                } else {
                  setWalkInName("");
                }
              }}
            />
            Walk-in
          </label>
          {walkIn ? (
            <input
              className={inputClassName()}
              value={walkInName}
              disabled={saving || loadingSale}
              onChange={(e) => {
                setWalkInName(e.target.value);
                setError(null);
              }}
              placeholder="Walk-in customer name"
              required
              autoComplete="off"
            />
          ) : (
            <PosSearchableSelect
              value={customerNum}
              onChange={(nextValue, option) => {
                setCustomerNum(nextValue);
                if (option) {
                  setCustomerOptions((prev) => {
                    const without = prev.filter((row) => String(row.value) !== String(option.value));
                    return [option, ...without];
                  });
                }
                setError(null);
              }}
              options={customerOptions}
              loadOptions={searchCustomersForSelect}
              loading={customerLoading}
              disabled={saving || loadingSale}
              placeholder="Search customer name or number…"
              searchPlaceholder="Type name, phone, or customer #…"
              emptyLabel="No customers found"
              idleSearchLabel="Type to search customers…"
            />
          )}
          <p className="mt-1 text-xs text-slate-500">
            Prefills from the invoice when you load it. Change the customer or use Walk-in and type
            their name.
          </p>
        </Field>

        <Field label="Credit date" required>
          <input
            type="date"
            className={inputClassName()}
            value={creditDate}
            onChange={(e) => setCreditDate(e.target.value)}
            required
          />
        </Field>

        <Field label="Refund method">
          <SearchableSelect
            value={refundMethod}
            onChange={setRefundMethod}
            options={REFUND_METHODS.map((method) => ({
              value: method.value,
              label: method.label,
            }))}
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Reason for credit" required>
          <SearchableSelect
            value={reasonPreset}
            onChange={setReasonPreset}
            required
            options={CREDIT_NOTE_REASONS.map((reason) => ({
              value: reason,
              label: reason,
            }))}
          />
        </Field>
        {reasonPreset === RETURN_REASON_OTHER ? (
          <Field label="Please specify" required>
            <input
              className={inputClassName()}
              value={reasonOther}
              onChange={(e) => setReasonOther(e.target.value)}
              required
            />
          </Field>
        ) : null}
      </div>

      <Field label="Notes" className="mt-4">
        <textarea
          rows={2}
          className={inputClassName()}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Customer paid less due to agreed price difference on invoice"
        />
      </Field>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={itemizeProducts}
            onChange={(e) => setItemizeProducts(e.target.checked)}
          />
          Itemize credit by product
        </label>
        <span className="text-xs text-slate-500">
          Leave unchecked for a single amount (price difference / underpayment).
        </span>
      </div>

      {!itemizeProducts ? (
        <Field label="Credit amount (KES)" className="mt-4" required>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={invoiceBalance != null && invoiceBalance > 0 ? invoiceBalance : undefined}
            className={`${inputClassName()} max-w-xs`}
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            required
            placeholder="0.00"
            disabled={!saleId}
          />
          {!saleId ? (
            <p className="mt-1 text-xs text-slate-500">Load an invoice before entering the amount.</p>
          ) : null}
        </Field>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-4">
            <p className="mb-2 text-sm font-medium text-slate-800">Add product manually</p>
            <p className="mb-3 text-xs text-slate-500">
              Search the catalogue to add products that are not on the invoice, or to credit without
              loading an invoice line first.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1">
                <ProductSearchSelect
                  value={productPick}
                  onChange={setProductPick}
                  onProductSelect={(product) => {
                    setProductPick(product.product_code);
                    setPickedProduct(product);
                  }}
                  excludeCodes={lines.map((line) => line.product_code)}
                  placeholder="Search product name or code…"
                />
              </div>
              <button
                type="button"
                onClick={addManualProductLine}
                disabled={!pickedProduct}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Add product
              </button>
            </div>
          </div>

          {lines.length > 0 ? (
            <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Line total</th>
                    <th className="px-3 py-2 text-right">Credit amount</th>
                    <th className="px-3 py-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr
                      key={`${line.sale_item_id}-${line.product_code}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{line.product_name}</div>
                        <div className="text-xs text-slate-500">{line.product_code}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {line.line_total != null ? formatSaleKes(line.line_total) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={line.max_credit_amount ?? undefined}
                          className={`${inputClassName()} w-32 text-right`}
                          value={line.credit_amount || ""}
                          onChange={(e) => updateCreditAmount(index, e.target.value)}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={3} className="px-3 py-2 text-right font-medium text-slate-700">
                      Total credit
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">
                      {formatSaleKes(displayTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
        </>
      )}

      {!itemizeProducts && displayTotal > 0 ? (
        <p className="mt-3 text-sm font-medium text-slate-700">
          Total credit: {formatSaleKes(displayTotal)}
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <PrimaryButton type="submit" disabled={saving || loadingSale || !canSubmit}>
          {saving ? "Saving…" : "Create credit note"}
        </PrimaryButton>
        <TabFormCancelButton
          href={backHref}
          onClick={(e) => {
            if (onCancel) {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      </div>
    </form>
  );
}
