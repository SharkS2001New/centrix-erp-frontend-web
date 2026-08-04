"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  NOTIFICATION_SCOPE_OPTIONS,
  channelHint,
  normalizeNotificationScopes,
  toggleNotificationScope,
} from "@/lib/notifications-settings";

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

function ScopeCheckboxes({ value, onChange, fallback = "all" }) {
  const scopes = normalizeNotificationScopes(value, fallback);
  const selected = new Set(scopes);

  return (
    <fieldset className="space-y-2">
      <legend className="theme-heading mb-1 text-sm font-medium">Apply to</legend>
      <p className="theme-subtext mb-2 text-xs">
        Tick one or more. SMS and/or email send when those channels are enabled under Messaging.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {NOTIFICATION_SCOPE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5"
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selected.has(opt.value)}
              onChange={(e) => onChange(toggleNotificationScope(scopes, opt.value, e.target.checked, fallback))}
            />
            <span>
              <span className="theme-heading block text-sm font-medium">{opt.label}</span>
              {opt.description ? (
                <span className="theme-subtext mt-0.5 block text-xs">{opt.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
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
      {channelHint(form)} Configure Africa&apos;s Talking SMS keys and email/SMTP under{" "}
      <strong>Organization settings → Messaging</strong>.
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
        description="Sends SMS and/or email (whichever channels are enabled) when the order is confirmed."
        checked={form.notify_on_order_placed}
        onChange={(v) => setForm((f) => ({ ...f, notify_on_order_placed: v }))}
      />
      {form.notify_on_order_placed ? (
        <>
          <ScopeCheckboxes
            value={form.order_placed_scope}
            fallback="all"
            onChange={(scopes) => setForm((f) => ({ ...f, order_placed_scope: scopes }))}
          />
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
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
        <div>
          <h3 className="theme-heading text-sm font-semibold">Payment received</h3>
          <CustomerNotificationChannelHint form={form} />
        </div>
        <Toggle
          label="Notify customer when payment is received"
          description="Including collect payment, mark as paid, and debtor invoice payments."
          checked={form.notify_on_debtor_payment}
          onChange={(v) => setForm((f) => ({ ...f, notify_on_debtor_payment: v }))}
        />
        {form.notify_on_debtor_payment ? (
          <>
            <ScopeCheckboxes
              value={form.debtor_payment_scope}
              fallback="debtors"
              onChange={(scopes) => setForm((f) => ({ ...f, debtor_payment_scope: scopes }))}
            />
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

      <div className="space-y-3 rounded-xl border border-[var(--theme-border)] p-4">
        <div>
          <h3 className="theme-heading text-sm font-semibold">Unpaid debt reminder</h3>
          <p className="theme-subtext mt-0.5 text-xs">
            Daily job reminds customers whose order balance is still unpaid after the number of days you set.
            Repeats every same interval while unpaid. Configure SMS/email under Messaging.
          </p>
        </div>
        <Toggle
          label="Remind customer of unpaid balance"
          description="Sends SMS and/or email after the order has been unpaid for the days below."
          checked={form.notify_on_debt_reminder}
          onChange={(v) => setForm((f) => ({ ...f, notify_on_debt_reminder: v }))}
        />
        {form.notify_on_debt_reminder ? (
          <>
            <Field label="Remind after (days unpaid)">
              <input
                type="number"
                min={1}
                max={365}
                className={inputClassName()}
                value={form.debt_reminder_after_days}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    debt_reminder_after_days: e.target.value,
                  }))
                }
              />
            </Field>
            <ScopeCheckboxes
              value={form.debt_reminder_scope}
              fallback="debtors"
              onChange={(scopes) => setForm((f) => ({ ...f, debt_reminder_scope: scopes }))}
            />
            <CustomerNotificationTemplateFields
              form={form}
              setForm={setForm}
              smsKey="debt_reminder_sms_template"
              emailKey="debt_reminder_email_template"
              placeholders="{order_num}, {order_total}, {amount_paid}, {balance_due}, {days_overdue}"
              smsDisabled={!form.sms_enabled}
              emailDisabled={!form.email_enabled}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Order placed + payment alerts side-by-side for Sales → Alerts. */
export function SalesCustomerOrderAlerts({ form, setForm }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="theme-heading text-base font-semibold">Customer order notifications</h3>
        <p className="theme-subtext mt-1 text-sm">
          Configure when customers get SMS/email for new orders, payments, and unpaid balances.
          Enable channels and Africa&apos;s Talking keys under Messaging first.
        </p>
      </div>
      <SalesOrderPlacedAlerts form={form} setForm={setForm} />
      <FinanceDebtorPaymentAlerts form={form} setForm={setForm} />
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
