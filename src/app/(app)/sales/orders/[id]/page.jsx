"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { formatShortDate } from "@/components/catalog/catalog-shared";
import { formatCustomerKes } from "@/components/customers/customer-form";
import { saleLineProductLabel } from "@/lib/sale-line-items";
import { RecordSalePaymentModal } from "@/components/sales/record-sale-payment-modal";
import { SaleWorkflowPanel } from "@/components/sales/sale-workflow-panel";
import {
  PaymentStatusBadge,
  SaleStatusBadge,
  formatReceiptNumber,
  formatSaleKes,
} from "@/components/sales/sales-shared";
import { saleCustomerLabel } from "@/lib/sales";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Sale items" },
  { id: "payments", label: "Payments" },
  { id: "workflow", label: "Workflow" },
];

export default function SaleOrderDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const saleId = params.id;
  const backHref = searchParams.get("from") || "/sales/orders";

  const [tab, setTab] = useState("overview");
  const [sale, setSale] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const loadSale = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [saleData, payRes, methodsRes] = await Promise.all([
        apiRequest(`/sales/${saleId}`),
        apiRequest("/sale-payments", {
          searchParams: { per_page: 50, "filter[sale_id]": saleId },
        }).catch(() => ({ data: [] })),
        apiRequest("/payment-methods", { searchParams: { per_page: 50 } }).catch(() => ({
          data: [],
        })),
      ]);
      setSale(saleData);
      setPayments(payRes.data ?? []);
      setPaymentMethods(methodsRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    loadSale();
  }, [loadSale]);

  const items = sale?.items ?? [];
  const totalPaid = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [payments],
  );
  const balanceDue = Math.max(0, Number(sale?.order_total ?? 0) - totalPaid);

  const methodNameById = useMemo(() => {
    const map = {};
    for (const m of paymentMethods) map[m.id] = m.method_name;
    return map;
  }, [paymentMethods]);

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-6">
        <Link href={backHref} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back
        </Link>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading order…</p>
      ) : sale ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-medium text-slate-900">
                  Sale {formatReceiptNumber(sale)}
                </h1>
                <p className="mt-1 text-sm text-slate-500">Order #{sale.order_num}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <SaleStatusBadge status={sale.status} />
                <PaymentStatusBadge status={sale.payment_status} />
              </div>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Meta label="Customer" value={saleCustomerLabel(sale)} />
              <Meta label="Date" value={formatShortDate(sale.completed_at ?? sale.created_at)} />
              <Meta label="Channel" value={sale.channel ?? "—"} />
              <Meta label="Total" value={formatSaleKes(sale.order_total)} highlight />
            </dl>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                  tab === t.id
                    ? "border border-b-0 border-slate-200 bg-white text-slate-900"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Summary">
                <dl className="space-y-2 text-sm">
                  <Row label="Payment status" value={sale.payment_status ?? "—"} />
                  <Row label="Amount paid" value={formatSaleKes(sale.amount_paid ?? totalPaid)} />
                  <Row label="Balance due" value={formatSaleKes(balanceDue)} />
                  <Row label="VAT" value={formatSaleKes(sale.total_vat)} />
                </dl>
              </Panel>
              <Panel title="Quick actions">
                <div className="flex flex-wrap gap-2">
                  {balanceDue > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPaymentModalOpen(true)}
                      className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a]"
                    >
                      Record payment
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Print receipt
                  </button>
                </div>
              </Panel>
            </div>
          )}

          {tab === "items" && (
            <Panel title="Sale items" subtitle={`${items.length} item(s)`}>
              {items.length === 0 ? (
                <p className="text-sm text-slate-500">No line items.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {items.map((line) => (
                    <li key={line.id ?? `${line.line_no}-${line.product_code}`} className="py-3">
                      <p className="font-medium text-slate-900">{saleLineProductLabel(line)}</p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {line.quantity} × {formatCustomerKes(line.selling_price)} ={" "}
                        {formatCustomerKes(line.amount)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {tab === "payments" && (
            <Panel
              title="Payments"
              action={
                balanceDue > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPaymentModalOpen(true)}
                    className="text-sm font-medium text-[#185FA5] hover:underline"
                  >
                    + Record payment
                  </button>
                ) : null
              }
            >
              {payments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <li key={p.id} className="flex justify-between py-3 text-sm">
                      <span className="text-slate-800">
                        {methodNameById[p.payment_method_id] ?? "Payment"}
                        {p.reference_number ? ` · ${p.reference_number}` : ""}
                      </span>
                      <span className="font-medium text-slate-900">{formatSaleKes(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-sm font-semibold">
                <span>Total paid</span>
                <span>{formatSaleKes(totalPaid)}</span>
              </div>
            </Panel>
          )}

          {tab === "workflow" && <SaleWorkflowPanel sale={sale} onUpdated={loadSale} />}
        </div>
      ) : null}

      <RecordSalePaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        saleId={saleId}
        balanceDue={balanceDue}
        onSaved={loadSale}
      />
    </div>
  );
}

function Meta({ label, value, highlight = false }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className={highlight ? "font-semibold text-slate-900" : "text-slate-800"}>{value}</dd>
    </div>
  );
}

function Panel({ title, subtitle, action, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}
