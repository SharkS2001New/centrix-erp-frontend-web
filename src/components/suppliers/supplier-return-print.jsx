import { apiRequest } from "@/lib/api";
import { formatPoNumber } from "@/components/lpo/lpo-shared";
import {
  buildBrandedA4DocumentHtml,
  buildDocItemsTable,
  buildMetaFieldRows,
  escapeHtml,
  formatDocAmount,
  formatDocDate,
  formatDocQty,
  printBrandedA4Document,
  resolveDocumentBranding,
} from "@/lib/branded-document-print";

export function formatSupplierReturnRef(document) {
  const id = String(document?.id ?? "").padStart(4, "0");
  const rawDate = document?.created_at?.slice?.(0, 10) ?? "";
  const datePart = rawDate.replace(/-/g, "");
  return datePart ? `SPLR-RET-${datePart}R${id}` : `SPLR-RET-R${id}`;
}

function resolveReturnReason(document) {
  if ((document?.reason_scope ?? "order") === "per_product") {
    const reasons = [...new Set((document?.lines ?? []).map((line) => line.reason).filter(Boolean))];
    return reasons.length ? reasons.join("; ") : document?.return_reason ?? "—";
  }
  return document?.return_reason ?? document?.notes ?? "—";
}

function buildCostMap(lpoSummary) {
  const map = new Map();
  for (const line of lpoSummary?.lines ?? []) {
    if (line?.product_code != null) {
      map.set(String(line.product_code), Number(line.cost_price ?? 0));
    }
  }
  return map;
}

/**
 * @param {object} document Supplier return document (from list or show API)
 * @param {object} [options]
 */
export async function printSupplierReturn(
  document,
  {
    organization = null,
    generalSettings = null,
    supplier = null,
    lpoSummary = null,
    printedBy = null,
  } = {},
) {
  if (!document) return;

  const branding = resolveDocumentBranding({ organization, generalSettings });
  let supplierRecord = supplier;
  let lpo = lpoSummary;

  const fetches = [];
  if (!supplierRecord && document.supplier_id) {
    fetches.push(
      apiRequest(`/suppliers/${document.supplier_id}`)
        .then((res) => {
          supplierRecord = res;
        })
        .catch(() => {}),
    );
  }
  if (!lpo && document.lpo_no) {
    fetches.push(
      apiRequest(`/lpo-mst/${document.lpo_no}/summary`)
        .then((res) => {
          lpo = res;
        })
        .catch(() => {}),
    );
  }
  if (fetches.length) await Promise.all(fetches);

  const costByCode = buildCostMap(lpo);
  const paymentTerms = lpo?.lpo?.terms?.trim() || supplierRecord?.payment_terms?.trim() || "—";
  const returnRef = formatSupplierReturnRef(document);
  const returnDate = formatDocDate(document.created_at?.slice?.(0, 10) ?? document.created_at);
  const supplierName = document.supplier_name ?? supplierRecord?.supplier_name ?? "—";
  const supplierPhone =
    supplierRecord?.phone ?? supplierRecord?.alternate_phone ?? supplierRecord?.mobile ?? "—";
  const supplierPin = supplierRecord?.tax_pin ?? "—";

  const lineRows = (document.lines ?? []).map((line) => {
    const qty = Number(line.quantity ?? 0);
    const unitCost = costByCode.get(String(line.product_code)) ?? 0;
    const amount = qty * unitCost;
    return {
      description: line.product_name ?? line.product_code ?? "—",
      qty: formatDocQty(qty),
      unitCost: unitCost > 0 ? formatDocAmount(unitCost) : "—",
      amount: unitCost > 0 ? formatDocAmount(amount) : "—",
      _amount: amount,
    };
  });

  const totalAmount = lineRows.reduce((sum, row) => sum + Number(row._amount ?? 0), 0);
  const returnedBy = document.returned_by_name ?? printedBy ?? "—";
  const reason = resolveReturnReason(document);

  const leftMeta = buildMetaFieldRows([
    { label: "RETURN REF NO #:", value: returnRef },
    { label: "SUPPLIERS NAME:", value: supplierName },
    { label: "PHONE NUMBER:", value: supplierPhone },
    { label: "RETURNS DATE:", value: returnDate },
    { label: "K.R.A Pin:", value: supplierPin },
    { label: "TERMS OF PAYMENT:", value: paymentTerms },
    { label: "LPO NO:", value: document.lpo_no ? formatPoNumber(document.lpo_no) : "—" },
    { label: "INVOICE NO:", value: document.supplier_invoice_no ?? "—" },
  ]);

  const itemsTable = buildDocItemsTable({
    columns: [
      { key: "description", label: "ITEMS" },
      { key: "qty", label: "QUANTITY", align: "right" },
      { key: "unitCost", label: "COST PRICE", align: "right" },
      { key: "amount", label: "AMOUNT", align: "right" },
    ],
    rows: lineRows,
    emptyLabel: "No returned items",
  });

  const bodyHtml = `
    <div class="meta-block">${leftMeta}</div>
    ${itemsTable}
    <div class="totals-row">
      <div class="totals-box">
        <p><strong>TOTAL AMOUNT:</strong> ${escapeHtml(totalAmount > 0 ? formatDocAmount(totalAmount) : "—")}</p>
      </div>
    </div>
    <div class="reason-row">
      <span class="meta-label">REASONS TO RETURN :</span>
      <span>${escapeHtml(reason)}</span>
    </div>
    <div class="signatures">
      <p>Returned By: <span class="sig-line">${escapeHtml(returnedBy)}</span></p>
      <p>Signature: <span class="sig-line">&nbsp;</span></p>
    </div>
  `;

  printBrandedA4Document({
    title: "SUPPLIERS RETURN",
    branding,
    organization,
    bodyHtml,
    printedBy: printedBy ?? returnedBy,
    documentFooterText: branding.documentFooterText,
  });
}
