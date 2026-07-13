import { apiRequest } from "@/lib/api";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { lpoDisplayLabel } from "@/lib/grn-document";
import {
  buildBrandedA4DocumentHtml,
  buildDocItemsTable,
  buildMetaFieldRows,
  escapeHtml,
  formatDocAmount,
  formatDocDate,
  printBrandedA4Document,
  resolveDocumentBranding,
} from "@/lib/branded-document-print";

function reconciliationRows(reconciliation) {
  if (!reconciliation) return "";
  const rows = [
    { label: "GRN received value", value: formatDocAmount(reconciliation.grn_total) },
    reconciliation.supplier_invoice_amount != null
      ? {
          label: "Supplier invoice amount",
          value: formatDocAmount(reconciliation.supplier_invoice_amount),
        }
      : null,
    reconciliation.po_net_amount != null
      ? { label: "PO total (net)", value: formatDocAmount(reconciliation.po_net_amount) }
      : null,
    reconciliation.received_payable_total != null
      ? {
          label: "Received payable (system)",
          value: formatDocAmount(reconciliation.received_payable_total),
        }
      : null,
    reconciliation.invoice_variance != null
      ? {
          label: "Variance vs invoice",
          value: formatDocAmount(reconciliation.invoice_variance),
        }
      : null,
    { label: "Match status", value: reconciliation.status ?? "—" },
  ].filter(Boolean);

  return `
    <div class="recon-block">
      <p class="meta-label">THREE-WAY MATCH</p>
      <table class="recon-table">
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td class="num">${escapeHtml(row.value)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="recon-note">Goods received value should match the supplier&apos;s physical invoice before payment is approved.</p>
    </div>`;
}

function buildGrnItemsTable(grn) {
  const showOrdered = grn.lines.some((line) => line.ordered_label && line.ordered_label !== "—");
  const showOffer = grn.lines.some((line) => line.offer_label);
  const columns = [
    { key: "product_name", label: "ITEM" },
    ...(showOrdered ? [{ key: "ordered_label", label: "ORDERED", align: "right" }] : []),
    { key: "received_label", label: "RECEIVED", align: "right" },
    ...(showOffer ? [{ key: "offer_label", label: "OFFER", align: "right" }] : []),
    { key: "unit_cost", label: "UNIT COST", align: "right" },
    { key: "line_total", label: "AMOUNT", align: "right" },
  ];

  const rows = (grn.lines ?? []).map((line) => ({
    product_name: line.product_name ?? line.product_code ?? "—",
    ordered_label: line.ordered_label ?? "—",
    received_label: line.received_label ?? "—",
    offer_label: line.offer_label ?? "—",
    unit_cost: line.unit_cost > 0 ? formatDocAmount(line.unit_cost) : "—",
    line_total: line.line_total > 0 ? formatDocAmount(line.line_total) : "—",
  }));

  return buildDocItemsTable({
    columns,
    rows,
    emptyLabel: "No received items",
  });
}

/**
 * Print a Goods Received Note (GRN) for procurement three-way matching.
 *
 * @param {object} grn Document from buildGrnFrom* helpers in grn-document.js
 */
export async function printGoodsReceivedNote(
  grn,
  {
    organization = null,
    generalSettings = null,
    supplier = null,
    user = null,
    printedBy = null,
    documentFooterText = null,
  } = {},
) {
  if (!grn?.lines?.length) {
    throw new Error("No received items to print on the goods received note.");
  }

  const branding = resolveDocumentBranding({ organization, generalSettings });
  const footerPrintedBy = resolvePrintedByUser(printedBy ?? user);
  let supplierRecord = supplier;
  const lpo = grn.lpo ?? {};

  if (!supplierRecord && lpo.supplier_id) {
    supplierRecord = await apiRequest(`/suppliers/${lpo.supplier_id}`).catch(() => null);
  }

  const supplierName = lpo.supplier_name ?? supplierRecord?.supplier_name ?? "—";
  const supplierPhone =
    supplierRecord?.phone ?? supplierRecord?.alternate_phone ?? supplierRecord?.mobile ?? "—";
  const supplierPin = supplierRecord?.tax_pin ?? "—";
  const supplierInvoice =
    grn.supplier_invoices?.[0]?.supplier_invoice_number ??
    grn.grn_number?.replace(/^GRN-/, "") ??
    "—";

  const leftMeta = buildMetaFieldRows([
    { label: "GRN NO:", value: grn.grn_number ?? "—" },
    { label: "PO NO:", value: lpoDisplayLabel(lpo) },
    { label: "SUPPLIER:", value: supplierName },
    { label: "SUPPLIER INVOICE:", value: supplierInvoice },
    { label: "RECEIPT DATE:", value: formatDocDate(grn.receipt_date) },
    { label: "STOCK LOCATION:", value: String(grn.stock_location ?? "store").toUpperCase() },
  ]);

  const rightMeta = buildMetaFieldRows([
    { label: "PHONE:", value: supplierPhone },
    { label: "K.R.A PIN:", value: supplierPin },
    { label: "YOUR REF:", value: lpo.reference_number ?? "—" },
    { label: "RECEIVED BY:", value: grn.received_by ?? footerPrintedBy ?? "—" },
  ]);

  const itemsTable = buildGrnItemsTable(grn);
  const recon = reconciliationRows(grn.reconciliation);

  const bodyHtml = `
    <style>
      .recon-block { margin-top: 10px; border: 1px solid #000; padding: 8px; }
      .recon-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
      .recon-table td { padding: 2px 0; vertical-align: top; }
      .recon-table td.num { text-align: right; font-weight: 600; }
      .recon-note { margin: 6px 0 0; font-size: 0.92em; }
    </style>
    <div class="meta-grid">
      <div class="meta-block">${leftMeta}</div>
      <div class="meta-block">${rightMeta}</div>
    </div>
    ${itemsTable}
    <div class="totals-row">
      <div class="totals-box">
        <p><strong>GRN TOTAL:</strong> ${escapeHtml(formatDocAmount(grn.grn_total))}</p>
      </div>
    </div>
    ${recon}
    <div class="signatures">
      <p>Received by: <span class="sig-line">${escapeHtml(grn.received_by ?? footerPrintedBy ?? "")}</span></p>
      <p>Checked by: <span class="sig-line">&nbsp;</span></p>
      <p>Authorised by: <span class="sig-line">&nbsp;</span></p>
    </div>
  `;

  printBrandedA4Document({
    title: "GOODS RECEIVED NOTE",
    branding,
    organization,
    bodyHtml,
    printedBy: footerPrintedBy,
    documentFooterText:
      documentFooterText ??
      branding.documentFooterText ??
      resolvePrintFooter(generalSettings, "loading_sheet"),
  });
}

export async function printGrnForLpoSummary(
  lpoSummary,
  uomById,
  {
    organization = null,
    generalSettings = null,
    user = null,
    supplierInvoiceNumber = null,
    receiptDate = null,
    mode = "cumulative",
    receiveCounts = null,
    priorReceivedByLineId = null,
    stockLocation = "store",
  } = {},
) {
  const { buildGrnFromLpoSummary, buildGrnFromReceiveSession } = await import("@/lib/grn-document");

  const grn =
    mode === "session" && receiveCounts
      ? buildGrnFromReceiveSession(lpoSummary, receiveCounts, uomById, {
          supplierInvoiceNumber,
          receiptDate,
          stockLocation,
          receivedBy: user?.full_name ?? user?.username ?? null,
          priorReceivedByLineId,
        })
      : buildGrnFromLpoSummary(lpoSummary, uomById, {
          supplierInvoiceNumber,
          receiptDate,
          stockLocation,
          receivedBy: user?.full_name ?? user?.username ?? null,
        });

  await printGoodsReceivedNote(grn, {
    organization,
    generalSettings: generalSettings ?? mergeGeneralSettings(),
    user,
    printedBy: user?.full_name ?? user?.username ?? null,
  });
}
