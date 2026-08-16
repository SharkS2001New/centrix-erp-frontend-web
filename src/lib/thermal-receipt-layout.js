import { orgPrintInkStyles } from "@/lib/print-typography";

/** Standard 80mm thermal roll — 70mm content centered leaves ~5mm side margins on paper. */
export const THERMAL_PAPER_WIDTH_MM = 80;
export const THERMAL_CONTENT_WIDTH_MM = 70;
export const THERMAL_SIDE_MARGIN_MM = (THERMAL_PAPER_WIDTH_MM - THERMAL_CONTENT_WIDTH_MM) / 2;

/** QZ Tray HTML pixel width (inches) for the full printable roll. */
export const THERMAL_QZ_PAGE_WIDTH_IN = 3.15;

/**
 * Shared 80mm thermal CSS for retail/wholesale receipts and hotel checks.
 * Callers pass the same `thermal` printPx / font so type sizes stay in lockstep.
 */
export function buildThermalReceiptCss({
  printPx,
  font,
  generalSettings = null,
  thermalLogoDims = { maxHeight: 24, maxWidth: 120 },
  extraCss = "",
  templateCss = "",
} = {}) {
  const px = printPx.body;
  const hpx = printPx.header;
  const fpx = printPx.footer;

  return `
    @page { size: ${THERMAL_PAPER_WIDTH_MM}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm; max-width: ${THERMAL_PAPER_WIDTH_MM}mm; height: auto; min-height: 0; margin: 0 auto; padding: 0; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body { font-family: ${font}; color: #000; background: #fff; font-size: ${px(10)}; ${orgPrintInkStyles(generalSettings, "thermal")} }
    .receipt { width: ${THERMAL_CONTENT_WIDTH_MM}mm; max-width: ${THERMAL_CONTENT_WIDTH_MM}mm; margin: 0 auto; padding: 0; box-sizing: border-box; page-break-inside: avoid; break-inside: avoid; }
    .org-brand,
    .org-header { margin: 0; padding: 0; max-width: 100%; }
    .org-logo { display: block; margin: 0 auto 2px; max-height: ${thermalLogoDims.maxHeight}px; max-width: ${thermalLogoDims.maxWidth}px; object-fit: contain; }
    .company-name,
    .org-name { text-align: center; font-size: ${hpx(13)}; font-weight: var(--print-w-header, 700); letter-spacing: .02em; line-height: 1.12; margin: 0 0 2px; word-break: break-word; overflow-wrap: anywhere; }
    .company-meta { text-align: center; font-size: ${hpx(9)}; color: #000; line-height: 1.15; margin: 0; font-weight: var(--print-w-header, 600); word-break: break-word; overflow-wrap: anywhere; }
    .doc-title { text-align: center; font-size: ${px(11)}; font-weight: 700; letter-spacing: .08em; margin: 10px 0 8px; }
    .doc-subtitle { text-align: center; font-size: ${px(9)}; font-weight: 700; letter-spacing: .04em; margin: 0 0 6px; text-transform: uppercase; }
    .divider { border-top: 1px dashed #000; margin: 4px 0; }
    .meta-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2px 4px; font-size: ${px(9)}; line-height: 1.25; max-width: 100%; }
    .meta-cell { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .meta-cell--sale { text-align: right; }
    .meta-label { font-weight: 700; }
    .meta-value { text-align: right; }
    .meta-full { grid-column: 1 / -1; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .table { width: 100%; max-width: 100%; border-collapse: collapse; margin: 4px 0; font-size: ${px(8)}; table-layout: fixed; }
    .table col.col-desc { width: 44%; }
    .table col.col-qty { width: 12%; }
    .table col.col-price { width: 18%; }
    .table col.col-amount { width: 26%; }
    .table.has-disc col.col-desc { width: 36%; }
    .table.has-disc col.col-qty { width: 10%; }
    .table.has-disc col.col-price { width: 16%; }
    .table.has-disc col.col-disc { width: 10%; }
    .table.has-disc col.col-amount { width: 28%; }
    .table.no-price col.col-desc { width: 58%; }
    .table.no-price col.col-qty { width: 16%; }
    .table.no-price col.col-amount { width: 26%; }
    .table thead th { padding: 1px 0; border-bottom: none; font-weight: 700; text-align: left; font-size: ${px(7)}; letter-spacing: 0; }
    .table thead th.qty,
    .table thead th.price,
    .table thead th.disc,
    .table thead th.amount { text-align: right; padding-left: 0; padding-right: 0; }
    .table th.desc, .table td.desc { padding-right: 2px; word-break: break-word; overflow-wrap: anywhere; }
    .table tbody tr { border-top: 1px dashed #000; }
    .table td { padding: 1px 0; vertical-align: top; text-align: left; }
    .table td.qty { white-space: nowrap; line-height: 1.15; font-size: ${px(7.5)}; text-align: right; padding-left: 0; padding-right: 0; }
    .table td.price,
    .table td.disc,
    .table td.amount { white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; padding-left: 0; padding-right: 0; }
    .summary-table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; font-size: ${px(8)}; }
    .summary-table col.col-label { width: 52%; }
    .summary-table col.col-value { width: 48%; }
    .summary-table.vat-table col.col-vat-rate { width: 52%; }
    .summary-table.vat-table col.col-vat-amt { width: 48%; }
    .summary-table td { padding: 1px 0; vertical-align: top; }
    .summary-table .amount-label { font-weight: 700; text-align: left; overflow-wrap: anywhere; word-break: break-word; padding-right: 4px; }
    .summary-table .amount-value { font-weight: var(--print-w-body, 600); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .summary-table.vat-table .amount-label,
    .summary-table.vat-table .vat-charged-label { font-size: ${px(7)}; letter-spacing: 0; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    .summary-table.vat-table .vat-charged-label { padding-left: 0; text-align: right; }
    .summary-table.vat-table .amount-value { text-align: right; }
    .summary-table tr.amount-line-grand td { font-size: ${px(10)}; font-weight: 700; }
    .summary-table tr.amount-line-grand .amount-value { font-weight: 700; }
    .vat-note { margin: 4px 0 0; font-size: 0.85em; line-height: 1.35; overflow-wrap: anywhere; word-break: break-word; }
    .payment-title { text-align: left; font-weight: 700; letter-spacing: .04em; margin: 0 0 6px; font-size: ${px(9)}; }
    .pay-instructions { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #000; font-size: ${px(9)}; text-align: left; max-width: 100%; }
    .pay-instructions .pay-lines { margin: 0; }
    .pay-instructions .pay-block { margin: 0 0 6px; }
    .pay-instructions .pay-block:last-child { margin-bottom: 0; }
    .pay-instructions .pay-block-title { font-weight: 700; margin: 0 0 3px; letter-spacing: .02em; }
    .pay-instructions .pay-line { margin: 3px 0; line-height: 1.45; text-align: left; word-break: break-word; overflow-wrap: anywhere; }
    .pay-instructions .pay-label { font-weight: 700; }
    .pay-instructions .pay-value { font-weight: var(--print-w-body, 600); }
    .pay-instructions .pay-note { margin-top: 6px; text-align: left; color: #000; font-size: ${px(8)}; line-height: 1.35; font-weight: var(--print-w-body, 600); word-break: break-word; overflow-wrap: anywhere; }
    .footer-text { font-size: ${fpx(8)}; color: #000; margin-top: 3px; letter-spacing: normal; line-height: 1.3; font-weight: var(--print-w-footer, 700); word-break: break-word; overflow-wrap: anywhere; text-transform: none; }
    .footer-line-divider { margin: 3px 0; }
    .footer-powered-by { text-align: center; font-size: ${fpx(7)}; font-weight: var(--print-w-footer, 600); color: #000; margin-top: 2px; letter-spacing: normal; line-height: 1.25; word-break: break-word; overflow-wrap: anywhere; text-transform: none; }
    .kra-etims-block { page-break-inside: avoid; break-inside: avoid; max-width: 100%; overflow: hidden; box-sizing: border-box; }
    .kra-etims-caption { margin-top: 4px; font-size: ${px(8)}; font-weight: 700; color: #000; line-height: 1.35; text-align: center; padding: 0 1px; overflow-wrap: anywhere; word-break: break-word; }
    .center { text-align: center; }
    @media print {
      html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm !important; max-width: ${THERMAL_PAPER_WIDTH_MM}mm !important; height: auto !important; min-height: 0 !important; margin: 0 auto !important; padding: 0 !important; }
      body { font-size: ${px(10, true)}; }
      .receipt { width: ${THERMAL_CONTENT_WIDTH_MM}mm !important; max-width: ${THERMAL_CONTENT_WIDTH_MM}mm !important; margin: 0 auto !important; padding: 0 !important; overflow: visible !important; }
      .org-brand,
      .org-header { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
      .org-logo { margin: 0 auto 2px !important; max-height: ${thermalLogoDims.maxHeight}px !important; max-width: ${thermalLogoDims.maxWidth}px !important; }
      .company-name,
      .org-name { font-size: ${hpx(13, true)}; }
      .company-meta { font-size: ${hpx(9, true)}; }
      .doc-title { font-size: ${px(11, true)}; }
      .doc-subtitle { font-size: ${px(9, true)}; }
      .meta-grid { font-size: ${px(9, true)}; }
      .table { font-size: ${px(8, true)}; }
      .table thead th { font-size: ${px(7, true)}; }
      .table td.qty { font-size: ${px(7.5, true)}; }
      .summary-table { font-size: ${px(8, true)}; }
      .summary-table.vat-table .amount-label,
      .summary-table.vat-table .vat-charged-label { font-size: ${px(7, true)}; }
      .summary-table.vat-table .vat-charged-label { padding-left: 0; text-align: right; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
      .summary-table tr.amount-line-grand td { font-size: ${px(10, true)}; }
      .payment-title, .pay-instructions { font-size: ${px(9, true)}; }
      .pay-instructions .pay-note { font-size: ${px(8, true)}; }
      .footer-text { font-size: ${fpx(8, true)}; }
      .footer-powered-by { font-size: ${fpx(7, true)}; }
      .kra-etims-caption { font-size: ${px(8, true)}; padding: 0 1px; overflow-wrap: anywhere; word-break: break-word; }
      .kra-buyer-pin, .kra-buyer-detail { font-size: ${px(9, true)}; font-weight: 700; }
    }
    ${extraCss}
    ${templateCss}
  `;
}
