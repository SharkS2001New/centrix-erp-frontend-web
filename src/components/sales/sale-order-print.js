import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { apiRequest } from "@/lib/api";
import { mergeGeneralSettings } from "@/lib/general-settings";
import {
  ensureSaleForPrint,
  fetchPrintModuleSettings,
} from "@/lib/print-module-settings";
import { withPosReceiptTicket } from "@/lib/pos-offline";
import { enrichSaleLinesForQtyPrint, saleLineProductName } from "@/lib/sale-line-items";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import {
  extractKraReceiptData,
  ensureKraQrForPrint,
  kraFailedWithoutVerificationLink,
} from "@/lib/kra-receipt-qr";
import { isKraDeviceConfigured } from "@/lib/finance-settings";
import { resolveSaleDocumentBranding, resolveSaleOrderCreatorName } from "@/lib/sale-document-print-shared";
import { fetchOrganizationLogoDataUrl } from "@/lib/organization-logo";
import { requestOrderPrintType } from "@/lib/order-print-type-picker";
import {
  mergeSalesSettings,
  resolveOrderPrintDocumentType,
} from "@/lib/sales-settings";
import {
  resolveReceiptPaymentDetails,
  shouldShowReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";
import { resolveProformaValidDays } from "@/lib/proforma-print-settings";
import { printSaleInvoice } from "@/components/sales/sale-invoice-print";
import { buildSaleReceiptHtml } from "@/components/sales/sale-receipt-print";
import { fetchLegacyArchiveSaleForPrint } from "@/lib/legacy-archive-api";
import {
  disposePrintWindow,
  openBlankPrintWindow,
  printWindowFeatures,
  showPrintPreparing,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";
import { dispatchPrintJob, shouldUsePrintAgentForDocument } from "@/lib/print-dispatch";

function ensureBatchPrintCache(cache = null) {
  if (cache && typeof cache === "object") {
    return {
      moduleSettingsPromise: cache.moduleSettingsPromise ?? null,
      organizationPromise: cache.organizationPromise ?? null,
      logoDataUrlPromise: cache.logoDataUrlPromise ?? null,
      branchById: cache.branchById ?? new Map(),
      customerByNum: cache.customerByNum ?? new Map(),
      routeById: cache.routeById ?? new Map(),
      userNameById: cache.userNameById ?? new Map(),
    };
  }
  return {
    moduleSettingsPromise: null,
    organizationPromise: null,
    logoDataUrlPromise: null,
    branchById: new Map(),
    customerByNum: new Map(),
    routeById: new Map(),
    userNameById: new Map(),
  };
}

function getOrCreateCachedPromise(map, key, factory) {
  if (key == null || key === "") return Promise.resolve(null);
  if (map.has(key)) return map.get(key);
  const promise = Promise.resolve()
    .then(factory)
    .catch(() => null);
  map.set(key, promise);
  return promise;
}

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

async function fetchUserPrintNameCached(userId, cache = null) {
  const batchCache = ensureBatchPrintCache(cache);
  return getOrCreateCachedPromise(batchCache.userNameById, userId, () => fetchUserPrintName(userId));
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

  const createdByName = await fetchUserPrintNameCached(sale?.created_by, options.printCache);
  if (createdByName) return createdByName;

  const cashierName = await fetchUserPrintNameCached(sale?.cashier_id, options.printCache);
  if (cashierName) return cashierName;

  return "—";
}

export async function warmSalePrintBatch(sales, options = {}) {
  const batchCache = ensureBatchPrintCache(options.printCache);
  const rows = Array.isArray(sales) ? sales.filter(Boolean) : [];
  const fallbackModuleSettings =
    options.moduleSettings ?? options.capabilities?.module_settings ?? null;
  const organizationId =
    options.organization?.id ??
    options.capabilities?.organization_id ??
    options.capabilities?.organization?.id ??
    null;
  const organizationAlreadyUsable =
    Boolean(options.organization?.name) || Boolean(options.organizationName);

  if (!(options.skipSettingsRefresh && fallbackModuleSettings) && !batchCache.moduleSettingsPromise) {
    batchCache.moduleSettingsPromise = fetchPrintModuleSettings(fallbackModuleSettings)
      .catch(() => fallbackModuleSettings ?? null);
  }

  if (
    !batchCache.organizationPromise &&
    !(options.skipOrganizationRefresh && organizationAlreadyUsable) &&
    organizationId
  ) {
    batchCache.organizationPromise = fetchOrganizationForPrint(organizationId).catch(() => null);
  }

  await Promise.allSettled(rows.flatMap((sale) => {
    const skipNetworkLookups = isOfflineSalePrint(sale, options);
    const tasks = [];

    if (!skipNetworkLookups) {
      tasks.push(getOrCreateCachedPromise(batchCache.branchById, sale?.branch_id, () => fetchBranch(sale?.branch_id)));
      tasks.push(
        getOrCreateCachedPromise(batchCache.customerByNum, sale?.customer_num, () => fetchCustomer(sale?.customer_num)),
      );
      tasks.push(getOrCreateCachedPromise(batchCache.routeById, sale?.route_id, () => fetchRoute(sale?.route_id)));
      tasks.push(fetchUserPrintNameCached(sale?.created_by, batchCache));
      tasks.push(fetchUserPrintNameCached(sale?.cashier_id, batchCache));
    }
    return tasks;
  }));

  const organizationFromCache = batchCache.organizationPromise
    ? await batchCache.organizationPromise.catch(() => null)
    : options.organization ?? null;
  const organization = organizationFromCache
    ? { ...(options.organization ?? {}), ...organizationFromCache }
    : options.organization ?? null;

  if (!batchCache.logoDataUrlPromise && organization) {
    batchCache.logoDataUrlPromise = fetchOrganizationLogoDataUrl(organization).catch(() => null);
  }

  return batchCache;
}

/**
 * Resolve thermal vs A4 before printing. Prompts when org setting is "both".
 * Explicit "proforma" always wins (unpaid bank document — non-fiscal).
 * @returns {Promise<"receipt"|"invoice"|"proforma"|null>}
 */
export async function resolveOrderPrintType(moduleSettings, explicitType) {
  if (explicitType === "proforma") return "proforma";
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
  const job = await prepareSaleOrderPrintJob(sale, options);
  if (!job?.ok) {
    if (job?.cancelled) return null;
    throw new Error(job?.error || "Print failed.");
  }
  const result = await dispatchPreparedSalePrintJob(job);
  if (!result?.ok) {
    throw new Error(
      result?.error || "Print failed — nothing was sent to the printer.",
    );
  }
  return job.documentType;
}

/**
 * Build a ready-to-queue print job (HTML + metadata) without sending it to the printer.
 * Batch printing prepares a whole chunk this way, then queues every job at once.
 */
export async function prepareSaleOrderPrintJob(sale, options = {}) {
  if (!sale) return { ok: false, error: "Missing sale." };

  const fallbackModuleSettings =
    options.moduleSettings ?? options.capabilities?.module_settings ?? null;
  const batchCache = ensureBatchPrintCache(options.printCache);

  const documentType = await resolveOrderPrintType(
    fallbackModuleSettings,
    options.documentType,
  );
  if (!documentType) {
    disposePrintWindow(options.printWindow);
    return { ok: false, cancelled: true };
  }

  let printWindow = options.printWindow ?? null;
  // Prefer Centrix Print Agent for all document types — avoid opening a blank iframe
  // before enrichment (passing printWindow forces browser printing in dispatchPrintJob).
  const offlineSale = isOfflineSalePrint(sale, options);
  const deferPrintWindow =
    !printWindow && shouldUsePrintAgentForDocument(documentType);
  if (!printWindow && !deferPrintWindow && !options.deferBrowserWindow) {
    printWindow = openBlankPrintWindow(printWindowFeatures(documentType));
    if (!printWindow) {
      return { ok: false, error: PRINT_BLOCKED_MESSAGE };
    }
  } else if (printWindow) {
    showPrintPreparing(printWindow);
  }

  try {
    const hasCompleteItems =
      Array.isArray(sale.items) &&
      sale.items.length > 0 &&
      !sale.items.some((line) => line?.product_code && !saleLineProductName(line));
    // POS checkout / previous-order draft: skipSaleRefresh with complete in-memory
    // lines. Never require eTIMS QR — that forced a GET of the pre-edit sale and
    // reprinted the old items after swap/qty changes.
    const skipSaleRefresh =
      options.skipNetworkLookups ||
      offlineSale ||
      isOfflineSalePrint(sale, options) ||
      (options.skipSaleRefresh && hasCompleteItems) ||
      Boolean(sale?._skip_kra_qr) ||
      Boolean(sale?.offline_pending_sync) ||
      String(sale?.id ?? "").startsWith("offline:");
    const loadedSale = withPosReceiptTicket(
      skipSaleRefresh ? sale : await ensureSaleForPrint(sale),
      sale,
    );

    // Explicit print is never blocked by stock / workflow can_print_invoice flags.
    // (POS checkout still passes skipStockPrintGate for the fast path.)

    const saleForPrint = enrichSaleLinesForQtyPrint(loadedSale, {
      productByCode: options.productByCode ?? null,
      uomById: options.uomById ?? null,
    });
    const moduleSettings =
      options.skipSettingsRefresh && fallbackModuleSettings
        ? fallbackModuleSettings
        : await (
          batchCache.moduleSettingsPromise
            ?? (batchCache.moduleSettingsPromise = fetchPrintModuleSettings(fallbackModuleSettings)
              .catch(() => fallbackModuleSettings ?? null))
        );
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
          ? await (
            batchCache.organizationPromise
              ?? (batchCache.organizationPromise = fetchOrganizationForPrint(organizationId).catch(() => null))
          )
          : null;
    const organization = fetchedOrganization
      ? { ...(options.organization ?? {}), ...fetchedOrganization }
      : options.organization ?? null;

    const [branch, customer, route] = await Promise.all([
      options.branch
        ? Promise.resolve(options.branch)
        : skipNetworkLookups
          ? Promise.resolve(null)
          : getOrCreateCachedPromise(batchCache.branchById, saleForPrint.branch_id, () => fetchBranch(saleForPrint.branch_id)),
      options.customer
        ? Promise.resolve(options.customer)
        : skipNetworkLookups
          ? Promise.resolve(null)
          : getOrCreateCachedPromise(
            batchCache.customerByNum,
            saleForPrint.customer_num,
            () => fetchCustomer(saleForPrint.customer_num),
          ),
      options.route
        ? Promise.resolve(options.route)
        : skipNetworkLookups
          ? Promise.resolve(null)
          : getOrCreateCachedPromise(batchCache.routeById, saleForPrint.route_id, () => fetchRoute(saleForPrint.route_id)),
    ]);

    const seller =
      options.seller ??
      sellerFromOrganization(organization) ??
      (options.organizationName ? { name: options.organizationName } : null) ??
      { name: DEFAULT_PRINT_ORG_NAME };

    // Proforma = unpaid bank document — never fiscalize / never require KRA QR.
    const isProforma = documentType === "proforma";

    let branding = resolveSaleDocumentBranding({
      organization,
      generalSettings: general,
      organizationNameFallback: seller.name ?? options.organizationName ?? "",
      documentVariant: isProforma
        ? "proforma"
        : documentType === "invoice"
          ? "invoice"
          : documentType === "receipt"
            ? "receipt"
            : null,
    });
    const logoDataUrl =
      options.skipLogoFetch || skipNetworkLookups
        ? null
        : await (
          batchCache.logoDataUrlPromise
            ?? (batchCache.logoDataUrlPromise = fetchOrganizationLogoDataUrl(organization).catch(() => null))
        );
    if (logoDataUrl) {
      branding = { ...branding, logoUrl: logoDataUrl };
    }

    // When KRA is off: never hit WAN for fiscal/QR. When on: allow sale/KRA fetch unless
    // checkout already passed kraReceipt and we are on the fast POS path.
    // Callers can force-skip (e.g. previous-order draft reprint — KRA syncs in background).
    const saleIsOfflinePending =
      Boolean(saleForPrint?.offline_pending_sync) ||
      String(saleForPrint?.id ?? "").startsWith("offline:") ||
      Boolean(saleForPrint?._skip_kra_qr);
    const kraConfigured = isKraDeviceConfigured(moduleSettings, options.capabilities);
    // Only skip WAN when we already have a usable verification link. A success
    // kra_response without signature_link must still fetch — otherwise fast
    // checkout print fails intermittently when the device omits the QR URL.
    const kraInlineForGate = extractKraReceiptData(
      saleForPrint,
      saleForPrint?._skip_kra_qr ? null : options.kraReceipt,
    );
    const kraAlreadyFailed = kraFailedWithoutVerificationLink(
      saleForPrint,
      saleForPrint?._skip_kra_qr ? null : options.kraReceipt,
    );
    const saleHasKraPayload = Boolean(
      saleForPrint?.kra_response ||
        saleForPrint?.kraResponse ||
        kraInlineForGate?.signatureLink ||
        kraInlineForGate?.invoiceNumber,
    );
    // Network fetch is org-scoped via /sales/{id}. Allow it when this org has KRA on,
    // or when the sale already carries fiscal payload (so a stale cross-org caps cache
    // cannot skip loading a saved signature_link). Never wait when KRA already failed.
    const kraAllowNetwork =
      options.allowKraNetwork != null
        ? Boolean(options.allowKraNetwork)
        : !saleIsOfflinePending &&
          !saleForPrint?._skip_kra_qr &&
          !kraAlreadyFailed &&
          !(skipNetworkLookups && Boolean(kraInlineForGate?.signatureLink)) &&
          (kraConfigured || saleHasKraPayload);

    let kraData = null;
    let kraQrDataUrl = null;
    if (!isProforma) {
      try {
        ({ kraData, kraQrDataUrl } = await ensureKraQrForPrint(saleForPrint, {
          kraReceipt: saleForPrint?._skip_kra_qr ? null : options.kraReceipt,
          moduleSettings,
          capabilities: options.capabilities,
          allowNetwork: kraAllowNetwork,
          qrSize: documentType === "invoice" ? 140 : 100,
        }));
      } catch {
        // Best-effort only — always fall through to a normal receipt/invoice.
        kraData = null;
        kraQrDataUrl = null;
      }
    }

    const paymentInstructions = resolveReceiptPaymentDetails({
      moduleSettings,
      route,
      sale: saleForPrint,
      overrideDetails: options.paymentInstructions ?? null,
      documentType: isProforma ? "proforma" : documentType === "invoice" ? "invoice" : "receipt",
    });

    const printedBy = resolvePrintedByUser(options.printedBy ?? options.user);
    const orderCreatorName = await resolveSaleOrderCreatorNameForPrint(saleForPrint, options);

    const footerDocType = documentType === "invoice" || isProforma ? "invoice" : "receipt";
    const paymentDetailsDocType = isProforma ? "proforma" : footerDocType;

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
      documentFooterText: resolvePrintFooter(general, footerDocType),
      paymentInstructions,
      showPaymentInstructions: shouldShowReceiptPaymentDetails(moduleSettings, paymentDetailsDocType),
      kraData,
      kraQrDataUrl,
      printWindow,
      salesSettings: sales,
    };

    if (documentType === "invoice" || isProforma) {
      return {
        ok: true,
        documentType,
        mode: isProforma ? "proforma" : "invoice",
        saleForPrint,
        printOptions: {
          ...printOptions,
          documentType: isProforma ? "proforma" : "invoice",
          invoiceValidDays: isProforma
            ? resolveProformaValidDays(sales)
            : Number(sales.invoice_valid_days ?? 7),
          preparedBy: orderCreatorName,
          uomById: options.uomById ?? null,
        },
        copies,
        printWindow,
      };
    }

    const html = buildSaleReceiptHtml(saleForPrint, {
      ...printOptions,
      copies,
      preparedBy: orderCreatorName,
      organizationName: seller.name ?? options.organizationName ?? DEFAULT_PRINT_ORG_NAME,
      uomById: options.uomById ?? null,
    });
    if (!html) {
      disposePrintWindow(printWindow);
      return { ok: false, error: "Could not build receipt HTML." };
    }

    return {
      ok: true,
      documentType: "receipt",
      mode: "receipt",
      html,
      copies,
      documentId: saleForPrint?.id ?? saleForPrint?.sale_id ?? sale?.id ?? null,
      printWindow,
      jobType: "receipt",
    };
  } catch (error) {
    disposePrintWindow(printWindow);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Print preparation failed.",
    };
  }
}

/** Send a prepared job to the Centrix agent queue or browser print dialog. */
export async function dispatchPreparedSalePrintJob(job, dispatchOptions = {}) {
  if (!job?.ok) return { mode: "browser", ok: false, error: job?.error || "Print failed." };

  if (job.mode === "invoice" || job.mode === "proforma") {
    const copies = Math.max(1, Number(job.copies ?? 1) || 1);
    let lastResult = { mode: "browser", ok: true };
    for (let copy = 0; copy < copies; copy += 1) {
      lastResult = await printSaleInvoice(job.saleForPrint, {
        ...job.printOptions,
        printWindow: copy === 0 ? job.printWindow ?? null : null,
      });
      if (!lastResult?.ok) return lastResult;
    }
    return lastResult;
  }

  return dispatchPrintJob({
    html: job.html,
    copies: job.copies,
    jobType: job.jobType ?? "receipt",
    documentId: job.documentId,
    printWindow: job.printWindow ?? null,
    windowFeatures: "width=420,height=720",
    allowBrowserFallback: dispatchOptions.allowBrowserFallback !== false,
  });
}
