/** Platform-controlled hospitality payment statuses — unpaid | partially_paid | paid. */

export const HOSPITALITY_PAYMENT_WORKFLOW_DEFAULTS = {
  unpaid: true,
  partially_paid: true,
  paid: true,
};

export const HOSPITALITY_PAYMENT_WORKFLOW_CATALOG = [
  {
    key: "unpaid",
    label: "Unpaid",
    description: "Save order / print receipt — payment collected later by cashier.",
  },
  {
    key: "partially_paid",
    label: "Partially paid",
    description: "Customer paid some of the bill; balance still due.",
  },
  {
    key: "paid",
    label: "Paid",
    description: "Fully settled (always available — cannot be turned off).",
  },
];

export function normalizeHospitalityPaymentWorkflow(raw) {
  const out = { ...HOSPITALITY_PAYMENT_WORKFLOW_DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(out)) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = Boolean(raw[key]);
    }
  }
  // Paid cannot be disabled — settle needs a terminal status.
  out.paid = true;
  return out;
}

export function resolveHospitalityPaymentWorkflow(capabilitiesOrSettings = null) {
  const hospitality =
    capabilitiesOrSettings?.module_settings?.hospitality ??
    capabilitiesOrSettings?.hospitality ??
    capabilitiesOrSettings?.module_settings ??
    capabilitiesOrSettings;
  const fromSettings = hospitality?.payment_workflow;
  const fromPlatform = capabilitiesOrSettings?.hospitality_payment_workflow;
  return normalizeHospitalityPaymentWorkflow(fromSettings ?? fromPlatform);
}

export function isHospitalityPaymentStatusEnabled(capabilitiesOrSettings, statusKey) {
  const workflow = resolveHospitalityPaymentWorkflow(capabilitiesOrSettings);
  return Boolean(workflow[statusKey]);
}
