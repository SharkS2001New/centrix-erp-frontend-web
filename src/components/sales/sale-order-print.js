import { apiRequest } from "@/lib/api";
import { getOrderDocumentType, mergeSalesSettings } from "@/lib/sales-settings";
import { printSaleInvoice } from "@/components/sales/sale-invoice-print";
import { printSaleReceipt } from "@/components/sales/sale-receipt-print";

async function fetchSeller(organizationId) {
  try {
    const org = await apiRequest(`/organizations/${organizationId}`);
    return {
      name: org.org_name,
      address: org.org_address,
      email: org.org_email,
      phone: org.primary_tel,
      secondary_phone: org.secondary_tel,
      tax_pin: org.org_pin,
      vat_regno: org.vat_regno,
    };
  } catch {
    return null;
  }
}

async function fetchBranch(branchId) {
  if (branchId == null) return null;
  try {
    const branch = await apiRequest(`/branches/${branchId}`);
    return {
      name: branch.branch_name,
      address: branch.branch_address,
      phone: branch.branch_phone,
      email: branch.branch_email,
    };
  } catch {
    return null;
  }
}

async function fetchCustomer(customerNum) {
  if (customerNum == null) return null;
  try {
    return await apiRequest(`/customers/${customerNum}`);
  } catch {
    return null;
  }
}

/**
 * Print an order using the format configured in sales settings (receipt or invoice).
 */
export async function printSaleOrder(sale, options = {}) {
  if (!sale) return;

  const moduleSettings = options.moduleSettings ?? options.capabilities?.module_settings;
  const sales = mergeSalesSettings(moduleSettings);
  const documentType = options.documentType ?? getOrderDocumentType(moduleSettings);

  const [seller, branch, customer] = await Promise.all([
    options.seller
      ? Promise.resolve(options.seller)
      : options.capabilities?.organization_id
        ? fetchSeller(options.capabilities.organization_id)
        : Promise.resolve(null),
    options.branch ? Promise.resolve(options.branch) : fetchBranch(sale.branch_id),
    options.customer ? Promise.resolve(options.customer) : fetchCustomer(sale.customer_num),
  ]);

  if (documentType === "invoice") {
    printSaleInvoice(sale, {
      ...options,
      seller: seller ?? { name: options.organizationName ?? "POS / ERP" },
      branch,
      customer,
      invoiceValidDays: Number(sales.invoice_valid_days ?? 7),
    });
    return;
  }

  printSaleReceipt(sale, {
    ...options,
    seller: seller ?? { name: options.organizationName ?? "POS / ERP" },
    branch,
    customer,
    productDiscountsEnabled: Boolean(sales.allow_discounts),
    orderDiscountEnabled: Boolean(sales.enable_order_discount),
    customerNameEnabled: Boolean(sales.enable_checkout_customer_name),
    showBranchOnReceipt: Boolean(sales.show_branch_on_receipt),
  });
}
