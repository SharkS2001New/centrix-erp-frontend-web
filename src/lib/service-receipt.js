import { PRODUCT_SHORT_NAME } from "@/lib/branding";
import { escapeHtml } from "@/lib/html-escape";
import { printHtmlDocument } from "@/lib/print-dispatch";
import { resolveReportBranding } from "@/lib/reports/report-branding";

/** Code 39 patterns: n = narrow, w = wide. Bars and spaces alternate, starting with a bar. */
const CODE39 = {
  0: "nnnwwnwnn",
  1: "wnnwnnnnw",
  2: "nnwwnnnnw",
  3: "wnwwnnnnn",
  4: "nnnwwnnnw",
  5: "wnnwwnnnn",
  6: "nnwwwnnnn",
  7: "nnnwnnwnw",
  8: "wnnwnnwnn",
  9: "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnwnwn",
  S: "nnwnnwnwn",
  T: "nnnnwwnwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "*": "nwnnwnwnn",
};

export function formatReceiptDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value ? String(value) : "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function formatReceiptAmount(value) {
  const amount = Number(value) || 0;
  const digits = Math.abs(amount % 1) < 0.001 ? 0 : 2;
  return amount.toLocaleString("en-KE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  });
}

export function organizationReceiptIdentity(organization) {
  const branding = resolveReportBranding({ organization });
  return {
    name: String(branding.organizationName || organization?.org_name || "").trim(),
    address: String(organization?.org_address || "").trim(),
    phone: String(organization?.primary_tel || organization?.phone || "").trim(),
    email: String(organization?.org_email || organization?.email || "").trim(),
    pin: String(organization?.org_pin || "").trim(),
    logoUrl: branding.logoUrl || "",
  };
}

function barcodeSvg(value, height) {
  const encoded = String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z.\- ]/g, "");
  if (!encoded) return "";
  const narrow = 1.15;
  const wide = narrow * 2.4;
  let x = 0;
  const rects = [];
  for (const char of `*${encoded}*`) {
    const pattern = CODE39[char];
    if (!pattern) continue;
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "w" ? wide : narrow;
      if (index % 2 === 0) {
        rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="${height}" fill="#111"/>`);
      }
      x += width;
    }
    x += narrow;
  }
  return `<svg class="barcode" viewBox="0 0 ${x.toFixed(2)} ${height}" role="img" aria-label="Barcode ${escapeHtml(encoded)}">${rects.join("")}</svg>`;
}

function contactLines(receipt) {
  return [
    receipt.address,
    receipt.phone ? `Tel: ${receipt.phone}` : "",
    receipt.email ? `Email: ${receipt.email}` : "",
    receipt.pin ? `PIN: ${receipt.pin}` : "",
  ].filter(Boolean);
}

function receiptCss(paper) {
  const thermal = paper === "thermal";
  return `
    @page { size: ${thermal ? "80mm auto" : "210mm 297mm"}; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: ${thermal ? "9px" : "12px"};
      line-height: 1.35;
    }
    .sheet {
      width: ${thermal ? "74mm" : "190mm"};
      margin: ${thermal ? "2mm auto" : "8mm auto"};
      border: 1px solid #c8c8c8;
      padding: ${thermal ? "3mm" : "8mm 9mm 7mm"};
    }
    .mast { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: ${thermal ? "14mm" : "22mm"}; }
    .logo { max-height: ${thermal ? "12mm" : "20mm"}; max-width: ${thermal ? "28mm" : "42mm"}; object-fit: contain; }
    .crest {
      width: ${thermal ? "12mm" : "18mm"};
      height: ${thermal ? "12mm" : "18mm"};
      border: 1.5px solid #1a1a1a;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; letter-spacing: 0.04em;
      font-size: ${thermal ? "8px" : "11px"};
    }
    .wordmark { margin-left: auto; text-align: right; line-height: 1.05; }
    .wordmark strong { display: block; font-size: ${thermal ? "11px" : "18px"}; letter-spacing: 0.01em; }
    .wordmark span { display: block; margin-top: 2px; font-size: ${thermal ? "7px" : "10px"}; letter-spacing: 0.08em; text-transform: uppercase; color: #333; }
    .refs { display: grid; grid-template-columns: ${thermal ? "1fr" : "1.2fr 1fr 1fr"}; gap: ${thermal ? "2mm" : "4mm"}; margin-top: ${thermal ? "3mm" : "6mm"}; }
    .refs p { margin: 0; }
    .k { font-size: ${thermal ? "7px" : "10px"}; letter-spacing: 0.04em; text-transform: uppercase; color: #333; }
    .v { font-weight: 800; font-size: ${thermal ? "11px" : "16px"}; margin-top: 1px; word-break: break-word; }
    hr { border: 0; border-top: 1px solid #bfbfbf; margin: ${thermal ? "2.5mm 0" : "4mm 0"}; }
    .copy-row { display: ${thermal ? "block" : "flex"}; justify-content: space-between; gap: 8px; align-items: flex-start; }
    .address { margin: 0; white-space: pre-line; font-weight: 700; max-width: ${thermal ? "100%" : "62%"}; }
    .copy { text-align: ${thermal ? "left" : "right"}; flex: 0 0 auto; ${thermal ? "margin-top: 2mm;" : ""} }
    .copy b { display: block; letter-spacing: 0.04em; font-size: ${thermal ? "9px" : "13px"}; margin-bottom: 2px; }
    .barcode { display: block; height: ${thermal ? "9mm" : "14mm"}; width: ${thermal ? "46mm" : "52mm"}; margin-left: ${thermal ? "0" : "auto"}; }
    .issuer { font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; margin: 0 0 2px; }
    .meta { margin: 0; color: #222; }
    .banner {
      margin: ${thermal ? "3mm 0" : "5mm 0 4mm"};
      background: #1f8f3a;
      color: #fff;
      text-align: center;
      font-weight: 800;
      letter-spacing: 0.14em;
      font-size: ${thermal ? "12px" : "20px"};
      padding: ${thermal ? "2mm 0" : "3.5mm 0"};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .who { display: grid; grid-template-columns: ${thermal ? "1fr" : "1.1fr 1fr"}; gap: 2px 16px; margin-bottom: ${thermal ? "2mm" : "4mm"}; }
    .who p { margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d5d5d5; padding: ${thermal ? "1.5mm 1mm" : "2.5mm 3mm"}; vertical-align: top; }
    th { background: #f4f4f4; text-align: left; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th.num, td.num { text-align: right; white-space: nowrap; width: ${thermal ? "18mm" : "28mm"}; }
    td.code { width: ${thermal ? "8mm" : "14mm"}; }
    tr.total td { border-left: 0; border-right: 0; font-weight: 800; }
    tr.total td.num { border: 1px solid #d5d5d5; }
    .balance { text-align: right; font-weight: 700; margin: 2mm 0 0; }
    .note { display: flex; gap: 8px; border: 1px solid #d5d5d5; margin-top: ${thermal ? "3mm" : "6mm"}; }
    .note b { padding: ${thermal ? "2mm" : "3mm"}; }
    .note p { margin: 0; padding: ${thermal ? "2mm 2mm 2mm 0" : "3mm 3mm 3mm 0"}; }
    .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: ${thermal ? "3mm" : "7mm"}; font-size: ${thermal ? "8px" : "11px"}; }
    .powered { font-weight: 800; letter-spacing: 0.01em; }
    .powered span { display: block; font-weight: 600; font-size: ${thermal ? "7px" : "10px"}; }
  `;
}

function crestInitials(name) {
  const parts = String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part[0]).join("").toUpperCase();
  return initials || "RC";
}

/**
 * Official service receipt (thermal or A4). This is not a retail till slip.
 * @param {object} receipt
 * @param {"thermal"|"a4"} paper
 */
export function buildServiceReceiptHtml(receipt, paper = "a4") {
  const thermal = paper === "thermal";
  const lines = Array.isArray(receipt?.lines) ? receipt.lines : [];
  const orgName = String(receipt?.orgName || "Receipt").trim();
  const contacts = contactLines(receipt);
  const logo = receipt?.logoUrl
    ? `<img class="logo" src="${escapeHtml(receipt.logoUrl)}" alt="" />`
    : `<div class="crest">${escapeHtml(crestInitials(orgName))}</div>`;
  const rows = lines
    .map(
      (line, index) => `<tr>
        <td class="code">${escapeHtml(line.code || index + 1)}</td>
        <td>${escapeHtml(line.description || "")}</td>
        <td class="num">${escapeHtml(formatReceiptAmount(line.amount))}</td>
      </tr>`,
    )
    .join("");
  const balance = Number(receipt?.balance) || 0;
  const note = String(receipt?.note || "This document is computer generated. It is a valid receipt.").trim();
  const customer = receipt?.customer || {};

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${escapeHtml(receipt?.receiptNo || "")}</title>
  <style>${receiptCss(paper)}</style>
</head>
<body class="${thermal ? "centrix-print-thermal" : ""}">
  <article class="sheet receipt">
    <header class="mast">
      ${logo}
      <div class="wordmark">
        <strong>${escapeHtml(orgName)}</strong>
        <span>Customer receipt</span>
      </div>
    </header>
    <section class="refs">
      <p><span class="k">Receipt no</span><span class="v">${escapeHtml(receipt?.receiptNo || "—")}</span></p>
      <p><span class="k">Bill reference no</span><span class="v">${escapeHtml(receipt?.reference || "—")}</span></p>
      <p><span class="k">Date</span><span class="v">${escapeHtml(formatReceiptDate(receipt?.date))}</span></p>
    </section>
    <hr />
    <div class="copy-row">
      <p class="address">${escapeHtml(receipt?.address || "")}</p>
      <div class="copy">
        <b>CUSTOMER COPY</b>
        ${barcodeSvg(receipt?.receiptNo || receipt?.reference || "", thermal ? 28 : 40)}
      </div>
    </div>
    <p class="issuer">${escapeHtml(orgName)}</p>
    ${contacts.filter((line) => line !== receipt?.address).map((line) => `<p class="meta">${escapeHtml(line)}</p>`).join("")}
    <div class="banner">RECEIPT PAID</div>
    <section class="who">
      <p><b>ID No:</b> ${escapeHtml(customer.idNo || "—")}</p>
      <p><b>Email:</b> ${escapeHtml(customer.email || "—")}</p>
      <p><b>Name:</b> ${escapeHtml(String(customer.name || "—").toUpperCase())}</p>
      <p><b>Tel:</b> ${escapeHtml(customer.phone || "—")}</p>
    </section>
    <table>
      <thead>
        <tr><th>Service code</th><th>Service description</th><th class="num">KES</th></tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total"><td></td><td class="num">Total KES</td><td class="num">${escapeHtml(formatReceiptAmount(receipt?.total))}</td></tr>
      </tbody>
    </table>
    ${balance > 0.009 ? `<p class="balance">Balance outstanding KES ${escapeHtml(formatReceiptAmount(balance))}</p>` : ""}
    <div class="note"><b>NOTE</b><p>${escapeHtml(note)}</p></div>
    <footer class="foot"><div class="powered"><span>Powered by</span>${escapeHtml(PRODUCT_SHORT_NAME)}</div></footer>
  </article>
</body>
</html>`;
}

export function printServiceReceipt(receipt, paper = "a4") {
  return printHtmlDocument(buildServiceReceiptHtml(receipt, paper), {
    jobType: paper === "thermal" ? "receipt" : "document",
    documentId: receipt?.receiptNo || null,
    windowFeatures: paper === "thermal" ? "width=420,height=760" : "width=900,height=840",
  });
}

export function buildSpaSaleReceipt(sale, spa, organization = null) {
  const identity = organizationReceiptIdentity(organization);
  const client = spa?.clients?.find((item) => item.id === sale?.clientId);
  const profile = spa?.profile || {};
  const lines = (sale?.lines || []).map((line, index) => ({
    code: line.kind === "product" && line.sku ? line.sku : String(index + 1),
    description: Number(line.qty) > 1 ? `${line.name} × ${line.qty}` : line.name,
    amount: Number(line.price || 0) * Number(line.qty || 0),
  }));
  if (Number(sale?.discount) > 0) {
    lines.push({ code: "", description: "Discount", amount: -Number(sale.discount) });
  }
  if (Number(sale?.tax) > 0) {
    lines.push({ code: "", description: "Tax", amount: Number(sale.tax) });
  }
  const reference = String(sale?.payment?.reference || "").trim();
  const footer = String(spa?.receipt?.footer || "").trim();
  const orgName = profile.name || identity.name || "Spa & Kinyozi";
  return {
    receiptNo: sale?.number || "",
    reference: reference || sale?.number || "",
    date: sale?.at,
    orgName,
    address: [spa?.branch, profile.address].filter(Boolean).join(", "),
    phone: profile.phone || identity.phone,
    email: profile.email || identity.email,
    pin: spa?.receipt?.showPin ? profile.pin || identity.pin : "",
    logoUrl: identity.logoUrl,
    customer: {
      idNo: "",
      name: client?.name || "Walk-in",
      email: client?.email || "",
      phone: client?.phone || "",
    },
    lines,
    total: sale?.total,
    note: footer
      ? `${footer} This document is computer generated.`
      : `This document is computer generated. It is a valid receipt issued by ${orgName}.`,
  };
}

function feeLabel(kind) {
  const value = String(kind || "fee").replace(/_/g, " ");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function buildDrivingFeeReceipt({ payment, invoice, student, organization }) {
  const identity = organizationReceiptIdentity(organization);
  const person = student || payment?.student || invoice?.student || {};
  const bill = invoice || payment?.invoice || {};
  const reference = String(payment?.reference || "").trim() || bill.invoice_number || "";
  const orgName = identity.name || "Driving school";
  const method = String(payment?.method || "").toLowerCase();
  const methodNote = method === "mpesa"
    ? " An M-Pesa reference on this receipt is recorded by the school. It is not a Safaricom confirmation."
    : "";
  return {
    receiptNo: payment?.id ? `RCP-${payment.id}` : reference || "RCP",
    reference: reference || "—",
    date: payment?.received_on || payment?.created_at,
    orgName,
    address: identity.address,
    phone: identity.phone,
    email: identity.email,
    pin: identity.pin,
    logoUrl: identity.logoUrl,
    customer: {
      idNo: person.id_document_number || person.student_number || "",
      name: person.full_name || "Student",
      email: person.email || "",
      phone: person.phone || "",
    },
    lines: [
      {
        code: "1",
        description: `${feeLabel(bill.kind)} ${bill.invoice_number || ""}`.trim(),
        amount: payment?.amount,
      },
    ],
    total: payment?.amount,
    balance: payment?.outstanding ?? invoice?.outstanding,
    note: `This document is computer generated. It is a valid receipt issued by ${orgName}.${methodNote}`,
  };
}
