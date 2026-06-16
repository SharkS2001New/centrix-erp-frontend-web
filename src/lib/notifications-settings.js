export const NOTIFICATIONS_DEFAULTS = {
  sms_enabled: false,
  sms_provider: "africas_talking",
  africas_talking_username: "",
  africas_talking_api_key: "",
  africas_talking_sender_id: "",
  email_enabled: false,
  email_from_name: "",
  email_from_address: "",
  smtp_enabled: false,
  smtp_host: "",
  smtp_port: 587,
  smtp_username: "",
  smtp_password: "",
  smtp_encryption: "tls",
  notify_on_dispatch: false,
  notify_on_delivery: false,
  notify_on_order_placed: false,
  order_placed_scope: "all",
  notify_on_debtor_payment: false,
  debtor_payment_scope: "debtors",
  dispatch_sms_template: "Your order {order_num} is out for delivery on route {route_name}.",
  delivery_sms_template: "Your order {order_num} was delivered. Thank you for your business.",
  dispatch_email_template: "",
  delivery_email_template: "",
  order_placed_sms_template:
    "Thank you. Your order {order_num} for KES {order_total} has been received. Balance due: KES {balance_due}.",
  order_placed_email_template: "",
  debtor_payment_sms_template:
    "Payment of KES {amount} received for order {order_num}. Balance due: KES {balance_due}.",
  debtor_payment_email_template: "",
};

export const NOTIFICATION_SCOPE_OPTIONS = [
  { value: "all", label: "All orders (customer must have phone and/or email)" },
  { value: "debtors", label: "Debtor / credit orders only" },
  { value: "route_orders", label: "Route orders only" },
];

export const SMTP_ENCRYPTION_OPTIONS = [
  { value: "tls", label: "TLS (587)" },
  { value: "ssl", label: "SSL (465)" },
  { value: "none", label: "None" },
];

export function mergeNotificationsSettings(moduleSettings) {
  return { ...NOTIFICATIONS_DEFAULTS, ...(moduleSettings?.notifications ?? {}) };
}

export function notificationsFormFromApi(res) {
  const source = res?.notifications ?? res;
  const notifications = mergeNotificationsSettings({ notifications: source });
  return {
    organization_id: res?.organization_id ?? null,
    organization_name: res?.organization_name ?? "",
    sms_enabled: Boolean(notifications.sms_enabled),
    sms_provider: notifications.sms_provider || "africas_talking",
    africas_talking_username: notifications.africas_talking_username ?? "",
    africas_talking_api_key: notifications.africas_talking_api_key ?? "",
    africas_talking_sender_id: notifications.africas_talking_sender_id ?? "",
    email_enabled: Boolean(notifications.email_enabled),
    email_from_name: notifications.email_from_name ?? "",
    email_from_address: notifications.email_from_address ?? "",
    smtp_enabled: Boolean(notifications.smtp_enabled),
    smtp_host: notifications.smtp_host ?? "",
    smtp_port: notifications.smtp_port ?? 587,
    smtp_username: notifications.smtp_username ?? "",
    smtp_password: notifications.smtp_password ?? "",
    smtp_encryption: notifications.smtp_encryption || "tls",
    notify_on_dispatch: Boolean(notifications.notify_on_dispatch),
    notify_on_delivery: Boolean(notifications.notify_on_delivery),
    notify_on_order_placed: Boolean(notifications.notify_on_order_placed),
    order_placed_scope: notifications.order_placed_scope || "all",
    notify_on_debtor_payment: Boolean(notifications.notify_on_debtor_payment),
    debtor_payment_scope: notifications.debtor_payment_scope || "debtors",
    dispatch_sms_template: notifications.dispatch_sms_template ?? NOTIFICATIONS_DEFAULTS.dispatch_sms_template,
    delivery_sms_template: notifications.delivery_sms_template ?? NOTIFICATIONS_DEFAULTS.delivery_sms_template,
    dispatch_email_template: notifications.dispatch_email_template ?? "",
    delivery_email_template: notifications.delivery_email_template ?? "",
    order_placed_sms_template:
      notifications.order_placed_sms_template ?? NOTIFICATIONS_DEFAULTS.order_placed_sms_template,
    order_placed_email_template: notifications.order_placed_email_template ?? "",
    debtor_payment_sms_template:
      notifications.debtor_payment_sms_template ?? NOTIFICATIONS_DEFAULTS.debtor_payment_sms_template,
    debtor_payment_email_template: notifications.debtor_payment_email_template ?? "",
    notifications_status: res?.notifications_status ?? null,
    mail_from_preview: res?.mail_from ?? null,
  };
}

export function notificationsPayloadFromForm(form) {
  return {
    sms_enabled: Boolean(form.sms_enabled),
    sms_provider: form.sms_provider || "africas_talking",
    africas_talking_username: form.africas_talking_username?.trim() ?? "",
    africas_talking_api_key: form.africas_talking_api_key?.trim() ?? "",
    africas_talking_sender_id: form.africas_talking_sender_id?.trim() ?? "",
    email_enabled: Boolean(form.email_enabled),
    email_from_name: form.email_from_name?.trim() ?? "",
    email_from_address: form.email_from_address?.trim() ?? "",
    smtp_enabled: Boolean(form.smtp_enabled),
    smtp_host: form.smtp_host?.trim() ?? "",
    smtp_port: Number(form.smtp_port) || 587,
    smtp_username: form.smtp_username?.trim() ?? "",
    smtp_password: form.smtp_password?.trim() ?? "",
    smtp_encryption: form.smtp_encryption || "tls",
    notify_on_dispatch: Boolean(form.notify_on_dispatch),
    notify_on_delivery: Boolean(form.notify_on_delivery),
    notify_on_order_placed: Boolean(form.notify_on_order_placed),
    order_placed_scope: form.order_placed_scope || "all",
    notify_on_debtor_payment: Boolean(form.notify_on_debtor_payment),
    debtor_payment_scope: form.debtor_payment_scope || "debtors",
    dispatch_sms_template: form.dispatch_sms_template?.trim() ?? "",
    delivery_sms_template: form.delivery_sms_template?.trim() ?? "",
    dispatch_email_template: form.dispatch_email_template?.trim() ?? "",
    delivery_email_template: form.delivery_email_template?.trim() ?? "",
    order_placed_sms_template: form.order_placed_sms_template?.trim() ?? "",
    order_placed_email_template: form.order_placed_email_template?.trim() ?? "",
    debtor_payment_sms_template: form.debtor_payment_sms_template?.trim() ?? "",
    debtor_payment_email_template: form.debtor_payment_email_template?.trim() ?? "",
  };
}

export function channelHint(form) {
  const channels = [];
  if (form.sms_enabled) channels.push("SMS");
  if (form.email_enabled) channels.push("email");
  if (channels.length === 0) {
    return "Enable SMS and/or email above for automatic delivery.";
  }
  return `Auto-sends via ${channels.join(" and ")} when the customer has a phone number and/or email on file.`;
}
