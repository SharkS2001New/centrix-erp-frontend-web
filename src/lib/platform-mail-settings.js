/** Platform-level outbound email (super-admin) for contracts, invoices, and notices. */

export const PLATFORM_MAIL_DEFAULTS = {
  enabled: false,
  from_name: "ALPAC SOFTWARE SOLUTIONS",
  from_address: "alpacke.tech@gmail.com",
  reply_to: "alpacke.tech@gmail.com",
  smtp_host: "",
  smtp_port: "587",
  smtp_username: "",
  smtp_password: "",
  smtp_encryption: "tls",
  contract_email_subject: "Centrix ERP {kind}: {title}",
  contract_email_body:
    "Dear {customer_name},\n\nPlease find attached your Centrix ERP {kind} ({reference}).\n\nFirst payment: {first_payment}\nRenewal: {renewal_payment}\n\nIf you have questions, reply to this email.\n\nRegards,\n{from_name}",
};

export function platformMailFormFromApi(res = {}) {
  const settings = res.settings ?? res.data ?? res ?? {};
  return {
    enabled: settings.enabled !== false && Boolean(settings.enabled ?? settings.smtp_host),
    from_name: settings.from_name || PLATFORM_MAIL_DEFAULTS.from_name,
    from_address: settings.from_address || PLATFORM_MAIL_DEFAULTS.from_address,
    reply_to: settings.reply_to || settings.from_address || PLATFORM_MAIL_DEFAULTS.reply_to,
    smtp_host: settings.smtp_host || "",
    smtp_port: settings.smtp_port != null ? String(settings.smtp_port) : "587",
    smtp_username: settings.smtp_username || "",
    smtp_password: "",
    smtp_password_set: Boolean(settings.smtp_password_set),
    smtp_encryption: settings.smtp_encryption || "tls",
    contract_email_subject:
      settings.contract_email_subject || PLATFORM_MAIL_DEFAULTS.contract_email_subject,
    contract_email_body:
      settings.contract_email_body || PLATFORM_MAIL_DEFAULTS.contract_email_body,
  };
}

export function platformMailPayloadFromForm(form) {
  const payload = {
    enabled: Boolean(form.enabled),
    from_name: form.from_name.trim(),
    from_address: form.from_address.trim(),
    reply_to: form.reply_to.trim() || form.from_address.trim(),
    smtp_host: form.smtp_host.trim(),
    smtp_port: Number(form.smtp_port) || 587,
    smtp_username: form.smtp_username.trim(),
    smtp_encryption: form.smtp_encryption || "tls",
    contract_email_subject: form.contract_email_subject.trim(),
    contract_email_body: form.contract_email_body.trim(),
  };
  if (form.smtp_password?.trim()) {
    payload.smtp_password = form.smtp_password.trim();
  }
  return payload;
}
