import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { apiRequest, organizationLogoFileUrl } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import { apiFetchCredentials } from "@/lib/auth-config";
import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  ensureSaleForPrint,
  fetchPrintModuleSettings,
} from "@/lib/print-module-settings";
import { enrichSaleLinesForQtyPrint, saleLineProductName } from "@/lib/sale-line-items";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import {
  extractKraReceiptData,
  ensureKraQrForPrint,
} from "@/lib/kra-receipt-qr";
import { isKraDeviceConfigured } from "@/lib/finance-settings";
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
import { isPrintAgentEnabled } from "@/lib/print-agent";

function isOfflineSalePrint(sale, options = {}) {
  return (
    Boolean(options.skipNetworkLookups) ||
    Boolean(sale?.offline_pending_sync) ||
    String(sale?.id ?? "").startsWith("offline:")
  );
}

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

async function fetchUserPrintName(userId) {
  if (userId == null || userId === "") return null;
  try {
    const user = await apiRequest(`/users/${userId}`, { loading: false, reportIssues: false });
    return (
      user.full_name ??
      user.name ??
      user.display_name ??
      user.username ??
      user.login ??
      user.user_name ??
      null
    );
  } catch {
    return null;
  }
}

async function resolveSaleOrderCreatorNameForPrint(sale, options = {}) {
  // Prefer names already in memory (sale payload / POS session) — never block print on WAN.
  const preparedBy =
    options.preparedBy ??
    options.user?.full_name ??
    options.user?.name ??
    options.user ??
    null;
  const fromSale = resolveSaleOrderCreatorName(sale, preparedBy);
  if (fromSale !== "—") return fromSale;

  if (options.skipNetworkLookups || isOfflineSalePrint(sale, options)) {
    return "—";
  }

  const createdByName = await fetchUserPrintName(sale?.created_by);
  if (createdByName) return createdByName;

  const cashierName = await fetchUserPrintName(sale?.cashier_id);
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
  // Prefer Centrix Print Agent — avoid opening a blank iframe before enrichment,
  // and skip WAN lookups that hang on a dropped/slow link.
  const offlineSale = isOfflineSalePrint(sale, options);
  // Skip the browser print iframe when Centrix Print Agent is configured.
  const deferPrintWindow = !printWindow && isPrintAgentEnabled();
  if (!printWindow && !deferPrintWindow) {
    printWindow = openBlankPrintWindow(printWindowFeatures(documentType));
    if (!printWindow) {
      throw new Error(PRINT_BLOCKED_MESSAGE);
    }
  } else if (printWindow) {
    showPrintPreparing(printWindow);
  }

  try {
    const hasCompleteItems =
      Array.isArray(sale.items) &&
      sale.items.length > 0 &&
      !sale.items.some((line) => line?.product_code && !saleLineProductName(line));
    const loadedSale =
      options.skipSaleRefresh && hasCompleteItems
        ? sale
        : await ensureSaleForPrint(sale);
    const saleForPrint = enrichSaleLinesForQtyPrint(loadedSale, {
      productByCode: options.productByCode ?? null,
      uomById: options.uomById ?? null,
    });
    const moduleSettings =
      options.skipSettingsRefresh && fallbackModuleSettings
        ? fallbackModuleSettings
        : await fetchPrintModuleSettings(fallbackModuleSettings);
    const sales = mergeSalesSettings(moduleSettings);
    const general = mergeGeneralSettings(moduleSettings);
    const organizationId =
      options.organization?.id ??
      options.capabilities?.organization_id ??
      options.capabilities?.organization?.id;

    const copies = Math.max(1, Number(options.copies ?? sales.receipt_copies ?? 1) || 1);

    const skipNetworkLookups = offlineSale || isOfflineSalePrint(saleForPrint, options);

    const organizationAlreadyUsable =
      Boolean(options.organization?.name) || Boolean(options.organizationName);
    const fetchedOrganization =
      skipNetworkLookups || (options.skipOrganizationRefresh && organizationAlreadyUsable)
        ? null
        : organizationId
          ? await fetchOrganizationForPrint(organizationId)
          : null;
    const organization = fetchedOrganization
      ? { ...(options.organization ?? {}), ...fetchedOrganization }
      : options.organization ?? null;

    const [branch, customer, route] = await Promise.all([
      options.branch
        ? Promise.resolve(options.branch)
        : skipNetworkLookups
          ? Promise.resolve(null)
          : fetchBranch(saleForPrint.branch_id),
      options.customer
        ? Promise.resolve(options.customer)
        : skipNetworkLookups
          ? Promise.resolve(null)
          : fetchCustomer(saleForPrint.customer_num),
      options.route
        ? Promise.resolve(options.route)
        : skipNetworkLookups
          ? Promise.resolve(null)
          : fetchRoute(saleForPrint.route_id),
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
    const logoDataUrl =
      options.skipLogoFetch || skipNetworkLookups
        ? null
        : await fetchOrganizationLogoDataUrl(organization);
    if (logoDataUrl) {
      branding = { ...branding, logoUrl: logoDataUrl };
    }

    // When KRA is off: never hit WAN for fiscal/QR. When on: allow sale/KRA fetch unless
    // checkout already passed kraReceipt and we are on the fast POS path.
    const saleIsOfflinePending =
      Boolean(saleForPrint?.offline_pending_sync) ||
      String(saleForPrint?.id ?? "").startsWith("offline:");
    const kraConfigured = isKraDeviceConfigured(moduleSettings, options.capabilities);
    const kraAllowNetwork =
      kraConfigured &&
      !saleIsOfflinePending &&
      !(skipNetworkLookups && options.kraReceipt);

    let kraData = null;
    let kraQrDataUrl = null;
    try {
      ({ kraData, kraQrDataUrl } = await ensureKraQrForPrint(saleForPrint, {
        kraReceipt: options.kraReceipt,
        moduleSettings,
        capabilities: options.capabilities,
        allowNetwork: kraAllowNetwork,
        qrSize: documentType === "invoice" ? 140 : 100,
        requireQrWhenFiscalized: kraConfigured,
      }));
    } catch (kraPrintError) {
      // Re-throw when KRA is required — do not silently print without the QR.
      if (kraConfigured) {
        throw kraPrintError;
      }
      kraData = extractKraReceiptData(saleForPrint, options.kraReceipt);
      kraQrDataUrl = null;
    }

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
      preparedBy: orderCreatorName,
      organizationName: seller.name ?? options.organizationName ?? DEFAULT_PRINT_ORG_NAME,
      uomById: options.uomById ?? null,
    });

    return documentType;
  } catch (error) {
    disposePrintWindow(printWindow);
    throw error;
  }
}
