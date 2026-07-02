import { PRINT_POWERED_BY } from "@/lib/branding";
import { escapeHtml } from "@/lib/branded-document-print";
import { buildStyledFooterLinesHtml, parseFooterLines } from "@/lib/footer-line-format";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { orgPrintInkStyles, orgPrintSectionPx } from "@/lib/print-typography";

/** Body padding (not @page) — keeps content clear of the fixed print footer. */
export const DOCUMENT_PRINT_EDGE_BODY_TOP = "10mm";
export const DOCUMENT_PRINT_EDGE_BODY_SIDES = "12mm";
export const DOCUMENT_PRINT_EDGE_BODY_BOTTOM = "30mm";

/** @deprecated Use zero @page margin + body padding above. Kept for imports that set @page size only. */
export const DOCUMENT_PRINT_EDGE_BOTTOM_MARGIN = "0";

export function documentPrintEdgeFooterStyles(generalSettings = null, { variant = "a4" } = {}) {
  const bodyPx = (base, print = false) =>
    orgPrintSectionPx(base, generalSettings, { variant, section: "body", print });
  const footerPx = (base, print = false) =>
    orgPrintSectionPx(base, generalSettings, { variant, section: "footer", print });
  return `
  body.has-doc-print-edge-footer { padding-bottom: 72px; }
  .doc-print-edge-footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    padding: 8px 16px 4px;
    border-top: 1px dotted #000;
    background: #fff;
    font-size: ${footerPx(9)};
    color: #000;
    font-weight: var(--print-w-footer, 600);
    line-height: 1.4;
    box-sizing: border-box;
    ${orgPrintInkStyles(generalSettings, variant)}
  }
  .doc-print-edge-footer .footer-notes {
    text-align: center;
    margin: 0 0 6px;
    font-size: ${footerPx(9)};
    font-weight: var(--print-w-footer, 700);
  }
  .doc-print-edge-footer .footer-notes p { margin: 2px 0; }
  .doc-print-edge-footer .print-footer-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr);
    align-items: end;
    gap: 8px 12px;
  }
  .doc-print-edge-footer .print-footer-left {
    text-align: left;
    font-weight: var(--print-w-footer, 700);
  }
  .doc-print-edge-footer .print-footer-center {
    text-align: center;
    font-weight: var(--print-w-footer, 700);
  }
  .doc-print-edge-footer .print-footer-center .designed-by {
    margin: 0 0 2px;
    font-weight: var(--print-w-strong, 800);
  }
  .doc-print-edge-footer .print-footer-center .printed-by {
    margin: 0;
    font-weight: var(--print-w-footer, 700);
  }
  .doc-print-edge-footer .print-footer-right {
    text-align: right;
    font-weight: var(--print-w-footer, 700);
    white-space: nowrap;
  }
  @media print {
    .doc-print-edge-footer {
      font-size: ${footerPx(9, true)};
    }
    .doc-print-edge-footer .footer-notes {
      font-size: ${footerPx(9, true)};
    }
  }
`;
}

export function buildDocumentPrintEdgeFooterHtml({
  printedBy = null,
  printedAt = null,
  pageLabel = "Page 1 of 1",
  poweredBy = PRINT_POWERED_BY,
  showDesignedBy = true,
  documentFooterText = "",
  designedByLabel = "Designed & Developed By",
} = {}) {
  const printedByName = resolvePrintedByUser(printedBy) ?? "—";
  const at = printedAt ?? new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const footerNotesHtml = (() => {
    const lines = parseFooterLines(documentFooterText);
    if (!lines.length) return "";
    const styled = buildStyledFooterLinesHtml(lines, { layout: "block", tag: "p" });
    return `<div class="footer-notes">${styled}</div>`;
  })();

  return `
  <footer class="doc-print-edge-footer">
    ${footerNotesHtml}
    <div class="print-footer-row">
      <span class="print-footer-left">Printed On: ${escapeHtml(at)}</span>
      <div class="print-footer-center">
        ${
          showDesignedBy
            ? `<p class="designed-by">${escapeHtml(designedByLabel)} ${escapeHtml(poweredBy)}</p>`
            : ""
        }
        <p class="printed-by">By: ${escapeHtml(printedByName)}</p>
      </div>
      <span class="print-footer-right">${escapeHtml(pageLabel)}</span>
    </div>
  </footer>`;
}
