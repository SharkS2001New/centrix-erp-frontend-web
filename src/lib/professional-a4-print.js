/**
 * Shared professional A4 stationery for invoices, proformas, and LPOs.
 * Layout inspired by commercial PFI forms (title + PIN left / logo right,
 * party meta, bordered line table, terms, signatures).
 */
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";
import { documentPrintEdgeFooterStyles } from "@/lib/document-print-edge-footer";
import { reportWatermarkCss } from "@/lib/reports/report-branding";

export function escapeProfessionalHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function professionalA4Styles(generalSettings = null, variant = "sale_invoice") {
  const printPx = createOrgPrintPx(generalSettings, variant);
  const px = printPx.body;
  const hpx = printPx.header;
  const fpx = printPx.footer;
  const font = orgPrintFontFamilyFromSettings(generalSettings, variant);

  return `
  @page { size: A4; margin: 12mm 12mm 16mm; }
  html { height: 100%; }
  body {
    font-family: ${font};
    margin: 0;
    padding: 0;
    color: #111;
    font-size: ${px(11)};
    line-height: 1.4;
    box-sizing: border-box;
    ${orgPrintInkStyles(generalSettings, variant)}
  }
  .page {
    max-width: 190mm;
    margin: 0 auto;
    position: relative;
  }
  .page-body { position: relative; z-index: 1; }

  .top-bar {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    align-items: start;
    margin-bottom: 10px;
  }
  .pin-line {
    font-size: ${hpx(11)};
    font-weight: 700;
    margin: 0 0 4px;
  }
  .company-block .company-name {
    font-size: ${hpx(16)};
    font-weight: var(--print-w-header, 700);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    margin: 0 0 4px;
  }
  .company-block .company-line {
    margin: 1px 0;
    font-size: ${hpx(10)};
    font-weight: 600;
    color: #222;
  }
  .logo-wrap {
    text-align: right;
  }
  .logo-wrap img,
  .logo-wrap--center img {
    display: block;
    object-fit: contain;
  }
  .logo-wrap img {
    margin-left: auto;
    max-height: 72px;
    max-width: 180px;
  }
  .top-bar--logo-left {
    grid-template-columns: auto 1fr;
  }
  .top-bar--logo-left .logo-wrap {
    text-align: left;
  }
  .top-bar--logo-left .logo-wrap img {
    margin-left: 0;
    margin-right: auto;
  }
  .top-bar--logo-center {
    display: block;
  }
  .logo-wrap--center {
    text-align: center;
    margin-bottom: 10px;
  }
  .logo-wrap--center img {
    margin: 0 auto;
  }
  .logo-size-small img { max-height: 40px !important; max-width: 110px !important; }
  .logo-size-medium img { max-height: 56px !important; max-width: 140px !important; }
  .logo-size-large img { max-height: 72px !important; max-width: 180px !important; }
  .logo-size-extra_large img { max-height: 96px !important; max-width: 240px !important; }

  .doc-title {
    text-align: center;
    font-size: ${px(16)};
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 8px 0 14px;
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .doc-banner {
    text-align: center;
    font-size: ${px(10)};
    font-weight: 700;
    margin: -6px 0 12px;
    padding: 6px 10px;
    border: 1px solid #222;
  }

  .party-meta {
    margin: 0 0 14px;
    font-size: ${px(11)};
  }
  .party-meta p {
    margin: 3px 0;
  }
  .party-meta .meta-label {
    font-weight: 700;
    display: inline-block;
    min-width: 9.5rem;
  }
  .party-meta .meta-value {
    font-weight: 600;
  }
  .party-meta .meta-value-em {
    font-weight: 700;
  }

  table.pro-items {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 8px;
    font-size: ${px(10)};
    border: 1.5px solid #111;
  }
  table.pro-items thead { display: table-header-group; }
  table.pro-items th,
  table.pro-items td {
    border: 1px solid #222;
    padding: 6px 7px;
    vertical-align: top;
  }
  table.pro-items th {
    font-weight: 700;
    text-align: left;
    background: #f3f3f3;
    font-size: ${px(9)};
    text-transform: none;
  }
  table.pro-items th.num,
  table.pro-items td.num {
    text-align: right;
    white-space: nowrap;
  }
  table.pro-items th.center,
  table.pro-items td.center {
    text-align: center;
  }
  table.pro-items tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  table.pro-items tr.total-row td {
    font-weight: 700;
    background: #fafafa;
  }
  table.pro-items tr.total-row .total-label {
    text-align: right;
  }

  .vat-note {
    font-style: italic;
    font-size: ${px(10)};
    margin: 6px 0 12px;
  }

  .closing {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .totals {
    display: flex;
    justify-content: flex-end;
    margin: 4px 0 12px;
  }
  .totals-box {
    min-width: 240px;
    text-align: right;
    font-size: ${px(11)};
  }
  .totals-box p { margin: 2px 0; }
  .totals-box .grand {
    font-weight: 700;
    font-size: ${px(12)};
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1.5px solid #111;
  }

  .terms {
    margin: 10px 0 14px;
    font-size: ${px(10)};
  }
  .terms h3 {
    margin: 0 0 6px;
    font-size: ${px(11)};
    font-weight: 700;
    text-transform: none;
  }
  .terms ol {
    margin: 0;
    padding-left: 1.25rem;
  }
  .terms li { margin: 2px 0; }
  .terms .bank-block {
    margin: 4px 0 0 0.5rem;
  }
  .terms .bank-block p { margin: 1px 0; }

  .pay-box,
  .pay-instructions {
    margin: 8px 0 12px;
    padding: 8px 10px;
    border: 1px solid #222;
    font-size: ${px(10)};
  }
  .pay-box .pay-title,
  .pay-instructions .pay-title {
    font-weight: 700;
    margin: 0 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .pay-box .pay-line,
  .pay-instructions .pay-line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 2px 0;
  }
  .pay-box .pay-label,
  .pay-instructions .pay-label { font-weight: 700; }
  .pay-box .pay-value,
  .pay-instructions .pay-value { text-align: right; font-weight: 600; }
  .pay-box .pay-note,
  .pay-instructions .pay-note { margin-top: 6px; font-size: ${px(9)}; }

  .signatures {
    margin: 18px 0 8px;
    text-align: right;
    font-size: ${px(11)};
    font-style: italic;
  }
  .signatures p { margin: 0 0 10px; }
  .signatures .sig-label { font-weight: 700; font-style: italic; }

  .body-footer-block,
  .served-by,
  .body-footer-line,
  .goods-note {
    margin: 8px 0;
    font-size: ${px(10)};
    font-weight: 600;
  }
  .served-by { font-weight: 700; }
  .goods-note.center,
  .body-footer-line.center { text-align: center; }
  .receive-signatures {
    margin: 12px 0 0;
    font-size: ${px(11)};
    max-width: 420px;
  }
  .sig-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 0 0 10px;
  }
  .sig-row .sig-label { white-space: nowrap; min-width: 5.5rem; font-weight: 700; }
  .sig-row .sig-line {
    flex: 1;
    border-bottom: 1px dotted #111;
    min-height: 1.1em;
  }
  .footer-line-divider {
    border: 0;
    border-top: 1px solid #ccc;
    margin: 8px 0;
  }

  .footer-notes {
    margin-top: 10px;
    text-align: center;
    font-size: ${fpx(9)};
    font-weight: var(--print-w-footer, 600);
  }
  .footer-notes p { margin: 3px 0; }
  .footer-notes .warn {
    font-weight: 700;
    text-decoration: underline;
    text-transform: uppercase;
  }

  ${documentPrintEdgeFooterStyles(generalSettings, { variant })}
  ${reportWatermarkCss()}

  @media print {
    body { font-size: ${px(11, true)}; }
    .pin-line { font-size: ${hpx(11, true)}; }
    .company-block .company-name { font-size: ${hpx(16, true)}; }
    .company-block .company-line { font-size: ${hpx(10, true)}; }
    .doc-title { font-size: ${px(16, true)}; }
    .party-meta { font-size: ${px(11, true)}; }
    table.pro-items { font-size: ${px(10, true)}; }
    table.pro-items th { font-size: ${px(9, true)}; }
    .vat-note { font-size: ${px(10, true)}; }
    .totals-box { font-size: ${px(11, true)}; }
    .totals-box .grand { font-size: ${px(12, true)}; }
    .terms, .pay-box { font-size: ${px(10, true)}; }
    .signatures { font-size: ${px(11, true)}; }
    .footer-notes { font-size: ${fpx(9, true)}; }
  }
`;
}

/**
 * Header: company + PIN with configurable logo position/size.
 * @param {'left'|'right'|'center'} [logoPosition]
 * @param {'small'|'medium'|'large'|'extra_large'} [logoSize]
 */
export function buildProfessionalHeaderHtml({
  companyName = "",
  pin = "",
  address = "",
  email = "",
  phones = "",
  logoUrl = null,
  showLogo = true,
  showName = true,
  logoPosition = "right",
  logoSize = "large",
} = {}) {
  const pinHtml = pin
    ? `<p class="pin-line">Our PIN No.: ${escapeProfessionalHtml(pin)}</p>`
    : "";
  const nameHtml =
    showName && companyName
      ? `<p class="company-name">${escapeProfessionalHtml(companyName)}</p>`
      : "";
  const lines = [
    address ? `<p class="company-line">${escapeProfessionalHtml(address)}</p>` : "",
    email ? `<p class="company-line">Email: ${escapeProfessionalHtml(email)}</p>` : "",
    phones ? `<p class="company-line">Tel: ${escapeProfessionalHtml(phones)}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  const companyBlock = `<div class="company-block">
      ${pinHtml}
      ${nameHtml}
      ${lines}
    </div>`;

  const sizeClass = `logo-size-${logoSize || "large"}`;
  const logoHtml =
    showLogo && logoUrl
      ? `<div class="logo-wrap ${sizeClass}${logoPosition === "center" ? " logo-wrap--center" : ""}"><img src="${escapeProfessionalHtml(logoUrl)}" alt="${escapeProfessionalHtml(companyName || "Logo")}" /></div>`
      : logoPosition === "center"
        ? ""
        : `<div class="logo-wrap"></div>`;

  if (logoPosition === "center") {
    return `<div class="top-bar top-bar--logo-center">
    ${logoHtml}
    ${companyBlock}
  </div>`;
  }

  if (logoPosition === "left") {
    return `<div class="top-bar top-bar--logo-left">
    ${logoHtml}
    ${companyBlock}
  </div>`;
  }

  return `<div class="top-bar">
    ${companyBlock}
    ${logoHtml}
  </div>`;
}

/**
 * Vertical meta block: Date / Customer / Address / Doc number, etc.
 * @param {Array<{ label: string, value?: string|null, emphasize?: boolean }>} fields
 */
export function buildProfessionalMetaHtml(fields = []) {
  const rows = fields
    .filter((field) => field && field.label)
    .map((field) => {
      const value =
        field.value == null || field.value === "" ? "—" : String(field.value);
      return `<p><span class="meta-label">${escapeProfessionalHtml(field.label)}:</span> <span class="meta-value${field.emphasize ? " meta-value-em" : ""}">${escapeProfessionalHtml(value)}</span></p>`;
    })
    .join("");
  return `<div class="party-meta">${rows}</div>`;
}

/**
 * @param {{ key: string, label: string, align?: 'left'|'right'|'center', width?: string }[]} columns
 * @param {Array<Record<string, string>>} rows  map of column.key -> html-safe or plain text
 * @param {{ totalLabel?: string, totalAmount?: string, totalColSpan?: number }=} total
 */
export function buildProfessionalItemsTableHtml({
  columns = [],
  rows = [],
  total = null,
} = {}) {
  const head = `<tr>${columns
    .map((col) => {
      const align = col.align === "right" ? "num" : col.align === "center" ? "center" : "";
      const width = col.width ? ` style="width:${escapeProfessionalHtml(col.width)}"` : "";
      return `<th class="${align}"${width}>${escapeProfessionalHtml(col.label)}</th>`;
    })
    .join("")}</tr>`;

  const body =
    rows.length === 0
      ? `<tr><td colspan="${columns.length}" class="center">No line items</td></tr>`
      : rows
          .map((row) => {
            const cells = columns
              .map((col) => {
                const align =
                  col.align === "right" ? "num" : col.align === "center" ? "center" : "";
                const raw = row[col.key];
                const value = raw == null || raw === "" ? "—" : String(raw);
                // Values may already be escaped by callers; escape again is safe for plain text.
                const safe = row[`__html_${col.key}`]
                  ? value
                  : escapeProfessionalHtml(value);
                return `<td class="${align}">${safe}</td>`;
              })
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");

  let totalRow = "";
  if (total?.totalAmount != null) {
    const labelColSpan = Math.max(1, (total.totalColSpan ?? columns.length - 1));
    const amountCols = Math.max(1, columns.length - labelColSpan);
    totalRow = `<tr class="total-row">
      <td colspan="${labelColSpan}" class="total-label">${escapeProfessionalHtml(total.totalLabel ?? "TOTAL :")}</td>
      <td colspan="${amountCols}" class="num">${escapeProfessionalHtml(total.totalAmount)}</td>
    </tr>`;
  }

  return `<table class="pro-items">
    <thead>${head}</thead>
    <tbody>${body}${totalRow}</tbody>
  </table>`;
}

export function buildProfessionalTermsHtml({
  title = "Terms and Conditions",
  lines = [],
} = {}) {
  if (!lines?.length) return "";
  const items = lines
    .map((line) => {
      if (typeof line === "object" && line?.type === "bank") {
        const bankLines = (line.lines ?? [])
          .map((l) => `<p>${escapeProfessionalHtml(l)}</p>`)
          .join("");
        return `<li><strong>${escapeProfessionalHtml(line.label ?? "Bank details:")}</strong>
          <div class="bank-block">${bankLines}</div>
        </li>`;
      }
      return `<li>${escapeProfessionalHtml(line)}</li>`;
    })
    .join("");
  return `<div class="terms">
    <h3>${escapeProfessionalHtml(title)}</h3>
    <ol>${items}</ol>
  </div>`;
}

/**
 * @param {Array<{ label: string, value?: string|null }>} entries
 */
export function buildProfessionalSignaturesHtml(entries = []) {
  const rows = entries
    .filter((entry) => entry?.label)
    .map((entry) => {
      const value = entry.value ? escapeProfessionalHtml(entry.value) : "________________";
      return `<p><span class="sig-label">${escapeProfessionalHtml(entry.label)}:</span> ${value}</p>`;
    })
    .join("");
  if (!rows) return "";
  return `<div class="signatures">${rows}</div>`;
}
