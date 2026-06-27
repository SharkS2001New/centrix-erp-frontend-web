import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { apiRequest } from "@/lib/api";
import { isKraDeviceConfigured } from "@/lib/finance-settings";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import {
  extractKraReceiptData,
  kraReceiptQrDataUrl,
} from "@/lib/kra-receipt-qr";
import { resolveSaleDocumentBranding } from "@/lib/sale-document-print-shared";
import { requestOrderPrintType } from "@/lib/order-print-type-picker";
import {
  mergeSalesSettings,
  resolveOrderPrintDocumentType,
} from "@/lib/sales-settings";
import {
  resolveReceiptPaymentDetails,
  shouldShowReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";
import {
  resolveInvoiceDeliveryTerms,
  resolveInvoiceFooterLines,
} from "@/lib/invoice-print-settings";
import { printSaleInvoice } from "@/components/sales/sale-invoice-print";
import { printSaleReceipt } from "@/components/sales/sale-receipt-print";

async function fetchOrganization(organizationId) {
  try {
    return await apiRequest(`/organizations/${organizationId}`);
  } catch {
    return null;
  }
}

function sellerFromOrganization(org) {
  if (!org) return null;
  return {
    name: org.org_name,
    address: org.org_address,
    email: org.org_email,
    phone: org.primary_tel,
    secondary_phone: org.secondary_tel,
    tax_pin: org.org_pin,
    vat_regno: org.vat_regno,
  };
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

async function fetchRoute(routeId) {
  if (routeId == null) return null;
  try {
    return await apiRequest(`/routes/${routeId}`);
  } catch {
    return null;
  }
}

/**
 * Resolve thermal vs A4 before printing. Prompts when org setting is "both".
 * @returns {Promise<"receipt"|"invoice"|null>}
 */
export async function resolveOrderPrintType(moduleSettings, explicitType) {
  let documentType = resolveOrderPrintDocumentType(moduleSettings, explicitType);
  if (!documentType) {
    documentType = await requestOrderPrintType();
  }
  return documentType ?? null;
}

/**
 * Print an order using the format configured in sales settings (receipt, invoice, or chosen).
 */
export async function printSaleOrder(sale, options = {}) {
  if (!sale) return null;

  const moduleSettings = options.moduleSettings ?? options.capabilities?.module_settings;
  const sales = mergeSalesSettings(moduleSettings);
  const general = mergeGeneralSettings(moduleSettings);
  const organizationId = options.capabilities?.organization_id;

  const documentType = await resolveOrderPrintType(moduleSettings, options.documentType);
  if (!documentType) return null;

  const [organization, branch, customer, route] = await Promise.all([
    options.organization
      ? Promise.resolve(options.organization)
      : organizationId
        ? fetchOrganization(organizationId)
        : Promise.resolve(null),
    options.branch ? Promise.resolve(options.branch) : fetchBranch(sale.branch_id),
    options.customer ? Promise.resolve(options.customer) : fetchCustomer(sale.customer_num),
    options.route ? Promise.resolve(options.route) : fetchRoute(sale.route_id),
  ]);

  const seller =
    options.seller ??
    sellerFromOrganization(organization) ??
    (options.organizationName ? { name: options.organizationName } : null) ??
    { name: DEFAULT_PRINT_ORG_NAME };

  const branding = resolveSaleDocumentBranding({
    organization,
    generalSettings: general,
  });

  const kraEnabled = isKraDeviceConfigured(moduleSettings, options.capabilities);
  const kraData = kraEnabled ? extractKraReceiptData(sale, options.kraReceipt) : null;
  const kraQrDataUrl =
    kraData?.signatureLink != null
      ? await kraReceiptQrDataUrl(kraData.signatureLink, {
          size: documentType === "invoice" ? 140 : 110,
        })
      : null;

  const paymentInstructions = resolveReceiptPaymentDetails({
    moduleSettings,
    route,
    sale,
    overrideDetails: options.paymentInstructions ?? null,
  });

  const printOptions = {
    ...options,
    seller,
    branch,
    customer,
    route,
    branding,
    organization,
    productDiscountsEnabled: Boolean(sales.allow_discounts),
    orderDiscountEnabled: Boolean(sales.enable_order_discount),
    customerNameEnabled: Boolean(sales.enable_checkout_customer_name),
    showBranchOnReceipt: Boolean(sales.show_branch_on_receipt),
    documentFooterText: resolvePrintFooter(
      general,
      documentType === "invoice" ? "invoice" : "receipt",
    ),
    paymentInstructions,
    showPaymentInstructions: shouldShowReceiptPaymentDetails(
      moduleSettings,
      documentType === "invoice" ? "invoice" : "receipt",
    ),
    kraEnabled,
    kraData,
    kraQrDataUrl,
  };

  if (documentType === "invoice") {
    const deliveryTerms = resolveInvoiceDeliveryTerms(sales);
    const footerLines = resolveInvoiceFooterLines(sales, {
      organizationName: seller.name ?? organization?.org_name ?? "",
      validDays: Number(sales.invoice_valid_days ?? 7),
    });
    printSaleInvoice(sale, {
      ...printOptions,
      invoiceValidDays: Number(sales.invoice_valid_days ?? 7),
      preparedBy: options.preparedBy ?? sale.cashier_name ?? sale.user?.full_name ?? null,
      deliveryTerms,
      footerLines,
    });
    return documentType;
  }

  printSaleReceipt(sale, {
    ...printOptions,
    organizationName: seller.name ?? options.organizationName ?? DEFAULT_PRINT_ORG_NAME,
  });

  return documentType;
}
