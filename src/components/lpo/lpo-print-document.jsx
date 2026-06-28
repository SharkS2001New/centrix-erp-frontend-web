import { buildLpoPrintHtml } from "./lpo-print-html";

function extractPrintFragment(html) {
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return {
    style: styleMatch?.[1] ?? "",
    body: bodyMatch?.[1] ?? html,
  };
}

/**
 * Omega-style A4 LPO / delivery note print view.
 * Uses the same HTML builder as live print and admin preview.
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
  documentFooterText = null,
  variant = "lpo",
}) {
  const html = buildLpoPrintHtml({
    lpo,
    lines,
    buyer,
    organization,
    supplier,
    printedBy,
    printSettings,
    generalSettings,
    documentFooterText,
    variant,
  });
  const { style, body } = extractPrintFragment(html);

  return (
    <div className="lpo-print-root">
      {style ? <style>{style}</style> : null}
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <p className="no-print mt-3 text-center text-[9px] text-slate-500">
        Use your browser print dialog to save as PDF or send to the printer.
      </p>
      <style>{`
        @media print {
          html, body { margin: 0; padding: 0; background: #fff; }
          .lpo-print-root { padding: 0 !important; }
          .no-print { display: none !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
        .lpo-print-root { max-width: 860px; margin: 0 auto; }
      `}</style>
    </div>
  );
}
