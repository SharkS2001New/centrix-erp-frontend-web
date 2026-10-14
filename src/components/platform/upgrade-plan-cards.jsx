"use client";

import { useEffect, useState } from "react";
import { BACKOFFICE_SECTION_CATALOG } from "@/lib/backoffice-sections";
import { formatBillingMoney, licensableWorkspacesForIndustry } from "@/lib/platform-billing";

export function quoteMonths(unit, months, minMonths, percent) {
  const count = Math.min(36, Math.max(1, Number(months) || 1));
  const gross = Math.round(unit * count * 100) / 100;
  const applied = count > minMonths && percent > 0 ? Math.min(100, percent) : 0;
  const discount = Math.round((gross * applied) / 100 * 100) / 100;
  return {
    months: count,
    gross,
    discount,
    percent: applied,
    amount: Math.round((gross - discount) * 100) / 100,
  };
}

const BILLING_TAB_LABELS = {
  token: "Tokens",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function BillingIntervalTabs({ value, onChange, options }) {
  const columns = options.length <= 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div
      role="tablist"
      aria-label="How you pay"
      className={`mx-auto mt-6 grid w-full max-w-xl ${columns} gap-1 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1.5 shadow-sm`}
    >
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option)}
            className={`rounded-xl px-4 py-3 text-sm font-semibold tracking-tight transition ${
              selected
                ? "bg-[var(--theme-primary)] text-white shadow-sm"
                : "text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-subtle)] hover:text-[var(--theme-text)]"
            }`}
          >
            {BILLING_TAB_LABELS[option] || option}
          </button>
        );
      })}
    </div>
  );
}

export function featureTitle(feature) {
  const text = String(feature ?? "").trim();
  const cut = text.indexOf(":");
  if (cut > 1 && cut < 48) return text.slice(0, cut).trim();
  return text;
}

export function prepaidOffer(plan, discount) {
  const unit = Number(plan.monthly_price) || 0;
  const minMonths = Number(plan.discount_min_months ?? discount.min_months ?? discount.minMonths ?? 3);
  const percent = Number(plan.discount_percent ?? discount.percent ?? 0);
  const quote = quoteMonths(unit, 12, minMonths, percent);
  return {
    plan,
    billing: "monthly",
    months: 12,
    amount: quote.amount,
    gross: quote.gross,
    discount: quote.discount,
    percent: quote.percent,
    kind: "prepaid",
    currency: plan.currency || "KES",
  };
}

export function onceOffer(plan) {
  return {
    plan,
    billing: "yearly",
    months: 12,
    amount: Number(plan.yearly_price) || 0,
    gross: Number(plan.yearly_price) || 0,
    discount: 0,
    percent: 0,
    kind: "once",
    currency: plan.currency || "KES",
  };
}

export function monthOffer(plan) {
  return {
    plan,
    billing: "monthly",
    months: 1,
    amount: Number(plan.monthly_price) || 0,
    gross: Number(plan.monthly_price) || 0,
    discount: 0,
    percent: 0,
    kind: "month",
    currency: plan.currency || "KES",
  };
}

export function PlanGroup({ title, hint, offers, currentName, onPay, preview = false, onMove, moving = false, manage = null, trailing = null }) {
  const recommendedIndex = offers.length >= 3 ? 2 : Math.max(0, offers.length - 1);
  const count = offers.length + (trailing ? 1 : 0);
  const width = count <= 1
    ? "mx-auto max-w-sm"
    : count === 2
      ? "mx-auto max-w-4xl md:grid-cols-2"
      : count === 3
        ? "md:grid-cols-2 xl:grid-cols-3"
        : "sm:grid-cols-2 xl:grid-cols-4";
  return (
    <section>
      {title ? <h2 className="theme-heading text-sm font-semibold">{title}</h2> : null}
      {hint ? <p className="theme-subtext mt-1 text-sm">{hint}</p> : null}
      <div className={`grid items-stretch gap-4 ${title ? "mt-4" : ""} ${width}`}>
        {offers.map((offer, index) => {
          const current = Boolean(currentName && offer.plan.name === currentName);
          return (
            <div key={`${offer.kind}-${offer.plan.id}`} className="flex h-full flex-col">
              <PlanCard
                offer={offer}
                current={current}
                recommended={index === recommendedIndex && !current}
                onPay={onPay}
                preview={preview}
                manage={manage}
              />
              {onMove ? (
                <div className="mt-2 flex justify-between gap-2 text-xs font-medium">
                  <button
                    type="button"
                    className="text-[#185FA5] disabled:text-slate-300"
                    disabled={moving || index === 0}
                    onClick={() => onMove(offers, index, -1)}
                  >
                    Move left
                  </button>
                  <button
                    type="button"
                    className="text-[#185FA5] disabled:text-slate-300"
                    disabled={moving || index === offers.length - 1}
                    onClick={() => onMove(offers, index, 1)}
                  >
                    Move right
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        {trailing ? <div className="flex h-full flex-col">{trailing}</div> : null}
      </div>
    </section>
  );
}

export function FreePlanCard({ pages = [], current = false, preview = false }) {
  const points = (pages.length ? pages : ["Dashboard"]).map((page) => String(page)).filter(Boolean);
  return (
    <article className={`flex h-full flex-1 flex-col rounded-2xl border p-6 shadow-sm ${
      current
        ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_7%,var(--theme-surface))]"
        : "border-[var(--theme-border)] bg-[var(--theme-surface)]"
    }`}>
      <p className="theme-subtext text-sm">Free</p>
      <h2 className="theme-heading mt-2 text-2xl font-semibold tracking-tight">Package 1</h2>
      <p className="theme-subtext mt-2 min-h-[3.75rem] text-sm leading-5">
        Open Centrix without paying. The platform administrator chooses which screens this includes.
      </p>
      <p className="theme-heading mt-5 text-4xl font-semibold tracking-tight">
        {formatBillingMoney(0, "KES")}
      </p>
      <p className="theme-subtext mt-1 text-sm">No charge.</p>
      <button
        type="button"
        disabled
        className={`theme-secondary-btn mt-5 w-full rounded-full px-4 py-2.5 text-sm font-semibold disabled:cursor-default disabled:opacity-70 ${
          preview ? "pointer-events-none" : ""
        }`}
      >
        {current ? "Your current plan" : "Free"}
      </button>
      <p className="theme-heading mt-6 text-sm font-medium">What&apos;s included</p>
      <ul className="mt-3 space-y-2.5 text-sm leading-5">
        {points.map((point) => (
          <li key={point} className="flex gap-2.5">
            <span className="theme-subtext">✓</span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function TokenPackCard({
  tokens = 0,
  price = 0,
  saleTokens = 1,
  balance = 0,
  current = false,
  preview = false,
  onStart,
}) {
  const each = Number(saleTokens) || 1;
  return (
    <article className={`flex h-full flex-1 flex-col rounded-2xl border p-6 shadow-sm ${
      current
        ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_7%,var(--theme-surface))]"
        : "border-[var(--theme-border)] bg-[var(--theme-surface)]"
    }`}>
      <p className="theme-subtext text-sm">Tokens</p>
      <h2 className="theme-heading mt-2 text-2xl font-semibold tracking-tight">Token pack</h2>
      <p className="theme-subtext mt-2 min-h-[3.75rem] text-sm leading-5">
        Pay for a pack of tokens. A completed sale uses tokens when it is saved online.
      </p>
      <p className="theme-heading mt-5 text-4xl font-semibold tracking-tight">
        {formatBillingMoney(price, "KES")}
      </p>
      <p className="theme-subtext mt-1 text-sm">{Number(tokens) || 0} tokens</p>
      <button
        type="button"
        disabled={current}
        onClick={() => {
          if (!preview) onStart?.();
        }}
        className={`mt-5 w-full rounded-full px-4 py-2.5 text-sm font-semibold disabled:cursor-default disabled:opacity-70 ${
          preview ? "pointer-events-none" : ""
        } ${current ? "theme-secondary-btn" : "theme-primary-btn"}`}
      >
        {current ? "Your current plan" : "Get started"}
      </button>
      <p className="theme-heading mt-6 text-sm font-medium">What&apos;s included</p>
      <ul className="mt-3 space-y-2.5 text-sm leading-5">
        <li className="flex gap-2.5"><span className="theme-subtext">✓</span><span>{Number(balance) || 0} tokens remaining</span></li>
        <li className="flex gap-2.5"><span className="theme-subtext">✓</span><span>Each completed sale uses {each} token{each === 1 ? "" : "s"}</span></li>
        <li className="flex gap-2.5"><span className="theme-subtext">✓</span><span>Reading stays free</span></li>
      </ul>
    </article>
  );
}

export function OneTimeQuoteCard({ preview = false, busy = false, onQuote, notice = "" }) {
  return (
    <article className="flex h-full flex-1 flex-col rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 shadow-sm">
      <p className="theme-subtext text-sm">One time</p>
      <h2 className="theme-heading mt-2 text-2xl font-semibold tracking-tight">Centrix One time payment</h2>
      <p className="theme-subtext mt-2 min-h-[3.75rem] text-sm leading-5">
        Buy Centrix once, instead of paying every month or every year. The platform administrator sends the price.
      </p>
      <p className="theme-heading mt-5 text-4xl font-semibold tracking-tight">Quote</p>
      <p className="theme-subtext mt-1 text-sm">Not a monthly or yearly fee.</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (!preview) onQuote?.();
        }}
        className={`theme-secondary-btn mt-5 w-full rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-70 ${
          preview ? "pointer-events-none" : ""
        }`}
      >
        {busy ? "Sending…" : "Get Quote"}
      </button>
      <p className="theme-heading mt-6 text-sm font-medium">What happens</p>
      <ul className="mt-3 space-y-2.5 text-sm leading-5">
        <li className="flex gap-2.5"><span className="theme-subtext">✓</span><span>One payment for Centrix</span></li>
        <li className="flex gap-2.5"><span className="theme-subtext">✓</span><span>A quote is emailed to the platform administrator</span></li>
        <li className="flex gap-2.5"><span className="theme-subtext">✓</span><span>You stay on your current plan until you accept the price</span></li>
      </ul>
      {notice ? <p className="theme-subtext mt-4 text-sm leading-5">{notice}</p> : null}
    </article>
  );
}

function PlanCard({ offer, current, recommended, onPay, preview, manage = null }) {
  if (manage) {
    return (
      <ManagedPlanCard
        offer={offer}
        recommended={recommended}
        saving={manage.savingId === offer.plan.id}
        onSave={(draft) => manage.onSave(offer.plan, draft)}
        onRemove={() => manage.onRemove(offer.plan)}
        onPreview={(snapshot) => manage.onPreview?.(snapshot)}
      />
    );
  }
  const features = (offer.plan.features ?? []).map(featureTitle).filter(Boolean);
  const yearly = offer.kind !== "month";
  const perMonth = yearly ? offer.amount / 12 : null;
  return (
    <article className={`flex h-full flex-1 flex-col rounded-2xl border p-6 shadow-sm ${
      recommended
        ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_7%,var(--theme-surface))]"
        : "border-[var(--theme-border)] bg-[var(--theme-surface)]"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <p className="theme-subtext text-sm">{offer.kind === "prepaid" ? "12 months" : offer.kind === "once" ? "Pay once" : "Monthly"}</p>
        {recommended ? <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-primary)]">Recommended</span> : <span />}
      </div>
      <h2 className="theme-heading mt-2 text-2xl font-semibold tracking-tight">{offer.plan.name}</h2>
      <p className="theme-subtext mt-2 min-h-[3.75rem] line-clamp-3 text-sm leading-5">{offer.plan.description || "\u00a0"}</p>
      <p className="theme-heading mt-5 text-4xl font-semibold tracking-tight">
        {formatBillingMoney(offer.amount, offer.currency)}
        <span className="theme-subtext text-base font-normal"> {yearly ? "/ year" : "/ month"}</span>
      </p>
      {offer.kind === "prepaid" && offer.discount > 0 ? (
        <p className="theme-subtext mt-1 text-sm">
          <span className="line-through">{formatBillingMoney(offer.gross, offer.currency)}</span>
          <span className="ml-2 text-[var(--theme-primary)]">Save {offer.percent}%</span>
        </p>
      ) : yearly ? (
        <p className="theme-subtext mt-1 text-sm">{formatBillingMoney(perMonth, offer.currency)} / month</p>
      ) : (
        <p className="mt-1 text-sm">&nbsp;</p>
      )}
      <button
        type="button"
        disabled={current}
        onClick={() => {
          if (!preview) onPay(offer);
        }}
        className={`mt-5 w-full rounded-full px-4 py-2.5 text-sm font-semibold disabled:cursor-default disabled:opacity-70 ${
          preview ? "pointer-events-none" : ""
        } ${recommended ? "theme-primary-btn" : "theme-secondary-btn"}`}
      >
        {current ? "Your current plan" : "Get started"}
      </button>
      {features.length > 0 ? (
        <>
          <p className="theme-heading mt-6 text-sm font-medium">What&apos;s included</p>
          <ul className="mt-3 space-y-2.5 text-sm leading-5">
            {features.map((feature) => (
              <li key={feature} className="flex gap-2.5">
                <span className="theme-subtext">✓</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

function cardDraft(offer) {
  const yearly = offer.kind === "once";
  const price = yearly ? offer.plan.yearly_price : offer.plan.monthly_price;
  const features = Array.isArray(offer.plan.feature_details) && offer.plan.feature_details.length > 0
    ? offer.plan.feature_details.map((row) => ({
      label: String(row?.label ?? ""),
      detail: String(row?.detail ?? ""),
    }))
    : [{ label: "", detail: "" }];
  return {
    name: offer.plan.name ?? "",
    description: offer.plan.description ?? "",
    price: price == null ? "" : String(price),
    features,
    is_active: offer.plan.is_active !== false,
    workspace_keys: Array.isArray(offer.plan.workspace_keys) ? [...offer.plan.workspace_keys] : [],
    section_keys: Array.isArray(offer.plan.section_keys) ? [...offer.plan.section_keys] : [],
  };
}

function ManagedPlanCard({ offer, recommended, saving, onSave, onRemove, onPreview }) {
  const [draft, setDraft] = useState(() => cardDraft(offer));
  const yearlyOnce = offer.kind === "once";
  const prepaid = offer.kind === "prepaid";
  const unit = Number(draft.price) || 0;
  const quotedYear = quoteMonths(
    unit,
    12,
    Number(offer.plan.discount_min_months ?? 3),
    Number(offer.plan.discount_percent ?? 0),
  );
  const yearTotal = quotedYear.amount;
  const featureKey = (offer.plan.feature_details ?? [])
    .map((row) => `${row?.label ?? ""}|${row?.detail ?? ""}`)
    .join("\n");

  useEffect(() => {
    setDraft(cardDraft(offer));
  }, [
    offer.plan.id,
    offer.plan.name,
    offer.plan.description,
    offer.plan.monthly_price,
    offer.plan.yearly_price,
    offer.plan.is_active,
    featureKey,
    (offer.plan.workspace_keys ?? []).join("|"),
    (offer.plan.section_keys ?? []).join("|"),
  ]);

  const fieldClass = "w-full rounded-lg border border-transparent bg-transparent px-2 py-1 outline-none hover:border-[var(--theme-border)] focus:border-[var(--theme-primary)] focus:bg-[var(--theme-surface)]";

  return (
    <article className={`flex h-full flex-1 flex-col rounded-2xl border p-6 shadow-sm ${
      recommended
        ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_7%,var(--theme-surface))]"
        : "border-[var(--theme-border)] bg-[var(--theme-surface)]"
    } ${draft.is_active ? "" : "opacity-80"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="theme-subtext text-sm">{prepaid ? "12 months" : yearlyOnce ? "Pay once" : "Monthly"}</p>
        <div className="flex items-center gap-2">
          {draft.is_active ? null : <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Hidden</span>}
          {recommended ? <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-primary)]">Recommended</span> : null}
        </div>
      </div>
      <input
        className={`${fieldClass} theme-heading mt-2 text-2xl font-semibold tracking-tight`}
        value={draft.name}
        aria-label="Plan name"
        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
      />
      <textarea
        className={`${fieldClass} theme-subtext mt-2 min-h-[4.5rem] resize-y text-sm leading-5`}
        value={draft.description}
        aria-label="Plan description"
        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
      />
      {prepaid ? (
        <p className="theme-heading mt-5 text-4xl font-semibold tracking-tight">
          {formatBillingMoney(yearTotal, offer.currency)}
          <span className="theme-subtext text-base font-normal"> / year</span>
        </p>
      ) : null}
      <label className="mt-3 block">
        <span className="theme-subtext text-xs">{yearlyOnce ? "Yearly price" : "Monthly price"}</span>
        <span className="mt-1 flex items-baseline gap-2">
          <input
            className={`${fieldClass} theme-heading w-40 text-3xl font-semibold tracking-tight`}
            inputMode="decimal"
            aria-label={yearlyOnce ? "Yearly price" : "Monthly price"}
            value={draft.price}
            onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
          />
          <span className="theme-subtext text-sm">{yearlyOnce ? "KES / year" : "KES / month"}</span>
        </span>
      </label>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
        />
        Published on the subscription screen
      </label>
      <PlanAccessFields
        industry={offer.plan.industry || "commerce"}
        workspaceKeys={draft.workspace_keys}
        sectionKeys={draft.section_keys}
        onToggle={(field, id) => setDraft((current) => {
          const list = current[field].includes(id)
            ? current[field].filter((key) => key !== id)
            : [...current[field], id];
          return { ...current, [field]: list };
        })}
      />
      <p className="theme-heading mt-6 text-sm font-medium">What&apos;s included</p>
      <ul className="mt-3 space-y-2">
        {draft.features.map((row, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="theme-subtext mt-2">✓</span>
            <span className="min-w-0 flex-1">
              <input
                className={`${fieldClass} text-sm`}
                value={row.label}
                placeholder="Point on the card"
                aria-label={`Card point ${index + 1}`}
                onChange={(event) => setDraft((current) => {
                  const features = [...current.features];
                  features[index] = { ...features[index], label: event.target.value };
                  return { ...current, features };
                })}
              />
              <input
                className={`${fieldClass} theme-subtext text-xs`}
                value={row.detail}
                placeholder="Short detail, optional"
                aria-label={`Detail for point ${index + 1}`}
                onChange={(event) => setDraft((current) => {
                  const features = [...current.features];
                  features[index] = { ...features[index], detail: event.target.value };
                  return { ...current, features };
                })}
              />
            </span>
            <button
              type="button"
              className="mt-1 text-xs text-red-700"
              onClick={() => setDraft((current) => ({
                ...current,
                features: current.features.filter((_, item) => item !== index),
              }))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-3 text-left text-sm font-medium text-[#185FA5]"
        onClick={() => setDraft((current) => ({
          ...current,
          features: [...current.features, { label: "", detail: "" }],
        }))}
      >
        Add a point
      </button>
      <button
        type="button"
        onClick={() => onPreview(previewSnapshot(offer, draft, prepaid ? yearTotal : unit))}
        className={`mt-5 w-full rounded-full px-4 py-2.5 text-sm font-semibold ${
          recommended ? "theme-primary-btn" : "theme-secondary-btn"
        }`}
      >
        Get started
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(draft)}
        className="theme-secondary-btn mt-3 w-full rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save card"}
      </button>
      <button type="button" className="mt-3 text-sm text-red-700" onClick={onRemove}>
        Remove plan
      </button>
    </article>
  );
}

function previewSnapshot(offer, draft, amount) {
  const features = (draft.features ?? [])
    .map((row) => {
      const label = String(row?.label ?? "").trim();
      if (!label) return "";
      const detail = String(row?.detail ?? "").trim();
      return detail ? `${label}: ${detail}` : label;
    })
    .filter(Boolean);
  return {
    kind: offer.kind,
    amount,
    currency: offer.currency || offer.plan.currency || "KES",
    plan: {
      name: String(draft.name ?? "").trim() || offer.plan.name,
      description: draft.description ?? "",
      features,
    },
  };
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function formatDay(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PaymentSimulation({ snapshot, shortCode, onClose }) {
  const [paid, setPaid] = useState(false);
  const [receipt] = useState(() => `SIM${String(Date.now()).slice(-8)}`);
  const [startedAt] = useState(() => new Date());
  const token = snapshot.kind === "token";
  const days = snapshot.kind === "once" ? 365 : snapshot.kind === "prepaid" ? 360 : 30;
  const endsAt = addDays(startedAt, days);
  const product = token
    ? "Token pack"
    : snapshot.kind === "once"
      ? "Yearly subscription"
      : snapshot.kind === "prepaid"
        ? "12 months paid in advance"
        : "Monthly subscription";
  const features = Array.isArray(snapshot.plan?.features) ? snapshot.plan.features : [];
  const tokens = Number(snapshot.tokens) || 0;
  const saleTokens = Number(snapshot.saleTokens) || 1;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="payment-simulation-title">
      <div className="theme-panel mx-auto my-8 max-w-lg rounded-2xl border p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-primary)]">Payment simulation</p>
            <h2 id="payment-simulation-title" className="theme-heading mt-1 text-xl font-semibold">
              {paid ? "Payment received" : snapshot.plan?.name || "Plan"}
            </h2>
          </div>
          <button type="button" className="theme-subtext text-sm" onClick={onClose}>Close</button>
        </div>
        <p className="theme-subtext mt-3 text-sm leading-6">
          This is what an organisation sees after M-Pesa confirms this payment. No prompt is sent and no organisation is charged.
        </p>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="theme-subtext">{product}</dt>
            <dd className="font-semibold">{formatBillingMoney(snapshot.amount, snapshot.currency || "KES")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="theme-subtext">Paybill</dt>
            <dd className="font-mono">{shortCode || "Not set"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="theme-subtext">Account</dt>
            <dd>Organisation code</dd>
          </div>
        </dl>
        {paid ? (
          <div className="mt-5 rounded-xl border border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)] p-4 text-sm leading-6">
            <p>M-Pesa receipt <span className="font-mono font-semibold">{receipt}</span></p>
            {token ? (
              <>
                <p className="mt-2">{tokens} tokens are added to the organisation balance.</p>
                <p className="mt-2">Each completed sale then uses {saleTokens} token{saleTokens === 1 ? "" : "s"}. Reading stays free. When a monthly or yearly period is not active, the organisation keeps working from this balance.</p>
              </>
            ) : (
              <>
                <p className="mt-2">{snapshot.plan?.name} becomes the active plan.</p>
                <p className="mt-2">Paid period: {formatDay(startedAt)} to {formatDay(endsAt)}.</p>
              </>
            )}
            {features.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {features.map((feature) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <button type="button" className="theme-primary-btn mt-6 w-full rounded-full px-4 py-2.5 text-sm font-semibold" onClick={() => setPaid(true)}>
            Complete payment
          </button>
        )}
      </div>
    </div>
  );
}

function PlanAccessFields({ industry, workspaceKeys = [], sectionKeys = [], onToggle }) {
  const workspaces = licensableWorkspacesForIndustry(industry);
  return (
    <details className="mt-4 rounded-xl border border-[var(--theme-border)] px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">Modules this payment opens</summary>
      <p className="theme-subtext mt-2 text-xs leading-5">
        When an organisation pays for this plan, these applications turn on. For Retail & Distribution, only the checked sections open.
      </p>
      <ul className="mt-2 space-y-1">
        {workspaces.map((workspace) => (
          <li key={workspace.id}>
            <label className="flex cursor-pointer items-start gap-2 py-1 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={workspaceKeys.includes(workspace.id)}
                onChange={() => onToggle("workspace_keys", workspace.id)}
              />
              <span>{workspace.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {industry === "commerce" ? (
        <ul className="mt-2 grid grid-cols-2 gap-1">
          {BACKOFFICE_SECTION_CATALOG.map((section) => (
            <li key={section.key}>
              <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={sectionKeys.includes(section.key)}
                  onChange={() => onToggle("section_keys", section.key)}
                />
                {section.label}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
