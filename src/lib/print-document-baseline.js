import {
  DOCUMENT_PRINT_EDGE_BODY_BOTTOM,
  DOCUMENT_PRINT_EDGE_BODY_SIDES,
  DOCUMENT_PRINT_EDGE_BODY_TOP,
} from "@/lib/document-print-edge-footer";

/** Injected last into every print document — suppresses browser URL/date headers. */
export const PRINT_DOCUMENT_BASELINE_HTML = `
<style id="centrix-print-baseline">
  /*
   * Zero @page margins: Chrome/Edge omit built-in headers & footers (URL, date, title)
   * when there is no margin box for them. Content margins move inside the page via body padding.
   */
  @page {
    margin: 0 !important;
  }
  @media print {
    html, body {
      margin: 0 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body.has-doc-print-edge-footer {
      padding: ${DOCUMENT_PRINT_EDGE_BODY_TOP} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} ${DOCUMENT_PRINT_EDGE_BODY_BOTTOM} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} !important;
      box-sizing: border-box;
      min-height: 100vh;
    }
    body.centrix-print-thermal {
      padding: 3mm 2mm !important;
      box-sizing: border-box;
    }
    .doc-print-edge-footer {
      position: fixed !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      margin: 0 !important;
      padding: 3px ${DOCUMENT_PRINT_EDGE_BODY_SIDES} 1.5mm !important;
      border-top: 1px dotted #000;
      background: #fff !important;
    }
  }
</style>`;

/** Append baseline print CSS so it overrides per-document @page rules. */
export function injectPrintDocumentBaseline(htmlContent) {
  const html = String(htmlContent ?? "");
  if (!html || html.includes("centrix-print-baseline")) return html;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${PRINT_DOCUMENT_BASELINE_HTML}</head>`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${PRINT_DOCUMENT_BASELINE_HTML}</head>`);
  }
  return `${PRINT_DOCUMENT_BASELINE_HTML}${html}`;
}
