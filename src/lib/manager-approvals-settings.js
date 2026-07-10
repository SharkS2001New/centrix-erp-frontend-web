import { mergeSalesSettings } from "@/lib/sales-settings";
import { notificationsFormFromApi } from "@/lib/notifications-settings";

/** Internal approval events covered by the approval-request in-app toggle. */
export const APPROVAL_REQUEST_EVENTS = [
  {
    id: "supplier_return",
    label: "Supplier return submitted",
    description: "Notifies users with Purchasing manage when a supplier return is submitted for approval.",
    module: "customers_suppliers",
  },
  {
    id: "customer_return",
    label: "Customer return submitted",
    description: "Notifies users with Sales manage when a customer return is submitted for approval.",
    module: "sales",
  },
  {
    id: "discount",
    label: "Discount approval requested",
    description:
      "Notifies users with Administration → Discount approvals → Approve (or legacy Sales → Order actions → Approve). Enable per channel under Organization settings → Sales → Prices & discounts (backoffice and/or mobile).",
    module: "sales",
  },
  {
    id: "order_cancel",
    label: "Order cancellation requested",
    description: "Notifies users with Sales → Order actions → Approve or Sales manage.",
    module: "sales",
  },
  {
    id: "leave",
    label: "Leave request submitted",
    description: "Notifies users with HR → Leave → Approve or HR manage.",
    module: "hr_payroll",
  },
  {
    id: "cash_advance",
    label: "Cash advance submitted",
    description: "Notifies users with HR → Cash advances → Approve or HR manage.",
    module: "hr_payroll",
  },
  {
    id: "payroll_run",
    label: "Payroll run submitted",
    description: "Notifies users with HR → Payroll runs → Approve or HR manage.",
    module: "hr_payroll",
  },
  {
    id: "lpo_approval",
    label: "LPO submitted for approval",
    description: "Notifies users with Purchasing → Purchase orders (LPO) → Approve.",
    module: "customers_suppliers",
  },
  {
    id: "stock_adjustment",
    label: "Stock adjustment submitted",
    description: "Notifies users with Inventory manage when adjustment approval is enabled.",
    module: "inventory",
  },
  {
    id: "stock_transfer",
    label: "Stock transfer submitted",
    description: "Notifies users with Inventory manage when transfer approval is enabled.",
    module: "inventory",
  },
  {
    id: "damage_write_off",
    label: "Damage / write-off submitted",
    description: "Notifies users with Inventory manage when write-off approval is enabled.",
    module: "inventory",
  },
  {
    id: "stock_take_completion",
    label: "Stock take completion submitted",
    description: "Notifies users with Inventory → Stock take → Approve or Inventory manage.",
    module: "inventory",
  },
  {
    id: "journal_entry",
    label: "Journal entry posting requested",
    description: "Notifies users with Accounting → Journal entries → Approve or Accounting manage.",
    module: "accounting",
  },
  {
    id: "expense_action",
    label: "Expense create/delete requested",
    description: "Notifies users with Accounting manage.",
    module: "accounting",
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
    order_cancellation_approval_enabled: Boolean(sales.order_cancellation_approval_enabled),
    stock_adjustment_approval_enabled: Boolean(inventory.stock_adjustment_approval_enabled),
    stock_transfer_approval_enabled: Boolean(inventory.stock_transfer_approval_enabled),
    damage_write_off_approval_enabled: Boolean(inventory.damage_write_off_approval_enabled),
    require_lpo_approval: Boolean(procurement.require_lpo_approval ?? true),
    require_payroll_approval: Boolean(hr.require_payroll_approval),
    journal_entry_approval_enabled: Boolean(accounting.journal_entry_approval_enabled),
    email_enabled: Boolean(notifications.email_enabled),
    notify_on_approval_request: Boolean(notifications.notify_on_approval_request),
    notify_on_approval_outcome: Boolean(notifications.notify_on_approval_outcome),
    in_app_notify_on_approval_request: Boolean(notifications.in_app_notify_on_approval_request),
    in_app_notify_on_approval_outcome: Boolean(notifications.in_app_notify_on_approval_outcome),
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
    order_cancellation_approval_enabled: Boolean(form.order_cancellation_approval_enabled),
  };
}

export function inventoryManagerApprovalsPayload(form) {
  return {
    stock_adjustment_approval_enabled: Boolean(form.stock_adjustment_approval_enabled),
    stock_transfer_approval_enabled: Boolean(form.stock_transfer_approval_enabled),
    damage_write_off_approval_enabled: Boolean(form.damage_write_off_approval_enabled),
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

export function managerApprovalsNotificationsPayload(form) {
  return {
    ...managerApprovalsEmailPayload(form),
    in_app_notify_on_approval_request: Boolean(form.in_app_notify_on_approval_request),
    in_app_notify_on_approval_outcome: Boolean(form.in_app_notify_on_approval_outcome),
  };
}

export function visibleApprovalRequestEvents(capabilities) {
  const modules = capabilities?.modules ?? {};
  return APPROVAL_REQUEST_EVENTS.filter((event) => {
    if (event.module === "customers_suppliers") return Boolean(modules.customers_suppliers);
    return Boolean(modules[event.module]);
  });
}

/** @deprecated Use visibleApprovalRequestEvents */
export function visibleAlwaysOnEvents(capabilities) {
  return visibleApprovalRequestEvents(capabilities);
}
