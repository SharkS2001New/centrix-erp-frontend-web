import { apiRequest } from "@/lib/api";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { mergeProcurementSettings } from "@/lib/procurement-settings";
import { fetchPrintModuleSettings } from "@/lib/print-module-settings";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { buildLpoPrintHtml } from "@/components/lpo/lpo-print-html";
import {
  disposePrintWindow,
  fillPrintWindow,
  openBlankPrintWindow,
  printWindowFeatures,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";

async function loadLpoPrintPayload(lpoNo, options = {}) {
  const prefetched = options.lpoSummary;
  const summary =
    prefetched?.lpo != null
      ? prefetched
      : await apiRequest(`/lpo-mst/${lpoNo}/summary`, { loading: false, reportIssues: false });

  const orgId = options.organization?.id ?? options.capabilities?.organization_id;
  const branchId = options.user?.branch_id;
  const supplierId = summary?.lpo?.supplier_id;

  const [organization, branch, supplier, settings] = await Promise.all([
    options.organization?.org_name || options.organization?.name
      ? Promise.resolve(options.organization)
      : orgId
        ? apiRequest(`/organizations/${orgId}`, { loading: false, reportIssues: false })
            .then((res) => res?.organization ?? res)
            .catch(() => null)
        : Promise.resolve(null),
    branchId
      ? apiRequest(`/branches/${branchId}`, { loading: false, reportIssues: false }).catch(() => null)
      : Promise.resolve(null),
    options.supplier
      ? Promise.resolve(options.supplier)
      : supplierId
        ? apiRequest(`/suppliers/${supplierId}`, { loading: false, reportIssues: false }).catch(() => null)
        : Promise.resolve(null),
    options.printSettings && options.generalSettings
      ? Promise.resolve({
          sales: null,
          general: options.generalSettings,
          procurement: options.printSettings,
        })
      : fetchPrintModuleSettings(options.moduleSettings ?? options.capabilities?.module_settings ?? null),
  ]);

  const generalSettings = mergeGeneralSettings(settings);
  const printSettings = mergeProcurementSettings(settings);

  let buyer = {};
  if (branch) {
    buyer = {
      name: organization?.org_name,
      address: branch.branch_address,
      phone: branch.branch_phone ?? branch.phone,
      email: branch.branch_email ?? branch.email,
      tax_pin: branch.tax_pin ?? branch.kra_pin ?? organization?.org_pin,
      po_box: branch.po_box,
    };
  } else if (organization) {
    buyer = {
      name: organization.org_name,
      address: organization.org_address,
      phone: organization.primary_tel,
      email: organization.org_email,
      tax_pin: organization.org_pin,
    };
  }

  return {
    lpo: summary.lpo,
    lines: summary.lines ?? [],
    buyer,
    organization,
    supplier,
    printSettings,
    generalSettings,
    documentFooterText: resolvePrintFooter(generalSettings, "lpo"),
    printedBy: options.user?.full_name ?? options.user?.username ?? null,
  };
}

/**
 * Print an LPO or delivery note via the browser print dialog (no app navigation).
 * @param {string|number} lpoNo
 * @param {{ variant?: "lpo"|"delivery_note", printWindow?: Window, capabilities?: object, user?: object, moduleSettings?: object }} options
 */
export async function printLpoOrder(lpoNo, options = {}) {
  if (lpoNo == null) return null;

  const variant = options.variant === "delivery_note" ? "delivery_note" : "lpo";

  let printWindow = options.printWindow ?? null;
  if (!printWindow) {
    printWindow = openBlankPrintWindow(printWindowFeatures("invoice"));
    if (!printWindow) {
      throw new Error(PRINT_BLOCKED_MESSAGE);
    }
  }

  try {
    const payload = await loadLpoPrintPayload(lpoNo, options);
    const html = buildLpoPrintHtml({
      ...payload,
      variant,
    });
    fillPrintWindow(printWindow, html);
    return variant;
  } catch (error) {
    disposePrintWindow(printWindow);
    throw error;
  }
}

/** User-click handler: open print dialog without navigating away from the app. */
export async function runLpoPrintClick(lpoNo, options = {}) {
  const variant = options.variant === "delivery_note" ? "delivery_note" : "lpo";
  return printLpoOrder(lpoNo, { ...options, variant });
}
