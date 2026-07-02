"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="theme-heading block text-sm font-medium">{label}</span>
        {description ? <span className="theme-subtext mt-0.5 block text-xs">{description}</span> : null}
      </span>
    </label>
  );
}

export function ApprovalAlertsFields({ form, setForm }) {
  const emailDisabled = !form.email_enabled;

  return (
    <div className="space-y-3">
      {!form.email_enabled ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Enable email under Organization settings → Notifications → Email setup to send approval alert emails.
        </p>
      ) : null}
      <Toggle
        label="Email approvers when approval is requested"
        description="Sends alongside the in-app bell notification."
        checked={form.notify_on_approval_request}
        disabled={emailDisabled}
        onChange={(v) => setForm((f) => ({ ...f, notify_on_approval_request: v }))}
      />
      <Toggle
        label="Email requester when approval is approved or rejected"
        checked={form.notify_on_approval_outcome}
        disabled={emailDisabled}
        onChange={(v) => setForm((f) => ({ ...f, notify_on_approval_outcome: v }))}
      />
      {form.notify_on_approval_request ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Approval request email subject">
            <input
              className={inputClassName()}
              value={form.approval_request_email_subject}
              disabled={emailDisabled}
              onChange={(e) => setForm((f) => ({ ...f, approval_request_email_subject: e.target.value }))}
            />
          </Field>
          <Field label="Approval request email body">
            <textarea
              className={`${inputClassName()} min-h-[72px]`}
              value={form.approval_request_email_template}
              disabled={emailDisabled}
              onChange={(e) => setForm((f) => ({ ...f, approval_request_email_template: e.target.value }))}
            />
          </Field>
          <p className="lg:col-span-2 text-xs text-slate-500">
            Placeholders: {"{title}"}, {"{message}"}, {"{link}"}, {"{organization_name}"}
          </p>
        </div>
      ) : null}
      {form.notify_on_approval_outcome ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Outcome email subject">
            <input
              className={inputClassName()}
              value={form.approval_outcome_email_subject}
              disabled={emailDisabled}
              onChange={(e) => setForm((f) => ({ ...f, approval_outcome_email_subject: e.target.value }))}
            />
          </Field>
          <Field label="Outcome email body">
            <textarea
              className={`${inputClassName()} min-h-[72px]`}
              value={form.approval_outcome_email_template}
              disabled={emailDisabled}
              onChange={(e) => setForm((f) => ({ ...f, approval_outcome_email_template: e.target.value }))}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
