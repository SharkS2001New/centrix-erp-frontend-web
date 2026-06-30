import { PRINT_POWERED_BY } from "@/lib/branding";
import { escapeHtml } from "@/lib/branded-document-print";

/** Extra bottom @page margin so content clears the fixed print footer. */
export const DOCUMENT_PRINT_EDGE_BOTTOM_MARGIN = "18mm";

export function documentPrintEdgeFooterStyles() {
  return `
  body.has-doc-print-edge-footer { padding-bottom: 52px; }
  .doc-print-edge-footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    padding: 6px 16px 4px;
    border-top: 1px dotted #999;
    background: #fff;
    font-size: 8px;
    color: #333;
    line-height: 1.35;
    box-sizing: border-box;
  }
  .doc-print-edge-footer .designed-by {
    margin: 0 0 4px;
    text-align: center;
    font-size: 8px;
  }
  .doc-print-edge-footer .print-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px 12px;
    padding: 0;
    border: none;
    margin: 0;
  }
  .doc-print-edge-footer .print-footer span { min-width: 0; word-break: break-word; }
  .doc-print-edge-footer .footer-notes {
    text-align: center;
    margin: 0 0 4px;
    font-size: 8px;
  }
  .doc-print-edge-footer .footer-notes p { margin: 2px 0; }
  @media print {
    body.has-doc-print-edge-footer { padding-bottom: 0; }
    .doc-print-edge-footer {
      left: 0;
      right: 0;
      bottom: 0;
      padding: 4px 12mm 2mm;
    }
  }
`;
}

export function buildDocumentPrintEdgeFooterHtml({
  printedBy = "—",
  printedAt = null,
  pageLabel = "Page 1 of 1",
  poweredBy = PRINT_POWERED_BY,
  showDesignedBy = true,
  documentFooterText = "",
  designedByLabel = "Designed & Developed By",
} = {}) {
  const at = printedAt ?? new Date().toLocaleString("en-GB");

  return `
  <footer class="doc-print-edge-footer">
    ${
      documentFooterText
        ? `<div class="footer-notes"><p>${escapeHtml(documentFooterText)}</p></div>`
        : ""
    }
    ${
      showDesignedBy
        ? `<p class="designed-by">${escapeHtml(designedByLabel)} ${escapeHtml(poweredBy)}</p>`
        : ""
    }
    <div class="print-footer">
      <span>Printed On: ${escapeHtml(at)}</span>
      <span>Printed By: ${escapeHtml(printedBy ?? "—")}</span>
      <span>${escapeHtml(pageLabel)}</span>
    </div>
  </footer>`;
}
