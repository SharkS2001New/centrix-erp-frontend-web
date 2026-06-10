"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { RecordSalePaymentModal } from "@/components/sales/record-sale-payment-modal";
import { SaleWorkflowPanel } from "@/components/sales/sale-workflow-panel";
import {
  OrderDetailHeader,
  OrderFinancialSummary,
  OrderLineItemsTable,
  OrderMetaPanel,
  OrderPaymentsSection,
} from "@/components/sales/sales-orders-shared";

export default function SaleOrderDetailPage() {
  const { capabilities, refreshCapabilities } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const saleId = params.id;
  const backHref = searchParams.get("from") || "/sales/orders";

  const [sale, setSale] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  useEffect(() => {
    refreshCapabilities().catch(() => {});
  }, [refreshCapabilities]);

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

  const saleWorkflow = useMemo(
    () => getOrderWorkflow(capabilities, sale),
    [capabilities, sale],
  );

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

  const canRecordPayment = balanceDue > 0 && sale?.status !== "cancelled";

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back to orders
        </Link>
        <div className="flex flex-wrap gap-2">
          {canRecordPayment ? (
            <button
              type="button"
              onClick={() => setPaymentModalOpen(true)}
              className="rounded-lg bg-[#185FA5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#144f8a]"
            >
              Record payment
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Print
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading order…</p>
      ) : sale ? (
        <div className="space-y-5">
          <OrderDetailHeader sale={sale} workflow={saleWorkflow} />

          <SaleWorkflowPanel sale={sale} onUpdated={loadSale} />

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <OrderLineItemsTable items={sale.items} />
            </div>
            <div className="space-y-5">
              <OrderFinancialSummary
                sale={sale}
                payments={payments}
                totalPaid={totalPaid}
                balanceDue={balanceDue}
              />
              <OrderPaymentsSection
                payments={payments}
                methodNameById={methodNameById}
                totalPaid={totalPaid}
                balanceDue={balanceDue}
                onRecordPayment={canRecordPayment ? () => setPaymentModalOpen(true) : null}
              />
              <OrderMetaPanel sale={sale} workflow={saleWorkflow} />
            </div>
          </div>
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
