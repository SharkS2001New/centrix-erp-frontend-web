import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { apiRequest } from "@/lib/api";
import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  ensureSaleForPrint,
  fetchPrintModuleSettings,
} from "@/lib/print-module-settings";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import {
  kraReceiptQrDataUrl,
  resolveKraReceiptDataForSale,
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
import {
  disposePrintWindow,
  openBlankPrintWindow,
  printWindowFeatures,
  showPrintPreparing,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";

async function fetchOrganization(organizationId) {
  try {
    const res = await apiRequest(`/organizations/${organizationId}`, {
      loading: false,
      reportIssues: false,
    });
    return res?.organization ?? res;
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
    const branch = await apiRequest(`/branches/${branchId}`, { loading: false, reportIssues: false });
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
    return await apiRequest(`/customers/${customerNum}`, { loading: false, reportIssues: false });
  } catch {
    return null;
  }
}

async function fetchRoute(routeId) {
  if (routeId == null) return null;
  try {
    return await apiRequest(`/routes/${routeId}`, { loading: false, reportIssues: false });
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

  const fallbackModuleSettings =
    options.moduleSettings ?? options.capabilities?.module_settings ?? null;

  const documentType = await resolveOrderPrintType(
    fallbackModuleSettings,
    options.documentType,
  );
  if (!documentType) {
    disposePrintWindow(options.printWindow);
    return null;
  }

  let printWindow = options.printWindow ?? null;
  if (!printWindow) {
    printWindow = openBlankPrintWindow(printWindowFeatures(documentType));
    if (!printWindow) {
      throw new Error(PRINT_BLOCKED_MESSAGE);
    }
  } else {
    showPrintPreparing(printWindow);
  }

  try {
    const saleForPrint = await ensureSaleForPrint(sale);
    const moduleSettings = await fetchPrintModuleSettings(fallbackModuleSettings);
    const sales = mergeSalesSettings(moduleSettings);
    const general = mergeGeneralSettings(moduleSettings);
    const organizationId =
      options.organization?.id ??
      options.capabilities?.organization_id ??
      options.capabilities?.organization?.id;

    const copies = Math.max(1, Number(options.copies ?? sales.receipt_copies ?? 1) || 1);

    const [organization, branch, customer, route] = await Promise.all([
      options.organization?.org_name || options.organization?.name
        ? Promise.resolve(options.organization)
        : organizationId
          ? fetchOrganization(organizationId)
          : Promise.resolve(null),
      options.branch ? Promise.resolve(options.branch) : fetchBranch(saleForPrint.branch_id),
      options.customer ? Promise.resolve(options.customer) : fetchCustomer(saleForPrint.customer_num),
      options.route ? Promise.resolve(options.route) : fetchRoute(saleForPrint.route_id),
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

    const kraData = await resolveKraReceiptDataForSale(saleForPrint, options.kraReceipt);
    const kraQrDataUrl =
      kraData?.signatureLink != null
        ? await kraReceiptQrDataUrl(kraData.signatureLink, {
            size: documentType === "invoice" ? 140 : 100,
          })
        : null;

    const paymentInstructions = resolveReceiptPaymentDetails({
      moduleSettings,
      route,
      sale: saleForPrint,
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
      kraData,
      kraQrDataUrl,
      printWindow,
    };

    if (documentType === "invoice") {
      const deliveryTerms = resolveInvoiceDeliveryTerms(sales);
      const footerLines = resolveInvoiceFooterLines(sales, {
        organizationName: seller.name ?? organization?.org_name ?? "",
        validDays: Number(sales.invoice_valid_days ?? 7),
      });
      for (let copy = 0; copy < copies; copy += 1) {
        printSaleInvoice(saleForPrint, {
          ...printOptions,
          invoiceValidDays: Number(sales.invoice_valid_days ?? 7),
          preparedBy:
            options.preparedBy ?? saleForPrint.cashier_name ?? saleForPrint.user?.full_name ?? null,
          deliveryTerms,
          footerLines,
        });
      }
      return documentType;
    }

    for (let copy = 0; copy < copies; copy += 1) {
      printSaleReceipt(saleForPrint, {
        ...printOptions,
        organizationName: seller.name ?? options.organizationName ?? DEFAULT_PRINT_ORG_NAME,
        uomById: options.uomById ?? null,
      });
    }

    return documentType;
  } catch (error) {
    disposePrintWindow(printWindow);
    throw error;
  }
}
