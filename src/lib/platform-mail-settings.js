/** Platform-level outbound email (super-admin) for contracts, invoices, and notices. */

export const PLATFORM_MAIL_DEFAULTS = {
  enabled: false,
  from_name: "ALPAC SOFTWARE SOLUTIONS",
  from_address: "alpacke.tech@gmail.com",
  reply_to: "alpacke.tech@gmail.com",
  noreply_address: "",
  smtp_host: "",
  smtp_port: "587",
  smtp_username: "",
  smtp_password: "",
  smtp_encryption: "tls",
  imap_enabled: false,
  imap_host: "",
  imap_port: "993",
  imap_username: "",
  imap_password: "",
  imap_encryption: "ssl",
  imap_mailbox: "INBOX",
  contract_email_subject: "Centrix ERP {kind}: {title}",
  contract_email_body:
    "Dear {customer_name},\n\nPlease find attached your Centrix ERP {kind} ({reference}).\n\nFirst payment: {first_payment}\nRenewal: {renewal_payment}\n\nIf you have questions, reply to this email.\n\nRegards,\n{from_name}",
  auth_mail_use_dedicated: false,
  auth_from_name: "",
  auth_from_address: "",
  auth_smtp_host: "",
  auth_smtp_port: "587",
  auth_smtp_username: "",
  auth_smtp_password: "",
  auth_smtp_encryption: "tls",
  subscription_reminder_enabled: false,
  subscription_reminder_days: "30,14,7",
  renewal_email_subject: "Centrix ERP licence renewal reminder — {company_code}",
  renewal_email_body:
    "Dear {customer_name},\n\nYour Centrix ERP licence for {company_code} ({plan_name}) expires on {expires_on} ({days_remaining} day(s) remaining).\n\nPlease find attached invoice {invoice_number} for {total} to renew your subscription.\n\nIf you have already paid, you can ignore this message.\n\nRegards,\n{from_name}",
};

export function platformMailFormFromApi(res = {}) {
  const settings = res.settings ?? res.data ?? res ?? {};
  return {
    enabled: settings.enabled !== false && Boolean(settings.enabled ?? settings.smtp_host),
    from_name: settings.from_name || PLATFORM_MAIL_DEFAULTS.from_name,
    from_address: settings.from_address || PLATFORM_MAIL_DEFAULTS.from_address,
    reply_to: settings.reply_to || settings.from_address || PLATFORM_MAIL_DEFAULTS.reply_to,
    noreply_address: settings.noreply_address || "",
    smtp_host: settings.smtp_host || "",
    smtp_port: settings.smtp_port != null ? String(settings.smtp_port) : "587",
    smtp_username: settings.smtp_username || "",
    smtp_password: "",
    smtp_password_set: Boolean(settings.smtp_password_set),
    smtp_encryption: settings.smtp_encryption || "tls",
    imap_enabled: Boolean(settings.imap_enabled),
    imap_host: settings.imap_host || "",
    imap_port: settings.imap_port != null ? String(settings.imap_port) : "993",
    imap_username: settings.imap_username || settings.smtp_username || "",
    imap_password: "",
    imap_password_set: Boolean(settings.imap_password_set),
    imap_encryption: settings.imap_encryption || "ssl",
    imap_mailbox: settings.imap_mailbox || "INBOX",
    imap_extension_available: settings.imap_extension_available !== false,
    contract_email_subject:
      settings.contract_email_subject || PLATFORM_MAIL_DEFAULTS.contract_email_subject,
    contract_email_body:
      settings.contract_email_body || PLATFORM_MAIL_DEFAULTS.contract_email_body,
    auth_mail_use_dedicated: Boolean(settings.auth_mail_use_dedicated),
    auth_from_name: settings.auth_from_name || "",
    auth_from_address: settings.auth_from_address || "",
    auth_smtp_host: settings.auth_smtp_host || "",
    auth_smtp_port: settings.auth_smtp_port != null ? String(settings.auth_smtp_port) : "587",
    auth_smtp_username: settings.auth_smtp_username || "",
    auth_smtp_password: "",
    auth_smtp_password_set: Boolean(settings.auth_smtp_password_set),
    auth_smtp_encryption: settings.auth_smtp_encryption || "tls",
    subscription_reminder_enabled: Boolean(settings.subscription_reminder_enabled),
    subscription_reminder_days:
      settings.subscription_reminder_days || PLATFORM_MAIL_DEFAULTS.subscription_reminder_days,
    renewal_email_subject:
      settings.renewal_email_subject || PLATFORM_MAIL_DEFAULTS.renewal_email_subject,
    renewal_email_body:
      settings.renewal_email_body || PLATFORM_MAIL_DEFAULTS.renewal_email_body,
  };
}

export function platformMailPayloadFromForm(form) {
  const payload = {
    enabled: Boolean(form.enabled),
    from_name: form.from_name.trim(),
    from_address: form.from_address.trim(),
    reply_to: form.reply_to.trim() || form.from_address.trim(),
    noreply_address: form.noreply_address.trim(),
    smtp_host: form.smtp_host.trim(),
    smtp_port: Number(form.smtp_port) || 587,
    smtp_username: form.smtp_username.trim(),
    smtp_encryption: form.smtp_encryption || "tls",
    imap_enabled: Boolean(form.imap_enabled),
    imap_host: form.imap_host.trim(),
    imap_port: Number(form.imap_port) || 993,
    imap_username: form.imap_username.trim(),
    imap_encryption: form.imap_encryption || "ssl",
    imap_mailbox: form.imap_mailbox.trim() || "INBOX",
    contract_email_subject: form.contract_email_subject.trim(),
    contract_email_body: form.contract_email_body.trim(),
    auth_mail_use_dedicated: Boolean(form.auth_mail_use_dedicated),
    auth_from_name: form.auth_from_name.trim(),
    auth_from_address: form.auth_from_address.trim(),
    auth_smtp_host: form.auth_smtp_host.trim(),
    auth_smtp_port: Number(form.auth_smtp_port) || 587,
    auth_smtp_username: form.auth_smtp_username.trim(),
    auth_smtp_encryption: form.auth_smtp_encryption || "tls",
    subscription_reminder_enabled: Boolean(form.subscription_reminder_enabled),
    subscription_reminder_days: form.subscription_reminder_days.trim() || "30,14,7",
    renewal_email_subject: form.renewal_email_subject.trim(),
    renewal_email_body: form.renewal_email_body.trim(),
  };
  if (form.smtp_password?.trim()) {
    payload.smtp_password = form.smtp_password.trim();
  }
  if (form.imap_password?.trim()) {
    payload.imap_password = form.imap_password.trim();
  }
  if (form.auth_smtp_password?.trim()) {
    payload.auth_smtp_password = form.auth_smtp_password.trim();
  }
  return payload;
}
