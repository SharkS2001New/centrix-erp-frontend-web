import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { apiRequest, organizationLogoFileUrl } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import { apiFetchCredentials } from "@/lib/auth-config";
import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  ensureSaleForPrint,
  fetchPrintModuleSettings,
} from "@/lib/print-module-settings";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import {
  kraReceiptQrDataUrl,
  resolveKraReceiptDataForSale,
} from "@/lib/kra-receipt-qr";
import { resolveSaleDocumentBranding, resolveSaleOrderCreatorName } from "@/lib/sale-document-print-shared";
import { organizationHasLogo } from "@/lib/reports/report-branding";
import { requestOrderPrintType } from "@/lib/order-print-type-picker";
import {
  mergeSalesSettings,
  resolveOrderPrintDocumentType,
} from "@/lib/sales-settings";
import {
  resolveReceiptPaymentDetails,
  shouldShowReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";
import { printSaleInvoice } from "@/components/sales/sale-invoice-print";
import { printSaleReceipt } from "@/components/sales/sale-receipt-print";
import { fetchLegacyArchiveSaleForPrint } from "@/lib/legacy-archive-api";
import {
  disposePrintWindow,
  openBlankPrintWindow,
  printWindowFeatures,
  showPrintPreparing,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";

async function fetchOrganizationForPrint(organizationId) {
  if (!organizationId) return null;
  try {
    const res = await apiRequest("/erp/organization/profile", {
      loading: false,
      reportIssues: false,
    });
    return res?.organization ?? res;
  } catch {
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
}

async function fetchOrganizationLogoDataUrl(organization) {
  if (!organization?.id || !organizationHasLogo(organization)) return null;
  const url = organizationLogoFileUrl(organization.id, {
    filePath: organization.logo_file_path ?? undefined,
  });
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers, credentials: apiFetchCredentials() });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
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

async function fetchUserDisplayName(userId) {
  if (userId == null || userId === "") return null;
  try {
    const user = await apiRequest(`/users/${userId}`, { loading: false, reportIssues: false });
    return user.full_name ?? user.name ?? user.username ?? null;
  } catch {
    return null;
  }
}

async function resolveSaleOrderCreatorNameForPrint(sale, options = {}) {
  const fromSale = resolveSaleOrderCreatorName(sale, options.preparedBy);
  if (fromSale !== "—") return fromSale;

  const createdByName = await fetchUserDisplayName(sale?.created_by);
  if (createdByName) return createdByName;

  const cashierName = await fetchUserDisplayName(sale?.cashier_id);
  if (cashierName) return cashierName;

  return "—";
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

function legacyArchiveSaleDate(archiveSale) {
  const raw = archiveSale?.legacy_sale_date ?? archiveSale?.sale_date;
  if (!raw) return null;
  const text = String(raw);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

/**
 * Print a legacy archive sale directly from LightStores (no Centrix materialization).
 */
export async function printLegacyArchiveSale(archiveSale, options = {}) {
  if (!archiveSale) return null;

  const channel = archiveSale.archive_channel ?? archiveSale.channel;
  const legacyOrderNum = archiveSale.legacy_order_num;
  const saleDate = legacyArchiveSaleDate(archiveSale);
  if (!channel || legacyOrderNum == null || !saleDate) {
    throw new Error("Legacy archive sale is missing channel, order number, or sale date.");
  }

  const saleForPrint =
    Array.isArray(archiveSale.items) && archiveSale.items.length > 0
      ? archiveSale
      : await fetchLegacyArchiveSaleForPrint(channel, legacyOrderNum, { sale_date: saleDate });

  return printSaleOrder(saleForPrint, options);
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

    const fetchedOrganization = organizationId
      ? await fetchOrganizationForPrint(organizationId)
      : null;
    const organization = fetchedOrganization
      ? { ...(options.organization ?? {}), ...fetchedOrganization }
      : options.organization ?? null;

    const [branch, customer, route] = await Promise.all([
      options.branch ? Promise.resolve(options.branch) : fetchBranch(saleForPrint.branch_id),
      options.customer ? Promise.resolve(options.customer) : fetchCustomer(saleForPrint.customer_num),
      options.route ? Promise.resolve(options.route) : fetchRoute(saleForPrint.route_id),
    ]);

    const seller =
      options.seller ??
      sellerFromOrganization(organization) ??
      (options.organizationName ? { name: options.organizationName } : null) ??
      { name: DEFAULT_PRINT_ORG_NAME };

    let branding = resolveSaleDocumentBranding({
      organization,
      generalSettings: general,
      organizationNameFallback: seller.name ?? options.organizationName ?? "",
    });
    const logoDataUrl = await fetchOrganizationLogoDataUrl(organization);
    if (logoDataUrl) {
      branding = { ...branding, logoUrl: logoDataUrl };
    }

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

    const printedBy = resolvePrintedByUser(options.printedBy ?? options.user);
    const orderCreatorName = await resolveSaleOrderCreatorNameForPrint(saleForPrint, options);

    const printOptions = {
      ...options,
      moduleSettings,
      seller,
      branch,
      customer,
      route,
      branding,
      organization,
      printedBy,
      generalSettings: general,
      productDiscountsEnabled: Boolean(
        sales.effective_allow_discounts ||
          sales.allow_discounts ||
          sales.discount_approval_enabled ||
          sales.discount_approval_enabled_mobile ||
          sales.discount_approval_enabled_backoffice,
      ),
      orderDiscountEnabled: Boolean(
        sales.effective_enable_order_discount ||
          sales.enable_order_discount ||
          sales.discount_approval_enabled ||
          sales.discount_approval_enabled_mobile ||
          sales.discount_approval_enabled_backoffice,
      ),
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
      salesSettings: sales,
    };

    if (documentType === "invoice") {
      for (let copy = 0; copy < copies; copy += 1) {
        printSaleInvoice(saleForPrint, {
          ...printOptions,
          invoiceValidDays: Number(sales.invoice_valid_days ?? 7),
          preparedBy: orderCreatorName,
          uomById: options.uomById ?? null,
        });
      }
      return documentType;
    }

    await printSaleReceipt(saleForPrint, {
      ...printOptions,
      copies,
      organizationName: seller.name ?? options.organizationName ?? DEFAULT_PRINT_ORG_NAME,
      uomById: options.uomById ?? null,
    });

    return documentType;
  } catch (error) {
    disposePrintWindow(printWindow);
    throw error;
  }
}
