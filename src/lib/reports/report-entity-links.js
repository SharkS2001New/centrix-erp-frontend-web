/** @typedef {'customer' | 'product' | 'order' | 'invoice' | 'supplier' | 'lpo'} ReportEntityLink */

const COLUMN_LINK_TYPES = {
  customer_num: "customer",
  customer_name: "customer",
  product_code: "product",
  product_name: "product",
  order_num: "order",
  order_id: "order",
  sale_id: "order",
  invoice_number: "invoice",
  customer_invoice_id: "invoice",
  supplier_id: "supplier",
  supplier_name: "supplier",
  supplier_code: "supplier",
  lpo_no: "lpo",
};

/**
 * @param {string | undefined} key
 * @returns {ReportEntityLink | null}
 */
export function inferReportLinkType(key) {
  if (!key) return null;
  return COLUMN_LINK_TYPES[key] ?? null;
}

/**
 * @param {ReportEntityLink} type
 * @param {Record<string, unknown>} row
 * @returns {string | null}
 */
export function reportEntityHref(type, row) {
  if (!row || !type) return null;

  switch (type) {
    case "customer": {
      const num = row.customer_num;
      return num != null && num !== "" ? `/customers/${num}` : null;
    }
    case "product": {
      const code = row.product_code;
      return code ? `/products/${encodeURIComponent(String(code))}` : null;
    }
    case "order": {
      const saleId = row.sale_id ?? row.order_id;
      if (saleId != null && saleId !== "") {
        return `/sales/orders/${saleId}`;
      }
      return null;
    }
    case "invoice": {
      const invoiceId = row.customer_invoice_id ?? row.invoice_id;
      const id = invoiceId != null ? String(invoiceId).trim() : "";
      if (id && id !== "undefined" && id !== "null" && /^\d+$/.test(id)) {
        return `/accounting/customer-invoices/${id}`;
      }
      return null;
    }
    case "supplier": {
      const supplierId = row.supplier_id;
      return supplierId != null && supplierId !== "" ? `/suppliers/${supplierId}` : null;
    }
    case "lpo": {
      const lpoNo = row.lpo_no;
      return lpoNo != null && lpoNo !== "" ? `/lpo/${lpoNo}` : null;
    }
    default:
      return null;
  }
}

/**
 * @param {string} columnKey
 * @param {Record<string, unknown>} row
 * @param {ReportEntityLink | undefined} linkType
 */
export function reportCellHref(columnKey, row, linkType) {
  const type = linkType ?? inferReportLinkType(columnKey);
  return type ? reportEntityHref(type, row) : null;
}
