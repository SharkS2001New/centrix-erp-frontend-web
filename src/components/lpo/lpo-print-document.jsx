import { formatLpoKes, formatPoNumber } from "./lpo-shared";

function formatPrintDate(value) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Legacy-style LPO print layout (aligned with sample PDF structure).
 */
export function LpoPrintDocument({ lpo, lines, buyer = {} }) {
  const termsLines = (lpo.terms || "")
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const instructionLines = (lpo.instructions || "")
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-[820px] bg-white p-6 text-[11px] leading-snug text-black print:p-4">
      <div className="mb-3 text-center text-[10px]">
        {buyer.phone ? <p>Tel: {buyer.phone}</p> : null}
        {buyer.tax_pin ? <p>PIN NO: {buyer.tax_pin}</p> : null}
        <h1 className="mt-1 text-base font-bold tracking-wide">LOCAL PURCHASE ORDER</h1>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 border-b border-black pb-3">
        <div>
          {buyer.address ? <p>Address: {buyer.address}</p> : null}
          {buyer.email ? <p>Email: {buyer.email}</p> : null}
          {buyer.po_box ? <p>P.O Box: {buyer.po_box}</p> : null}
        </div>
        <div>
          <p className="font-semibold">L.P.O No.: {formatPoNumber(lpo.lpo_no)}</p>
          <p>Date created: {formatPrintDate(lpo.order_date)}</p>
          <p>Valid Until: {formatPrintDate(lpo.due_date)}</p>
          <p>Deliver At: {lpo.delivery_address || "—"}</p>
        </div>
      </div>

      <p className="mb-2 text-sm font-bold uppercase">{lpo.supplier_name || "Supplier"}</p>
      {lpo.supplier_email ? <p>Email Address: {lpo.supplier_email}</p> : null}

      <table className="mb-3 w-full border-collapse border border-black text-[10px]">
        <thead>
          <tr className="border-b border-black bg-slate-50">
            <th className="border-r border-black px-2 py-1 text-left">Product Name</th>
            <th className="border-r border-black px-2 py-1 text-right">Quantity</th>
            <th className="border-r border-black px-2 py-1 text-right">Unit Price</th>
            <th className="border-r border-black px-2 py-1 text-left">Package</th>
            <th className="px-2 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-black">
              <td className="border-r border-black px-2 py-1">{line.product_name}</td>
              <td className="border-r border-black px-2 py-1 text-right">{line.ordered_qty}</td>
              <td className="border-r border-black px-2 py-1 text-right">
                {formatLpoKes(line.cost_price).replace(/^KES\s*/, "")}
              </td>
              <td className="border-r border-black px-2 py-1">
                {line.packaging_label || line.uom || "—"}
              </td>
              <td className="px-2 py-1 text-right">
                {formatLpoKes(line.line_total).replace(/^KES\s*/, "")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-3 flex justify-end gap-8 text-[11px]">
        <div className="text-right">
          <p>Totals: {formatLpoKes(lpo.subtotal ?? lpo.net_amount - (lpo.vat_amount || 0))}</p>
          <p>Total V.A.T: {formatLpoKes(lpo.vat_amount)}</p>
          <p className="font-bold">Grand Total: {formatLpoKes(lpo.net_amount)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-black pt-3">
        <div>
          <p className="font-semibold">Terms of Payment:</p>
          <p>{lpo.terms || "—"}</p>
          {instructionLines.length > 0 ? (
            <>
              <p className="mt-2 font-semibold">Delivery Instructions:</p>
              <ul className="list-inside list-decimal">
                {instructionLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div className="space-y-6 text-[10px]">
          <p>Prepared By: ___________________</p>
          <p>Checked By: ___________________</p>
          <p>Authorised By: ___________________</p>
        </div>
      </div>

      {termsLines.length > 0 ? (
        <ol className="mt-3 list-inside list-decimal text-[9px]">
          {termsLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      ) : (
        <ol className="mt-3 list-inside list-decimal text-[9px] text-slate-700">
          <li>Order valid until the date shown above.</li>
          <li>No goods shall be received without an invoice or delivery note.</li>
          <li>Please quote LPO number on all delivery notes and invoices.</li>
          <li>Kindly attach a copy of LPO to invoices and delivery notes.</li>
          <li>Ensure buyer KRA PIN is captured on all supplier invoices.</li>
        </ol>
      )}

      <p className="mt-4 text-center text-[9px] font-semibold uppercase">
        This order is not valid unless sent directly or signed by an authorised signatory.
      </p>
      <p className="mt-2 text-center text-[9px] text-slate-600 print:block">
        Printed {new Date().toLocaleString("en-GB")} — Save as PDF from your browser print dialog.
      </p>
    </div>
  );
}
