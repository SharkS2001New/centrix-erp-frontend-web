"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { NOTIFICATION_SCOPE_OPTIONS, channelHint } from "@/lib/notifications-settings";

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

export function CustomerNotificationTemplateFields({
  form,
  setForm,
  smsKey,
  emailKey,
  placeholders,
  smsDisabled,
  emailDisabled,
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Field label="SMS template">
        <textarea
          className={`${inputClassName()} min-h-[72px]`}
          value={form[smsKey]}
          disabled={smsDisabled}
          onChange={(e) => setForm((f) => ({ ...f, [smsKey]: e.target.value }))}
        />
      </Field>
      <Field label="Email template (optional)">
        <textarea
          className={`${inputClassName()} min-h-[72px]`}
          value={form[emailKey]}
          disabled={emailDisabled}
          placeholder="Uses SMS template if left blank"
          onChange={(e) => setForm((f) => ({ ...f, [emailKey]: e.target.value }))}
        />
      </Field>
      {placeholders ? (
        <p className="theme-subtext lg:col-span-2 text-xs">Placeholders: {placeholders}</p>
      ) : null}
    </div>
  );
}

export function CustomerNotificationChannelHint({ form }) {
  return (
    <p className="theme-subtext text-xs">
      {channelHint(form)} Configure SMS and email channels under Administration → Organization settings →
      Notifications.
    </p>
  );
}

export function SalesOrderPlacedAlerts({ form, setForm }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
      <div>
        <h3 className="theme-heading text-sm font-semibold">Order placement</h3>
        <CustomerNotificationChannelHint form={form} />
      </div>
      <Toggle
        label="Notify customer when order is placed"
        checked={form.notify_on_order_placed}
        onChange={(v) => setForm((f) => ({ ...f, notify_on_order_placed: v }))}
      />
      {form.notify_on_order_placed ? (
        <>
          <Field label="Apply to">
            <select
              className={inputClassName()}
              value={form.order_placed_scope}
              onChange={(e) => setForm((f) => ({ ...f, order_placed_scope: e.target.value }))}
            >
              {NOTIFICATION_SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <CustomerNotificationTemplateFields
            form={form}
            setForm={setForm}
            smsKey="order_placed_sms_template"
            emailKey="order_placed_email_template"
            placeholders="{order_num}, {order_total}, {amount_paid}, {balance_due}"
            smsDisabled={!form.sms_enabled}
            emailDisabled={!form.email_enabled}
          />
        </>
      ) : null}
    </div>
  );
}

export function FinanceDebtorPaymentAlerts({ form, setForm }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
      <div>
        <h3 className="theme-heading text-sm font-semibold">Debtor payments</h3>
        <CustomerNotificationChannelHint form={form} />
      </div>
      <Toggle
        label="Notify customer when payment is received"
        checked={form.notify_on_debtor_payment}
        onChange={(v) => setForm((f) => ({ ...f, notify_on_debtor_payment: v }))}
      />
      {form.notify_on_debtor_payment ? (
        <>
          <Field label="Apply to">
            <select
              className={inputClassName()}
              value={form.debtor_payment_scope}
              onChange={(e) => setForm((f) => ({ ...f, debtor_payment_scope: e.target.value }))}
            >
              {NOTIFICATION_SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <CustomerNotificationTemplateFields
            form={form}
            setForm={setForm}
            smsKey="debtor_payment_sms_template"
            emailKey="debtor_payment_email_template"
            placeholders="{order_num}, {amount}, {amount_paid}, {balance_due}"
            smsDisabled={!form.sms_enabled}
            emailDisabled={!form.email_enabled}
          />
        </>
      ) : null}
    </div>
  );
}

export function DistributionDeliveryAlerts({ form, setForm }) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
      <div>
        <h3 className="theme-heading text-sm font-semibold">Delivery updates</h3>
        <CustomerNotificationChannelHint form={form} />
      </div>
      <Toggle
        label="Notify customers when trip departs"
        checked={form.notify_on_dispatch}
        onChange={(v) => setForm((f) => ({ ...f, notify_on_dispatch: v }))}
      />
      {form.notify_on_dispatch ? (
        <CustomerNotificationTemplateFields
          form={form}
          setForm={setForm}
          smsKey="dispatch_sms_template"
          emailKey="dispatch_email_template"
          placeholders="{order_num}, {route_name}, {trip_code}"
          smsDisabled={!form.sms_enabled}
          emailDisabled={!form.email_enabled}
        />
      ) : null}
      <Toggle
        label="Notify customers on delivery (POD captured)"
        checked={form.notify_on_delivery}
        onChange={(v) => setForm((f) => ({ ...f, notify_on_delivery: v }))}
      />
      {form.notify_on_delivery ? (
        <CustomerNotificationTemplateFields
          form={form}
          setForm={setForm}
          smsKey="delivery_sms_template"
          emailKey="delivery_email_template"
          placeholders="{order_num}"
          smsDisabled={!form.sms_enabled}
          emailDisabled={!form.email_enabled}
        />
      ) : null}
    </div>
  );
}
