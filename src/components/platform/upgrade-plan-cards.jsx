"use client";

import { formatBillingMoney } from "@/lib/platform-billing";

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

export function PlanGroup({ title, hint, offers, currentName, onPay, preview = false, onMove, moving = false }) {
  const recommendedIndex = offers.length >= 3 ? 2 : Math.max(0, offers.length - 1);
  const width = offers.length <= 1
    ? "mx-auto max-w-sm"
    : offers.length === 2
      ? "mx-auto max-w-4xl md:grid-cols-2"
      : "md:grid-cols-2 xl:grid-cols-3";
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
      </div>
    </section>
  );
}

function PlanCard({ offer, current, recommended, onPay, preview }) {
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
