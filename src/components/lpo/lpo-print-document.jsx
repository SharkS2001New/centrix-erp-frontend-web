import { organizationLogoFileUrl } from "@/lib/api";
import {
  buildReportOrgHeaderHtml,
  buildReportWatermarkHtml,
  organizationHasLogo,
  resolveReportBranding,
} from "@/lib/reports/report-branding";
import {
  resolveLpoDeliveryNotes,
  resolveLpoKebsWarning,
  resolveLpoVatNote,
} from "@/lib/lpo-print-settings";
import { computeLpoLineTotals, formatLpoAmount, formatPoNumber } from "./lpo-shared";

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

function formatQty(value) {
  return Number(value ?? 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lpoDisplayNumber(lpo) {
  const ref = String(lpo?.reference_number ?? "").trim();
  if (ref) return ref;
  return lpo?.po_number ?? formatPoNumber(lpo?.lpo_no);
}

/**
 * Compact A4 LPO print — matches legacy Omega-style layout without reserved stamp space.
 */
export function LpoPrintDocument({
  lpo,
  lines,
  buyer = {},
  organization = null,
  supplier = null,
  printedBy = null,
  printSettings = null,
  generalSettings = null,
}) {
  const branding = resolveReportBranding({ organization, generalSettings });
  const orgName = organization?.org_name ?? buyer.name ?? "";
  const orgPhones = [organization?.primary_tel, organization?.secondary_tel]
    .filter(Boolean)
    .join(" / ");
  const orgPin = organization?.org_pin ?? buyer.tax_pin ?? "";
  const logoUrl =
    organizationHasLogo(organization) && organization?.id
      ? organizationLogoFileUrl(organization.id, {
          filePath: organization.logo_file_path ?? undefined,
        })
      : null;

  const supplierName = lpo?.supplier_name ?? supplier?.supplier_name ?? "Supplier";
  const supplierPoBox = supplier?.address?.trim() || "—";
  const supplierEmail = lpo?.supplier_email ?? supplier?.email ?? "—";
  const supplierPhone = lpo?.supplier_phone ?? supplier?.phone ?? supplier?.alternate_phone ?? "—";
  const supplierPin = supplier?.tax_pin ?? "—";
  const supplierTown = supplier?.town ?? "—";
  const paymentTerms = lpo?.terms?.trim() || "—";

  const instructionLines = resolveLpoDeliveryNotes(lpo, printSettings ?? {});
  const noteLines = instructionLines;
  const kebsWarning = resolveLpoKebsWarning(printSettings ?? {});
  const vatNote = resolveLpoVatNote(printSettings ?? {});
  const watermarkHtml = buildReportWatermarkHtml(branding);

  const subtotal =
    Number(lpo?.subtotal) ||
    Math.max(0, Number(lpo?.net_amount ?? 0) - Number(lpo?.vat_amount ?? 0));
  const totalVat = Number(lpo?.vat_amount ?? 0);

  const lineRows = (lines ?? []).map((line) => {
    const totals = computeLpoLineTotals(line);
    const pkg = (line.packaging_label || line.package_name || line.uom || "—").toLowerCase();
    return {
      ...line,
      pkg,
      unitPrice: formatLpoAmount(line.cost_price),
      qty: formatQty(line.ordered_qty),
      vat: formatLpoAmount(totals.vat),
      amount: formatLpoAmount(totals.net),
    };
  });

  const printedAt = new Date().toLocaleString("en-GB");
  const byName = printedBy ?? lpo?.created_by_name ?? "—";

  const orgHeaderHtml = branding.showHeader
    ? buildReportOrgHeaderHtml({
        ...branding,
        logoUrl: logoUrl ?? branding.logoUrl,
        organizationName: orgName || branding.organizationName,
      })
    : orgName
      ? `<div class="org-name">${escapeHtml(orgName)}</div>`
      : "";

  return (
    <div className="lpo-print-root">
      <style>{`
        @page { size: A4; margin: 8mm 10mm; }
        @media print {
          html, body { margin: 0; padding: 0; background: #fff; }
          .lpo-print-root { padding: 0 !important; }
          .no-print { display: none !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
        .lpo-print-root {
          max-width: 820px;
          margin: 0 auto;
          padding: 12px 16px;
          font-family: "Times New Roman", Times, serif;
          font-size: 10px;
          line-height: 1.3;
          color: #000;
        }
        .lpo-brand { text-align: center; margin-bottom: 6px; }
        .lpo-brand .org-logo { display: block; margin: 0 auto 4px; max-height: 56px; max-width: 220px; object-fit: contain; }
        .lpo-brand .org-name { font-size: 18px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
        .lpo-brand-meta { text-align: center; font-size: 9px; margin-top: 2px; }
        .lpo-title { text-align: center; font-size: 13px; font-weight: 700; margin: 8px 0; letter-spacing: 0.06em; }
        .lpo-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-bottom: 8px; }
        .lpo-meta p { margin: 1px 0; }
        .lpo-supplier-name { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; }
        .lpo-meta-label { font-weight: 700; }
        .lpo-meta-value em { font-style: italic; }
        table.lpo-items { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9px; }
        table.lpo-items th, table.lpo-items td {
          border-top: 1px dotted #000;
          border-bottom: 1px dotted #000;
          padding: 3px 5px;
          vertical-align: top;
        }
        table.lpo-items th { font-weight: 700; text-align: left; }
        table.lpo-items th.num, table.lpo-items td.num { text-align: right; white-space: nowrap; }
        .lpo-totals { display: flex; justify-content: flex-end; margin: 4px 0 8px; font-size: 10px; }
        .lpo-totals-box { min-width: 200px; text-align: right; }
        .lpo-totals-box p { margin: 2px 0; }
        .lpo-notes { margin: 6px 0; padding: 0; list-style: none; font-size: 8px; }
        .lpo-notes li { margin-bottom: 2px; }
        .lpo-notes .n { font-weight: 700; margin-right: 4px; }
        .lpo-warn { text-align: center; font-size: 8px; font-weight: 700; text-decoration: underline; text-transform: uppercase; margin: 4px 0 2px; }
        .lpo-note-line { text-align: center; font-size: 8px; margin: 2px 0; }
        .lpo-footer { margin-top: 6px; padding-top: 4px; border-top: 1px dotted #999; display: flex; justify-content: space-between; font-size: 8px; color: #333; }
        .watermark { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        .watermark-text { position: absolute; top: 48%; left: 50%; transform: translate(-50%, -50%) rotate(-32deg); font-size: 64px; font-weight: 700; color: rgba(15, 23, 42, 0.06); white-space: nowrap; }
        .watermark-logo { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: 70%; max-height: 70%; opacity: 0.05; object-fit: contain; }
      `}</style>

      {watermarkHtml ? <div dangerouslySetInnerHTML={{ __html: watermarkHtml }} /> : null}

      <div className="lpo-brand" style={{ position: "relative", zIndex: 1 }}>
        {orgHeaderHtml ? (
          <div dangerouslySetInnerHTML={{ __html: orgHeaderHtml }} />
        ) : null}
        <div className="lpo-brand-meta">
          {organization?.org_address || buyer.address ? (
            <div>{organization?.org_address ?? buyer.address}</div>
          ) : null}
          {organization?.org_email || buyer.email ? (
            <div>Email: {organization?.org_email ?? buyer.email}</div>
          ) : null}
          {orgPhones || buyer.phone ? <div>Tel: {orgPhones || buyer.phone}</div> : null}
          {orgPin ? <div>PIN NO: {orgPin}</div> : null}
        </div>
      </div>

      <div className="lpo-title">LOCAL PURCHASE ORDER</div>

      <div className="lpo-meta">
        <div>
          <div className="lpo-supplier-name">{supplierName}</div>
          <p>
            <span className="lpo-meta-label">P.O Box:</span> {supplierPoBox}
          </p>
          <p>
            <span className="lpo-meta-label">Email Address:</span> {supplierEmail}
          </p>
          <p>
            <span className="lpo-meta-label">Phone:</span> {supplierPhone}
          </p>
          <p>
            <span className="lpo-meta-label">K.R.A Pin:</span> {supplierPin}
          </p>
          <p>
            <span className="lpo-meta-label">Town:</span> {supplierTown}
          </p>
          <p>
            <span className="lpo-meta-label">Terms of Payment:</span> {paymentTerms}
          </p>
        </div>
        <div>
          <p>
            <span className="lpo-meta-label">L.P.O No.:</span>{" "}
            <span className="lpo-meta-value">
              <em>{lpoDisplayNumber(lpo)}</em>
            </span>
          </p>
          <p>
            <span className="lpo-meta-label">Created On:</span> {formatPrintDate(lpo?.order_date)}
          </p>
          <p>
            <span className="lpo-meta-label">Valid Until:</span> {formatPrintDate(lpo?.due_date)}
          </p>
          <p>
            <span className="lpo-meta-label">Deliver At:</span> {lpo?.delivery_address || "—"}
          </p>
        </div>
      </div>

      <table className="lpo-items">
        <thead>
          <tr>
            <th>Product Name</th>
            <th className="num">Quantity</th>
            <th>Package</th>
            <th className="num">Unit Price</th>
            <th className="num">V.A.T</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lineRows.length ? (
            lineRows.map((line) => (
              <tr key={line.id ?? `${line.product_code}-${line.qty}`}>
                <td>{line.product_name}</td>
                <td className="num">{line.qty}</td>
                <td>{line.pkg}</td>
                <td className="num">{line.unitPrice}</td>
                <td className="num">{line.vat}</td>
                <td className="num">{line.amount}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#666" }}>
                No line items
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="lpo-totals">
        <div className="lpo-totals-box">
          <p>
            <strong>Totals:</strong> {formatLpoAmount(subtotal)}
          </p>
          <p>
            <strong>Total V.A.T:</strong> {formatLpoAmount(totalVat)}
          </p>
        </div>
      </div>

      <ol className="lpo-notes">
        {noteLines.map((line, index) => (
          <li key={`${index}-${line}`}>
            <span className="n">{index + 1}.</span>
            {line}
          </li>
        ))}
      </ol>

      <p className="lpo-warn">{kebsWarning}</p>
      <p className="lpo-note-line">
        <strong>Take note:</strong> {vatNote}
      </p>

      <div className="lpo-footer">
        <span>Printed On: {printedAt}</span>
        <span>By: {byName}</span>
      </div>

      <p className="no-print mt-3 text-center text-[9px] text-slate-500">
        Use your browser print dialog to save as PDF or send to the printer.
      </p>
    </div>
  );
}
