"use client";

import Link from "next/link";
import {
  DetailDrawer,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { lpoRowDisplayNumber } from "@/components/lpo/lpo-shared";
import { PaymentStatusBadge, formatSupplierKes, formatSupplierPaymentReference } from "./suppliers-shared";

export function PurchasesPanel({ items, supplierId, onSelectLpo }) {
  if (!items?.length) {
    return <p className="text-sm text-slate-500">No LPO / purchase orders for this supplier.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
            <th className="py-2 pr-3">LPO #</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Supplier invoice</th>
            <th className="py-2 pr-3">Created</th>
            <th className="py-2 pr-3 text-right">Total</th>
            <th className="py-2 pr-3 text-right">Paid</th>
            <th className="py-2 pr-3 text-right">Balance</th>
            <th className="py-2 pr-3">Pay status</th>
            <th className="py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.lpo_no} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-2.5 pr-3">
                <Link
                  href={`/lpo/${row.lpo_no}`}
                  className="font-mono font-medium text-[#185FA5] hover:underline"
                >
                  PO-{lpoRowDisplayNumber(row)}
                </Link>
              </td>
              <td className="py-2.5 pr-3 text-slate-700">{row.status_name}</td>
              <td className="py-2.5 pr-3 text-slate-700">
                {row.supplier_invoice_no || row.reference_number || "—"}
              </td>
              <td className="py-2.5 pr-3 text-slate-600">
                {row.order_date ? formatShortDate(row.order_date) : "—"}
              </td>
              <td className="py-2.5 pr-3 text-right font-medium text-slate-800">
                {formatSupplierKes(row.net_amount || row.total_amount)}
              </td>
              <td className="py-2.5 pr-3 text-right text-slate-700">
                {formatSupplierKes(row.amount_paid)}
              </td>
              <td className="py-2.5 pr-3 text-right text-amber-700">
                {formatSupplierKes(row.balance_due)}
              </td>
              <td className="py-2.5 pr-3">
                <PaymentStatusBadge status={row.payment_status} />
              </td>
              <td className="py-2.5 text-right">
                {supplierId ? (
                  <span className="inline-flex gap-2">
                    <Link
                      href={`/lpo/${row.lpo_no}`}
                      className="text-xs font-medium text-slate-600 hover:underline"
                    >
                      View
                    </Link>
                    <Link
                      href={`/suppliers/payments/new?supplier_id=${supplierId}&lpo_no=${row.lpo_no}`}
                      className="text-xs font-medium text-[#185FA5] hover:underline"
                    >
                      Pay
                    </Link>
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentsPanel({ items, supplier }) {
  const supplierId = supplier?.id;
  const newPaymentHref = supplierId
    ? `/suppliers/payments/new?supplier_id=${supplierId}`
    : "/suppliers/payments/new";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Link
          href={`/suppliers/payments?supplier_id=${supplierId}`}
          className="text-sm font-medium text-[#185FA5] hover:text-[#144f8a]"
        >
          Open Supplier payments module
        </Link>
        <Link
          href={newPaymentHref}
          className="inline-flex items-center rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
        >
          Record payment
        </Link>
      </div>

      {!items?.length ? (
        <p className="text-sm text-slate-500">
          No supplier payments recorded yet.{" "}
          <Link href={newPaymentHref} className="font-medium text-[#185FA5] hover:underline">
            Record the first payment
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">LPO #</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Reference</th>
                <th className="py-2 pr-3">Paid by</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2.5 pr-3">{formatShortDate(row.date_paid)}</td>
                  <td className="py-2.5 pr-3 text-right font-medium text-emerald-700">
                    {formatSupplierKes(row.amount_paid)}
                    {row.amount_due_snapshot > row.amount_paid ? (
                      <span className="block text-xs font-normal text-slate-500">
                        of {formatSupplierKes(row.amount_due_snapshot)} due
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3">
                    {row.is_partial ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        Partial
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        Full
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-slate-700">
                    {row.lpo_no ? lpoRowDisplayNumber(row) : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-700">{row.payment_method}</td>
                  <td className="py-2.5 pr-3 text-slate-600">
                    {formatSupplierPaymentReference(row)}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">{row.paid_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function DocumentsPanel({ items, onSelectLpo }) {
  if (!items?.length) {
    return <p className="text-sm text-slate-500">No documents attached to this supplier&apos;s LPOs.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
            <th className="py-2 pr-3">LPO #</th>
            <th className="py-2 pr-3">File</th>
            <th className="py-2 pr-3">LPO status</th>
            <th className="py-2 pr-3">Supplier invoice</th>
            <th className="py-2 pr-3">Created</th>
            <th className="py-2 pr-3 text-right">LPO total</th>
            <th className="py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {items.map((doc) => (
            <tr key={doc.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-2.5 pr-3">
                <button
                  type="button"
                  onClick={() => onSelectLpo?.({ lpo_no: doc.lpo_no })}
                  className="font-mono font-medium text-[#185FA5] hover:underline"
                >
                  {lpoRowDisplayNumber(doc)}
                </button>
              </td>
              <td className="py-2.5 pr-3 font-medium text-slate-900">
                {doc.file_name || "Attachment"}
              </td>
              <td className="py-2.5 pr-3 text-slate-700">{doc.status_name || "—"}</td>
              <td className="py-2.5 pr-3 text-slate-700">{doc.supplier_invoice_no || "—"}</td>
              <td className="py-2.5 pr-3 text-slate-600">
                {doc.order_date ? formatShortDate(doc.order_date) : "—"}
              </td>
              <td className="py-2.5 pr-3 text-right">{formatSupplierKes(doc.total_amount)}</td>
              <td className="py-2.5 text-right text-amber-700">
                {formatSupplierKes(doc.balance_due)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LpoDetailDrawer({ lpo, open, onClose, supplierId }) {
  if (!lpo) return null;

  return (
    <DetailDrawer
      title={lpoRowDisplayNumber(lpo)}
      subtitle={lpo.status_name}
      open={open}
      onClose={onClose}
      wide
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <DetailItem label="Reference" value={lpo.reference_number} />
        <DetailItem label="Supplier invoice" value={lpo.supplier_invoice_no} />
        <DetailItem
          label="Date created"
          value={lpo.order_date ? formatShortDate(lpo.order_date) : null}
        />
        <DetailItem label="Due date" value={lpo.due_date ? formatShortDate(lpo.due_date) : null} />
        <DetailItem label="Line items" value={String(lpo.line_count ?? 0)} />
        <DetailItem
          label="Received qty"
          value={`${lpo.received_qty ?? 0} / ${lpo.ordered_qty ?? 0} ordered`}
        />
        <DetailItem label="Total" value={formatSupplierKes(lpo.net_amount || lpo.total_amount)} />
        <DetailItem label="Paid" value={formatSupplierKes(lpo.amount_paid)} />
        <DetailItem label="Balance due" value={formatSupplierKes(lpo.balance_due)} highlight />
        <DetailItem label="Payment" value={<PaymentStatusBadge status={lpo.payment_status} />} />
      </dl>

      {supplierId && Number(lpo.balance_due) > 0 ? (
        <div className="mt-4">
          <Link
            href={`/suppliers/payments/new?supplier_id=${supplierId}&lpo_no=${lpo.lpo_no}`}
            className="text-sm font-medium text-[#185FA5] hover:underline"
          >
            Record payment for this LPO
          </Link>
        </div>
      ) : null}

      {lpo.supplier_invoices?.length > 0 && (
        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vendor invoices (3-way match)
          </h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {lpo.supplier_invoices.map((inv) => (
              <li key={inv.id} className="flex justify-between px-3 py-2 text-sm">
                <span>
                  {inv.supplier_invoice_number}
                  {inv.invoice_date ? (
                    <span className="ml-2 text-slate-500">
                      {formatShortDate(inv.invoice_date)}
                    </span>
                  ) : null}
                </span>
                <span className="font-medium">{formatSupplierKes(inv.invoice_amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </DetailDrawer>
  );
}

function DetailItem({ label, value, highlight }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 ${highlight ? "font-medium text-amber-700" : "text-slate-900"}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
