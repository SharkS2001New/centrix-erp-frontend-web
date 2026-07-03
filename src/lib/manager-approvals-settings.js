import { mergeSalesSettings } from "@/lib/sales-settings";
import { notificationsFormFromApi } from "@/lib/notifications-settings";

/** Internal events that always notify managers (no org toggle yet). */
export const ALWAYS_ON_INTERNAL_EVENTS = [
  {
    id: "supplier_return",
    label: "Supplier return submitted",
    description: "Notifies users with purchasing manager permission when a supplier return is submitted for approval.",
    module: "customers_suppliers",
  },
  {
    id: "customer_return",
    label: "Customer return submitted",
    description: "Notifies sales managers when a customer return is submitted for approval.",
    module: "sales",
  },
  {
    id: "leave",
    label: "Leave request submitted",
    description: "Notifies HR managers when an employee submits a leave request.",
    module: "hr_payroll",
  },
];

export function hasManagerApprovalsSettingsTab(capabilities) {
  const modules = capabilities?.modules ?? {};
  return Boolean(
    modules.sales ||
      modules.inventory ||
      modules.customers_suppliers ||
      modules.hr_payroll ||
      modules.accounting ||
      modules.admin,
  );
}

export function managerApprovalsFormFromApiResponses(responses = {}) {
  const sales = mergeSalesSettings({ sales: responses.sales?.sales ?? responses.sales });
  const inventory = responses.inventory?.inventory ?? responses.inventory ?? {};
  const procurement = responses.procurement?.procurement ?? responses.procurement ?? {};
  const hr = responses.hr?.hr ?? responses.hr ?? {};
  const accounting = responses.accounting?.accounting ?? responses.accounting ?? {};
  const notifications = notificationsFormFromApi(responses.notifications ?? {});

  return {
    discount_approval_enabled: Boolean(sales.discount_approval_enabled),
    discount_approval_threshold_percent: String(sales.discount_approval_threshold_percent ?? 10),
    order_cancellation_approval_enabled: Boolean(sales.order_cancellation_approval_enabled),
    stock_adjustment_approval_enabled: Boolean(inventory.stock_adjustment_approval_enabled),
    stock_transfer_approval_enabled: Boolean(inventory.stock_transfer_approval_enabled),
    require_lpo_approval: Boolean(procurement.require_lpo_approval ?? true),
    require_payroll_approval: Boolean(hr.require_payroll_approval),
    journal_entry_approval_enabled: Boolean(accounting.journal_entry_approval_enabled),
    email_enabled: Boolean(notifications.email_enabled),
    notify_on_approval_request: Boolean(notifications.notify_on_approval_request),
    notify_on_approval_outcome: Boolean(notifications.notify_on_approval_outcome),
    approval_request_email_subject:
      notifications.approval_request_email_subject ?? "Approval required: {title}",
    approval_request_email_template:
      notifications.approval_request_email_template ?? "{message}\n\nOpen in Centrix: {link}",
    approval_outcome_email_subject: notifications.approval_outcome_email_subject ?? "{title}",
    approval_outcome_email_template:
      notifications.approval_outcome_email_template ?? "{message}\n\nOpen in Centrix: {link}",
  };
}

export function salesManagerApprovalsPayload(form) {
  return {
    discount_approval_enabled: Boolean(form.discount_approval_enabled),
    discount_approval_threshold_percent: Number(form.discount_approval_threshold_percent) || 10,
    order_cancellation_approval_enabled: Boolean(form.order_cancellation_approval_enabled),
  };
}

export function inventoryManagerApprovalsPayload(form) {
  return {
    stock_adjustment_approval_enabled: Boolean(form.stock_adjustment_approval_enabled),
    stock_transfer_approval_enabled: Boolean(form.stock_transfer_approval_enabled),
  };
}

export function procurementManagerApprovalsPayload(form) {
  return { require_lpo_approval: Boolean(form.require_lpo_approval) };
}

export function hrManagerApprovalsPayload(form) {
  return { require_payroll_approval: Boolean(form.require_payroll_approval) };
}

export function accountingManagerApprovalsPayload(form) {
  return { journal_entry_approval_enabled: Boolean(form.journal_entry_approval_enabled) };
}

export function managerApprovalsEmailPayload(form) {
  return {
    notify_on_approval_request: Boolean(form.notify_on_approval_request),
    notify_on_approval_outcome: Boolean(form.notify_on_approval_outcome),
    approval_request_email_subject: form.approval_request_email_subject?.trim() ?? "",
    approval_request_email_template: form.approval_request_email_template?.trim() ?? "",
    approval_outcome_email_subject: form.approval_outcome_email_subject?.trim() ?? "",
    approval_outcome_email_template: form.approval_outcome_email_template?.trim() ?? "",
  };
}

export function visibleAlwaysOnEvents(capabilities) {
  const modules = capabilities?.modules ?? {};
  return ALWAYS_ON_INTERNAL_EVENTS.filter((event) => {
    if (event.module === "customers_suppliers") return Boolean(modules.customers_suppliers);
    return Boolean(modules[event.module]);
  });
}
