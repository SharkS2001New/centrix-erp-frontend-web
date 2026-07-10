import { escapeHtml } from "@/lib/sale-document-print-shared";
import {
  contractKindLabel,
  formatBillingDate,
  formatBillingMoney,
  licenseBasisLabel,
  planModuleLabels,
  resolveAgreementPrices,
  workspaceLabels,
} from "@/lib/platform-billing";
import { DEFAULT_PLATFORM_SELLER, normalizeSeller } from "@/lib/platform-invoices";
import { fillPrintWindow, openBlankPrintWindow, printWindowFeatures } from "@/lib/open-print-window";

function partyLines(party) {
  return [
    party?.name,
    party?.company_code ? `Company code: ${party.company_code}` : null,
    party?.email,
    party?.phone,
    party?.tax_pin ? `KRA PIN: ${party.tax_pin}` : null,
    party?.address,
  ].filter(Boolean);
}

/**
 * Build printable HTML for a platform quote/contract (Kenya-oriented commercial schedule + terms).
 */
export function buildPlatformContractHtml(contract, { seller: sellerOverride } = {}) {
  const seller = normalizeSeller(sellerOverride ?? contract?.seller ?? DEFAULT_PLATFORM_SELLER);
  const customer = {
    name:
      contract?.organization?.org_name ??
      contract?.customer_name ??
      "Tenant organization",
    email: contract?.organization?.org_email ?? contract?.organization?.email ?? contract?.customer_email,
    phone: contract?.organization?.phone ?? contract?.customer_phone,
    address: contract?.organization?.address ?? contract?.customer_address,
    tax_pin: contract?.organization?.tax_pin ?? contract?.customer_tax_pin,
    company_code: contract?.organization?.company_code,
  };
  const prices = resolveAgreementPrices(contract);
  const workspaces = workspaceLabels(
    contract?.workspace_keys ?? contract?.plan?.workspace_keys ?? [],
  );
  const modules = planModuleLabels(contract?.module_keys ?? contract?.plan?.module_keys ?? []);
  const kind = contractKindLabel(contract?.kind ?? "contract");
  const title = contract?.title || `${kind} — Centrix ERP`;
  const reference = contract?.reference || contract?.id || "—";

  const workspaceList = workspaces.length
    ? `<ul>${workspaces.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul>`
    : "<p class='muted'>Applications as agreed with the Customer.</p>";

  const moduleList = modules.length
    ? `<ul>${modules.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #0f172a; background: #f1f5f9; }
    .sheet { max-width: 800px; margin: 20px auto; background: #fff; padding: 36px 40px; box-shadow: 0 1px 4px rgba(15,23,42,.08); }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 11px; margin-bottom: 22px; font-family: system-ui, sans-serif; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin: 0 0 6px; font-family: system-ui, sans-serif; }
    .party p { margin: 0 0 2px; font-size: 12.5px; line-height: 1.45; }
    .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; }
    .box h2 { font-size: 12px; margin: 0 0 8px; font-family: system-ui, sans-serif; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
    .fees { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .fee strong { display: block; font-size: 16px; margin-top: 2px; }
    .muted { color: #64748b; font-size: 11px; }
    ul { margin: 0; padding-left: 18px; font-size: 12.5px; }
    .terms { white-space: pre-wrap; font-size: 11.5px; line-height: 1.5; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 40px; }
    .sign .line { border-top: 1px solid #94a3b8; margin-top: 44px; padding-top: 8px; font-size: 11px; color: #475569; }
    .law { font-size: 10px; color: #64748b; margin-top: 24px; font-family: system-ui, sans-serif; }
    @media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; max-width: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${escapeHtml(kind)} · Ref ${escapeHtml(String(reference))} · ${escapeHtml(formatBillingDate(contract?.start_date || contract?.created_at))} · Governed by the laws of Kenya</p>

    <div class="grid">
      <div class="party">
        <p class="label">Provider</p>
        ${partyLines(seller).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      </div>
      <div class="party">
        <p class="label">Customer</p>
        ${partyLines(customer).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      </div>
    </div>

    <div class="box">
      <h2>Commercial schedule</h2>
      <div class="fees">
        <div>
          <span class="muted">First-time payment</span>
          <strong>${escapeHtml(formatBillingMoney(prices.first_payment_price, prices.currency))}</strong>
        </div>
        <div>
          <span class="muted">Renewal (${escapeHtml(prices.interval)})</span>
          <strong>${escapeHtml(formatBillingMoney(prices.renewal_price, prices.currency))}</strong>
        </div>
      </div>
      <p class="muted" style="margin-top:10px">
        Licence: ${escapeHtml(licenseBasisLabel(prices.license_basis))}
        · Seats: ${escapeHtml(String(contract?.seat_count ?? "—"))}
        ${contract?.plan?.name ? ` · Plan: ${escapeHtml(contract.plan.name)}` : ""}
        ${contract?.valid_until ? ` · Valid until: ${escapeHtml(formatBillingDate(contract.valid_until))}` : ""}
      </p>
    </div>

    <div class="box">
      <h2>Licensed Centrix applications</h2>
      ${workspaceList}
      ${moduleList ? `<p class="muted" style="margin-top:8px">Billing modules</p>${moduleList}` : ""}
    </div>

    <div class="box">
      <h2>Terms and conditions</h2>
      <div class="terms">${escapeHtml(contract?.terms || "")}</div>
    </div>

    ${
      contract?.notes
        ? `<div class="box"><h2>Notes</h2><div class="terms">${escapeHtml(contract.notes)}</div></div>`
        : ""
    }

    <div class="sign">
      <div><div class="line">Authorised signatory — ${escapeHtml(seller.name || "Provider")}</div></div>
      <div><div class="line">Authorised signatory — ${escapeHtml(customer.name || "Customer")}</div></div>
    </div>
    <p class="law">This document is intended for commercial SaaS licensing in Kenya. It does not constitute legal advice; parties should obtain independent counsel for material transactions.</p>
  </div>
</body>
</html>`;
}

export function printPlatformContract(contract, options) {
  const html = buildPlatformContractHtml(contract, options);
  const win = openBlankPrintWindow();
  if (!win) return;
  fillPrintWindow(win, html);
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* ignore */
    }
  }, 250);
}

export function downloadPlatformContractHtml(contract, options) {
  const html = buildPlatformContractHtml(contract, options);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ref = contract?.reference || contract?.id || "contract";
  a.href = url;
  a.download = `${String(ref).replace(/[^\w.-]+/g, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { printWindowFeatures };
